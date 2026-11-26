"""General ledger lines for a car company. The web app's Ledger page builds
the QuickBooks-style General Ledger and Trial Balance from these, together
with expense-service's /ledger/lines.

GET /ledger/lines?to=YYYY-MM-DD   every posting up to that day (all history,
                                  so the page can work out opening balances)

Nothing is stored: every line is worked out from the records the business
already keeps, as balanced double entries (each transaction's debits equal
its credits):

  Deposit on a car / proforma   Dr Cash, Bank or Mobile money  Cr 2000 Customer deposits
  Vehicle sale                  Dr 2000 (the deposits it uses up)
                                Dr Cash/Bank/MoMo (paid at the sale)
                                Dr 1100 Accounts receivable (still owed)
                                                               Cr 4000 Vehicle sales
  Payment on a debt             Dr Cash                        Cr 1100
  Debt typed in by hand         Dr 1100                        Cr 3000 Opening balance equity
  Rental deposit (kosiyo)       Dr Cash/Bank/MoMo              Cr 2100 Rental deposits held
  Car returned                  Dr 2100 (all of it)            Cr Cash (given back)
                                                               Cr 4100 Rental income (kept)

Owners and admins of car companies only. No cost prices or
profit are sent.
"""
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.core.product_client import get_car_deposits
from app.core.security import get_current_user
from app.db.database import get_db
from app.models.debt import Debt, DebtPayment
from app.models.proforma import Proforma
from app.models.rental import CarRental
from app.models.sale import Sale

router = APIRouter(prefix="/ledger", tags=["Ledger"])

LEDGER_ROLES = {"owner", "admin"}
KIGALI = timezone(timedelta(hours=2))

CASH, BANK, MTN, AIRTEL = "1000", "1010", "1020", "1030"
RECEIVABLE, CUSTOMER_DEPOSITS, RENTAL_DEPOSITS = "1100", "2000", "2100"
OPENING_EQUITY, VEHICLE_SALES, RENTAL_INCOME = "3000", "4000", "4100"


def require_ledger(user: dict = Depends(get_current_user)) -> dict:
    if user.get("layout") != "car" or user.get("role") not in LEDGER_ROLES:
        raise HTTPException(status_code=403, detail="The ledger is for the owner of a car company.")
    if not user.get("shop_id"):
        raise HTTPException(status_code=400, detail="This account has no business.")
    return user


def money_account(method: str | None) -> str:
    """Where money received or paid sits, by how it moved."""
    m = (method or "").strip().lower()
    if m in ("mtn", "momo", "mobile", "mobile_money"):
        return MTN
    if m in ("airtel", "airtel_money"):
        return AIRTEL
    if m in ("bank", "card", "cheque", "check", "transfer", "pos"):
        return BANK
    return CASH


def day_of(value) -> str:
    """A date as YYYY-MM-DD in Kigali time (timestamps are kept in UTC)."""
    if value is None:
        return ""
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(KIGALI).date().isoformat()
    text = str(value).strip()
    if len(text) == 10 and text[4] == "-" and text[7] == "-":
        return text
    try:
        return day_of(datetime.fromisoformat(text.replace("Z", "+00:00")))
    except ValueError:
        return text[:10] if len(text) >= 10 and text[4] == "-" else ""


def _num(v) -> float:
    try:
        return round(float(v or 0), 2)
    except (TypeError, ValueError):
        return 0.0


class Book:
    """Collects balanced transactions as ledger lines."""

    def __init__(self, to: str = ""):
        self.to = to
        self.lines: list[dict] = []

    def post(self, txn: str, day: str, kind: str, num: str, name: str, memo: str,
             entries: list[tuple[str, float, float]], currency: str = "") -> None:
        """One transaction; entries are (account, debit, credit). A negative
        debit is a credit and the other way round."""
        if not day or (self.to and day > self.to):
            return
        clean = []
        for account, debit, credit in entries:
            debit, credit = round(float(debit), 2), round(float(credit), 2)
            if debit < 0:
                credit, debit = credit - debit, 0.0
            if credit < 0:
                debit, credit = debit - credit, 0.0
            net = round(debit - credit, 2)
            if net:
                clean.append((account, max(net, 0.0), max(-net, 0.0)))
        if not clean:
            return
        diff = round(sum(d for _, d, _ in clean) - sum(c for _, _, c in clean), 2)
        if diff:  # never by construction; the books stay balanced regardless
            clean.append((OPENING_EQUITY, max(-diff, 0.0), max(diff, 0.0)))
        for account, debit, credit in clean:
            self.lines.append({
                "txn": txn, "date": day, "type": kind, "num": num or "", "name": name or "",
                "memo": memo or "", "account": account, "debit": debit, "credit": credit,
                "currency": (currency or "").upper(),
            })


@router.get("/lines")
def ledger_lines(
    to: str | None = None,
    db: Session = Depends(get_db),
    user: dict = Depends(require_ledger),
    authorization: str = Header(None),
):
    shop = user["shop_id"]
    book = Book(day_of(to) if to else "")
    token = (authorization or "").replace("Bearer ", "")
    warnings: list[str] = []

    proformas = db.query(Proforma).filter(Proforma.shop_id == shop).all()
    sales = db.query(Sale).filter(Sale.shop_id == shop).order_by(Sale.created_at, Sale.id).all()
    debts = db.query(Debt).filter(Debt.shop_id == shop).all()
    rentals = db.query(CarRental).filter(CarRental.shop_id == shop).all()
    cars = get_car_deposits(token)
    if cars is None:
        cars = []
        warnings.append("vehicles_unreachable")

    # ── Deposits received (Dr money, Cr 2000) ────────────────────────────
    deposits_on_car: dict[str, float] = defaultdict(float)
    buyer_of_car: dict[str, str] = {}
    on_cars: set[str] = set()
    for car in cars:
        pid = car.get("product_id") or ""
        label = " ".join(x for x in (car.get("name"), car.get("plate_no")) if x)
        buyer_of_car[pid] = car.get("buyer_name") or ""
        for i, d in enumerate(car.get("deposits") or []):
            amount = _num(d.get("amount"))
            if amount <= 0:
                continue
            if d.get("proforma_deposit_id"):
                on_cars.add(str(d["proforma_deposit_id"]))
            deposits_on_car[pid] += amount
            book.post(f"cardep:{pid}:{i}", day_of(d.get("date") or d.get("at")), "deposit", d.get("reference") or "",
                      car.get("buyer_name") or "", f"Deposit on {label}".strip(),
                      [(money_account(d.get("method")), amount, 0), (CUSTOMER_DEPOSITS, 0, amount)])

    proforma_of_sale: dict[str, Proforma] = {}
    deposits_on_proforma: dict[str, float] = defaultdict(float)
    for p in proformas:
        for sid in p.sale_ids or []:
            proforma_of_sale[sid] = p
        items = [d for d in (p.deposits or []) if isinstance(d, dict)]
        if not items and _num(p.deposit_amount) > 0:  # made before deposits were itemised
            items = [{"id": "legacy", "amount": p.deposit_amount, "method": "cash", "date": p.date}]
        for d in items:
            amount = _num(d.get("amount"))
            if amount <= 0 or str(d.get("id")) in on_cars:
                continue  # already counted on its car
            deposits_on_proforma[p.id] += amount
            book.post(f"pfdep:{p.id}:{d.get('id')}", day_of(d.get("date") or d.get("at") or p.date), "deposit",
                      p.invoice_no, p.customer or "", f"Deposit on proforma {p.invoice_no}",
                      [(money_account(d.get("method")), amount, 0), (CUSTOMER_DEPOSITS, 0, amount)], p.currency)

    # ── Sales (Cr 4000) ─────────────────────────────────────────────────
    def paid_of(s: Sale) -> float:
        total = _num(s.total_amount)
        if s.amount_paid is None:
            return 0.0 if s.payment_method == "debt" else total
        return min(_num(s.amount_paid), total)

    # The deposits each sale uses up: a proforma's pool (its own deposits and
    # its cars'), in the order its sales were made; otherwise its car's.
    applied: dict[str, float] = {}
    groups: dict[str, list[Sale]] = defaultdict(list)
    for s in sales:
        p = proforma_of_sale.get(s.id)
        if p:
            groups[p.id].append(s)
        else:
            applied[s.id] = min(deposits_on_car.get(s.product_id, 0.0), paid_of(s))
            deposits_on_car[s.product_id] = max(deposits_on_car.get(s.product_id, 0.0) - applied[s.id], 0.0)
    for pid, group in groups.items():
        pool = deposits_on_proforma.get(pid, 0.0) + sum(deposits_on_car.pop(s.product_id, 0.0) for s in group)
        for s in group:
            applied[s.id] = min(pool, paid_of(s))
            pool -= applied[s.id]

    debt_of_sale = {d.sale_id: d for d in debts if d.sale_id}
    sales_by_id = {s.id: s for s in sales}
    for s in sales:
        p = proforma_of_sale.get(s.id)
        total, paid = _num(s.total_amount), paid_of(s)
        used = applied.get(s.id, 0.0)
        name = (p.customer if p else "") or buyer_of_car.get(s.product_id) or (
            debt_of_sale[s.id].debtor_name if s.id in debt_of_sale else "")
        memo = (s.product_name or "Vehicle") + (f" x{s.quantity}" if (s.quantity or 1) != 1 else "")
        book.post(f"sale:{s.id}", day_of(s.created_at), "sale", p.invoice_no if p else s.id[:8].upper(), name, memo,
                  [(CUSTOMER_DEPOSITS, used, 0), (money_account(s.payment_method), paid - used, 0),
                   (RECEIVABLE, total - paid, 0), (VEHICLE_SALES, 0, total)],
                  p.currency if p else "")

    # ── Debts: payments received (Dr Cash, Cr 1100) ──────────────────────
    payments: dict[str, list[DebtPayment]] = defaultdict(list)
    for row in db.query(DebtPayment).filter(DebtPayment.shop_id == shop).order_by(DebtPayment.created_at).all():
        payments[row.debt_id].append(row)
    for d in debts:
        sale = sales_by_id.get(d.sale_id or "")
        if sale:
            p = proforma_of_sale.get(sale.id)
            at_sale = sum(paid_of(s) for s in groups[p.id]) if p else paid_of(sale)
        else:
            # Typed in by hand (or its sale is gone): what is owed comes into
            # the books on the day the debt was recorded.
            at_sale = 0.0
            book.post(f"debt:{d.id}", day_of(d.created_at), "debt", "", d.debtor_name, d.notes or "Debt recorded",
                      [(RECEIVABLE, _num(d.amount_owed), 0), (OPENING_EQUITY, 0, _num(d.amount_owed))])
        received = round(_num(d.amount_paid) - at_sale, 2)
        dated = 0.0
        for row in payments.get(d.id, []):
            amount = _num(row.amount)
            dated += amount
            book.post(f"debtpay:{row.id}", day_of(row.created_at), "payment", "", d.debtor_name, "Payment on debt",
                      [(CASH, amount, 0), (RECEIVABLE, 0, amount)])
        rest = round(received - dated, 2)
        if rest:  # paid before payments were dated
            book.post(f"debtpay:{d.id}:earlier", day_of(d.created_at), "payment", "", d.debtor_name,
                      "Payment on debt (date not recorded)", [(CASH, rest, 0), (RECEIVABLE, 0, rest)])

    # ── Rentals (2100 held, 4100 kept) ───────────────────────────────────
    for r in rentals:
        car = " ".join(x for x in (r.car_name, r.plate_no) if x)
        held = 0.0
        if _num(r.deposit) > 0:
            held += _num(r.deposit)
            book.post(f"rentdep:{r.id}", day_of(r.agreement_date or r.created_at), "rental_deposit", r.rental_no,
                      r.customer, f"Rental deposit, {car}",
                      [(CASH, _num(r.deposit), 0), (RENTAL_DEPOSITS, 0, _num(r.deposit))], r.currency)
        for i, x in enumerate(r.extra_deposits or []):
            if not isinstance(x, dict) or _num(x.get("amount")) <= 0:
                continue
            amount = _num(x.get("amount"))
            held += amount
            book.post(f"rentdep:{r.id}:{x.get('id') or i}", day_of(x.get("date") or x.get("at")), "rental_deposit",
                      r.rental_no, r.customer, f"Rental deposit, {car}",
                      [(money_account(x.get("method")), amount, 0), (RENTAL_DEPOSITS, 0, amount)], r.currency)
        if r.status == "returned" and held > 0:
            back = min(_num(r.deposit_returned), held)
            book.post(f"rentret:{r.id}", day_of(r.returned_at), "rental_return", r.rental_no, r.customer,
                      f"Car returned, {car}" + (f": {r.return_note}" if r.return_note else ""),
                      [(RENTAL_DEPOSITS, held, 0), (CASH, 0, back), (RENTAL_INCOME, 0, held - back)], r.currency)

    book.lines.sort(key=lambda x: (x["date"], x["txn"]))
    return {"success": True, "data": {"lines": book.lines, "warnings": warnings}}
