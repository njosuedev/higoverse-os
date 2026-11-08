"""The VSDC web service (RRA_VSDC_DOC_v1.0.4 §3.2.1).

RRA's VSDC is a WAR that Higoverse runs on its own server once RRA approves
the VSDC request (MyRRA); it signs receipts and forwards them to the EBM 2.1
server (production api-ebm.rra.gov.rw, test sdcsandbox.rra.gov.rw). Its
address is a server setting, EBM_VSDC_URL, never something a business can
type: the server would otherwise call any address it is given.

Every answer is {resultCd, resultMsg, resultDt, data}; "000" is success.
"""
import logging
from dataclasses import dataclass, field

import requests

from app.core.config import settings
from app.ebm import codes

logger = logging.getLogger(__name__)


@dataclass
class Result:
    code: str
    message: str
    data: dict = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return self.code == codes.OK

    def explain(self) -> str:
        """A message for people: RRA's own, else the code's meaning."""
        base = codes.RESULT_MESSAGES.get(self.code, "")
        msg = (self.message or "").strip()
        if msg and msg.lower() not in ("it is succeeded",) and msg != base:
            return f"{msg} (RRA {self.code})"
        return f"{base or 'RRA returned an error.'} (RRA {self.code})"


class NotConfigured(Exception):
    pass


def base_url() -> str:
    url = (settings.EBM_VSDC_URL or "").strip().rstrip("/")
    if not url:
        raise NotConfigured("RRA EBM isn't set up on this server yet (no VSDC address).")
    return url


def call(path: str, body: dict, timeout: float | None = None) -> Result:
    """POSTs to the VSDC. Network trouble comes back as code 894, like the
    VSDC's own client errors, so callers handle one kind of failure."""
    url = f"{base_url()}{path}"
    try:
        res = requests.post(url, json=body, timeout=timeout or settings.EBM_TIMEOUT_SECONDS)
    except requests.RequestException as e:
        logger.error("VSDC %s failed: %s", path, e)
        return Result("894", "The VSDC could not be reached. Try again in a moment.")
    try:
        j = res.json()
    except ValueError:
        logger.error("VSDC %s returned HTTP %s, not JSON", path, res.status_code)
        return Result("899", f"The VSDC answered with HTTP {res.status_code}.")
    data = j.get("data")
    return Result(str(j.get("resultCd") or "899"), str(j.get("resultMsg") or ""), data if isinstance(data, dict) else {})


# ── The calls Higoverse uses ───────────────────────────────────────────

def init_info(tin: str, bhf_id: str, device_serial: str) -> Result:
    return call("/initializer/selectInitInfo", {"tin": tin, "bhfId": bhf_id, "dvcSrlNo": device_serial})


def item_classes(tin: str, bhf_id: str, last_req: str = "20180101000000") -> Result:
    return call("/itemClass/selectItemsClass", {"tin": tin, "bhfId": bhf_id, "lastReqDt": last_req}, timeout=60)


def customer(tin: str, bhf_id: str, customer_tin: str) -> Result:
    return call("/customers/selectCustomer", {"tin": tin, "bhfId": bhf_id, "custmTin": customer_tin})


def save_item(body: dict) -> Result:
    return call("/items/saveItems", body)


def save_sale(body: dict) -> Result:
    return call("/trnsSales/saveSales", body)


def save_stock_io(body: dict) -> Result:
    return call("/stock/saveStockItems", body)


def save_stock_master(body: dict) -> Result:
    return call("/stockMaster/saveStockMaster", body)
