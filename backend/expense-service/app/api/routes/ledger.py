"""General ledger lines from the expense book and Income (car companies).
The web app's Ledger page merges these with sale-service's /ledger/lines.

GET /ledger/lines?to=YYYY-MM-DD   every posting up to that day

Each record is one balanced double entry:

  Expense (Rwanda)          Dr 6xxx by category          Cr Cash / Bank / Mobile money
  Expense abroad            Dr 5100 Vehicle import costs Cr Cash / Bank / Mobile money
  Money received (Expenses, direction "in")
                            Dr Cash / Bank / Mobile money Cr 4800 Other income
  Income                    Dr Cash / Bank / Mobile money Cr 41xx-48xx by source

Salaries, advances and bonuses paid from Payroll each add a "salaries"
expense, so they are in the ledger once, as 6030.
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.database import get_db
from app.models.expense import Expense
from app.models.income import Income

router = APIRouter(prefix="/ledger", tags=["Ledger"])

LEDGER_ROLES = {"owner", "admin"}
KIGALI = timezone(timedelta(hours=2))

EXPENSE_ACCOUNTS = {
    "rent": "6010", "utilities": "6020", "salaries": "6030", "supplies": "6040",
    "maintenance": "6050", "marketing": "6060", "transport": "6070", "taxes": "6080", "other": "6090",
}
IMPORT_COSTS = "5100"
INCOME_ACCOUNTS = {
    "rental": "4100", "services": "4200", "commission": "4300", "transport": "4400",
    "interest": "4500", "other": "4800",
}
OTHER_INCOME = "4800"


def require_ledger(user: dict = Depends(get_current_user)) -> dict:
    if user.get("layout") != "car" or user.get("role") not in LEDGER_ROLES:
        raise HTTPException(status_code=403, detail="The ledger is for the owner of a car company.")
    if not user.get("shop_id"):
        raise HTTPException(status_code=400, detail="This account has no business.")
    return user


def money_account(method: str | None) -> str:
    """Same accounts as sale-service's ledger: 1000 Cash, 1010 Bank,
    1020 MTN MoMo, 1030 Airtel Money."""
    m = (method or "").strip().lower()
    if m in ("mtn", "momo", "mobile", "mobile_money"):
        return "1020"
    if m in ("airtel", "airtel_money"):
        return "1030"
    if m in ("bank", "card", "cheque", "check", "transfer", "pos"):
        return "1010"
    return "1000"


def day_of(value: datetime | None) -> str:
    if value is None:
        return ""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(KIGALI).date().isoformat()


def _line(txn, day, kind, num, name, memo, account, debit, credit) -> dict:
    return {"txn": txn, "date": day, "type": kind, "num": num or "", "name": name or "", "memo": memo or "",
            "account": account, "debit": round(debit, 2), "credit": round(credit, 2), "currency": ""}


@router.get("/lines")
def ledger_lines(to: str | None = None, db: Session = Depends(get_db), user: dict = Depends(require_ledger)):
    shop = user["shop_id"]
    until = (to or "")[:10]
    lines: list[dict] = []

    for e in db.query(Expense).filter(Expense.shop_id == shop).all():
        day, amount = day_of(e.expense_date), round(float(e.amount or 0), 2)
        if not day or (until and day > until) or not amount:
            continue
        money = money_account(e.payment_method)
        payee = e.receiver_phone or e.bank_name or ""
        memo = e.title + (f" — {e.notes}" if e.notes else "")
        if e.direction == "in":
            lines += [_line(f"exp:{e.id}", day, "income", "", payee, memo, money, amount, 0),
                      _line(f"exp:{e.id}", day, "income", "", payee, memo, OTHER_INCOME, 0, amount)]
            continue
        category = e.category.value if hasattr(e.category, "value") else str(e.category or "other")
        account = IMPORT_COSTS if e.scope == "abroad" else EXPENSE_ACCOUNTS.get(category, "6090")
        lines += [_line(f"exp:{e.id}", day, "expense", "", payee, memo, account, amount, 0),
                  _line(f"exp:{e.id}", day, "expense", "", payee, memo, money, 0, amount)]

    for i in db.query(Income).filter(Income.shop_id == shop).all():
        day, amount = day_of(i.income_date), round(float(i.amount or 0), 2)
        if not day or (until and day > until) or not amount:
            continue
        memo = i.title + (f" — {i.notes}" if i.notes else "")
        account = INCOME_ACCOUNTS.get(i.source or "other", OTHER_INCOME)
        lines += [_line(f"inc:{i.id}", day, "income", i.reference, i.payer, memo, money_account(i.payment_method), amount, 0),
                  _line(f"inc:{i.id}", day, "income", i.reference, i.payer, memo, account, 0, amount)]

    lines.sort(key=lambda x: (x["date"], x["txn"]))
    return {"success": True, "data": {"lines": lines, "warnings": []}}
