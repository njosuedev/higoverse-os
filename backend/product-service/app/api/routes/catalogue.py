"""A car company's public catalogue: the cars it has for sale, one card per
car name (model), for customers who open a shared link or see the
WhatsApp Status card.

GET /catalogue/link?prices=1&currency=RWF   staff: the shop's shareable token
GET /catalogue/public/{token}               anyone with the link: the cars on sale

The token is the shop id plus a signature (SECRET_KEY), so nobody can open
another company's catalogue by guessing its id from the public directory,
and whether prices show is part of the signed token, so it can't be edited
in the address bar. Only cars on sale are listed (in stock, not pending),
and only what a customer may see: no plate, chassis, cost or buyer details.
"""
import base64
import hashlib
import hmac
import time

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session, defer

from app.core.config import settings
from app.core.security import get_current_user
from app.db.database import get_db
from app.models.product import Product
from app.api.routes.products import (
    _COVER_CACHE, _COVER_CACHE_MAX, _PENDING_RE, _attr_matches, _first_image,
    _parse_attrs, _resize_data_url,
)

router = APIRouter(prefix="/catalogue", tags=["Catalogue"])

# Specs a customer chooses by; shown as each model's range of values.
_SPECS = ("car_type", "year", "battery_range", "color", "condition", "mileage")


def _sign(shop_id: str, opts: str) -> str:
    mac = hmac.new(settings.SECRET_KEY.encode(), f"higoverse-catalogue-v1:{shop_id}:{opts}".encode(), hashlib.sha256)
    return base64.urlsafe_b64encode(mac.digest()[:12]).decode().rstrip("=")


def catalogue_token(shop_id: str, prices: bool, currency: str = "RWF") -> str:
    """"<shop id>.<p|n><currency><signature>": prices shown or not, and the
    currency they're in (the shop's Settings, which the public can't read)."""
    opts = ("p" if prices else "n") + currency
    return f"{shop_id}.{opts}{_sign(shop_id, opts)}"


def _read_token(token: str) -> tuple[str, bool, str]:
    shop_id, _, rest = token.rpartition(".")
    opts, sig = rest[:4], rest[4:]
    if (not shop_id or len(opts) != 4 or opts[0] not in ("p", "n") or not opts[1:].isalpha()
            or not hmac.compare_digest(sig, _sign(shop_id, opts))):
        raise HTTPException(status_code=404, detail="Catalogue not found")
    return shop_id, opts[0] == "p", opts[1:]


@router.get("/link")
def get_link(prices: bool = True, currency: str = "RWF", user: dict = Depends(get_current_user)):
    if not user["shop_id"]:
        raise HTTPException(status_code=400, detail="You need a shop first")
    if user.get("layout") != "car":
        raise HTTPException(status_code=400, detail="The catalogue is for car companies")
    currency = currency.strip().upper()
    if len(currency) != 3 or not currency.isalpha() or not currency.isascii():
        raise HTTPException(status_code=400, detail="Currency is a 3-letter code, like RWF")
    return {"success": True, "data": {"token": catalogue_token(user["shop_id"], prices, currency), "prices": prices}}


def _cover(pid: str, src: str, size: int) -> str:
    key = (pid, len(src), src[-32:], size)
    cover = _COVER_CACHE.get(key)
    if cover is None:
        cover = _resize_data_url(src, size)
        _COVER_CACHE[key] = cover
        while len(_COVER_CACHE) > _COVER_CACHE_MAX:
            _COVER_CACHE.popitem(last=False)
    else:
        _COVER_CACHE.move_to_end(key)
    return cover


def _num(v):
    try:
        return float(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


# The page, its link preview and the Status card read the same catalogue
# within seconds of each other: keep each answer a minute.
_CACHE: dict[tuple, tuple[float, dict]] = {}
_CACHE_SECONDS = 60


def _catalogue(db: Session, shop_id: str, prices: bool, currency: str, size: int) -> dict:
    cars = (
        db.query(Product)
        .options(defer(Product.images))
        .filter(Product.shop_id == shop_id, Product.quantity > 0, ~_attr_matches(_PENDING_RE))
        .order_by(Product.created_at.desc(), Product.id)
        .limit(2000)
        .all()
    )

    models: dict[str, dict] = {}
    for p in cars:
        a = _parse_attrs(p.attributes)
        m = models.setdefault(p.name, {
            "name": p.name, "count": 0, "prices": [], "specs": {k: set() for k in _SPECS},
            "cover_id": None, "last_added": None,
        })
        m["count"] += 1
        if p.selling_price is not None:
            m["prices"].append(float(p.selling_price))
        for k in _SPECS:
            v = " ".join(str(a.get(k) or "").split())
            if v:
                m["specs"][k].add(v)
        # Newest car with a photo is the model's cover.
        if m["cover_id"] is None and p.thumbnail:
            m["cover_id"] = p.id
        if m["last_added"] is None and p.created_at:
            m["last_added"] = p.created_at

    cover_ids = [m["cover_id"] for m in models.values() if m["cover_id"]]
    sources = {
        pid: _first_image(images, thumb)
        for pid, images, thumb in (
            db.query(Product.id, Product.images, Product.thumbnail).filter(Product.id.in_(cover_ids)).all()
            if cover_ids else []
        )
    }

    out = []
    for m in models.values():
        specs = m["specs"]
        years = sorted({int(n) for y in specs["year"] if (n := _num(y))})
        ranges = sorted({int(n) for r in specs["battery_range"] if (n := _num(r))})
        mileages = sorted({int(n) for r in specs["mileage"] if (n := _num(r)) is not None})
        src = sources.get(m["cover_id"]) if m["cover_id"] else None
        out.append({
            "name": m["name"],
            "count": m["count"],
            "min_price": min(m["prices"]) if prices and m["prices"] else None,
            "max_price": max(m["prices"]) if prices and m["prices"] else None,
            "years": years,
            "car_types": sorted(specs["car_type"]),
            "colors": sorted(specs["color"], key=str.lower),
            "conditions": sorted(specs["condition"]),
            "battery_range": [ranges[0], ranges[-1]] if ranges else None,
            "mileage": [mileages[0], mileages[-1]] if mileages else None,
            "cover": _cover(m["cover_id"], src, size) if src else None,
            "last_added": m["last_added"].isoformat() if m["last_added"] else None,
        })
    # Models with photos first (they sell the catalogue), then most in stock.
    out.sort(key=lambda m: (m["cover"] is None, -m["count"], m["name"].lower()))

    return {
        "shop_id": shop_id,
        "prices": prices,
        "currency": currency,
        "total": len(cars),
        "models": out,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


@router.get("/public/{token}")
def get_public(token: str, response: Response, size: int = 640, db: Session = Depends(get_db)):
    shop_id, prices, currency = _read_token(token)
    size = min(max(size, 160), 1080)
    key = (shop_id, prices, currency, size)
    now = time.monotonic()
    hit = _CACHE.get(key)
    if hit and now - hit[0] < _CACHE_SECONDS:
        data = hit[1]
    else:
        data = _catalogue(db, shop_id, prices, currency, size)
        _CACHE[key] = (now, data)
        if len(_CACHE) > 200:
            for k in sorted(_CACHE, key=lambda k: _CACHE[k][0])[:100]:
                _CACHE.pop(k, None)
    response.headers["Cache-Control"] = "public, max-age=60"
    return {"success": True, "data": data}
