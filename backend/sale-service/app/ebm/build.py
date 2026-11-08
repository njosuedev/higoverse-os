"""Builds what is sent to RRA's VSDC, and what is printed from its answer.

Pure: no database and no network, so every amount can be checked in tests.
Field names and lengths follow RRA_VSDC_DOC_v1.0.4 §3.3.6 (sales) and §3.3.8
(stock). Amounts include VAT, as RRA's own sample shows: an 18% item sold for
200,000 has taxblAmt 200,000 and taxAmt 30,508 (200,000 × 18 / 118).
"""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal

from app.ebm import codes

# Rwanda is UTC+2 all year (no daylight saving).
KIGALI = timezone(timedelta(hours=2), "CAT")
CENT = Decimal("0.01")


def now() -> datetime:
    return datetime.now(KIGALI)


def dt14(dt: datetime) -> str:
    """yyyyMMddHHmmss, Kigali time."""
    return dt.astimezone(KIGALI).strftime("%Y%m%d%H%M%S")


def dt8(dt: datetime) -> str:
    """yyyyMMdd, Kigali time."""
    return dt.astimezone(KIGALI).strftime("%Y%m%d")


def money(x) -> Decimal:
    return Decimal(str(x or 0)).quantize(CENT, rounding=ROUND_HALF_UP)


def tax_inside(amount: Decimal, tax_type: str) -> Decimal:
    """The VAT included in a VAT-inclusive amount."""
    rate = Decimal(codes.TAX_RATES.get(tax_type, 0))
    if not rate:
        return Decimal("0.00")
    return (amount * rate / (Decimal(100) + rate)).quantize(CENT, rounding=ROUND_HALF_UP)


def num(x: Decimal | int | float):
    """A JSON number: whole amounts without decimals, others with two."""
    d = money(x)
    return int(d) if d == d.to_integral_value() else float(d)


def cut(s: str | None, n: int) -> str | None:
    s = " ".join((s or "").split())
    return s[:n] if s else None


def item_code(origin: str, item_type: str, pkg_unit: str, qty_unit: str, seq: int) -> str:
    """§4.17: country, product type, packaging unit, quantity unit and a
    7-digit counter, e.g. RW2NTU0000012."""
    return f"{origin}{item_type}{pkg_unit}{qty_unit}{seq:07d}"[:20]


@dataclass
class Line:
    item_code: str
    item_class: str
    name: str
    pkg_unit: str
    qty_unit: str
    tax_type: str
    quantity: Decimal
    unit_price: Decimal

    @property
    def supply(self) -> Decimal:
        return money(self.quantity * self.unit_price)

    @property
    def tax(self) -> Decimal:
        return tax_inside(self.supply, self.tax_type)


def totals(lines: list[Line]) -> dict:
    """Per tax type (A–D) and overall: taxable amounts, rates and tax."""
    out: dict = {}
    for t in ("A", "B", "C", "D"):
        mine = [l for l in lines if l.tax_type == t]
        out[f"taxblAmt{t}"] = sum((l.supply for l in mine), Decimal("0.00"))
        out[f"taxRt{t}"] = Decimal(codes.TAX_RATES[t])
        out[f"taxAmt{t}"] = sum((l.tax for l in mine), Decimal("0.00"))
    out["totTaxblAmt"] = sum((l.supply for l in lines), Decimal("0.00"))
    out["totTaxAmt"] = sum((l.tax for l in lines), Decimal("0.00"))
    out["totAmt"] = out["totTaxblAmt"]
    return out


def sale_request(*, tin: str, bhf_id: str, invoice_no: int, lines: list[Line], when: datetime,
                 sale_date: datetime, payment_code: str, user_id: str, user_name: str,
                 customer_tin: str | None = None, customer_name: str | None = None,
                 customer_phone: str | None = None, trade_name: str | None = None,
                 address: str | None = None, top_msg: str | None = None, bottom_msg: str | None = None,
                 refund_of: int | None = None, refund_reason: str | None = None) -> dict:
    """TrnsSalesSaveWrReq (§3.3.6.1) for /trnsSales/saveSales."""
    if not lines:
        raise ValueError("A receipt needs at least one item")
    refund = refund_of is not None
    t = totals(lines)
    stamp = dt14(when)
    uid = (user_id or "higoverse")[:20]
    uname = cut(user_name, 60) or "Higoverse"
    return {
        "tin": tin,
        "bhfId": bhf_id,
        "invcNo": invoice_no,
        "orgInvcNo": refund_of or 0,
        "custTin": cut(customer_tin, 9),
        "custNm": cut(customer_name, 60),
        "salesTyCd": codes.SALES_TYPE_NORMAL,
        "rcptTyCd": codes.RECEIPT_REFUND if refund else codes.RECEIPT_SALE,
        "pmtTyCd": payment_code,
        "salesSttsCd": codes.STATUS_REFUNDED if refund else codes.STATUS_APPROVED,
        "cfmDt": stamp,
        "salesDt": dt8(sale_date),
        "stockRlsDt": stamp,
        "cnclReqDt": None,
        "cnclDt": None,
        "rfdDt": stamp if refund else None,
        "rfdRsnCd": refund_reason if refund else None,
        "totItemCnt": len(lines),
        **{k: num(v) for k, v in t.items()},
        "prchrAcptcYn": "N",
        "remark": None,
        "regrId": uid, "regrNm": uname, "modrId": uid, "modrNm": uname,
        "receipt": {
            "custTin": cut(customer_tin, 9),
            "custMblNo": cut(customer_phone, 20),
            "rptNo": invoice_no,
            "trdeNm": cut(trade_name, 20),
            "adrs": cut(address, 200),
            "topMsg": cut(top_msg, 20),
            "btmMsg": cut(bottom_msg, 20),
            "prchrAcptcYn": "N",
        },
        "itemList": [
            {
                "itemSeq": i,
                "itemCd": l.item_code,
                "itemClsCd": l.item_class,
                "itemNm": cut(l.name, 200) or l.item_code,
                "bcd": None,
                "pkgUnitCd": l.pkg_unit,
                "pkg": num(l.quantity),
                "qtyUnitCd": l.qty_unit,
                "qty": num(l.quantity),
                "prc": num(l.unit_price),
                "splyAmt": num(l.supply),
                "dcRt": 0,
                "dcAmt": 0,
                "isrccCd": None, "isrccNm": None, "isrcRt": None, "isrcAmt": None,
                "taxTyCd": l.tax_type,
                "taxblAmt": num(l.supply),
                "taxAmt": num(l.tax),
                "totAmt": num(l.supply),
            }
            for i, l in enumerate(lines, start=1)
        ],
    }


def stock_request(*, tin: str, bhf_id: str, stock_no: int, lines: list[Line], when: datetime,
                  stock_type: str, user_id: str, user_name: str, customer_tin: str | None = None,
                  customer_name: str | None = None) -> dict:
    """StockIOSaveReq (§3.3.8.2) for /stock/saveStockItems."""
    t = totals(lines)
    uid = (user_id or "higoverse")[:20]
    uname = cut(user_name, 60) or "Higoverse"
    return {
        "tin": tin, "bhfId": bhf_id,
        "sarNo": stock_no, "orgSarNo": stock_no,
        "regTyCd": "A",
        "custTin": cut(customer_tin, 9), "custNm": cut(customer_name, 100), "custBhfId": None,
        "sarTyCd": stock_type,
        "ocrnDt": dt8(when),
        "totItemCnt": len(lines),
        "totTaxblAmt": num(t["totTaxblAmt"]), "totTaxAmt": num(t["totTaxAmt"]), "totAmt": num(t["totAmt"]),
        "remark": None,
        "regrId": uid, "regrNm": uname, "modrId": uid, "modrNm": uname,
        "itemList": [
            {
                "itemSeq": i, "itemCd": l.item_code, "itemClsCd": l.item_class,
                "itemNm": cut(l.name, 200) or l.item_code, "bcd": None,
                "pkgUnitCd": l.pkg_unit, "pkg": num(l.quantity),
                "qtyUnitCd": l.qty_unit, "qty": num(l.quantity),
                "itemExprDt": None,
                "prc": num(l.unit_price), "splyAmt": num(l.supply), "totDcAmt": 0,
                "taxblAmt": num(l.supply), "taxTyCd": l.tax_type, "taxAmt": num(l.tax), "totAmt": num(l.supply),
            }
            for i, l in enumerate(lines, start=1)
        ],
    }


def receipt_label(receipt_type: str) -> str:
    """NS normal sale, NR normal refund (what follows the receipt counter)."""
    return "NR" if receipt_type == codes.RECEIPT_REFUND else "NS"


def receipt_qr_text(*, signed_at_rra: str | None, sdc_id: str | None, receipt_no: int | None,
                    total_receipt_no: int | None, receipt_type: str, internal_data: str | None,
                    signature: str | None) -> str | None:
    """The receipt's QR code, as RRA's Technical Specification of CIS for VSDC
    (§7.24.7) prescribes: invoice_date(ddmmyyyy)#time(hhmmss)#sdc number#
    sdc_receipt_number#internal_data#receipt_signature.

    (Some EBM v2 software prints instead a link to RRA's receipt check,
    myrra.rra.gov.rw/common/link/ebm/receipt/indexEbmReceiptData?Data=…;
    if RRA asks for that during certification, change it only here.)
    """
    if not (signed_at_rra and len(signed_at_rra) >= 14 and signature):
        return None
    s = signed_at_rra
    date = f"{s[6:8]}{s[4:6]}{s[0:4]}"
    time = s[8:14]
    counter = f"{receipt_no}/{total_receipt_no} {receipt_label(receipt_type)}"
    return "#".join([date, time, sdc_id or "", counter, internal_data or "", signature])


def grouped(code: str | None, size: int = 4) -> str:
    """Internal data and signature are printed in groups of four: ABCD-EFGH-…"""
    s = (code or "").strip()
    return "-".join(s[i:i + size] for i in range(0, len(s), size))
