"""Fetch today's fuel prices from the five official price pages and write data/prices.js.

Run:  python scripts/update_prices.py      (needs openpyxl)
Runs automatically at 08:00, 11:00, 15:00 and 18:00 Tbilisi time (.github/workflows/update-prices.yml).

Every price is validated before anything is written:
  * it must be found on the page and be between 1 and 10 GEL (0.00 = "not sold right now"),
  * it must not move more than 25% from the last saved value (a parsing slip, not a real change).
If a company fails, its last good prices are kept with their older "checked" time and the script
exits with status 1 so the GitHub Action is marked failed (and GitHub emails the repo owner).
The other companies are still updated.
"""

import io
import json
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "prices.js"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0 Safari/537.36")
TBILISI = timezone(timedelta(hours=4))  # Georgia is UTC+4 all year (no daylight saving)
MAX_JUMP = 0.25

# Which product on each site is which dashboard category (see AGENT.md > Category mapping).
PRODUCTS = {
    "Wissol": {"super": "Eko Super", "petrol": "Euro Regular", "euroDiesel": "Euro Diesel",
               "premiumDiesel": "Eko Diesel"},
    "SOCAR":  {"super": "Nano Super", "petrol": "Nano Euro Regular", "euroDiesel": "Euro 5 Diesel",
               "premiumDiesel": "Nano Euro 5 Diesel"},
    "Gulf":   {"super": "G-Force Super", "petrol": "G-Force Euro Regular", "euroDiesel": "Euro Diesel",
               "premiumDiesel": "G-Force Euro Diesel"},
    "Lukoil": {"super": "Super Ecto", "petrol": "Euro Regular", "euroDiesel": "Euro Diesel",
               "premiumDiesel": None},  # Lukoil Georgia sells no premium diesel
    "Rompetrol": {"super": "efix Super", "petrol": "efix Euro Regular", "euroDiesel": "Euro Diesel",
                  "premiumDiesel": "efix Euro Diesel"},
}
EXTRAS = {"Wissol": [("Diesel Energy", "not Euro 5, aimed at machinery")]}


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def page_lines(url):
    """The page as a list of non-empty text lines (tags stripped)."""
    html = fetch(url).decode("utf-8", errors="replace")
    html = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", "\n", html)
    return [t.strip() for t in re.sub(r"<[^>]*>", "\n", html).split("\n") if t.strip()]


def to_price(text):
    m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*₾?", text.strip())
    return round(float(m.group(1)), 2) if m else None


# ---------------- one reader per site ----------------

def read_wissol():
    # Each product's details popup reads:  <name> / "Standard Price:" / "4.58 ₾"
    lines = page_lines("https://wissol.ge/en/fuel-prices")
    found = {}
    for i in range(len(lines) - 2):
        if lines[i + 1] == "Standard Price:":
            price = to_price(lines[i + 2])
            if price is not None:
                found.setdefault(lines[i], price)
    return found


def read_socar():
    # Homepage "CURRENT FUEL PRICES":  <name> / "Standard" / "4.55" / "₾"
    lines = page_lines("https://sgp.ge/en")
    found = {}
    for i in range(len(lines) - 2):
        if lines[i + 1] == "Standard":
            price = to_price(lines[i + 2])
            if price is not None:
                found.setdefault(lines[i], price)
    return found


def read_gulf():
    # Official archive download; the first data row is the current price list.
    wb = openpyxl.load_workbook(io.BytesIO(fetch("https://gulf.ge/en/fuel_prices/download")), read_only=True)
    rows = list(wb.worksheets[0].iter_rows(values_only=True))
    header, latest = list(rows[0]), rows[1]
    return {str(name).strip(): round(float(v), 2) for name, v in zip(header[1:], latest[1:])
            if name and v not in (None, "") and "(Gulf+)" not in str(name)}


def read_lukoil():
    # Homepage price list: each price sits directly BEFORE its product name ("4.55" / "Super Ecto").
    lines = page_lines("https://www.lukoil.ge/")
    names = {"Super Ecto 100", "Super Ecto", "Premium Avangard", "Euro Regular", "Euro Diesel"}
    found = {}
    for i in range(1, len(lines)):
        if lines[i] in names:
            price = to_price(lines[i - 1])
            if price is not None:
                found.setdefault(lines[i], price)
    return found


def read_rompetrol():
    # Homepage "Fuel Price" table:  "Product" / "GEL/l" / <name> / "4.56" / <name> / "4.16" ...
    # Some names stay in Georgian even on the English page, so they're mapped to English here.
    aliases = {"efix ევრო რეგულარი": "efix Euro Regular", "efix ევრო დიზელი": "efix Euro Diesel",
               "ევრო დიზელი": "Euro Diesel"}
    lines = page_lines("https://www.rompetrol.ge/en")
    start = lines.index("GEL/l") + 1  # ValueError (-> company failure) if the table is gone
    found = {}
    i = start
    while i + 1 < len(lines):
        price = to_price(lines[i + 1])
        if price is None:
            break  # end of the table
        name = aliases.get(lines[i], lines[i])
        found.setdefault(name, price)
        i += 2
    return found


READERS = {"Wissol": read_wissol, "SOCAR": read_socar, "Gulf": read_gulf, "Lukoil": read_lukoil,
           "Rompetrol": read_rompetrol}


# ---------------- build + validate ----------------

def load_previous():
    if not OUT.exists():
        return {}
    text = OUT.read_text(encoding="utf-8")
    return json.loads(text[text.index("{"):text.rindex("}") + 1]).get("companies", {})


def build_company(company, found, previous):
    """Category dict for one company, or raise ValueError describing what's wrong."""
    out = {}
    for cat, product in PRODUCTS[company].items():
        if product is None:
            out[cat] = None
            continue
        price = found.get(product)
        if price is None:
            raise ValueError(f"{product} not found on the page")
        if price == 0:  # the sites show 0.00 for a fuel that is temporarily not sold
            out[cat] = None
            continue
        if not 1 <= price <= 10:
            raise ValueError(f"{product} price {price} is outside 1-10 GEL")
        old = (previous.get(cat) or {}).get("price")
        if old and abs(price - old) / old > MAX_JUMP:
            raise ValueError(f"{product} jumped from {old} to {price} (>{MAX_JUMP:.0%}), refusing")
        out[cat] = {"name": product, "price": price}
    out["extras"] = []
    for product, note in EXTRAS.get(company, []):
        if product in found and 1 <= found[product] <= 10:
            out["extras"].append({"name": product, "price": found[product], "note": note})
    return out


def main():
    now = datetime.now(TBILISI)
    previous = load_previous()
    companies, failures = {}, []

    for company, reader in READERS.items():
        prev = previous.get(company, {})
        try:
            data = build_company(company, reader(), prev)
            data["checkedAt"] = now.isoformat(timespec="minutes")
            companies[company] = data
            print(f"OK   {company}: " + ", ".join(f"{k}={v['price']}" for k, v in data.items()
                                                    if isinstance(v, dict) and "price" in v))
        except Exception as e:  # network error, layout change, implausible value
            failures.append(f"{company}: {e}")
            if prev:
                companies[company] = prev  # keep the last good prices (and their older checkedAt)
            print(f"FAIL {company}: {e}" + ("  -> kept last good prices" if prev else ""), file=sys.stderr)

    if not companies:
        print("No prices at all; nothing written.", file=sys.stderr)
        return 1

    payload = {"checkedAt": now.isoformat(timespec="minutes"), "companies": companies}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        "// Generated by scripts/update_prices.py. Do not edit by hand.\n"
        "// Current pump prices (GEL/liter) read from each company's official price page.\n"
        f"window.fuelPrices = {json.dumps(payload, ensure_ascii=False, indent=1)};\n",
        encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)} at {payload['checkedAt']}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
