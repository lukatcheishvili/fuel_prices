"""Fetch today's fuel prices from the five official price pages and write data/prices.js.

Run:  python scripts/update_prices.py      (needs openpyxl)
Runs automatically at 08:07, 11:07, 15:07 and 18:07 Tbilisi time (.github/workflows/update-prices.yml).

Each fuel also gets its octane (gasoline) or cetane (diesel) figure, read from the companies' own
product pages on every run (see "octane / cetane per product" below).

Each fuel also gets its self-service station price ("selfService": a number, or null when the company
publishes none), read from the same pages plus SOCAR's station API (see "self-service prices" below).
It never fails a run: if it can't be read, the previous self-service price is kept and a warning is printed.

Every price is validated before anything is written:
  * it must be found on the page and be between 1 and 10 GEL (0.00 = "not sold right now"),
  * it must not move more than 25% from the last saved value (a parsing slip, not a real change).
If a company fails, its last good prices are kept with their older "checked" time and the script
exits with status 1 so the GitHub Action is marked failed (and GitHub emails the repo owner).
The other companies are still updated.
"""

import collections
import functools
import io
import json
import re
import sys
import time
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
    "Wissol": {"super": "Eko Super", "premium": "Eko Premium", "petrol": "Euro Regular",
               "euroDiesel": "Euro Diesel", "premiumDiesel": "Eko Diesel"},
    "SOCAR":  {"super": "Nano Super", "premium": "Nano Premium", "petrol": "Nano Euro Regular",
               "euroDiesel": "Euro 5 Diesel", "premiumDiesel": "Nano Euro 5 Diesel"},
    "Gulf":   {"super": "G-Force Super", "premium": "G-Force Premium", "petrol": "G-Force Euro Regular",
               "euroDiesel": "Euro Diesel", "premiumDiesel": "G-Force Euro Diesel"},
    "Lukoil": {"super": "Super Ecto", "premium": "Premium Avangard", "petrol": "Euro Regular",
               "euroDiesel": "Euro Diesel", "premiumDiesel": None},  # Lukoil Georgia sells no premium diesel
    "Rompetrol": {"super": "efix Super", "premium": "efix Euro Premium", "petrol": "efix Euro Regular",
                  "euroDiesel": "Euro Diesel", "premiumDiesel": "efix Euro Diesel"},
}
EXTRAS = {"Wissol": [("Diesel Energy", "not Euro 5, aimed at machinery")]}


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


@functools.lru_cache(maxsize=None)  # a page read for prices and again for octane/cetane is fetched once
def page_lines(url):
    """The page as a tuple of non-empty text lines (tags stripped)."""
    html = fetch(url).decode("utf-8", errors="replace")
    html = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", "\n", html)
    return tuple(t.strip() for t in re.sub(r"<[^>]*>", "\n", html).split("\n") if t.strip())


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


@functools.lru_cache(maxsize=None)  # the pump prices and the Gulf+ (self-service) prices come from one download
def gulf_latest():
    """Every column of the first data row (the current price list), including the "(Gulf+)" ones."""
    wb = openpyxl.load_workbook(io.BytesIO(fetch("https://gulf.ge/en/fuel_prices/download")), read_only=True)
    rows = list(wb.worksheets[0].iter_rows(values_only=True))
    header, latest = list(rows[0]), rows[1]
    return {str(name).strip(): round(float(v), 2) for name, v in zip(header[1:], latest[1:])
            if name and v not in (None, "")}


def read_gulf():
    # Official archive download; the first data row is the current price list.
    return {name: v for name, v in gulf_latest().items() if "(Gulf+)" not in name}


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


# ---------------- octane / cetane per product ----------------
# Read from each company's own pages on every run, so a grade change on their side reaches the site.
# A spec is {"type": "octane" | "cetane" | "cetane index", "value": 98, "min": True, "source": ...}:
# "min" = the company states it as a minimum ("Minimum 98"); source "site" = read from its pages.

def spec(type_, value, minimum, source="site"):
    return {"type": type_, "value": value, "min": minimum, "source": source}


def specs_wissol():
    # Each product's details popup:  <name> / "Standard Price:" ... "Octane rating: : Minimum 98"
    # or "Cetane number: Minimum 51" (Wissol also lists a lower "Cetane index"; the number is used).
    lines = page_lines("https://wissol.ge/en/fuel-prices")
    found, current = {}, None
    for i, line in enumerate(lines):
        if i + 1 < len(lines) and lines[i + 1] == "Standard Price:":
            current = line
        elif current and current not in found:
            m = re.match(r"Octane rating:\W*Minimum\s+(\d+(?:\.\d+)?)", line)
            if m:
                found[current] = spec("octane", float(m.group(1)), True)
            m = re.match(r"Cetane number:\W*Minimum\s+(\d+(?:\.\d+)?)", line)
            if m:
                found[current] = spec("cetane", float(m.group(1)), True)
    return found


def specs_gulf():
    # "FUEL CHARACTERISTICS": <name> / "Standard - Euro 5" / "Octane number (RON) - minimum 98"
    # or "Cetane index - 53.3". Its plain diesel is called "Diesel" there, "Euro Diesel" in the price list.
    lines = [l.replace("&nbsp;", "").strip()
             for l in page_lines("https://gulf.ge/en/products-and-services/fuel-characteristics")]
    aliases = {"Diesel": "Euro Diesel"}
    found, current = {}, None
    for i, line in enumerate(lines):
        if i + 1 < len(lines) and lines[i + 1].startswith("Standard -"):
            current = aliases.get(line, line)
        elif current:
            m = re.match(r"Octane number \(RON\) - minimum\s+(\d+(?:\.\d+)?)", line, re.I)
            if m:
                found[current] = spec("octane", float(m.group(1)), True)
            m = re.match(r"Cetane index - (\d+(?:\.\d+)?)", line, re.I)
            if m:
                found[current] = spec("cetane index", float(m.group(1)), False)
    return found


def specs_lukoil():
    # About-us page (Georgian): "... RON-98 (სუპერი), RON-95 (პრემიუმი), RON-92 (ევრო-რეგულარი) ...".
    # Lukoil publishes no cetane figure.
    text = " ".join(page_lines("https://www.lukoil.ge/about-us"))
    names = {"სუპერი": "Super Ecto", "პრემიუმი": "Premium Avangard", "ევრო-რეგულარი": "Euro Regular"}
    return {names[n]: spec("octane", float(v), False)
            for v, n in re.findall(r"RON-(\d+)\s*\(([^)]+)\)", text) if n in names}


def specs_rompetrol():
    # Gasoline: the grade is in the product name on the fuels page ("efixS სუპერი 98", "efix Euro Premium 95").
    # (The efix page also lists lab results such as 98.7; other brands only publish grades, so grades are used.)
    # Diesel: the efix page, "Efix Euro Diesel" / "Euro Diesel" followed by "Cetane Number: 51.3".
    found = {}
    for line in page_lines("https://www.rompetrol.ge/en/personal/fuels"):
        m = re.fullmatch(r"(efix\S*\s.+?)\s+(\d{2,3})", line, re.I)
        if not m:
            continue
        name = m.group(1).lower()
        product = ("efix Super" if "super" in name or "სუპერი" in name else
                   "efix Euro Premium" if "premium" in name or "პრემიუმ" in name else
                   "efix Euro Regular" if "regular" in name or "რეგულარ" in name else None)
        if product:
            found[product] = spec("octane", float(m.group(2)), False)
    current = None
    for line in page_lines("https://www.rompetrol.ge/en/personal/fuels/efix"):
        if line in ("Efix Euro Diesel", "Euro Diesel"):
            current = "efix Euro Diesel" if line.startswith("Efix") else "Euro Diesel"
        m = re.match(r"Cetane Number:\s*(\d+(?:\.\d+)?)", line, re.I)
        if m and current:
            found[current] = spec("cetane", float(m.group(1)), False)
            current = None
    return found


SPEC_READERS = {"Wissol": specs_wissol, "Gulf": specs_gulf, "Lukoil": specs_lukoil, "Rompetrol": specs_rompetrol}

# Used only when a company doesn't publish a figure (and nothing was read before).
# SOCAR publishes no octane on sgp.ge: these come from a third-party guide (georgiantravelguide.com/en/socar).
SPEC_FALLBACK = {
    "SOCAR": {"Nano Super": spec("octane", 98.0, False, "guide"),
              "Nano Premium": spec("octane", 95.0, False, "guide"),
              "Nano Euro Regular": spec("octane", 92.0, False, "guide")},
}
# Any Euro-5 diesel without a published figure: the EN 590 (Euro 5) minimum cetane number.
DIESEL_STANDARD = spec("cetane", 51.0, True, "standard")
SPEC_RANGE = {"octane": (80, 102), "cetane": (40, 70), "cetane index": (40, 70)}


def attach_specs(company, data, previous):
    """Give every category in `data` a "spec". Never fails the company's prices: if a page can't be read,
    the previous spec is kept (then the fallback). Changes are printed as GitHub warnings."""
    specs = {}
    if company in SPEC_READERS:
        try:
            specs = SPEC_READERS[company]()
        except Exception as e:
            print(f"::warning::{company} octane/cetane page unreadable ({e}); kept the previous figures")
    for cat in PRODUCTS[company]:
        entry = data.get(cat)
        if not entry:
            continue
        old_entry = previous.get(cat) or {}
        old = old_entry.get("spec") if old_entry.get("name") == entry["name"] else None
        new = specs.get(entry["name"])
        if new:
            lo, hi = SPEC_RANGE[new["type"]]
            if not lo <= new["value"] <= hi:
                print(f"::warning::{company} {entry['name']} {new['type']} {new['value']} looks wrong; ignored")
                new = None
        spec_ = (new or (old if old and old.get("source") == "site" else None)
                 or SPEC_FALLBACK.get(company, {}).get(entry["name"])
                 or (DIESEL_STANDARD if "iesel" in cat else None))
        if spec_ is None:
            print(f"::warning::{company} {entry['name']}: no octane/cetane figure found")
            continue
        if old and (old["type"], old["value"]) != (spec_["type"], spec_["value"]):
            print(f"::warning::{company} {entry['name']} {old['type']} changed {old['value']} -> {spec_['value']}")
        entry["spec"] = spec_


# ---------------- self-service prices ----------------
# Wissol: the same product popups as the pump price ("Self Service Price:" follows "Standard Price:").
# Gulf: the "(Gulf+)" columns of the same download (Gulf+ is Gulf's self-service network; 0 = not sold there).
# SOCAR: no single price list; each self-service station (brand type 3 in its station locator) has its own,
#        so the most common price across those stations is used (one special-price station is ignored that way;
#        on a tie, the highest of the tied prices).
# Lukoil and Rompetrol publish no self-service price. Each reader returns {product name: price}; a product it
# doesn't list (or lists with 0) has no self-service price.

def self_wissol():
    lines = page_lines("https://wissol.ge/en/fuel-prices")
    found = {}
    for i in range(len(lines) - 4):
        if lines[i + 1] == "Standard Price:" and lines[i + 3] == "Self Service Price:":
            price = to_price(lines[i + 4])
            if price is not None:
                found.setdefault(lines[i], price)
    if not found:
        raise ValueError('no "Self Service Price:" lines found on the page')
    return found


def self_gulf():
    found = {name[:-len(" (Gulf+)")]: v for name, v in gulf_latest().items() if name.endswith(" (Gulf+)")}
    if not found:
        raise ValueError("no (Gulf+) columns in the download")
    return found


SOCAR_API = "https://sgp.ge/sgp-backend/api/integration/info/"
SOCAR_SELF_SERVICE_BRAND = 3  # "Self service" in the station locator's brand types
SOCAR_FUEL_CODES = {"PREMIUM": "Nano Premium", "EURREG": "Nano Euro Regular",
                    "DIESEL": "Euro 5 Diesel", "EURODSL": "Nano Euro 5 Diesel"}  # Nano Super isn't sold there


def socar_json(url, tries=3):
    for attempt in range(tries):
        try:
            return json.loads(fetch(url))["GetBranches"]["Results"]
        except Exception:
            if attempt == tries - 1:
                raise
            time.sleep(2)


def self_socar():
    stations = [b["AgsId"] for b in socar_json(SOCAR_API + "get-branches-full-info")
                if SOCAR_SELF_SERVICE_BRAND in (b.get("BrandIds") or [])]
    if not stations:
        raise ValueError("no self-service stations in the station list")
    prices = collections.defaultdict(list)
    for ags_id in stations:
        station = socar_json(SOCAR_API + f"get-branch-full-info-by-id?agsId={ags_id}")[0]
        for fuel in station.get("FuelsWithPrice", []):
            try:
                price = round(float(fuel["FuelPrice"]), 2)
            except (KeyError, TypeError, ValueError):
                continue
            if fuel.get("FuelCode") in SOCAR_FUEL_CODES and 1 <= price <= 10:
                prices[fuel["FuelCode"]].append(price)
    found = {}
    for code, values in prices.items():
        counts = collections.Counter(values)
        best = max(counts.values())
        # the most common price; on a tie the highest of the tied prices (never promise less than a station charges)
        found[SOCAR_FUEL_CODES[code]] = max(price for price, n in counts.items() if n == best)
    return found


SELF_SERVICE_READERS = {"Wissol": self_wissol, "SOCAR": self_socar, "Gulf": self_gulf}


def attach_self_service(company, data, previous, now):
    """Give every category in `data` a "selfService" price (number or None). Never fails the company's prices:
    if the self-service source can't be read, or gives an implausible value, the previous value is kept."""
    reader = SELF_SERVICE_READERS.get(company)
    found, ok = {}, False
    if reader:
        try:
            found, ok = reader(), True
        except Exception as e:
            print(f"::warning::{company} self-service prices unreadable ({e}); kept the previous ones")
    for cat in PRODUCTS[company]:
        entry = data.get(cat)
        if not entry:
            continue
        old_entry = previous.get(cat) or {}
        old = old_entry.get("selfService") if old_entry.get("name") == entry["name"] else None
        if not reader:
            entry["selfService"] = None  # the company publishes none
            continue
        new = found.get(entry["name"]) if ok else old
        if ok and new == 0:
            new = None  # 0 = not sold at its self-service stations
        if ok and new is not None:
            if not 1 <= new <= 10:
                print(f"::warning::{company} {entry['name']} self-service price {new} is outside 1-10 GEL; "
                      "kept the previous one")
                new = old
            elif old and abs(new - old) / old > MAX_JUMP:
                print(f"::warning::{company} {entry['name']} self-service price jumped {old} -> {new}; "
                      "kept the previous one")
                new = old
            elif new > entry["price"]:
                print(f"::warning::{company} {entry['name']} self-service price {new} is above the pump price "
                      f"{entry['price']}")
        entry["selfService"] = new
    if reader and ok:
        data["selfServiceCheckedAt"] = now.isoformat(timespec="minutes")
    elif previous.get("selfServiceCheckedAt"):
        data["selfServiceCheckedAt"] = previous["selfServiceCheckedAt"]


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
            attach_specs(company, data, prev)
            attach_self_service(company, data, prev, now)
            data["checkedAt"] = now.isoformat(timespec="minutes")
            companies[company] = data
            print(f"OK   {company}: " + ", ".join(
                f"{k}={v['price']}" + (f" ({v['spec']['type']} {v['spec']['value']:g})" if "spec" in v else "")
                + (f" self-service {v['selfService']}" if v.get("selfService") else "")
                for k, v in data.items() if isinstance(v, dict) and "price" in v))
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
