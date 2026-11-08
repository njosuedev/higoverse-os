"""RRA EBM receipts (sale-service /ebm), against the fake VSDC in
backend/sale-service/tools/fake_vsdc.py. Synthetic companies on the
throwaway local database only (see harness.py). Run with:

    python security_tests/run.py sale-service
"""
import os
import sys
import uuid
from decimal import Decimal

import pytest

sys.path.insert(0, os.path.dirname(__file__))
import harness  # noqa: E402
from harness import SHOP_A, SHOP_B, auth, token  # noqa: E402

if os.environ.get("HGV_SERVICE", "sale-service") != "sale-service":
    pytest.skip("EBM lives in sale-service", allow_module_level=True)

APP = harness.load_service("sale-service")

from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.db.database import SessionLocal  # noqa: E402
from app.ebm import build, vsdc  # noqa: E402
from app.models.ebm import (EbmCashMove, EbmConfig, EbmCopyLog, EbmInvoice, EbmInvoiceSale, EbmItem,  # noqa: E402
                            EbmZReport)
from app.models.sale import Sale  # noqa: E402

sys.path.insert(0, str(harness.BACKEND / "sale-service"))
from tools import fake_vsdc  # noqa: E402

OWNER = auth(token(SHOP_A, "owner", name="Ama Owner"))
STAFF = auth(token(SHOP_A, "staff"))
B_OWNER = auth(token(SHOP_B, "owner"))
TIN = "999000111"


@pytest.fixture(scope="module")
def client():
    settings.EBM_VSDC_URL = "http://fake-vsdc.invalid"
    real = vsdc.call
    vsdc.call = lambda path, body, timeout=None: _fake(path, body)
    with TestClient(APP, raise_server_exceptions=False) as c:   # startup creates the tables
        _clean()
        yield c
    vsdc.call = real
    _clean()


def _fake(path, body):
    j = fake_vsdc.handle(path, body)
    return vsdc.Result(j["resultCd"], j["resultMsg"], j["data"] or {})


def _clean():
    db = SessionLocal()
    try:
        for shop in (SHOP_A, SHOP_B):
            for model in (EbmCopyLog, EbmCashMove, EbmZReport):
                db.query(model).filter(model.shop_id == shop).delete()
            db.query(EbmInvoiceSale).filter(EbmInvoiceSale.shop_id == shop).delete()
            db.query(EbmInvoice).filter(EbmInvoice.shop_id == shop).delete()
            db.query(EbmItem).filter(EbmItem.shop_id == shop).delete()
            db.query(EbmConfig).filter(EbmConfig.shop_id == shop).delete()
            db.query(Sale).filter(Sale.shop_id == shop, Sale.product_name.like("EBM %")).delete()
        db.commit()
    finally:
        db.close()
    fake_vsdc.state.update({"rcpt": {}, "tot": {}, "items": {}, "sales": {}, "stock": [], "masters": {}, "fail": {}})


def _sale(name, qty, price, payment="cash", shop=SHOP_A) -> str:
    db = SessionLocal()
    try:
        s = Sale(shop_id=shop, product_id=str(uuid.uuid4()), product_name=f"EBM {name}", quantity=qty,
                 unit_price=price, total_amount=qty * price, payment_method=payment)
        db.add(s)
        db.commit()
        return s.id
    finally:
        db.close()


# ── The amounts (pure) ─────────────────────────────────────────────────

def test_tax_is_inside_the_price_like_rras_sample():
    # RRA_VSDC_DOC sample: B item of 200,000 carries 30,508 VAT; 50,000 carries 7,627.
    assert build.tax_inside(Decimal("200000"), "B") == Decimal("30508.47")
    assert build.tax_inside(Decimal("50000"), "B") == Decimal("7627.12")
    assert build.tax_inside(Decimal("50000"), "A") == Decimal("0")


def test_sale_request_matches_rra_fields():
    line = lambda code, tax, q, p: build.Line(code, "5020230100", "x", "NT", "U", tax, Decimal(q), Decimal(p))
    req = build.sale_request(tin=TIN, bhf_id="00", invoice_no=7, when=build.now(), sale_date=build.now(),
                             payment_code="01", user_id="u1", user_name="Ama",
                             lines=[line("RW2NTU0000001", "B", 2, 1500), line("RW2NTU0000002", "A", 1, 1000)])
    assert req["invcNo"] == 7 and req["orgInvcNo"] == 0
    assert (req["salesTyCd"], req["rcptTyCd"], req["salesSttsCd"]) == ("N", "S", "02")
    assert req["taxblAmtB"] == 3000 and req["taxAmtB"] == 457.63 and req["taxRtB"] == 18
    assert req["taxblAmtA"] == 1000 and req["taxAmtA"] == 0
    assert req["totAmt"] == 4000 and req["totTaxAmt"] == 457.63 and req["totItemCnt"] == 2
    assert [i["itemSeq"] for i in req["itemList"]] == [1, 2]
    assert len(req["cfmDt"]) == 14 and len(req["salesDt"]) == 8


def test_item_code_and_qr_layout():
    assert build.item_code("RW", "2", "NT", "BA", 12) == "RW2NTBA0000012"   # RRA's own example (§4.17)
    qr = build.receipt_qr_text(signed_at_rra="20261108143005", sdc_id="SDC010000005", receipt_no=27,
                               total_receipt_no=32, receipt_type="S", internal_data="GZGGIZLYTJSSD7YLYLGIIG6FCY",
                               signature="TQZMKL57AGBMSTPO")
    # CIS spec §7.24.7: ddmmyyyy#hhmmss#sdc number#sdc receipt number#internal data#signature
    assert qr == "08112026#143005#SDC010000005#27/32 NS#GZGGIZLYTJSSD7YLYLGIIG6FCY#TQZMKL57AGBMSTPO"
    assert build.grouped("TQZMKL57AGBMSTPO") == "TQZM-KL57-AGBM-STPO"


# ── Setting up ─────────────────────────────────────────────────────────

def test_only_the_owner_sets_up_ebm(client):
    r = client.put("/ebm/config", headers=STAFF, json={"tin": TIN})
    assert r.status_code == 403


def test_turning_on_needs_a_default_item_class(client):
    r = client.put("/ebm/config", headers=OWNER, json={"enabled": True, "tin": TIN, "device_serial": "dvc-1"})
    assert r.status_code == 400


def test_setup_and_connect(client):
    r = client.put("/ebm/config", headers=OWNER, json={"tin": TIN, "bhf_id": "00", "device_serial": "dvc-1"})
    assert r.status_code == 200 and r.json()["data"]["connected"] is False
    r = client.post("/ebm/config/connect", headers=OWNER)
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["connected"] and d["sdc_id"] and d["mrc_no"] and d["taxpayer_name"] == "TEST TAXPAYER"

    r = client.post("/ebm/item-classes/sync", headers=OWNER)
    assert r.status_code == 200 and r.json()["data"]["count"] == 3
    r = client.get("/ebm/item-classes?q=drink", headers=STAFF)
    assert [c["code"] for c in r.json()["data"]] == ["5020230100"]

    r = client.put("/ebm/config", headers=OWNER, json={"enabled": True, "default_item_class": "5020230100"})
    assert r.status_code == 200 and r.json()["data"]["ready"] is True


def test_bad_tin_is_refused(client):
    assert client.put("/ebm/config", headers=OWNER, json={"tin": "12345"}).status_code == 422


# ── Receipts ───────────────────────────────────────────────────────────

def test_issue_sign_and_lock(client):
    a, b = _sale("Soda", 2, 1500), _sale("Water", 1, 1000)
    r = client.post("/ebm/invoices", headers=STAFF, json={"sale_ids": [a, b], "customer_tin": "100000001"})
    assert r.status_code == 200, r.text
    inv = r.json()["data"]
    assert inv["status"] == "signed" and inv["label"] == "NS"
    assert inv["receipt_no"] == 1 and inv["total_receipt_no"] == 1
    assert inv["total_amount"] == 4000 and inv["total_tax"] == pytest.approx(610.17)
    assert inv["customer_tin"] == "100000001" and inv["sale_ids"] == [a, b]
    assert inv["qr_text"].count("#") == 5 and inv["qr_text"].endswith(inv["signature"])
    assert inv["cashier"]
    assert inv["stock_status"] == "sent"
    assert fake_vsdc.state["stock"][-1]["sarTyCd"] == "11"

    # The same sales again: the same receipt, not a second one.
    again = client.post("/ebm/invoices", headers=OWNER, json={"sale_ids": [a, b]}).json()["data"]
    assert again["id"] == inv["id"]
    # Part of them on another receipt: refused.
    assert client.post("/ebm/invoices", headers=OWNER, json={"sale_ids": [a]}).status_code == 409

    # Declared sales can't be edited or deleted.
    assert client.put(f"/sales/{a}", headers=OWNER, json={"notes": "x"}).status_code == 409
    assert client.delete(f"/sales/{b}", headers=OWNER).status_code == 409

    found = client.post("/ebm/invoices/lookup", headers=STAFF, json={"sale_ids": [a, b, str(uuid.uuid4())]}).json()["data"]
    assert set(found) == {a, b} and found[a]["status"] == "signed"

    # Refund: staff can't, a manager/owner can; then the sale is free again.
    REFUND = {"reason": "06", "note": "Customer returned the goods", "recipient": "Jean Test"}
    assert client.post(f"/ebm/invoices/{inv['id']}/refund", headers=STAFF, json=REFUND).status_code == 403
    # The refund log book needs the justification and the person refunded.
    assert client.post(f"/ebm/invoices/{inv['id']}/refund", headers=OWNER, json={"reason": "06"}).status_code == 422
    r = client.post(f"/ebm/invoices/{inv['id']}/refund", headers=OWNER, json=REFUND)
    assert r.status_code == 200, r.text
    ref = r.json()["data"]
    assert ref["status"] == "signed" and ref["label"] == "NR" and ref["original_invoice_no"] == inv["invoice_no"]
    assert ref["invoice_no"] == inv["invoice_no"] + 1
    assert fake_vsdc.state["stock"][-1]["sarTyCd"] == "03"
    assert client.get(f"/ebm/invoices/{inv['id']}", headers=STAFF).json()["data"]["refunded"] is True
    # A second refund returns the first.
    assert ref["refund_recipient"] == "Jean Test" and ref["refund_note"]
    assert client.post(f"/ebm/invoices/{inv['id']}/refund", headers=OWNER, json=REFUND).json()["data"]["id"] == ref["id"]
    assert client.delete(f"/sales/{b}", headers=OWNER).status_code == 200


def test_unreachable_vsdc_keeps_the_number_and_retries(client):
    s = _sale("Juice", 3, 700, payment="mtn")
    fake_vsdc.state["fail"]["/trnsSales/saveSales"] = "894"
    r = client.post("/ebm/invoices", headers=STAFF, json={"sale_ids": [s]})
    inv = r.json()["data"]
    assert inv["status"] == "failed" and inv["can_discard"] is False
    assert client.post(f"/ebm/invoices/{inv['id']}/discard", headers=OWNER).status_code == 400
    r = client.post(f"/ebm/invoices/{inv['id']}/retry", headers=STAFF)
    done = r.json()["data"]
    assert done["status"] == "signed" and done["invoice_no"] == inv["invoice_no"]
    assert done["payment_code"] == "06"


def test_refused_receipt_can_be_discarded(client):
    # A single refusal heals itself: items registered again, sent once more.
    fake_vsdc.state["fail"]["/trnsSales/saveSales"] = "910"
    healed = client.post("/ebm/invoices", headers=STAFF, json={"sale_ids": [_sale("Milk", 1, 800)]}).json()["data"]
    assert healed["status"] == "signed" and healed["attempts"] == 2
    s = _sale("Bread", 1, 900)
    fake_vsdc.state["fail"]["/trnsSales/saveSales"] = ["910", "910"]
    inv = client.post("/ebm/invoices", headers=STAFF, json={"sale_ids": [s]}).json()["data"]
    assert inv["status"] == "failed" and inv["can_discard"] is True
    assert client.put(f"/sales/{s}", headers=OWNER, json={"notes": "x"}).status_code == 409
    assert client.post(f"/ebm/invoices/{inv['id']}/discard", headers=STAFF).status_code == 403
    assert client.post(f"/ebm/invoices/{inv['id']}/discard", headers=OWNER).json()["data"]["status"] == "void"
    # Free again, and a new receipt can be issued for it.
    again = client.post("/ebm/invoices", headers=STAFF, json={"sale_ids": [s]}).json()["data"]
    assert again["status"] == "signed" and again["id"] != inv["id"]


def test_item_tax_type_is_used_and_resent(client):
    s = _sale("Tomatoes", 4, 500)
    db = SessionLocal()
    try:
        pid = db.query(Sale).filter(Sale.id == s).one().product_id
    finally:
        db.close()
    r = client.put(f"/ebm/items/{pid}", headers=OWNER, json={"tax_type": "A", "item_class": "5010170100"})
    assert r.status_code == 200 and r.json()["data"]["registered"] is False
    inv = client.post("/ebm/invoices", headers=STAFF, json={"sale_ids": [s]}).json()["data"]
    assert inv["status"] == "signed" and inv["total_tax"] == 0 and inv["lines"][0]["tax_type"] == "A"


def test_origin_country_goes_into_the_item_code(client):
    # Imported goods: a car from China gets a CN… code, like real EBM invoices.
    s = _sale("Car", 1, 16000000)
    db = SessionLocal()
    try:
        pid = db.query(Sale).filter(Sale.id == s).one().product_id
    finally:
        db.close()
    assert client.put(f"/ebm/items/{pid}", headers=OWNER, json={"origin": "china"}).status_code == 422
    item = client.put(f"/ebm/items/{pid}", headers=OWNER, json={"origin": "cn"}).json()["data"]
    assert item["origin"] == "CN" and item["item_code"].startswith("CN2NTU")
    inv = client.post("/ebm/invoices", headers=STAFF, json={"sale_ids": [s]}).json()["data"]
    assert inv["lines"][0]["item_code"] == item["item_code"]
    # RRA's own figure on that invoice: 16,000,000 incl. 18% VAT carries 2,440,677.97.
    assert inv["total_tax"] == pytest.approx(2440677.97)
    # Declared now: its origin can't change any more.
    assert client.put(f"/ebm/items/{pid}", headers=OWNER, json={"origin": "JP"}).status_code == 400


def test_other_company_cannot_see_or_use_receipts(client):
    s = _sale("Secret", 1, 100)
    inv = client.post("/ebm/invoices", headers=OWNER, json={"sale_ids": [s]}).json()["data"]
    assert client.get(f"/ebm/invoices/{inv['id']}", headers=B_OWNER).status_code == 404
    assert client.post(f"/ebm/invoices/{inv['id']}/refund", headers=B_OWNER,
                       json={"reason": "06", "note": "x x x", "recipient": "Someone"}).status_code == 404
    assert client.post(f"/ebm/invoices/{inv['id']}/retry", headers=B_OWNER).status_code == 404
    assert client.get(f"/ebm/invoices/by-sale/{s}", headers=B_OWNER).json()["data"] is None
    assert client.post("/ebm/invoices/lookup", headers=B_OWNER, json={"sale_ids": [s]}).json()["data"] == {}
    # B has no EBM set up, and can't put A's sale on a receipt.
    assert client.post("/ebm/invoices", headers=B_OWNER, json={"sale_ids": [s]}).status_code == 400
    assert client.get("/ebm/invoices", headers=B_OWNER).json()["data"]["total"] == 0


def test_status_copies_cash_and_reports(client):
    assert client.get("/ebm/status", headers=STAFF).json()["data"]["ok"] is True
    fake_vsdc.state["fail"]["/code/selectCodes"] = "894"
    st = client.get("/ebm/status", headers=STAFF).json()["data"]
    assert st["ok"] is False and st["reason"]

    s1, s2 = _sale("Rice", 2, 1180, payment="cash"), _sale("Beans", 1, 500, payment="mtn")
    a = client.post("/ebm/invoices", headers=STAFF, json={"sale_ids": [s1]}).json()["data"]
    client.post("/ebm/invoices", headers=STAFF, json={"sale_ids": [s2]})
    assert a["items_count"] == 1 and len(a["issued_at_cis"]) == 14
    assert client.post(f"/ebm/invoices/{a['id']}/copy", headers=STAFF).json()["data"]["label"] == "CS"
    assert client.post("/ebm/cash", headers=STAFF, json={"kind": "deposit", "amount": 20000, "note": "Opening float"}).status_code == 200
    assert client.post("/ebm/cash", headers=STAFF, json={"kind": "withdrawal", "amount": 5000}).status_code == 200
    assert client.post("/ebm/cash", headers=STAFF, json={"kind": "gift", "amount": 5}).status_code == 422
    assert len(client.get("/ebm/cash", headers=STAFF).json()["data"]) == 2

    x = client.get("/ebm/reports/x", headers=STAFF).json()["data"]
    assert x["kind"] == "X" and x["sales"]["count"] >= 2 and x["refunds"]["count"] >= 1
    assert x["opening_deposit"] == 20000 and x["withdrawals"]["amount"] == 5000
    assert x["copies"]["CS"]["count"] == 1 and x["mrc"] and x["tin"] == TIN
    assert x["sales"]["by_payment"]["CASH"] > 0 and x["sales"]["by_payment"]["MOBILE MONEY"] >= 500
    assert x["net_total"] == round(x["sales"]["total"] - x["refunds"]["total"], 2)

    # Z: staff can't close the day; the owner can, once per day.
    assert client.post("/ebm/reports/z", headers=STAFF, json={}).status_code == 403
    z = client.post("/ebm/reports/z", headers=OWNER, json={}).json()["data"]
    assert z["kind"] == "Z" and z["number"] == 1 and z["sales"]["count"] == x["sales"]["count"]
    assert client.post("/ebm/reports/z", headers=OWNER, json={}).status_code == 400
    assert client.get("/ebm/reports/z/1", headers=STAFF).json()["data"]["number"] == 1
    assert client.get("/ebm/reports/z/1", headers=B_OWNER).status_code == 404
    # After the Z, the X report starts again from zero.
    assert client.get("/ebm/reports/x", headers=STAFF).json()["data"]["sales"]["count"] == 0

    plu = client.get("/ebm/reports/plu", headers=STAFF).json()["data"]
    names = {i["name"]: i for i in plu["items"]}
    assert names["EBM Rice"]["quantity"] == 2 and names["EBM Rice"]["amount"] == 2360
    assert client.get("/ebm/reports/stock?day=2026-01-01", headers=STAFF).status_code == 200
    assert client.get("/ebm/reports/stock?day=2999-01-01", headers=STAFF).status_code == 400


def test_every_sale_is_signed_whichever_app_records_it(client):
    """POST /sales (the mobile app, any client) is signed by the server; the
    web checkout defers to sign its basket as one receipt; no sale while
    RRA's VSDC is down; unsigned sales are listed and can all be sent."""
    import app.api.routes.sales as sales_routes
    product = {"id": "p-mobile", "name": "EBM Mobile item", "quantity": 10, "cost_price": 100, "selling_price": 300}
    real = (sales_routes.get_product, sales_routes.update_product_stock)
    sales_routes.get_product = lambda pid, token: dict(product, id=pid)
    sales_routes.update_product_stock = lambda *a, **k: True
    try:
        r = client.post("/sales", headers=STAFF, json={"product_id": str(uuid.uuid4()), "quantity": 1, "unit_price": 300})
        assert r.status_code == 200, r.text
        assert r.json()["ebm"]["status"] == "signed"
        d = client.post("/sales", headers={**STAFF, "X-Higoverse-EBM": "defer"},
                        json={"product_id": str(uuid.uuid4()), "quantity": 2, "unit_price": 300})
        assert "ebm" not in d.json()
        deferred = d.json()["data"]["id"]
        un = client.get("/ebm/unsigned", headers=STAFF).json()["data"]
        assert deferred in un["sale_ids"]
        fake_vsdc.state["fail"]["/code/selectCodes"] = "894"
        down = client.post("/sales", headers=STAFF, json={"product_id": str(uuid.uuid4()), "quantity": 1, "unit_price": 300})
        assert down.status_code == 503 and "paused" in down.json()["detail"]
        done = client.post("/ebm/sign-pending", headers=STAFF).json()["data"]
        assert done["signed"] >= 1 and deferred not in client.get("/ebm/unsigned", headers=STAFF).json()["data"]["sale_ids"]
    finally:
        sales_routes.get_product, sales_routes.update_product_stock = real


def test_device_cant_change_after_receipts(client):
    r = client.put("/ebm/config", headers=OWNER, json={"tin": "999000222"})
    assert r.status_code == 400
