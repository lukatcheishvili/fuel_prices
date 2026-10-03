# Georgia Fuel Prices

**🔗 Live dashboard: [georgia-fuel-prices.vercel.app](https://georgia-fuel-prices.vercel.app)**

A dashboard of current fuel prices from Georgia's four main distributors: **Wissol**, **SOCAR**,
**Gulf** and **Lukoil**. Built for drivers who want to see the cheapest place to fill up at a glance,
whatever fuel they use.

## What it shows

- **Cheapest right now:** a P1–P3 podium for Best diesel (the default), Euro diesel, Super or
  Petrol, with the gap you'd pay per liter and per 50 L tank.
- **Loyalty card prices:** a switch that re-ranks by price after each company's loyalty-card
  discount (Wissol card, SOCAR Energy Card, Gulf Club, Lukoil card).
- **How much more the others cost:** gap-to-cheapest charts for every fuel.
- **Price board:** every price in one table.
- **Five years of prices:** daily price history per fuel (cheapest-to-priciest band plus the
  average).
- **Sources:** a link to every official page the numbers come from.
- **Settings:** pick your default fuel and your loyalty card level at each company (for example
  SOCAR 150+ L or Wissol Gold), and choose whether the dashboard opens with your card prices on.
  Saved in your browser (localStorage); nothing is sent anywhere.

Works on desktop and phones. On a phone the layout is compact (one-line podium rows, a rotated
price board, one chart at a time with its own fuel switch).

## Stack

A single static `index.html`: plain JavaScript and CSS, [Apache ECharts](https://echarts.apache.org/)
from cdnjs, and the Inter font. No build step. The design follows the Ferrari design system
in [`DESIGN.md`](DESIGN.md).

```
index.html                 the dashboard
assets/                    favicon, flag, company logos
data/history.js            5-year daily price history (generated)
scripts/build_history.py   rebuilds data/history.js from the companies' official archives
AGENT.md                   project notes, decisions and log (read this first when contributing)
DESIGN.md                  full design system reference
```

## Run locally

Open `index.html` in a browser. No server is needed.

## Data

None of the four companies publishes a public API, so current prices are read from each
company's own price page. The history comes from their official archives (SOCAR and Wissol APIs,
Gulf's Excel download, Lukoil's history table). To refresh the history:

```
pip install openpyxl
python scripts/build_history.py
```

Current prices in `index.html` are still entered by hand; a scheduled scraper is the next step.

## Deployment

Hosted on Vercel as a static site. Every push to `main` redeploys it. `.vercelignore` keeps the
notes and scripts off the public site.
