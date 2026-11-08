"""RRA EBM (Electronic Billing Machine) records, kept by sale-service.

Higoverse is a private invoicing system, so it reaches RRA through a VSDC
(Virtual Sales Data Controller, RRA_VSDC_DOC_v1.0.4). Every sale sent there
comes back signed: receipt number, internal data, signature, SDC ID and MRC,
which the printed receipt must show. See app/ebm/.
"""
import uuid
from sqlalchemy import (Boolean, Column, DateTime, ForeignKey, Integer, JSON, Numeric, String, Text,
                        UniqueConstraint)
from sqlalchemy.sql import func
from app.db.database import Base


class EbmConfig(Base):
    """One business's EBM device (TIN + branch + device serial)."""
    __tablename__ = "ebm_configs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    shop_id = Column(String, unique=True, index=True, nullable=False)

    enabled = Column(Boolean, nullable=False, default=False)
    # When EBM was (last) turned on: sales from then on must all be signed.
    enabled_at = Column(DateTime(timezone=True), nullable=True)
    # Sign every sale as it is recorded (the web app does it right after the sale).
    auto_issue = Column(Boolean, nullable=False, default=True)
    # Send stock movements and remaining quantities after each receipt.
    report_stock = Column(Boolean, nullable=False, default=True)

    tin = Column(String(9), nullable=True)
    bhf_id = Column(String(2), nullable=False, default="00")
    device_serial = Column(String(100), nullable=True)

    # Applied to products that have no EBM details of their own yet.
    default_item_class = Column(String(10), nullable=True)
    default_tax_type = Column(String(1), nullable=False, default="B")
    # Origin country of the goods (RRA nation code), the first letters of item codes.
    default_origin = Column(String(2), nullable=True, default="RW")

    # From RRA, on initialisation.
    taxpayer_name = Column(String(60), nullable=True)
    branch_name = Column(String(60), nullable=True)
    device_id = Column(String(20), nullable=True)
    sdc_id = Column(String(20), nullable=True)
    mrc_no = Column(String(20), nullable=True)
    initialized_at = Column(DateTime(timezone=True), nullable=True)

    # Counters. Each is only ever increased under a row lock (app/ebm/service.py).
    last_invoice_no = Column(Integer, nullable=False, default=0)
    last_stock_no = Column(Integer, nullable=False, default=0)
    last_item_seq = Column(Integer, nullable=False, default=0)

    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class EbmItem(Base):
    """How one product is declared to RRA (item code, class, tax type)."""
    __tablename__ = "ebm_items"
    __table_args__ = (UniqueConstraint("shop_id", "product_id", name="uq_ebm_item_product"),
                      UniqueConstraint("shop_id", "item_code", name="uq_ebm_item_code"))

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    shop_id = Column(String, index=True, nullable=False)
    product_id = Column(String, index=True, nullable=False)

    item_code = Column(String(20), nullable=False)       # itemCd, e.g. RW2NTU0000001
    item_class = Column(String(10), nullable=False)      # itemClsCd (RRA list)
    item_type = Column(String(1), nullable=False, default="2")  # 1 raw, 2 finished, 3 service
    tax_type = Column(String(1), nullable=False, default="B")   # A-EX, B 18%, C, D
    origin = Column(String(2), nullable=False, default="RW")
    pkg_unit = Column(String(5), nullable=False, default="NT")
    qty_unit = Column(String(5), nullable=False, default="U")

    # Saved on RRA's side with the details above (cleared when they change).
    registered = Column(Boolean, nullable=False, default=False)
    registered_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class EbmInvoice(Base):
    """One receipt sent to RRA: a sale (S) or a refund of one (R)."""
    __tablename__ = "ebm_invoices"
    __table_args__ = (UniqueConstraint("shop_id", "invoice_no", name="uq_ebm_invoice_no"),)

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    shop_id = Column(String, index=True, nullable=False)

    invoice_no = Column(Integer, nullable=False)          # invcNo
    original_invoice_no = Column(Integer, nullable=False, default=0)  # orgInvcNo (refunds)
    receipt_type = Column(String(1), nullable=False, default="S")     # S sale, R refund
    refunded_by = Column(String, nullable=True)           # the refund's EbmInvoice id
    refund_reason = Column(String(2), nullable=True)
    # The refund log book RRA requires (CIS spec §14): why, and who got the money back.
    refund_note = Column(Text, nullable=True)
    refund_recipient = Column(String(100), nullable=True)

    customer_tin = Column(String(9), nullable=True)
    customer_name = Column(String(60), nullable=True)
    customer_phone = Column(String(20), nullable=True)
    payment_code = Column(String(2), nullable=False, default="01")

    total_amount = Column(Numeric(18, 2), nullable=False, default=0)
    total_tax = Column(Numeric(18, 2), nullable=False, default=0)

    # pending → signed, or failed (can be sent again with the same number).
    status = Column(String(10), nullable=False, default="pending", index=True)
    error = Column(Text, nullable=True)
    attempts = Column(Integer, nullable=False, default=0)

    # Exactly what was sent, so a retry sends the same receipt.
    request = Column(JSON, nullable=False)

    # RRA's answer (printed on the receipt).
    receipt_no = Column(Integer, nullable=True)          # rcptNo
    total_receipt_no = Column(Integer, nullable=True)    # totRcptNo
    internal_data = Column(String(64), nullable=True)    # intrlData
    signature = Column(String(64), nullable=True)        # rcptSign
    sdc_id = Column(String(20), nullable=True)
    mrc_no = Column(String(20), nullable=True)
    signed_at_rra = Column(String(14), nullable=True)    # vsdcRcptPbctDate, yyyyMMddHHmmss
    signed_at = Column(DateTime(timezone=True), nullable=True)

    # Stock movement reported after signing: sent, failed, skipped.
    stock_status = Column(String(10), nullable=True)
    stock_no = Column(Integer, nullable=True)
    stock_error = Column(Text, nullable=True)

    created_by = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class EbmInvoiceSale(Base):
    """Which sales a receipt covers (a checkout is one sale row per product)."""
    __tablename__ = "ebm_invoice_sales"
    __table_args__ = (UniqueConstraint("invoice_id", "sale_id", name="uq_ebm_invoice_sale"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(String, ForeignKey("ebm_invoices.id", ondelete="CASCADE"), index=True, nullable=False)
    sale_id = Column(String, index=True, nullable=False)
    shop_id = Column(String, index=True, nullable=False)


class EbmCashMove(Base):
    """Cash put into or taken out of the till (CIS spec §7.12), shown on X/Z reports."""
    __tablename__ = "ebm_cash_moves"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    shop_id = Column(String, index=True, nullable=False)
    kind = Column(String(10), nullable=False)            # deposit | withdrawal
    amount = Column(Numeric(18, 2), nullable=False)
    note = Column(String(200), nullable=True)
    created_by = Column(String, nullable=True)
    created_by_name = Column(String(60), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


class EbmCopyLog(Base):
    """Each reprint of a signed receipt: a COPY (CS for a sale, CR for a refund)."""
    __tablename__ = "ebm_copy_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    shop_id = Column(String, index=True, nullable=False)
    invoice_id = Column(String, ForeignKey("ebm_invoices.id", ondelete="CASCADE"), index=True, nullable=False)
    label = Column(String(2), nullable=False)
    amount = Column(Numeric(18, 2), nullable=False, default=0)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


class EbmZReport(Base):
    """A closed day (Z daily report, CIS spec §19), kept as an accounting record."""
    __tablename__ = "ebm_z_reports"
    __table_args__ = (UniqueConstraint("shop_id", "number", name="uq_ebm_z_number"),)

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    shop_id = Column(String, index=True, nullable=False)
    number = Column(Integer, nullable=False)
    day = Column(String(10), nullable=False)             # yyyy-mm-dd (Kigali)
    period_from = Column(DateTime(timezone=True), nullable=False)
    period_to = Column(DateTime(timezone=True), nullable=False)
    data = Column(JSON, nullable=False)
    created_by = Column(String, nullable=True)
    created_by_name = Column(String(60), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class EbmItemClass(Base):
    """RRA's item classification list (the same for everyone), cached."""
    __tablename__ = "ebm_item_classes"

    code = Column(String(10), primary_key=True)
    name = Column(String(200), nullable=False)
    level = Column(Integer, nullable=True)
    tax_type = Column(String(1), nullable=True)
    in_use = Column(Boolean, nullable=False, default=True)
    synced_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
