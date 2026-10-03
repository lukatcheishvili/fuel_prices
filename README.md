# Georgia Fuel Prices

A dashboard of current fuel prices from Georgia's four main distributors: **Wissol**, **SOCAR**,
**Gulf** and **Lukoil**. Built for a diesel driver who wants to see the cheapest option at a glance.

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
