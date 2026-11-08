"""A stand-in for RRA's VSDC, for local development and tests only.

It answers the calls Higoverse makes the way RRA_VSDC_DOC_v1.0.4 describes,
with made-up signatures. Receipts it signs are worthless to RRA.

    python -m uvicorn tools.fake_vsdc:app --port 8099     (from backend/sale-service)
    EBM_VSDC_URL=http://127.0.0.1:8099                    (sale-service .env)
"""
import hashlib
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, Request

app = FastAPI(title="Fake VSDC (development only)")
KIGALI = timezone(timedelta(hours=2))

state = {"rcpt": {}, "tot": {}, "items": {}, "sales": {}, "stock": [], "masters": {}, "fail": {}}


def _now() -> str:
    return datetime.now(KIGALI).strftime("%Y%m%d%H%M%S")


def ok(data=None):
    return {"resultCd": "000", "resultMsg": "It is succeeded", "resultDt": _now(), "data": data}


def err(code: str, msg: str):
    return {"resultCd": code, "resultMsg": msg, "resultDt": _now(), "data": None}


def handle(path: str, b: dict) -> dict:
    # Tests: {"/trnsSales/saveSales": "894"} fails that call once; ["910", "910"] twice.
    if path in state["fail"]:
        v = state["fail"][path]
        if isinstance(v, list):   # several failures in a row
            code = v.pop(0)
            if not v:
                del state["fail"][path]
        else:
            code = state["fail"].pop(path)
        return err(code, "Forced failure")
    if not b.get("tin") or not b.get("bhfId"):
        return err("910", "Request parameter error")
    if path == "/initializer/selectInitInfo":
        if not b.get("dvcSrlNo"):
            return err("901", "It is not valid device")
        return ok({"info": {"tin": b["tin"], "taxprNm": "TEST TAXPAYER", "bsnsActv": "TESTING", "bhfId": b["bhfId"],
                            "bhfNm": "Headquarter", "hqYn": "Y", "dvcId": f"{b['tin']}{b['bhfId']}0001",
                            "sdcId": f"SDC0{b['tin'][-5:]}01", "mrcNo": f"WIS0{b['tin'][-6:]}",
                            "lastSaleInvcNo": 0, "lastInvcNo": 0}})
    if path == "/code/selectCodes":
        # Nothing changed since lastReqDt → "no search result", as RRA answers.
        if b.get("lastReqDt", "") >= "20260101000000":
            return err("001", "There is no search result")
        return ok({"clsList": [{"cdCls": "04", "cdClsNm": "Tax Type", "dtlList": [
            {"cd": "A", "cdNm": "A-EX", "userDfnCd1": "0"}, {"cd": "B", "cdNm": "B-18.00%", "userDfnCd1": "18"}]}]})
    if path == "/itemClass/selectItemsClass":
        return ok({"itemClsList": [
            {"itemClsCd": "5020230100", "itemClsNm": "Soft drinks", "itemClsLvl": 4, "taxTyCd": "B", "useYn": "Y"},
            {"itemClsCd": "5010170100", "itemClsNm": "Fresh vegetables", "itemClsLvl": 4, "taxTyCd": "A", "useYn": "Y"},
            {"itemClsCd": "8111150000", "itemClsNm": "Software or hardware engineering", "itemClsLvl": 3, "taxTyCd": "B", "useYn": "Y"},
        ]})
    if path == "/customers/selectCustomer":
        if b.get("custmTin") == "100000001":
            return ok({"custList": [{"tin": "100000001", "taxprNm": "TEST CUSTOMER LTD", "taxprSttsCd": "A",
                                     "dstrtNm": "GASABO"}]})
        return err("001", "There is no search result")
    if path == "/items/saveItems":
        state["items"][(b["tin"], b["itemCd"])] = b
        return ok()
    if path == "/trnsSales/saveSales":
        key = (b["tin"], b["bhfId"], b["invcNo"])
        if key in state["sales"]:
            return ok(state["sales"][key])          # the same receipt again: same answer
        for it in b.get("itemList") or []:
            if (b["tin"], it["itemCd"]) not in state["items"]:
                return err("910", f"Item {it['itemCd']} is not registered")
        dev = (b["tin"], b["bhfId"])
        kind = b["salesTyCd"] + b["rcptTyCd"]
        state["rcpt"][(dev, kind)] = state["rcpt"].get((dev, kind), 0) + 1
        state["tot"][dev] = state["tot"].get(dev, 0) + 1
        h = hashlib.sha256(repr(sorted(b.items(), key=str)).encode()).hexdigest().upper()
        data = {"rcptNo": state["rcpt"][(dev, kind)], "totRcptNo": state["tot"][dev],
                "intrlData": h[:26], "rcptSign": h[26:42], "vsdcRcptPbctDate": _now(),
                "sdcId": f"SDC0{b['tin'][-5:]}01", "mrcNo": f"WIS0{b['tin'][-6:]}"}
        state["sales"][key] = data
        return ok(data)
    if path == "/stock/saveStockItems":
        state["stock"].append(b)
        return ok()
    if path == "/stockMaster/saveStockMaster":
        state["masters"][(b["tin"], b["itemCd"])] = b["rsdQty"]
        return ok()
    return err("912", "There is a request Method error")


@app.post("/{path:path}")
async def any_call(path: str, request: Request):
    return handle("/" + path, await request.json())
