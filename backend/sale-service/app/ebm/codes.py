"""RRA's code lists used by Higoverse (RRA_VSDC_DOC_v1.0.4, chapter 4)."""

# The invoicing system's version (CIS spec §7.7): change it with every change
# to how receipts are issued or printed; RRA certifies a given version.
CIS_NAME = "Higoverse CIS"
CIS_VERSION = "1.0.0"

# 4.1 Tax type → rate (%). Prices in Rwanda include VAT, so the tax inside an
# amount is amount × rate / (100 + rate).
TAX_RATES = {"A": 0, "B": 18, "C": 0, "D": 0}
TAX_LABELS = {"A": "A-EX", "B": "B-18.00%", "C": "C", "D": "D"}

# 4.3 Product type.
ITEM_TYPES = {"1": "Raw material", "2": "Finished product", "3": "Service"}

# 4.10 Payment method, from the app's payment methods.
PAYMENT_CODES = {
    "cash": "01",
    "debt": "02",      # credit
    "bank": "04",
    "card": "05",
    "mtn": "06",       # mobile money
    "airtel": "06",
}
OTHER_PAYMENT = "07"
PAYMENT_LABELS = {"01": "CASH", "02": "CREDIT", "03": "CASH/CREDIT", "04": "BANK CHECK",
                  "05": "DEBIT&CREDIT CARD", "06": "MOBILE MONEY", "07": "OTHER"}

# 4.16 Refund reason.
REFUND_REASONS = {
    "01": "Missing quantity", "02": "Missing item", "03": "Damaged", "04": "Wasted",
    "05": "Raw material shortage", "06": "Refund", "07": "Wrong customer TIN",
    "08": "Wrong customer name", "09": "Wrong amount/price", "10": "Wrong quantity",
    "11": "Wrong item(s)", "12": "Wrong tax type", "13": "Other reason",
}

# 4.8 / 4.9 / 4.11: Higoverse sends only normal (N) receipts — the spec says
# "Send only 'N' type" — as a sale (S) or a refund after sale (R).
SALES_TYPE_NORMAL = "N"
RECEIPT_SALE, RECEIPT_REFUND = "S", "R"
STATUS_APPROVED, STATUS_REFUNDED = "02", "05"

# 4.15 Stock in/out type.
STOCK_OUT_SALE = "11"
STOCK_IN_RETURN = "03"

# 4.14 API response codes.
OK = "000"
NO_RESULT = "001"
DEVICE_INSTALLED = "902"
DUPLICATE = "994"
RESULT_MESSAGES = {
    "001": "There is no search result.",
    "894": "Could not reach RRA from the VSDC.",
    "899": "The VSDC reported a client error.",
    "900": "The request had no header information.",
    "901": "RRA says this is not a valid device. Check the TIN, branch and device serial.",
    "902": "This device is already installed.",
    "903": "Only a VSDC device can be verified.",
    "910": "RRA rejected a request parameter.",
    "921": "RRA cannot receive a sale that was already declared.",
    "922": "RRA can receive the receipt only after the sale.",
    "991": "RRA had an error while registering.",
    "994": "RRA already has this record.",
    "999": "RRA had an unknown error.",
}
