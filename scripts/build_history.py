"""Build data/history.js: five years of daily fuel prices for the four distributors.

Run:  python scripts/build_history.py      (from the Fuel folder; needs openpyxl)

Sources (all official, all public, no API keys):
  SOCAR   https://sgp.ge/sgp-backend/api/integration/info/get-archive-price-list  (daily rows)
  Wissol  https://api.wissol.ge/fuelpricehistory/                               (change points)
  Gulf    https://gulf.ge/en/fuel_prices/download  (.xlsx)                       (change points)
  Lukoil  https://www.lukoil.ge/prices-history     (HTML table, starts 2022-07-15) (change points)

Every source is turned into a list of (date, price) change points, then forward-filled onto one
daily calendar. A price of 0 means "not sold" and becomes null. Product mapping matches the
category mapping in AGENT.md.
"""

import io
import json
import re
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

import openpyxl

YEARS = 5
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0 Safari/537.36")
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "history.js"
PRICES = ROOT / "data" / "prices.js"

CATEGORIES = ["premiumDiesel", "euroDiesel", "super", "petrol"]


def fetch(url, attempts=3):
    """GET with retries: archive servers are occasionally slow to answer from GitHub's runners."""
    for attempt in range(1, attempts + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=90) as resp:
                return resp.read()
        except Exception:
            if attempt == attempts:
                raise
            time.sleep(10 * attempt)


def price(v):
    """Source value -> float, or None when the product isn't sold (0 / blank)."""
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return round(v, 2) if v > 0 else None


def socar(start, end):
    codes = {"EURODSL": "premiumDiesel", "DIESEL": "euroDiesel", "SUPER": "super", "EURREG": "petrol"}
    url = ("https://sgp.ge/sgp-backend/api/integration/info/get-archive-price-list"
           f"?pageNum=1&daysPerPage=4000&startDate={start - timedelta(days=10)}&endDate={end}")
    rows = json.loads(fetch(url))["ArchivePrice"]["Results"]
    points = {c: [] for c in CATEGORIES}
    for row in rows:
        d = date.fromisoformat(row["DateOfChange"][:10])
        for p in row["Prices"]:
            if p["FuelCode"] in codes:
                points[codes[p["FuelCode"]]].append((d, price(p["Price"])))
    return points


def wissol():
    names = {"ეკო დიზელი": "premiumDiesel", "ევრო დიზელი": "euroDiesel",
             "ეკო სუპერი": "super", "ევრო რეგულარი": "petrol"}
    data = json.loads(fetch("https://api.wissol.ge/fuelpricehistory/?days=4000"))["data"]
    points = {c: [] for c in CATEGORIES}
    for s in data:
        if s["name"] in names:
            points[names[s["name"]]] = [(date.fromisoformat(x["name"][:10]), price(x["value"]))
                                        for x in s["series"]]
    return points


def gulf():
    cols = {"G-Force Euro Diesel": "premiumDiesel", "Euro Diesel": "euroDiesel",
            "G-Force Super": "super", "G-Force Euro Regular": "petrol"}
    wb = openpyxl.load_workbook(io.BytesIO(fetch("https://gulf.ge/en/fuel_prices/download")), read_only=True)
    rows = list(wb.worksheets[0].iter_rows(values_only=True))
    header = list(rows[0])
    points = {c: [] for c in CATEGORIES}
    for r in rows[1:]:
        d = r[0] if isinstance(r[0], date) else date.fromisoformat(str(r[0])[:10])
        if isinstance(d, datetime):
            d = d.date()
        for col, cat in cols.items():
            points[cat].append((d, price(r[header.index(col)])))
    return points


def lukoil():
    html = fetch("https://www.lukoil.ge/prices-history").decode("utf-8")
    tokens = [t.strip() for t in re.sub(r"<[^>]*>", "\n", html).split("\n") if t.strip()]
    # Table columns: #, Super Ecto 100, Super Ecto, Premium Avangard, Euro Regular, Euro Diesel, changed at
    points = {c: [] for c in CATEGORIES}
    for i, t in enumerate(tokens):
        if re.fullmatch(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}", t):
            _, _, sup, _, reg, dsl = tokens[i - 6:i]
            d = date.fromisoformat(t[:10])
            points["super"].append((d, price(sup)))
            points["petrol"].append((d, price(reg)))
            points["euroDiesel"].append((d, price(dsl)))
    # Lukoil Georgia sells no premium diesel: premiumDiesel stays empty (null).
    return points


def daily(points, days):
    """Forward-fill change points onto the daily calendar (last change of a day wins)."""
    pts = sorted(points, key=lambda p: p[0])  # stable: same-day order preserved
    out, j, current = [], 0, None
    for d in days:
        while j < len(pts) and pts[j][0] <= d:
            current = pts[j][1]
            j += 1
        out.append(current)
    return out


def read_js_object(path):
    text = path.read_text(encoding="utf-8")
    return json.loads(text[text.index("{"):text.rindex("}") + 1])


def fallback_points(company):
    """Change points for a company whose archive is unreachable: its series from the existing
    history.js, plus the latest price read by update_prices.py (data/prices.js) on its date."""
    points = {cat: [] for cat in CATEGORIES}
    if OUT.exists():
        old = read_js_object(OUT)
        old_start = date.fromisoformat(old["start"])
        for cat in CATEGORIES:
            for i, v in enumerate(old["series"][cat].get(company, [])):
                points[cat].append((old_start + timedelta(days=i), v))
    if PRICES.exists():
        current = read_js_object(PRICES)["companies"].get(company, {})
        if current.get("checkedAt"):
            day = date.fromisoformat(current["checkedAt"][:10])
            for cat in CATEGORIES:
                entry = current.get(cat)
                points[cat].append((day, entry["price"] if entry else None))
    if not any(points.values()):
        raise RuntimeError(f"no earlier history or current price to fall back on for {company}")
    return points


def main():
    end = date.today() - timedelta(days=1)  # today's prices come from data/prices.js on the page
    start = date(end.year - YEARS, end.month, end.day) + timedelta(days=1)
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]

    readers = {"Wissol": wissol, "SOCAR": lambda: socar(start, end), "Gulf": gulf, "Lukoil": lukoil}
    sources, fell_back = {}, []
    for company, read in readers.items():
        try:
            sources[company] = read()
        except Exception as e:
            # One slow/unreachable archive must not stop the update: keep that company's existing
            # history and extend it with today's scraped price. Surfaced as a warning in the run.
            sources[company] = fallback_points(company)
            fell_back.append(company)
            print(f"::warning::{company} price archive unavailable ({e}); "
                  f"extended its existing history with the latest scraped price instead")
    series = {cat: {co: daily(pts[cat], days) for co, pts in sources.items()} for cat in CATEGORIES}

    payload = {"generated": date.today().isoformat(), "start": start.isoformat(),
               "end": end.isoformat(), "series": series}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        "// Generated by scripts/build_history.py. Do not edit by hand.\n"
        "// Daily GEL/liter per category and company, forward-filled from each official archive.\n"
        f"window.fuelHistory = {json.dumps(payload, separators=(',', ':'))};\n",
        encoding="utf-8")

    print(f"{start} -> {end}, {len(days)} days, wrote {OUT} ({OUT.stat().st_size // 1024} KB)")
    for cat in CATEGORIES:
        last = {co: s[-1] for co, s in series[cat].items()}
        first = {co: next((i for i, v in enumerate(s) if v is not None), None) for co, s in series[cat].items()}
        print(f"  {cat:14} last={last}  first-index={first}")


    if fell_back:
        print(f"Used fallback history for: {', '.join(fell_back)}")


if __name__ == "__main__":
    sys.exit(main())
