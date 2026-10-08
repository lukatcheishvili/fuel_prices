# Georgia Fuel Prices

**🔗 Live dashboard: [georgia-fuel-prices.vercel.app](https://georgia-fuel-prices.vercel.app)**

A dashboard of current fuel prices from Georgia's main distributors: **Wissol**, **SOCAR**,
**Gulf**, **Lukoil** and **Rompetrol**. Built for drivers who want to see the cheapest place to fill up at a glance,
whatever fuel they use.

## What it shows

- **Cheapest right now:** a P1–P3 podium for Best diesel (the default), Euro diesel, Super,
  Premium or Petrol, with the gap you'd pay per liter and per 50 L tank.
- **Loyalty card prices:** a switch that re-ranks by price after each company's loyalty-card
  discount (Wissol card, SOCAR Energy Card, Gulf Club, Lukoil card, Rompetrol Card).
- **How much more the others cost:** gap-to-cheapest charts for every fuel.
- **Price board:** every price in one table.
- **Five years of prices:** daily price history per fuel (cheapest-to-priciest band plus the
  average).
- **Sources:** a link to every official page the numbers come from.
- **Settings:** pick your default fuel and your loyalty card level at each company (for example
  SOCAR 150+ L or Wissol Gold), and choose whether the dashboard opens with your card prices on.
  Saved in your browser (localStorage); nothing is sent anywhere.

Works on desktop and phones, and is optimized for iPhone. On a phone the layout is compact (one-line podium rows, a rotated
price board, one chart at a time with its own fuel switch).

## Stack

A single static `index.html`: plain JavaScript and CSS, [Apache ECharts](https://echarts.apache.org/)
from cdnjs, and the Inter font. No build step. The design follows the Ferrari design system
in [`DESIGN.md`](DESIGN.md).

```
index.html                    the dashboard
assets/                       favicon, flag, company logos
data/prices.js                current prices (updated four times a day)
data/history.js               5-year daily price history (generated)
scripts/update_prices.py      reads the five official price pages (pump and self-service prices) -> data/prices.js
scripts/build_history.py      rebuilds data/history.js from the companies' official archives
.github/workflows/update-prices.yml   runs both scripts and commits the new data
airflow/                   Apache Airflow (Docker) that starts the workflow on schedule
AGENT.md                   project notes, decisions and log (read this first when contributing)
DESIGN.md                  full design system reference
```

## Run locally

Open `index.html` in a browser. No server is needed.

## Data

None of the companies publishes a public API, so current prices are read from each company's own
price page. The history comes from their official archives (SOCAR and Wissol APIs, Gulf's Excel
download, Lukoil's history table). Rompetrol publishes no archive, so its history is collected by
this project from 04 Oct 2026 onward.

A "Self-service prices" switch shows the price at self-service stations, for the companies that publish one
(Wissol, Gulf+ and SOCAR; Lukoil and Rompetrol publish none). It has no history, and it never shows a card
discount on top of it: see the Sources tab for what each company says about cards at self-service stations.

**Automatic updates:** a GitHub Action (`.github/workflows/update-prices.yml`) reads the five price
pages, refreshes the history, and commits the new data; the push redeploys the site on Vercel. It is
started four times a day, around **08:00, 11:00, 15:00 and 18:00 Tbilisi time**, in two ways:

- **Apache Airflow** (`airflow/`, see [`airflow/README.md`](airflow/README.md)) runs in Docker on the
  maintainer's PC and starts the workflow at 08:05, 11:05, 15:05 and 18:05, then waits for its result.
  It only runs while that PC is on.
- **GitHub's own schedule** is the backup: :19 and :47 past the same hours. It's best effort, so GitHub
  sometimes starts these late or skips them.

Extra runs are harmless: they queue one after another and just re-check the prices. Every price is validated (must exist, 1–10 GEL, no
jump over 25%; 0.00 means "not sold"). If a site fails, its last good prices are kept and the run is
marked failed so GitHub emails you. You can also start it by hand: **Actions → Update fuel prices →
Run workflow**.

To run the update locally:

```
pip install openpyxl
python scripts/update_prices.py
python scripts/build_history.py
```

## Deployment

Hosted on Vercel as a static site. Every push to `main` redeploys it. `.vercelignore` keeps the
notes and scripts off the public site.
