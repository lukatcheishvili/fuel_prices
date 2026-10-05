# Fuel Dashboard — Agent Notes

## Rules for any agent working in this folder

- **Update this file after every 10 prompts/turns in a session, or whenever the user explicitly asks you to.**
  Update the "What Needs To Be Done" section if priorities changed, and always append a new
  entry to the "Log" section at the bottom (never delete old log entries).
- Keep "What Needs To Be Done" ABOVE the Log. Keep the Log at the very BOTTOM of the file,
  in chronological order (oldest first), so the history of what was actually done is easy to scan.
- Do not rewrite or summarize away older log entries to save space — append only.

## Project Summary

A dashboard tracking live fuel prices for Georgia's four major fuel distributors: **Wissol**,
**SOCAR Georgia**, **Gulf Georgia**, **Lukoil Georgia**. Currently a single static file:
`index.html` (vanilla JS + CSS, Apache ECharts 6.1.0 via cdnjs, Inter via Google Fonts).
No build step, no backend yet. Logos live in `assets/logos/`. All code lives in the git repo
`Desktop\Fuel\fuel_prices` (moved there 2026-10-03), pushed to the public GitHub repo
`lukatcheishvili/fuel_prices` (branch `main`) and deployed on Vercel (team
`lukatcheishvilis-projects`). `.vercelignore` keeps AGENT.md, DESIGN.md, README.md and scripts/
off the public site.

**The user drives a diesel car.** The diesel view is the most important thing on the page and
must always stay at the very top.

### Current structure of index.html

- Top nav (64px, dark): small Georgian flag (`assets/flag-ge.svg`, 24×16) + "Georgia Fuel Prices",
  tabs **Dashboard** / **Sources**.
- Dashboard tab, top to bottom:
  1. **Diesel hero ("Cheapest diesel right now")**: P1/P2/P3 podium of the 3 cheapest
     "best diesel" prices, ascending. Each row: position number (P1 in Rosso Corsa), brand logo,
     company + product name, price, and gap vs P1 (per liter and per 50 L tank).
     A **fuel switch** (segmented 4-button group, far right of the title row; it replaced an
     earlier dropdown, see Components) switches the podium between Best diesel / Euro diesel /
     Super / Petrol and updates eyebrow + title.
     It always opens on Best diesel (not remembered between visits, on purpose). Ties share a
     position number? NO: positions are numbered straight down the list (P1, P2, P3, P4), even
     when prices are equal (user's explicit rule). Only P1 is red. A brand tied with P1 on price
     still gets the "Cheapest" badge. A brand tied on price with P3 is still shown as a 4th row
     (P4), so petrol can show 4 rows.
     **Fixed dimensions (user requirement):** switching fuel must never resize/reflow the hero.
     Rows have fixed heights (desktop 152 top / 112 others; mobile ≤760px 168 / 160). Only the
     TOP row gets the large "first" styling, even when two brands tie for P1. The title uses
     the stacked-grid trick (all 4 titles in one cell, only the current one visible), so it
     reserves the longest title's size at every width. Product line is single-line; the
     "No premium sold" badge shortens to "No premium" on mobile. The ONLY allowed size change
     is an extra row for a tie at P3. Verified by measuring at 1440/1100/900/390px.
     A **"Loyalty card prices"** pill switch (`card-switch`, role=switch, on the meta row under
     the title; off by default) re-ranks the podium by card price = pump price minus each company's ENTRY-level
     card discount, and adds a line per row: "<card> −0.15 · pump 4.94". The row line is always
     reserved, so toggling never resizes the podium (verified at 1440/390px for all fuels).
     Card prices are used by the podium and (via their own switch) the gap charts; KPI cards,
     board and history stay on pump prices.
  2. **Cheapest by fuel**: 3 KPI cards (Euro Diesel, Super, Petrol) with logo(s); ties show
     every tied brand.
  3. **"How much more the others cost"**: 4 small-multiple lollipop charts (Best diesel, Euro
     diesel, Super, Petrol). x = gap from the cheapest (shared scale across panels), y = brands
     sorted cheapest first with logos as axis labels. Cheapest dot red, others gray.
     Brand labels on the y-axis are LEFT-aligned (logos form one straight column; user request).
     Has its own **"Loyalty card prices"** `card-switch` (top right of the section head, above
     the legend; independent of the podium switch, off by default) that re-ranks all 4 panels by
     card price (`ranked(cat, true)`) and adds card + pump price to the tooltip. Charts are built
     once (`renderCharts`) and refreshed in place (`updateGapCharts`). The x-scale max is computed
     over BOTH modes (currently +0.16), so toggling moves dots but never the axis or panel sizes.
     All loyalty switches go through `bindCardSwitch(button, onChange)`; reuse it for new ones.
  4. **Price board**: HTML table of every price (companies × fuels) with product names; cheapest
     per column marked with a small red square. Doubles as the accessible table view.
  5. **"Five years of prices"**: 4 small-multiple line charts (same 4 categories), daily, last
     5 years. Shaded band = cheapest to priciest brand that day (the market's price
     distribution); white line = average of the brands; end label = today's average. Shared
     y-scale (0.50 steps). Stats row per panel: 5-yr low/high (with month) + average today.
     Axis-crosshair tooltip lists every brand that day (logo, price, cheapest marked red).
     Data comes from `data/history.js` (see "Price history data" below); the section hides
     itself if that file is missing.
  6. Footnote on data provenance (full content width, justified).
- Sources tab: each company's current-price page, price-history source, last-checked date.
- Data lives inline in `fuelData` (hand-entered, scraped 2026-10-03), plus `sources` and
  `lastUpdated`. All derived values (rankings, cheapest, gaps) are computed in JS.

### Category mapping (important — do not re-derive from scratch, re-read this first)

None of the four companies use the same product names, so categories were mapped by hand:

- **Super** = each company's top-octane gasoline: Wissol "Eko Super", SOCAR "Nano Super",
  Gulf "G-Force Super", Lukoil "Super Ecto". (Note: Lukoil also lists "Super Ecto 100" but it
  was priced at 0.00 / out of stock at last check — excluded.)
- **Petrol** = each company's base/regular gasoline, which is literally named "Euro Regular"
  (or "Nano Euro Regular" / "G-Force Euro Regular") at all four — the one category with a
  clean 1:1 name match.
- **Euro Diesel** = each company's plain Euro-5 diesel: Wissol "Euro Diesel", SOCAR
  "Euro 5 Diesel", Gulf "Euro Diesel", Lukoil "Euro Diesel".
- **Premium Diesel** (`premiumDiesel` in `fuelData`; replaced the old "Other Diesel" bucket on
  2026-10-03) = each company's TOP-TIER diesel: Wissol "Eko Diesel", SOCAR "Nano Euro 5 Diesel",
  Gulf "G-Force Euro Diesel". **Lukoil sells no premium diesel** (`premiumDiesel: null`).
- **Best diesel** (used by the hero podium and first chart) = each brand's premium diesel, or its
  Euro Diesel if it has no premium (only Lukoil today), flagged in the UI with a
  "No premium sold" badge / "STD" tag. Ranked one entry per brand.
  - Why: the user said "I use the best diesel that the companies usually have", so the podium
    ranks premium tiers, not the cheapest diesel SKU overall.
  - Lukoil's fallback putting it at P1 is a judgment call. If the user only wants true premium
    diesel, change `bestDiesel()` to drop brands without a premium tier.
- **Wissol "Diesel Energy"** (4.91) is NOT premium. It's a lower grade (no Euro-5 standard
  listed, cetane min 46, marketed for machinery), cheaper than Wissol's Euro Diesel. Kept in
  `extras` and shown only as a note on the price board. (The old "Other Diesel" KPI wrongly
  surfaced it as the cheapest "other diesel".)
- Prices used are the **standard (full-service) pump price**. Wissol also lists a lower
  self-service price on its page, which is ignored.

### No public APIs exist

Checked all four — none publish a public API. Each only shows current prices on its own
website as a plain page/table:
- Wissol: https://wissol.ge/en/fuel-prices
- SOCAR: https://sgp.ge/en (archive at https://sgp.ge/en/price-archive)
- Gulf: https://gulf.ge/en/fuel_prices (blocks WebFetch's default user agent with a 403 —
  use a browser-like `User-Agent` header, e.g. via curl, to fetch it)
- Lukoil: https://www.lukoil.ge/

To make prices "live," these four pages need to be scraped on a schedule (not yet built).
**Prices update automatically** (since 2026-10-04): `.github/workflows/update-prices.yml` runs at
08, 11, 15 and 18 Tbilisi, each at :19 plus a backup run at :47 (cron `19,47 4,7,11,14 * * *`, UTC+4,
no DST; user's choice, see the 2026-10-04 and 2026-10-05 logs) plus a manual "Run
workflow". It runs `scripts/update_prices.py` → `data/prices.js` (`window.fuelPrices` =
{ checkedAt, companies: { <Co>: { super, petrol, euroDiesel, premiumDiesel, extras, checkedAt } } })
and `scripts/build_history.py`, then commits as github-actions[bot] and pushes → Vercel redeploys.
`checkedAt` changes every run, so there's a commit (and a Vercel deploy) four times a day.
- Readers: Wissol = "<name> / Standard Price: / 4.58 ₾" on /en/fuel-prices; SOCAR = "<name> /
  Standard / 4.55" on the homepage; Gulf = first data row of the .xlsx download (skip "(Gulf+)"
  columns); Lukoil = homepage, where the price comes BEFORE the name; Rompetrol = /en homepage table.
- History now runs through TODAY: the last day uses the live prices from data/prices.js.
- Validation: present, 1–10 GEL, ≤25% jump vs the previous file; `0.00` = not sold → `null`.
  A failing company keeps its last good data (and older checkedAt) and the run exits 1 (failed run →
  GitHub email). The page treats a null category as "not sold": unranked, "Not sold" on the board,
  no dot in that gap chart.
- **Wissol's history API (`api.wissol.ge`) times out from GitHub's runners** (seen on the first two runs;
  likely blocks non-Georgian/cloud IPs). Wissol's price PAGE works fine. `build_history.py` therefore
  retries each archive and, if one is unreachable, keeps that company's existing series and extends it
  with the latest scraped price (warning annotation, run stays green). Running build_history.py locally
  (from Georgia) rebuilds Wissol's history from its API in full.
- index.html no longer hard-codes prices: `fuelData` = LOGOS + `window.fuelPrices`; `lastUpdated`
  and the Sources "checked" dates come from the feed; the hero shows "updated <date>, <HH:MM>".

### Price history data (`data/history.js`, built by `scripts/build_history.py`)

All four companies DO publish price history (found 2026-10-03):
- SOCAR: JSON API behind sgp.ge/en/price-archive:
  `https://sgp.ge/sgp-backend/api/integration/info/get-archive-price-list?pageNum=1&daysPerPage=4000&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
  (daily rows since at least 2021; FuelCodes SUPER=Nano Super, EURREG=Nano Euro Regular,
  DIESEL=Euro 5 Diesel, EURODSL=Nano Euro 5 Diesel).
- Wissol: `https://api.wissol.ge/fuelpricehistory/?days=N` (JSON change points since 2009;
  series names are Georgian: ეკო სუპერი, ევრო რეგულარი, ეკო დიზელი, ევრო დიზელი).
- Gulf: `https://gulf.ge/en/fuel_prices/download` (.xlsx of all changes since 2012; ignore the
  "(Gulf+)" columns).
- Lukoil: `https://www.lukoil.ge/prices-history` (HTML table of changes, **only since
  2022-07-15**, no pagination). Super Ecto has ~69 not-sold days (kept null, not filled).
Run `python scripts/build_history.py` (needs openpyxl) to regenerate. It forward-fills each
source onto a daily calendar ending yesterday (0 price = null = not sold); the page appends
today's `fuelData` as the last point. It's a `.js` file (not JSON) because the page is opened
via `file://`, where `fetch()` of local files is blocked. **Not automatic yet.** Run it as part
of the future scheduled scraper. The archive's latest gasoline values can lag the live page by
a day (e.g. SOCAR Super 4.50 in archive vs 4.55 live on 2026-10-03, a same-day price rise).

### Loyalty card discounts (`loyaltyCards` in index.html; verified 2026-10-03)

Read from each company's OWN site. Web-search summaries were wrong for SOCAR and Gulf (see
below), so always re-verify on the official page before changing these.
| Company | Card | Entry level (used) | All levels | Official source |
|---|---|---|---|---|
| Wissol | Wissol card / app | 0.15 | Silver 0.15 on sign-up · Gold 0.20 (500–1,000 GEL/month) · Platinum 0.25 (>1,000 GEL/month) | wissol.ge/en/retail/loyalty-program |
| SOCAR | Energy Card | 0.15 | 0.15 (0–80 L last month) · 0.20 (80–150 L) · 0.25 (150+ L); PRIME subscription flat 0.30 for 15 GEL/month (150/yr) | sgp.ge/en/e-card (FAQ "How does the level system work?") |
| Gulf | Gulf Club | 0.10 (0.15 Wed/Sun, computed in Asia/Tbilisi time) | 0.10 daily · 0.15 Wed & Sun | gulf.ge/en/gulf_club (terms) |
| Lukoil | Lukoil card | 0.15 | 0.15–0.23 by volume, from ≥50 L purchase; individual discount from 15,000 L | lukoil.ge/cards |
- Rejected/unverified figures: a web search claimed SOCAR 0.20/0.25/0.30 and Gulf 0.15/0.20
  (app QR 0.20/0.25) from gulf.ge promo #280. That promo page is now 404 and SOCAR's own FAQ
  says 0.15/0.20/0.25, so the official pages win.
- Gulf's "Gulf+" price columns (≈0.10 lower) are Gulf's self-service network (gulfplus.ge), NOT a
  loyalty discount. Wissol's lower "self-service" price is likewise not a card discount.
- Wissol's page doesn't say whether the discount differs by fuel type; it's assumed to apply to all fuels.

### Rompetrol Georgia (5th company, added 2026-10-04 at the user's request)
- Current prices: https://www.rompetrol.ge/en homepage "Fuel Price" table ("Product" / "GEL/l" then
  name/price pairs; some names stay Georgian on the EN page → aliased in `read_rompetrol()`).
  Mapping: super = efix Super (98), petrol = efix Euro Regular (92), euroDiesel = Euro Diesel,
  premiumDiesel = efix Euro Diesel. (efix Euro Premium 95 is not used, like other brands' Premium.)
- No public price archive (pricerompetrol.ge rejects automated requests). Per the user, its history
  is collected from the scheduled readings starting 04 Oct 2026 (`NO_ARCHIVE` in build_history.py).
- Loyalty: Rompetrol Card, Classic 0.08 (on activation; card given with a 30 GEL purchase), Premium 0.12
  (80+ L/month for 3 rolling months), Gold 0.15 (120+ L/month for 3 months); any fuel.
  Source: rompetrol.ge/en/personal/rompetrol-card.
- Logo: the site only has a 113×31 PNG, so `assets/logos/rompetrol.svg` is the sun symbol **redrawn
  as a vector** (user approved) matching the official mark: orange scalloped rim, 8 red elliptical
  petals, white-yellow glow, flat bottom, 40:31 proportions.
- Layout for 5: gap charts 256px tall; phone price board has 5 logo columns (label column 27%, 8px
  names); the odd 5th Settings card spans both columns.

### Logos (`assets/logos/`)

Downloaded from each company's own site on 2026-10-03 and cropped to square marks so they
size consistently:
- `wissol.svg`: wissol.ge `/images/Wissol.svg` (lime circle + green star mark).
- `socar.svg`: sgp.ge `/images/icons/logo.svg`, with the white "SOCAR" wordmark path removed
  and the viewBox cropped to the flame only.
- `gulf.png`: gulf.ge `/img/logo_main_en.png` (104×96 roundel).
- `lukoil.png`: the logo image lukoil.ge itself embeds (hosted on brandlogos.net), cropped to
  the red "LUK" square (the black "LUKOIL" text was invisible on the dark canvas).
All four marks read on the dark canvas without a background plate. Keep it that way.

## Design System: Ferrari (MUST follow for all UI work)

Source: `npx getdesign@latest add ferrari` (VoltAgent awesome-design-md). The full spec is
saved as `DESIGN.md` in the repo root. Read it for detail. This section is the binding summary.
Every color/size in `index.html` comes from the CSS custom properties on `:root`. Never
inline a hex value below `:root`; JS reads them via `token("--name")`.

### Personality
Cinematic, editorial, luxury-automotive precision. Near-black canvas, white type, ONE red
accent used scarcely. Quiet confidence: modest type weights, sharp corners, hairlines, no
drop shadows.

### Color tokens
| Token | Hex | Use |
|---|---|---|
| `--primary` (Rosso Corsa) | `#da291c` | ONLY: P1 position, "cheapest" dots/markers/badge. Never decorative, never large fills. |
| `--primary-active` | `#b01e0a` | Pressed state of a red control |
| `--canvas` | `#181818` | Page background. Never pure black. |
| `--canvas-elevated` | `#303030` | Elevated panels (diesel podium), tooltips |
| `--hairline` | `#303030` | 1px dividers/borders on canvas |
| `--ink` | `#ffffff` | Headings, values, primary text |
| `--body` | `#969696` | Secondary text on canvas, axis labels, "everyone else" chart dots |
| `--body-on-elevated` | `#b4b4b4` | *Project addition*: secondary text on `#303030` (keeps ≥4.5:1) |
| `--muted` | `#666666` | Decorative/disabled only (fails AA for body text) |
| `--stem` | `#4a4a4a` | *Project addition*: lollipop stems in charts |
Do not introduce any other saturated color. Other colors come only from image assets: company
logos and the Georgian flag in the nav (its own `#ff0000` red, inside the SVG, not a token).
Ferrari's semantic colors (info `#4c98b9`, success `#03904a`, warning `#f13a2c`) are allowed
only for genuine status messages, never for data series.

### Typography
- Font: **Inter** (open substitute for licensed FerrariSans), weights 400/500/600/700.
  Stack: `'Inter', -apple-system, system-ui, sans-serif`.
- Display/headings at weight **500, never bold**. Negative tracking on display sizes only.
- Scale used: hero title 36px/500/-0.36px · section title 26px/500/+0.195px · card title
  16-18px · body 14px/400 · small 13px · caption 12px.
- **Eyebrow / labels / table headers**: 11px, 600, uppercase, letter-spacing 1.1px, `--body`.
- **Nav & tabs**: 13px, 600, uppercase, letter-spacing 0.65px.
- **Big numbers** (race-position style): P-positions 40-56px weight 700; prices 36-56px
  weight 500. Big standalone numbers use proportional figures; `tabular-nums` only in table
  columns.
- Text never wears a data/series color (except the red P1 position, which is the
  "race-position highlight" pattern from the spec).

### Spacing (8px ladder; use the tokens, no ad-hoc px)
`--space-xxxs` 4 · `xxs` 8 · `xs` 16 · `sm` 24 · `md` 32 · `lg` 48 · `xl` 64 · `xxl` 96.
Sections are separated by `xl` (64px). Max content width 1280px. Page gutter 32px desktop,
16px mobile.

### Shape & depth
- **0px corners everywhere** (cards, panels, tooltips, buttons). Pills (`9999px`) ONLY for
  small uppercase badges, plus ONE user-approved exception: the loyalty card switch (below).
- Depth = brightness step (`#181818` → `#303030`) + 1px hairlines. **No drop shadows.**
- Card grids use the "1px gap on hairline background" trick for crisp shared dividers.

### Components in use
- `top-nav-on-dark` (64px, hairline bottom, active tab = white 2px underline).
- `podium` (race-position rows on `--canvas-elevated`), `kpi-card`, `chart-card`, `board`
  table, `badge` (outline pill) / `badge.solid` (red pill, for "Cheapest" only).
- `card-switch` (loyalty card prices): **user-supplied design** (a Motion/React "bounce vs spring"
  toggle), ported to vanilla JS. Uppercase label (13px/600, `--body`, white when on or hovered)
  + pill track 56×32 (`--switch-track` = white 20%, i.e. `#fff3`), 4px padding, 24px ball.
  Off = white ball on the left; on = **Rosso Corsa (`--primary`) ball** on the right (user's
  explicit choice, after trying green; colour fades over `--dur-slow`). Animation (`animateBall`): FLIP from the old spot to
  the new one with the Web Animations API. Switching ON = spring (stiffness 700, damping 30,
  mass 1; ~0.52s, ~2px overshoot); switching OFF = easeOutBounce over 1.2s. Both curves are
  precomputed as 60fps keyframes. Skipped under `prefers-reduced-motion`. No Motion
  library dependency. Keep this design if the switch is touched again.
- `fuel-switch`: segmented control (role=radiogroup) of 4 **equal-width** buttons in a 1px
  white frame, `--hairline` dividers, 46px tall, 13px/600 uppercase 0.65px tracking. Selected
  segment is inverted (white fill, `--canvas` text). Arrow keys move + select (wrapping). 2×2
  grid full-width on mobile. Measured constant width (497.5px desktop) whatever is selected.
  - History: this replaced a dropdown. The user disliked (1) the dropdown button resizing with
    label length, and (2) the open menu overlapping the podium, even after styling it as an
    attached menu. **Lesson: don't use overlay dropdowns above the podium / KPI content.**
    For small option sets (≤5), use this segmented switch so nothing ever covers content.

### Charts: Apache ECharts
- Chosen over Chart.js for fine-grained theming (rich-text axis labels with logo images, custom
  tooltips, per-point styling) that matches the editorial look. Loaded from cdnjs
  `echarts/6.1.0` (5.5.1 does not exist on cdnjs, so don't "downgrade" to it).
- Form: **emphasis** (cheapest in Rosso Corsa, everyone else `--body` gray), not one color per
  company. Logos carry company identity. Validated with the dataviz palette script: red vs gray
  passes CVD (ΔE 14.5), normal-vision and contrast checks on `#181818`.
- Price differences are tiny (a few tetri), so charts plot the **gap from the cheapest**
  (honest zero baseline) instead of absolute price bars starting at 0 (which hide differences)
  or truncated bars (which mislead).
- Shared x-scale across small multiples. Hairline solid gridlines. No legend box inside
  charts (one HTML legend above the grid). Value label at the dot. Row-wide hover tooltip
  styled as a sharp `--canvas-elevated` box. Tick spacing widens below 480px panel width.
- Every chart has a table twin (the Price board) and an `aria-label` listing its values.
- History charts: "range band + average line" form instead of 4 colored lines per panel. Four
  near-identical brand lines would tangle and need 4 categorical colors (forbidden by the
  single-accent rule). Band color is the `--band` token (white at 12%). Brand detail is in the
  tooltip. Crosshair and gridlines are solid, never dashed.

### Phone layout (≤760px; user asked for an optimized, professional mobile view)
- Utilities: `.d-only`/`.m-only` (inline) and `.only-desktop`/`.only-mobile` (block) swap content.
  `.fuel-switch.mobile-switch` needs the double class to beat `.fuel-switch { display:grid }`.
- Header: ≤420px shows the flag only (`.brand-text` hidden) so DASHBOARD / SOURCES / ⚙ fit.
- Brand (flag + name) is a link (`#brandHome`): it returns to the Dashboard tab, or scrolls to the
  top if already there (user request). It works with click, tap and keyboard.
- Hero: titles drop " right now"; meta drops the tank note; fuel switch is a full-width 2×2.
- Podium: one compact line per brand (pos | logo | name+product+card | price), fixed heights
  108/92px; gap line shows only "+0.02 ₾/L"; card line shows "Card −0.15 · pump 4.94";
  the "No premium" badge reads "Std".
- KPI cards: label + price on one line, station underneath.
- Gap charts + 5-year history: **one fuel at a time** (user's choice), each with its own
  phone-only fuel switch (`setupChartSwitch`); desktop still shows all 4. Narrow charts use
  3 ticks (cheapest / middle / max). Tooltips use `confine: true`.
- Price board: a separate transposed table (fuels × company logos, `#boardMobile`) so all four
  brands fit; Sources tables become stacked cards (`.board.stack` + `data-label`).
- Result at 390px: 6,072px → ~3,160px tall, no horizontal scroll, no console errors.

### iPhone optimization (describe it publicly only as "optimized for iPhone", no model names: user's request)
- `viewport-fit=cover` + `env(safe-area-inset-*)` on `.wrap`, the nav (status bar in home-screen
  mode) and the footnote (home indicator). `theme-color`/`color-scheme` #181818; `html` has the canvas
  background, so iOS overscroll stays dark; `text-size-adjust: 100%`.
- Add to Home Screen: `site.webmanifest` (standalone, icons 180/192/512 in assets/) + apple-mobile-web-app
  meta (black-translucent status bar, title "Fuel Prices").
- Touch: `touch-action: manipulation`, no tap highlight, all `:hover` styles inside
  `@media (hover: hover)` (iOS sticky hover). `(pointer: coarse)` → every control ≥44px tall.
- 430–760px (large iPhones): slightly larger hero title, podium and KPI numbers.
- Landscape phones (`max-height: 500px` + `pointer: coarse` + width >760): desktop columns but the
  compact podium (rows 92/76px) and tighter spacing; podium 376px → 244px.
- Verified at 402×874 and 440×956 portrait plus 874×402 and 956×440 landscape (DPR 3, iOS UA): no overflow, no small tap
  targets, no console errors.

### Settings tab (saved per browser in localStorage key `gfp.settings.v1`)
- The tab is an **icon-only gear** (18px) after Sources on every screen size. The user asked
  to remove the "SETTINGS" text; the accessible name is `aria-label`/`title` "Settings".
- `{ cards: {Wissol, SOCAR, Gulf, Lukoil: levelId | "none"}, showCardPrices, defaultFuel }`.
  Defaults: entry level everywhere, card prices off, defaultFuel "bestDiesel" (user's rule:
  diesel is the very default). Values are validated on load; storage access is wrapped in try/catch.
- Default fuel: the podium and phone chart switches open on it.
- Loyalty levels per company (radio list incl. "No card"), "Open with my card prices on" switch
  (sets both card switches on load), "Reset to defaults". Every change auto-saves, shows
  "✓ Saved in this browser" and re-renders the podium, gap charts and Sources table.
- `loyaltyCards[].levels` hold each published level (SOCAR: 0–80 / 80–150 / 150+ L / PRIME;
  Wissol: Silver / Gold / Platinum; Gulf: Gulf Club (0.10, 0.15 Wed/Sun); Lukoil: Entry 0.15 /
  Top 0.23). `cardFor()` returns the user's level; "none" means pump price.
- One segmented-control implementation (`createSegmented`) powers every fuel switch.

### Motion (user asked for smooth, professional animations)
- Tokens: `--ease` = `cubic-bezier(0.2, 0, 0, 1)` (JS `MOTION.ease`); durations `--dur-fast` 150ms,
  `--dur` 250ms, `--dur-slow` 450ms. All zeroed under `prefers-reduced-motion` (JS checks
  `reducedMotion()`). Don't invent new curves or durations.
- Tabs: one `.tab-indicator` underline slides between tabs; the old panel fades out (fast), then
  the new one fades up 8px (slow).
- Fuel switch: one `.fuel-switch-thumb` (white block) slides/resizes between segments (2D on the
  mobile 2×2 grid); text colours cross-fade.
- Indicators are positioned with sub-pixel `getBoundingClientRect` (`placeIndicator`) and
  re-snapped by a ResizeObserver, because the Inter web font loading changes button widths.
- Hero title: stacked titles cross-fade (out fast, in delayed). Eyebrow fades on change.
- Podium (`animatePodium`): FLIP. Rows that stay slide to their new position; brands entering
  fade up; brands leaving fade out as absolutely positioned "ghost" rows; prices count to the new
  value (`tweenNumber`); changed product/card text fades in. First paint is a staggered rise.
- Gap charts: ECharts **custom series**, one group per brand in fixed company order, so a brand's
  whole row (logo, name, stem, dot, price) slides to its new rank and the price counts while
  moving. A full-row invisible rect is the tooltip hit area. Don't go back to a category y-axis:
  it relabels rows in place, so dots appear to change owner mid-animation.
- **Never resize/re-render a chart while it's hidden** (inactive tab, phone-hidden fuel card). It
  measures 0px wide and the custom-series rows collapse onto the brand labels without recovering.
  The window resize handler filters with `isVisible()`; tab switches and phone chart switches fire a
  resize after showing, so hidden charts catch up then. Regression test: Settings → Dashboard,
  Sources → resize → Dashboard, desktop → phone width → desktop, and phone rotation.
- Testing animations: headless `--dump-dom` / `--virtual-time-budget` do NOT advance animations.
  Use puppeteer-core with the installed Chrome (real time). Screenshot inside the viewport;
  `captureBeyondViewport` resizes the page and produced a false "collapsed chart" frame.

### Do / Don't (quick check before shipping UI)
- DO keep the diesel podium first on the page.
- DO keep red scarce: if more than ~5 red things are on screen, something is wrong.
- DON'T use rounded cards/buttons, drop shadows, bold display headings, pure black, or new
  accent colors.
- DON'T color text with series colors. DON'T use dashed gridlines or dual axes.

## What Needs To Be Done

- [x] (Done 2026-10-04: scripts/update_prices.py + GitHub Action.) Build a scraper (one per company, since markup/structure differs for each) that pulls
  current prices from the four source pages above and outputs them in the shape `fuelData`
  already expects in index.html (note the new shape: `{name, price}` objects per category,
  `premiumDiesel` may be null, `extras` array).
- [ ] Decide how/where scraped data is stored and how index.html gets it (static JSON file
  fetched by the page? small backend/cron job? build step?) — not decided yet.
- [ ] Decide on a refresh cadence (e.g. hourly/daily) once scraping exists, and drive
  `lastUpdated` / `sources[].checked` from the scraper instead of hand-editing.
- [ ] Confirm with the user whether Lukoil (no premium diesel, Euro Diesel used as fallback)
  should appear on the diesel podium at all.
- [x] Visual design pass. Done 2026-10-03 with the Ferrari design system (see above).
- [ ] Consider historical price tracking (the source sites keep price archives/history) if the
  user wants trend charts later, not just current snapshot.
- [ ] Optional: a card-level selector (entry / top level) for the loyalty switches, or extend
  card prices to the KPI cards and price board (currently podium + gap charts).
- [ ] Re-run `scripts/build_history.py` on the same schedule as the scraper so the 5-year
  charts stay current (it already fetches all four official archives).
- [x] Moved all code into the `fuel_prices` git repo, pushed to GitHub, deployed on Vercel
  (2026-10-03).

## Log

- **2026-10-03**: Created project. Researched Wissol/SOCAR/Gulf/Lukoil — confirmed none have a
  public API. Built initial `index.html` with placeholder/sample data: 4 KPI cards (Euro
  Diesel, Diesel, Super, Petrol) + 4 per-company bar charts side by side.
- **2026-10-03**: User spot-checked Lukoil's real diesel price (4.92) against the dashboard and
  found a mismatch. Re-scraped all four sites directly from raw HTML (not AI-summarized
  fetches, which had mixed up some rows/columns). Discovered "Diesel" wasn't a category that
  exists consistently across all four companies. Asked the user how to handle it; user chose to
  split into "Euro Diesel" (consistent across all 4) and "Other Diesel" (extra branded diesel
  SKUs, "None" where a company has none — specifically Lukoil). Rebuilt `index.html` with
  correct real prices for Super, Petrol, Euro Diesel, Other Diesel per company.
- **2026-10-03**: Added a "Sources" tab to index.html listing each company's official price-page
  URL and last-checked date, so anyone viewing the dashboard can verify where numbers came from.
- **2026-10-03**: Created this AGENT.md file to track project state, mapping decisions, and
  outstanding TODOs across sessions/agents.
- **2026-10-03**: Design pass. Pulled the Ferrari design system via `npx getdesign@latest add
  ferrari` and saved the full spec as `DESIGN.md` plus a binding summary in this file. User
  (a diesel driver) asked for a diesel KPI at the very top showing the top 3 cheapest, ascending,
  and clarified they buy "the best diesel the companies usually have", so it ranks each brand's
  premium diesel (Lukoil falls back to Euro Diesel, badged). Checked Wissol's site: Diesel Energy
  is a lower grade, not premium, so Eko Diesel is Wissol's premium. Replaced the "Other Diesel"
  category with `premiumDiesel` + `extras`. Downloaded and cropped brand logos into
  `assets/logos/`. Rebuilt `index.html`: dark Ferrari theme, P1-P3 diesel podium with logos,
  3 KPI cards (Euro Diesel/Super/Petrol), 4 gap-to-cheapest lollipop charts in Apache ECharts
  6.1.0 (replacing the per-company Chart.js bar charts), and a price board table. Verified by
  headless-Chrome screenshots at 1440px and 390px (no horizontal page scroll; widened chart
  ticks on narrow screens). User asked whether prices update automatically: they don't yet
  (hard-coded `fuelData`; scraper still TODO).
- **2026-10-03**: Per user request, replaced the red square brand mark in the top nav with a
  small Georgian flag (`assets/flag-ge.svg`, hand-drawn SVG: white field, red St George's cross,
  four small crosses; shown at 24×16).
- **2026-10-03**: Note at the bottom of the dashboard now spans the full content width
  (justified, hairline divider above) so its edges line up with the sections above. It used to
  stop at 760px.
- **2026-10-03**: Added a fuel picker button at the right of the hero title. It switches the
  top-3 podium between Best diesel (default), Euro diesel, Super and Petrol. Tested in headless
  Chrome: mouse and keyboard selection, ties (Super P1/P1/P3, Petrol shows two P3s), and mobile.
- **2026-10-03**: Fuel picker polish per user feedback: the button keeps a fixed width
  (stacked-label trick; measured 234px for all four choices), and the open menu is now an
  attached dropdown (dark canvas, white frame continuing from the button, hairline dividers) so
  it reads clearly above the gray podium instead of blending into it.
- **2026-10-03**: Replaced the fuel dropdown with a segmented 4-button switch: the open menu
  still covered the podium, so an overlay was the wrong pattern. Left-aligned the brand labels
  in the gap charts so the logos form a straight column.
- **2026-10-03**: Added "Five years of prices" below the price board. Found official price
  history for all four brands (SOCAR API, Wissol API, Gulf .xlsx, Lukoil table, which only
  starts 2022-07-15). Wrote `scripts/build_history.py` → `data/history.js` (1,826 days,
  2021-10-03..2026-10-02, 141 KB; last values cross-checked against the live pages). Charts show
  the cheapest-to-priciest band + brand average per fuel, with per-brand tooltips. Added
  history links to the Sources tab. Verified in headless Chrome (desktop + 390px, tooltip,
  switch clicks/keyboard, no console errors).
- **2026-10-03**: Made the hero podium a fixed size for every fuel (user noticed it resizing):
  fixed row heights, "first" styling on the top row only (the Super P1 tie used to make the card
  40px taller), stacked titles (the Euro diesel title wrapped on mobile), and a shorter mobile
  badge. Measured identical podium position/height for all fuels at 4 widths; only Petrol's
  P3 tie adds a row, as the user allowed.
- **2026-10-03**: Podium positions are now numbered sequentially (P1, P2, P3, P4), with no shared
  numbers for equal prices (user request). Super now reads P1 SOCAR, P2 Lukoil (both 4.55, both
  badged "Cheapest"), P3 Wissol; Petrol shows P4 Gulf (tied with P3 Wissol at 3.97).
- **2026-10-03**: Added a "Loyalty card prices" switch to the podium. Researched all four loyalty
  programs and verified the discounts on the official pages (Wissol, SOCAR Energy Card, Gulf Club,
  Lukoil card). Two web-search summaries were wrong, so official pages won. Card mode uses
  entry-level discounts (Gulf by Tbilisi weekday) and re-ranks the podium (e.g. diesel: Gulf
  drops out, Wissol enters at P3). Added a "How card prices are calculated" table to Sources.
  Podium size verified constant with the switch on and off.
- **2026-10-03**: Restyled the loyalty toggle to the user's Motion design: pill track + white ball,
  spring when switching on and bounce when switching off, ported to vanilla JS. Verified the
  animation paths in headless Chrome (spring overshoot then settle; bounce rebounds at the
  end). Recorded as the one rounded-corner exception to the design system.
- **2026-10-03**: Added the same loyalty pill switch to "How much more the others cost". It re-ranks
  all 4 gap charts by card price; the axis is shared across both modes so nothing jumps. Refactored
  the charts to build once and update in place, and both switches to share `bindCardSwitch`.
  Verified: rankings change as expected (Gulf moves to last everywhere today, since its card is
  0.10 vs 0.15), panel sizes are constant, and the switches are independent.
- **2026-10-03**: Motion pass: sliding tab underline + panel crossfade, sliding fuel-switch thumb,
  title crossfade, FLIP podium (slide/enter/exit ghosts/price count-up), gap charts rebuilt as an
  ECharts custom series so whole brand rows slide to their new rank. Fixed indicators drifting
  after the web font loads (ResizeObserver + sub-pixel geometry). Verified with real-time
  puppeteer captures. Added a fuel-pump favicon (`assets/favicon.svg` + 64/180 PNG fallbacks).
- **2026-10-03**: Loyalty switch ball turns Rosso Corsa when on (user tried green first, then chose
  red). User asked to publish: per their choices, moved all code from `Desktop\Fuel` into the
  `fuel_prices` repo, added README.md, .gitignore and .vercelignore, renamed the branch to
  `main`, and created the public GitHub repo `lukatcheishvili/fuel_prices` for Vercel to deploy from.
- **2026-10-03**: Published. GitHub repo https://github.com/lukatcheishvili/fuel_prices (public),
  Vercel project `georgia-fuel-prices` (git-linked, auto-deploys on push to `main`), live at
  https://georgia-fuel-prices.vercel.app. Created GitHub release **v1.0.0** (tag on e548fa2) with
  full release notes (features, data snapshot, loyalty discounts, tech, known limitations). Use
  semantic versioning for future releases (v1.1.0 for the scraper, etc.).
- **2026-10-03**: Phone pass, after the user's verdict that desktop looked great and the phone needed work.
  Compact podium, KPI cards and transposed price board; one-chart-at-a-time phone switches for the gap
  and history sections; Sources as stacked cards; flag-only header ≤420px. Fixed a hidden-indicator
  JS error. Page went from 6,072px to ~3,160px at 390px with no overflow. Added a **Settings** tab
  (gear, after Sources): default fuel (diesel by default), per-company loyalty card level, "open with
  card prices on", reset, all persisted in localStorage and verified across reloads. README:
  "built for drivers" generally, not diesel-specific (user correction). Shipped in v1.1.0.
- **2026-10-03**: Settings tab is icon-only (gear). Brand (flag + name) links back to the Dashboard (or
  scrolls to the top). iPhone optimization pass: safe areas, theme color, home-screen manifest +
  icons, 44px touch targets, hover only on hover devices, large-phone sizing, compact landscape podium.
  Shipped in v1.1.0.
- **2026-10-03**: User approved the phone/Settings/iPhone work. Committed, pushed to `main` (Vercel
  auto-deploy), and published GitHub release **v1.1.0** (v1.0.0 kept as history).
- **2026-10-03**: Fixed the gap charts overlapping their labels (reported by the user with a screenshot):
  any tab switch fired a resize that re-rendered the hidden dashboard charts at 0px width. Hidden charts
  are now skipped. Verified with 13 desktop/phone/rotation scenarios. README links the live site.
- **2026-10-04**: User noticed the live site still showed 03 Oct. Built automatic updates: a reader per
  site (`scripts/update_prices.py`) with validation and per-company fallback, `data/prices.js` feed, and a
  GitHub Action at 08:00 and 18:00 Tbilisi (user changed from once a day to twice). The page reads the
  feed; 0.00 = not sold. Verified locally (all 4 parse; validation cases; not-sold simulation; full
  regression). User then raised adding **Rompetrol Georgia**: to investigate next.
- **2026-10-04**: First Action runs: prices from all 4 sites OK from GitHub; Wissol history API timed out
  → added retry + fallback; re-run green; bot commits auto-deploy on Vercel; live shows "updated 04 Oct
  2026, 14:25".
- **2026-10-04**: Added **Rompetrol Georgia** (user request): updater reader, loyalty card levels, redrawn
  vector logo (user chose redraw), history collected from today (user chose this; no public archive),
  5-company layouts. Petrol P1 is now Rompetrol 3.88. History builder now ends today using live
  prices. Per the user, removed specific iPhone model names everywhere public (code comments, AGENT.md,
  v1.1.0 release); say only "optimized for iPhone".
- **2026-10-04**: Published GitHub release **v1.2.0** (automatic twice-daily updates, Rompetrol, chart-overlap
  fix) on 8eb1ce6. Releases so far: v1.0.0 launch, v1.1.0 phone/iPhone/Settings, v1.2.0 auto-updates + Rompetrol.
- **2026-10-04**: Schedule → **08:00, 11:00, 15:00, 18:00 Tbilisi** (user's choice). Data behind it: each brand
  changes prices every ~5–7 days (any brand on ~93 of 365 days); Lukoil's timestamped log shows 92% of changes
  between 07:00 and 11:00 (63/105 in the 09:00 hour), so the old 08:00 run missed most same-day changes until
  18:00. I suggested :07 past the hour to dodge GitHub's top-of-hour scheduling delays; the user chose on-the-hour
  times, so runs may start a few minutes late.
- **2026-10-04**: Schedule moved to **:07 past the hour** (08:07, 11:07, 15:07, 18:07 Tbilisi; cron
  `7 4,7,11,14 * * *`) at the user's request, to avoid GitHub's top-of-hour scheduling delays.
- **2026-10-05**: User reported the site still showed 04 Oct data. Cause: GitHub's best-effort scheduler, not
  the scripts. Of the `:07` slots, 04 Oct 15:07 and 05 Oct 08:07 never ran and 04 Oct 18:07 started at 19:45;
  every run that did start succeeded and deployed. Started a manual run (c27a874, 11:16). At the user's request,
  moved to quieter minutes with redundancy: cron `19,47 4,7,11,14 * * *` (two runs per slot, 8 a day).
  Still not guaranteed; if slots keep getting dropped, the reliable fix is an external trigger (e.g.
  cron-job.org calling the workflow_dispatch API with a fine-grained token, Actions read/write).
- **2026-10-05**: Added **Apache Airflow 3.3.2** (`airflow/`) as the main scheduler, at the user's request (also
  to learn it). Runs on the user's PC in Docker Desktop (user's choice; only works while the PC is on), with
  LocalExecutor + Postgres (trimmed from the official compose: no Redis/Celery/Flower). DAG `fuel_prices`
  at 08:05, 11:05, 15:05, 18:05 Tbilisi, catchup off: `trigger_workflow` calls workflow_dispatch with
  `return_run_details: true` (otherwise 204, no run ID), then sensor `wait_for_run` polls it (30 s, reschedule mode) and fails if the
  GitHub run fails. Needs the Airflow Variable `github_token` (fine-grained, Actions read/write). The GitHub
  cron stays as a backup. `.env` files (secrets, UI login) and airflow logs are git-ignored; `airflow/` is in
  .vercelignore. See airflow/README.md.
- **2026-10-05**: First Airflow run fixed twice: dispatch needs `return_run_details: true`; a task parameter
  can't be named `run_id` (reserved by Airflow) → `github_run_id`. Then green end to end. Found a workflow
  bug on the way: a run queued behind another (concurrency) checked out the SHA it was triggered on, so its
  push was rejected; checkout now uses `ref: main`.
