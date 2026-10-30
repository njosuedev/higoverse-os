"""A car company's proforma books its cars: each car goes "pending" for the
proforma's customer, with the offered price as the agreed price and the
proforma's deposits recorded on the car. This is the same record the
Vehicles page keeps when staff mark a car pending (apps/web
components/items/VehicleGrid.tsx, apps/mobile lib/src/reservation.dart):

  sale_status "pending", buyer_customer_id, buyer_name, buyer_phone,
  buyer_id_no, pending_since, pending_at, pending_note, agreed_price, and
  deposits (JSON text: [{amount, method, date, at, reference?}]).

Deposits copied from a proforma also carry `proforma_deposit_id`, so taking
one off the proforma takes it off the car too. Once the cars' deposits
reach the agreed price, the Vehicles page records the sale; sales.py then
marks the proforma sold.
"""
import json
from datetime import date, datetime, timezone

from fastapi import HTTPException

from app.core.product_client import get_product, update_product_attributes


def attrs_of(product: dict | None) -> dict:
    try:
        a = json.loads((product or {}).get("attributes") or "{}")
    except (TypeError, ValueError):
        a = {}
    return a if isinstance(a, dict) else {}


def _car_deposits(a: dict) -> list[dict]:
    try:
        d = json.loads(a.get("deposits") or "[]")
    except (TypeError, ValueError):
        d = []
    return [x for x in d if isinstance(x, dict)] if isinstance(d, list) else []


def _paid(deposits: list[dict]) -> float:
    total = 0.0
    for d in deposits:
        try:
            total += float(d.get("amount") or 0)
        except (TypeError, ValueError):
            pass
    return round(total, 2)


def _text(n: float) -> str:
    """15700000.0 → "15700000", as the apps store amounts."""
    return str(int(n)) if float(n).is_integer() else str(n)


def _cars(p, token: str) -> list[tuple[dict, dict, dict, float]]:
    """Each car on the proforma: (line, product, its attributes, price)."""
    out = []
    for line in p.lines or []:
        pid = line.get("product_id")
        if not pid:
            continue
        product = get_product(pid, token)
        if not product:
            raise HTTPException(status_code=400, detail=f"{line.get('product_name') or 'A vehicle'} is no longer in stock.")
        price = float(line.get("unit_price") or 0) * float(line.get("qty") or 1)
        out.append((line, product, attrs_of(product), round(price, 2)))
    return out


def _save(changes: list[tuple[str, str | None, str]], token: str) -> None:
    """Writes each car's new attributes; if one fails, puts back the ones
    already written and refuses, so no car is left half booked."""
    done = []
    for pid, old, new in changes:
        if not update_product_attributes(pid, new, token):
            for back_id, back_old in reversed(done):
                update_product_attributes(back_id, back_old, token)
            raise HTTPException(status_code=503, detail="Could not update the vehicle. Nothing was saved.")
        done.append((pid, old))


def undo(changes: list[tuple[str, str | None, str]], token: str) -> None:
    """Puts the cars back as they were before `book` (when saving the
    proforma itself fails afterwards)."""
    for pid, old, _ in reversed(changes):
        update_product_attributes(pid, old, token)


def book(p, deposits: list[dict], token: str) -> list[tuple[str, str | None, str]]:
    """Marks the proforma's cars pending for its customer and records
    `deposits` (the proforma's own entries) on them: spread over the cars in
    order, each up to what it still owes. Returns what changed, for `undo`."""
    cars = _cars(p, token)
    if not cars:
        raise HTTPException(status_code=400, detail="Pick at least one vehicle from stock.")

    now = datetime.now(timezone.utc).isoformat()
    plan = []
    for line, product, a, price in cars:
        name = product.get("name") or line.get("product_name") or "This vehicle"
        if (product.get("quantity") or 0) <= 0:
            raise HTTPException(status_code=409, detail=f"{name} is already sold.")
        holder = a.get("buyer_customer_id") if a.get("sale_status") == "pending" else None
        if holder and holder != p.customer_id:
            who = a.get("buyer_name") or "another customer"
            raise HTTPException(status_code=409, detail=f"{name} is already pending for {who}.")
        # Same customer already booked it: keep what they paid before.
        kept = _car_deposits(a) if holder else []
        plan.append({"product": product, "a": a, "price": price, "deposits": kept, "same": bool(holder)})

    for d in deposits:
        left = round(float(d.get("amount") or 0), 2)
        for i, car in enumerate(plan):
            if left <= 0:
                break
            room = max(0.0, car["price"] - _paid(car["deposits"]))
            take = left if i == len(plan) - 1 else min(left, room)
            if take <= 0:
                continue
            entry = {"amount": take, "method": d.get("method") or "cash", "date": d.get("date") or date.today().isoformat(),
                     "at": d.get("at") or now, "proforma_deposit_id": d.get("id")}
            if d.get("reference"):
                entry["reference"] = d["reference"]
            car["deposits"].append(entry)
            left = round(left - take, 2)

    changes = []
    for car in plan:
        a = car["a"]
        new = {
            **a,
            "sale_status": "pending",
            "buyer_customer_id": p.customer_id or "",
            "buyer_name": p.customer or "",
            "buyer_phone": p.customer_phone or "",
            "buyer_id_no": p.customer_id_no or "",
            "pending_since": a.get("pending_since") if car["same"] and a.get("pending_since") else date.today().isoformat(),
            "pending_at": a.get("pending_at") if car["same"] and a.get("pending_at") else now,
            "pending_note": f"Proforma {p.invoice_no}",
            "proforma_id": p.id,
            "agreed_price": _text(car["price"]),
            "deposits": json.dumps(car["deposits"], ensure_ascii=False) if car["deposits"] else "",
        }
        new = {k: v for k, v in new.items() if v not in (None, "")}
        old = car["product"].get("attributes")
        changes.append((car["product"]["id"], old, json.dumps(new, ensure_ascii=False)))
    _save(changes, token)
    return changes


# What marks a car pending (cleared the same way as on the Vehicles page).
_PENDING_KEYS = ("sale_status", "buyer_customer_id", "buyer_name", "buyer_phone", "buyer_id_no",
                 "pending_since", "pending_at", "pending_note", "proforma_id", "agreed_price", "deposits")


def rebook(p, old_lines: list[dict], old_customer_id: str | None, token: str) -> list[tuple[str, str | None, str]]:
    """A pending proforma's customer, cars or prices were changed: takes its
    booking off the cars it had, then books the cars it has now. A car that
    leaves the proforma (or whose buyer changes) goes back to available,
    unless payments were recorded on it from the Vehicles page: those are
    the customer's money, so it refuses. Returns what changed, for `undo`."""
    ours = {d.get("id") for d in p.deposits or [] if d.get("id")}
    keep_ids = {l.get("product_id") for l in p.lines or [] if l.get("product_id")}
    same_customer = (old_customer_id or "") == (p.customer_id or "")

    released = []
    seen = set()
    for line in old_lines or []:
        pid = line.get("product_id")
        if not pid or pid in seen:
            continue
        seen.add(pid)
        product = get_product(pid, token)
        if not product:
            continue
        a = attrs_of(product)
        if a.get("sale_status") != "pending":
            continue
        if a.get("proforma_id") not in (None, "", p.id):
            continue  # booked by another proforma
        if (a.get("buyer_customer_id") or "") != (old_customer_id or ""):
            continue  # booked for someone else
        deps = _car_deposits(a)
        others = [d for d in deps if d.get("proforma_deposit_id") not in ours]
        stays = pid in keep_ids and same_customer
        if others and not stays:
            name = product.get("name") or line.get("product_name") or "A vehicle"
            raise HTTPException(status_code=409, detail=(
                f"{name} has payments recorded on the Vehicles page. Remove them there first, "
                "or keep this vehicle and customer on the proforma."))
        if stays:
            # Kept: its proforma deposits are spread again by `book`.
            new = {**a, "deposits": json.dumps(others, ensure_ascii=False)} if others else {k: v for k, v in a.items() if k != "deposits"}
        else:
            new = {k: v for k, v in a.items() if k not in _PENDING_KEYS}
        released.append((pid, product.get("attributes"), json.dumps(new, ensure_ascii=False)))

    _save(released, token)
    try:
        booked = book(p, p.deposits or [], token)
    except Exception:
        undo(released, token)
        raise
    return released + booked


def drop_deposit(p, deposit_id: str, token: str) -> None:
    """Takes a deposit removed from the proforma off its cars too."""
    changes = []
    for _, product, a, _ in _cars(p, token):
        deps = _car_deposits(a)
        kept = [d for d in deps if d.get("proforma_deposit_id") != deposit_id]
        if len(kept) != len(deps):
            new = {**a, "deposits": json.dumps(kept, ensure_ascii=False)} if kept else {k: v for k, v in a.items() if k != "deposits"}
            changes.append((product["id"], product.get("attributes"), json.dumps(new, ensure_ascii=False)))
    if changes:
        _save(changes, token)


def paid_on_cars(p, token: str) -> float | None:
    """What the customer has paid on the proforma's cars (their deposits,
    including any recorded on the Vehicles page), or None when no car is
    pending for this customer."""
    total, found = 0.0, False
    for _, _, a, _ in _cars(p, token):
        if a.get("sale_status") == "pending" and a.get("buyer_customer_id") == p.customer_id:
            total += _paid(_car_deposits(a))
            found = True
    return round(total, 2) if found else None
