import uuid
from sqlalchemy import Column, String, Numeric, DateTime, Text, Enum as SAEnum
from sqlalchemy.sql import func
from app.db.database import Base
import enum


class ExpenseCategory(str, enum.Enum):
    rent        = "rent"
    utilities   = "utilities"
    salaries    = "salaries"
    supplies    = "supplies"
    maintenance = "maintenance"
    marketing   = "marketing"
    transport   = "transport"
    taxes       = "taxes"
    other       = "other"


class Expense(Base):
    __tablename__ = "expenses"

    id           = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    shop_id      = Column(String, index=True, nullable=False)
    created_by   = Column(String, nullable=False)

    title        = Column(String, nullable=False)
    category     = Column(SAEnum(ExpenseCategory), nullable=False, default=ExpenseCategory.other)
    amount       = Column(Numeric(12, 2), nullable=False)
    notes        = Column(Text, nullable=True)

    expense_date     = Column(DateTime(timezone=True), nullable=False)
    created_at       = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    proof_data       = Column(Text, nullable=True)

    payment_method   = Column(String, nullable=True)   # "mtn" | "bank"
    bank_name        = Column(String, nullable=True)   # e.g. "BK Bank"
    bank_account     = Column(String, nullable=True)   # account number / reference
    receiver_phone   = Column(String, nullable=True)   # phone of money recipient
    # "in": money received, recorded here by mistake or for the record; never
    # counted as spending. Empty (older rows) or "out": money spent.
    direction        = Column(String(3), nullable=True)
    # Where the money went or came from: "abroad" before the goods reach
    # Rwanda (buying in China, shipping…), "rwanda" once here (duties,
    # clearing, rent…). Empty on older rows = Rwanda.
    scope            = Column(String(10), nullable=True)
    # RRA: what supports it for income tax. "ebm" (EBM receipt), "wht"
    # (withholding tax declared), "dmc" (customs declaration) or "none": no
    # EBM, so it must be lodged in the RRA Tax Ledger with its documents; the
    # supplier, their TIN/ID, the document number and why there is no EBM
    # are kept. Empty on older rows.
    ebm_support      = Column(String(4), nullable=True)
    supplier_name    = Column(String(150), nullable=True)
    supplier_tin     = Column(String(40), nullable=True)     # TIN, or national ID / passport
    doc_ref          = Column(String(100), nullable=True)    # receipt, contract, invoice or bank reference
    no_ebm_reason    = Column(String(20), nullable=True)
    # The expense book's internal reference: 001, 002, … per business (core/voucher.py).
    voucher_no       = Column(String(20), nullable=True)     # bank | abroad | government | unregistered | other
