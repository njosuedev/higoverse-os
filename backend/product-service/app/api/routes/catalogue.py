"""A car company's public catalogue: the cars it has for sale, one card per
car name (model), for customers who open a shared link or see the
WhatsApp Status card.

GET /catalogue/link?prices=1&currency=RWF&lang=en  staff: the shop's short link code
GET /catalogue/public/{token}                      anyone with the link: the cars on sale
GET /catalogue/public/{token}/cover?name=          one car name's cover photo (JPEG)
GET /catalogue/public/{token}/photos?name=         one car name's photos, for its gallery
GET /catalogue/public/{token}/version              a fingerprint of the cars on sale, polled by
                                                   the open page so it updates as stock changes

A link is higoverse.com/c/<code>: 8 random letters and digits, stored with
the shop, whether prices show, the currency and the language, so it can't be
guessed from the public directory nor edited to show prices. Older links
carry a signed token instead ("<shop>.<p|n><currency><signature>") and still
open. Only cars on sale with a photo are listed (in stock, not pending), and
only what a customer may see: no plate, chassis, cost or buyer details.
"""
import base64
import hashlib
import hmac
import io
import json
import secrets
import string
import time
import uuid
from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, defer

from app.core.config import settings
from app.core.security import get_current_user
from app.db.database import get_db
from app.models.catalogue_link import CatalogueLink
from app.models.product import Product
from app.api.routes.products import (
    _COVER_CACHE, _COVER_CACHE_MAX, _PENDING_RE, _attr_matches, _first_image,
    _parse_attrs,
)

router = APIRouter(prefix="/catalogue", tags=["Catalogue"])

# Specs a customer chooses by; shown as each model's range of values.
_SPECS = ("car_type", "year", "battery_range", "color", "condition", "mileage")


def _sign(shop_id: str, opts: str) -> str:
    mac = hmac.new(settings.SECRET_KEY.encode(), f"higoverse-catalogue-v1:{shop_id}:{opts}".encode(), hashlib.sha256)
    return base64.urlsafe_b64encode(mac.digest()[:12]).decode().rstrip("=")


def _short_id(shop_id: str) -> str:
    """A UUID shop id in 22 characters instead of 36, for a shorter link."""
    try:
        return base64.urlsafe_b64encode(uuid.UUID(shop_id).bytes).decode().rstrip("=")
    except ValueError:
        return shop_id


def _full_id(short: str) -> str:
    if len(short) == 22:
        try:
            raw = base64.urlsafe_b64decode(short + "==")
            if len(raw) == 16:
                return str(uuid.UUID(bytes=raw))
        except (ValueError, TypeError):
            pass
    return short


def catalogue_token(shop_id: str, prices: bool, currency: str = "RWF") -> str:
    """"<shop id>.<p|n><currency><signature>": prices shown or not, and the
    currency they're in (the shop's Settings, which the public can't read).
    The shop id is written short; links with the full id still open."""
    opts = ("p" if prices else "n") + currency
    return f"{_short_id(shop_id)}.{opts}{_sign(shop_id, opts)}"


def _read_token(token: str) -> tuple[str, bool, str]:
    written, _, rest = token.rpartition(".")
    shop_id = _full_id(written)
    opts, sig = rest[:4], rest[4:]
    if (not shop_id or len(opts) != 4 or opts[0] not in ("p", "n") or not opts[1:].isalpha()
            or not hmac.compare_digest(sig, _sign(shop_id, opts))):
        raise HTTPException(status_code=404, detail="Catalogue not found")
    return shop_id, opts[0] == "p", opts[1:]


_CODE_CHARS = string.ascii_letters + string.digits
_LANGS = {"en", "rw", "fr", "sw", "zh"}


def _resolve(db: Session, token: str) -> tuple[str, bool, str, str | None]:
    """(shop id, prices shown, currency, language) for a short code or an
    older signed token (which has no language); 404 for anything else."""
    if "." in token:
        shop_id, prices, currency = _read_token(token)
        return shop_id, prices, currency, None
    link = db.query(CatalogueLink).filter(CatalogueLink.code == token).first() if 6 <= len(token) <= 12 and token.isalnum() else None
    if not link:
        raise HTTPException(status_code=404, detail="Catalogue not found")
    return link.shop_id, link.prices, link.currency, link.lang


@router.get("/link")
def get_link(prices: bool = True, currency: str = "RWF", lang: str = "en",
             db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    if not user["shop_id"]:
        raise HTTPException(status_code=400, detail="You need a shop first")
    if user.get("layout") != "car":
        raise HTTPException(status_code=400, detail="The catalogue is for car companies")
    currency = currency.strip().upper()
    if len(currency) != 3 or not currency.isalpha() or not currency.isascii():
        raise HTTPException(status_code=400, detail="Currency is a 3-letter code, like RWF")
    lang = lang if lang in _LANGS else "en"
    where = (CatalogueLink.shop_id == user["shop_id"], CatalogueLink.prices == prices,
             CatalogueLink.currency == currency, CatalogueLink.lang == lang)
    link = db.query(CatalogueLink).filter(*where).first()
    for _ in range(5):
        if link:
            break
        try:
            link = CatalogueLink(code="".join(secrets.choice(_CODE_CHARS) for _ in range(8)), shop_id=user["shop_id"],
                                 prices=prices, currency=currency, lang=lang)
            db.add(link)
            db.commit()
        except IntegrityError:
            # The same code drawn twice, or a second tab made this link first.
            db.rollback()
            link = db.query(CatalogueLink).filter(*where).first()
    if not link:
        raise HTTPException(status_code=500, detail="Could not make the link; try again")
    return {"success": True, "data": {"token": link.code, "code": link.code, "path": f"/c/{link.code}",
                                      "prices": prices, "lang": lang}}


def _retouch(data_url: str, size: int, crop: bool = True) -> str:
    """The photo as the catalogue shows it: gently auto-levelled, a little
    more colour and sharpened for small screens. With `crop`, every car in the
    same 16:10 frame (centred), for the Status card and link preview; without,
    the whole photo, for the page. Only this copy changes; the stored photo
    never does."""
    try:
        from PIL import Image, ImageEnhance, ImageFilter, ImageOps
    except ImportError:
        return data_url
    try:
        img = Image.open(io.BytesIO(base64.b64decode(data_url.split(",", 1)[1])))
        img = ImageOps.exif_transpose(img).convert("RGB")
        if crop:
            w = min(size, img.width)
            img = ImageOps.fit(img, (w, round(w * 10 / 16)), Image.LANCZOS, centering=(0.5, 0.55))
        else:
            img.thumbnail((size, size), Image.LANCZOS)
        img = ImageOps.autocontrast(img, cutoff=0.5, preserve_tone=True)
        img = ImageEnhance.Color(img).enhance(1.12)
        img = ImageEnhance.Contrast(img).enhance(1.04)
        img = img.filter(ImageFilter.UnsharpMask(radius=1.6, percent=70, threshold=3))
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=84, optimize=True, progressive=True)
        return "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode()
    except Exception:
        return data_url


def _cover(pid: str, src: str, size: int, crop: bool = True) -> str:
    key = ("catalogue", pid, len(src), src[-32:], size, crop)
    cover = _COVER_CACHE.get(key)
    if cover is None:
        cover = _retouch(src, size, crop)
        _COVER_CACHE[key] = cover
        while len(_COVER_CACHE) > _COVER_CACHE_MAX:
            _COVER_CACHE.popitem(last=False)
    else:
        _COVER_CACHE.move_to_end(key)
    return cover


def _days_ago(when) -> float:
    if when.tzinfo is None:
        return (time.time() - when.replace(tzinfo=timezone.utc).timestamp()) / 86400
    return (time.time() - when.timestamp()) / 86400


def _num(v):
    try:
        return float(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


# The page, its link preview and the Status card read the same catalogue
# within seconds of each other: keep each answer a minute.
_CACHE: dict[tuple, tuple[float, dict]] = {}
_CACHE_SECONDS = 60


def _on_sale(shop_id: str):
    """Cars a customer may see: in stock, not pending, with a photo."""
    return (Product.shop_id == shop_id, Product.quantity > 0, ~_attr_matches(_PENDING_RE),
            func.coalesce(Product.thumbnail, "") != "")


_VERSIONS: dict[str, tuple[float, str]] = {}
_VERSION_SECONDS = 3


def _version(db: Session, shop_id: str) -> str:
    """Changes whenever a car on sale is added, sold, repriced, re-described
    or gets new photos; read from the small columns only (never `images`)."""
    now = time.monotonic()
    hit = _VERSIONS.get(shop_id)
    if hit and now - hit[0] < _VERSION_SECONDS:
        return hit[1]
    rows = (
        db.query(Product.id, Product.name, Product.quantity, Product.selling_price, Product.attributes,
                 func.length(Product.thumbnail), func.length(Product.images))
        .filter(*_on_sale(shop_id))
        .order_by(Product.id)
        .limit(2000)
        .all()
    )
    digest = hashlib.sha1(repr([tuple(r) for r in rows]).encode()).hexdigest()[:12]
    _VERSIONS[shop_id] = (now, digest)
    if len(_VERSIONS) > 500:
        _VERSIONS.clear()
    return digest


def _catalogue(db: Session, shop_id: str, prices: bool, currency: str, size: int, covers: bool = True) -> dict:
    cars = (
        db.query(Product)
        .options(defer(Product.images))
        .filter(*_on_sale(shop_id))
        .order_by(Product.created_at.desc(), Product.id)
        .limit(2000)
        .all()
    )

    models: dict[str, dict] = {}
    for p in cars:
        a = _parse_attrs(p.attributes)
        m = models.setdefault(p.name, {
            "name": p.name, "count": 0, "prices": [], "specs": {k: set() for k in _SPECS},
            "cover_id": None, "last_added": None, "colors": {}, "with_photos": 0,
        })
        m["count"] += 1
        # Cars per colour, as first spelled ("white" and "White" are one).
        color = " ".join(str(a.get("color") or "").split())
        if color:
            spelled = next((c for c in m["colors"] if c.lower() == color.lower()), color)
            m["colors"][spelled] = m["colors"].get(spelled, 0) + 1
        if p.thumbnail:
            m["with_photos"] += 1
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

    cover_ids = [m["cover_id"] for m in models.values() if m["cover_id"]] if covers else []
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
            "colors": sorted(m["colors"], key=str.lower),
            "color_counts": m["colors"],
            "photos": m["with_photos"],
            "conditions": sorted(specs["condition"]),
            "battery_range": [ranges[0], ranges[-1]] if ranges else None,
            "mileage": [mileages[0], mileages[-1]] if mileages else None,
            "cover": _cover(m["cover_id"], src, size) if src else None,
            "has_cover": bool(m["cover_id"]),
            "last_added": m["last_added"].isoformat() if m["last_added"] else None,
            # Stocked in this past week: "New arrival" on the card.
            "new_arrival": bool(m["last_added"]) and _days_ago(m["last_added"]) <= 7,
        })
    # Models with photos first (they sell the catalogue), then most in stock.
    out.sort(key=lambda m: (not m["has_cover"], -m["count"], m["name"].lower()))

    return {
        "shop_id": shop_id,
        "prices": prices,
        "currency": currency,
        "total": len(cars),
        "models": out,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


@router.get("/public/{token}")
def get_public(token: str, response: Response, size: int = 640, covers: bool = True, db: Session = Depends(get_db)):
    shop_id, prices, currency, lang = _resolve(db, token)
    size = min(max(size, 160), 1080)
    # Kept until the cars change, so a sale shows at once.
    version = _version(db, shop_id)
    key = (shop_id, prices, currency, size, covers, version)
    now = time.monotonic()
    hit = _CACHE.get(key)
    if hit and now - hit[0] < _CACHE_SECONDS:
        data = hit[1]
    else:
        data = {**_catalogue(db, shop_id, prices, currency, size, covers), "version": version}
        _CACHE[key] = (now, data)
        if len(_CACHE) > 200:
            for k in sorted(_CACHE, key=lambda k: _CACHE[k][0])[:100]:
                _CACHE.pop(k, None)
    response.headers["Cache-Control"] = "no-cache"
    return {"success": True, "data": {**data, "lang": lang}}


@router.get("/public/{token}/version")
def get_version(token: str, response: Response, db: Session = Depends(get_db)):
    shop_id, _, _, _ = _resolve(db, token)
    response.headers["Cache-Control"] = "no-store"
    return {"success": True, "data": {"version": _version(db, shop_id)}}


@router.get("/public/{token}/cover")
def get_cover(token: str, name: str, size: int = 640, db: Session = Depends(get_db)):
    """One car name's cover as a JPEG file, the whole photo uncropped, so the
    page stays small and browsers cache each photo (the page adds the
    catalogue version to the address, so a new photo is a new file)."""
    shop_id, _, _, _ = _resolve(db, token)
    size = min(max(size, 160), 1280)
    row = (
        db.query(Product.id, Product.images, Product.thumbnail)
        .filter(*_on_sale(shop_id), Product.name == name)
        .order_by(Product.created_at.desc(), Product.id)
        .first()
    )
    src = _first_image(row.images, row.thumbnail) if row else None
    if not src:
        raise HTTPException(status_code=404, detail="No photo")
    cover = _cover(row.id, src, size, crop=False)
    return Response(content=base64.b64decode(cover.split(",", 1)[1]), media_type="image/jpeg",
                    headers={"Cache-Control": "public, max-age=86400"})


# A car name's gallery: every photo of its cars on sale, newest car first,
# whole and retouched like the covers. Read when a customer opens that car.
_MAX_PHOTOS = 60


@router.get("/public/{token}/photos")
def get_photos(token: str, name: str, response: Response, size: int = 960, db: Session = Depends(get_db)):
    shop_id, _, _, _ = _resolve(db, token)
    size = min(max(size, 320), 1280)
    cars = (
        db.query(Product.id, Product.images, Product.thumbnail)
        .filter(*_on_sale(shop_id), Product.name == name)
        .order_by(Product.created_at.desc(), Product.id)
        .limit(_MAX_PHOTOS)
        .all()
    )
    out, seen = [], set()
    for pid, images, thumbnail in cars:
        try:
            lst = json.loads(images) if images else []
        except ValueError:
            lst = []
        srcs = [i for i in lst if isinstance(i, str) and i.startswith("data:")] if isinstance(lst, list) else []
        if not srcs and isinstance(thumbnail, str) and thumbnail.startswith("data:"):
            srcs = [thumbnail]
        for n, src in enumerate(srcs):
            mark = (len(src), src[-64:])  # the same photo on two cars counts once
            if mark in seen:
                continue
            seen.add(mark)
            out.append(_cover(f"{pid}:{n}", src, size, crop=False))
            if len(out) >= _MAX_PHOTOS:
                break
        if len(out) >= _MAX_PHOTOS:
            break
    response.headers["Cache-Control"] = "no-cache"
    return {"success": True, "data": out}
