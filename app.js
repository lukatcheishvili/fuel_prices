// Current prices come from data/prices.js, written by scripts/update_prices.py (GitHub Action,
// four times a day, at :19 and :47 past 08, 11, 15 and 18 Tbilisi). Each category is { name, price } or null when that fuel isn't sold.
// premiumDiesel = the company's top-tier diesel (null if it sells none).
// extras = any other diesel SKU that is neither Euro Diesel nor the premium tier.
const LOGOS = {
  Wissol: "assets/logos/wissol.svg",
  SOCAR:  "assets/logos/socar.svg",
  Gulf:   "assets/logos/gulf.png",
  Lukoil: "assets/logos/lukoil.png",
  Rompetrol: "assets/logos/rompetrol.svg"  // added 2026-10-04
};
// The data files are generated from other companies' websites and much of it ends up in innerHTML
// and chart tooltips, so every string in them is HTML-escaped once here. The scrapers only write
// numbers and fixed strings today; this keeps a future scraped name from becoming page code.
const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeStrings(value) {
  if (typeof value === "string") return value.replace(/[&<>"']/g, c => HTML_ESCAPES[c]);
  if (Array.isArray(value)) return value.map(escapeStrings);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [escapeStrings(k), escapeStrings(v)]));
  }
  return value;
}
window.fuelPrices = escapeStrings(window.fuelPrices);
if (window.fuelHistory) window.fuelHistory = escapeStrings(window.fuelHistory);
const priceFeed = window.fuelPrices;
const fuelData = Object.entries(LOGOS).map(([company, logo]) => ({ company, logo, ...priceFeed.companies[company] }));
const lastUpdated = priceFeed.checkedAt.slice(0, 10);   // YYYY-MM-DD, Tbilisi time
const lastUpdatedTime = priceFeed.checkedAt.slice(11, 16);  // HH:MM

// Each distributor's own official price page (no public API exists for any of them).
const sources = [
  { company: "Wissol", url: "https://wissol.ge/en/fuel-prices", checked: priceFeed.companies.Wissol.checkedAt.slice(0, 10),
    history: "https://api.wissol.ge/fuelpricehistory/" },
  { company: "SOCAR",  url: "https://sgp.ge/en",                checked: priceFeed.companies.SOCAR.checkedAt.slice(0, 10),
    history: "https://sgp.ge/en/price-archive" },
  { company: "Gulf",   url: "https://gulf.ge/en/fuel_prices",    checked: priceFeed.companies.Gulf.checkedAt.slice(0, 10),
    history: "https://gulf.ge/en/fuel_prices/download" },
  { company: "Lukoil", url: "https://www.lukoil.ge/",            checked: priceFeed.companies.Lukoil.checkedAt.slice(0, 10),
    history: "https://www.lukoil.ge/prices-history" },
  { company: "Rompetrol", url: "https://www.rompetrol.ge/en",     checked: priceFeed.companies.Rompetrol.checkedAt.slice(0, 10),
    history: null }  // no public archive: history is collected from the daily readings since 04 Oct 2026
];

const TANK_LITERS = 50;
const ROMPETROL_SINCE = "2026-10-04";  // Rompetrol has no public archive: its history starts with our own readings

// Loyalty card discounts (GEL per liter, every fuel type), from each company's own site, 2026-10-03.
// Each company lists its levels (first = entry level, the default). The user's level per company
// is chosen in Settings and saved in this browser.
const tbilisiWeekday = () =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Tbilisi" }).format(new Date());
// Card names, level names and notes are in i18n.js (card.<Co>, levels.<Co>, level.<Co>.<id>, note.<Co>.<id>).
const loyaltyCards = [
  { company: "Wissol", url: "https://wissol.ge/en/retail/loyalty-program",
    levels: [
      { id: "silver",   discount: 0.15 },  // automatic on sign-up
      { id: "gold",     discount: 0.20 },  // 500–1,000 GEL spent per month
      { id: "platinum", discount: 0.25 }   // over 1,000 GEL spent per month
    ] },
  { company: "SOCAR", url: "https://sgp.ge/en/e-card",
    levels: [
      { id: "l0",    discount: 0.15 },  // 0–80 L bought last month
      { id: "l80",   discount: 0.20 },
      { id: "l150",  discount: 0.25 },
      { id: "prime", discount: 0.30 }   // subscription, 15 GEL/month
    ] },
  { company: "Gulf", url: "https://gulf.ge/en/gulf_club",
    levels: [
      { id: "club", discount: () => (["Wed", "Sun"].includes(tbilisiWeekday()) ? 0.15 : 0.10) }
    ] },
  { company: "Lukoil", url: "https://www.lukoil.ge/cards",
    levels: [
      { id: "entry", discount: 0.15 },  // from a purchase of at least 50 L
      { id: "top",   discount: 0.23 }   // highest volume level
    ] },
  { company: "Rompetrol", url: "https://www.rompetrol.ge/en/personal/rompetrol-card",
    levels: [
      { id: "classic", discount: 0.08 },  // on activation (card with a 30 GEL purchase)
      { id: "premium", discount: 0.12 },  // 80+ L per month for 3 months
      { id: "gold",    discount: 0.15 }   // 120+ L per month for 3 months
    ] }
];
const cardName = l => t(`card.${l.company}`);
const levelLabel = (l, lv) => t(`level.${l.company}.${lv.id}`);
const levelNote = (l, lv) => t(`note.${l.company}.${lv.id}`);
const levelDiscount = lv => (typeof lv.discount === "function" ? lv.discount() : lv.discount);

// ---------- Settings (saved in this browser only) ----------
const SETTINGS_KEY = "gfp.settings.v1";
const FUEL_KEYS = ["bestDiesel", "euroDiesel", "super", "premium", "petrol"];  // same keys as `categories`
// Languages, each labelled in its own language (lang= keeps "ქართული" in normal Georgian letters).
const LANGS = [
  { key: "en", label: "English", lang: "en" },
  { key: "ka", label: "ქართული", lang: "ka" },
  { key: "ru", label: "Русский", lang: "ru" }
];
const defaultSettings = () => ({
  cards: Object.fromEntries(loyaltyCards.map(l => [l.company, l.levels[0].id])),  // entry levels
  showCardPrices: false,
  defaultFuel: "bestDiesel",  // the dashboard opens on diesel unless the user picks another fuel
  lang: "en"                  // English unless the user picks Georgian or Russian
});
function loadSettings() {
  const d = defaultSettings();
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    if (!saved) return d;
    loyaltyCards.forEach(l => {  // keep only values that still exist
      const v = saved.cards && saved.cards[l.company];
      if (v === "none" || l.levels.some(x => x.id === v)) d.cards[l.company] = v;
    });
    d.showCardPrices = !!saved.showCardPrices;
    if (FUEL_KEYS.includes(saved.defaultFuel)) d.defaultFuel = saved.defaultFuel;
    if (LANGS.some(l => l.key === saved.lang)) d.lang = saved.lang;
  } catch (e) { /* storage blocked or corrupt: fall back to defaults */ }
  return d;
}
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch (e) {
    return false;
  }
}
let settings = loadSettings();

// ---------- Language (English default; Georgian and Russian from i18n.js) ----------
// t("key", { name: value }) returns the text in the current language, falling back to English.
function t(key, vars) {
  let s = (window.I18N[settings.lang] || {})[key] ?? window.I18N.en[key];
  if (s == null) return key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return s;
}
// Static page text is tagged in the HTML: data-i18n (text), data-i18n-aria (aria-label), data-i18n-title (title).
function applyStaticText() {
  document.documentElement.lang = settings.lang;
  document.title = t("meta.title");
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-aria]").forEach(el => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
  document.querySelectorAll("[data-i18n-title]").forEach(el => el.setAttribute("title", t(el.dataset.i18nTitle)));
}
// Georgian letters come from Noto Sans Georgian, which the browser fetches only once Georgian is shown.
// Charts draw their text on a canvas, so they wait for it (otherwise they'd use a fallback font).
function georgianFontReady() {
  if (settings.lang !== "ka" || !document.fonts) return Promise.resolve();
  return Promise.all(["400", "500", "600"].map(w => document.fonts.load(`${w} 13px "Noto Sans Georgian"`, "ქ")))
    .catch(() => {});
}

// The card a brand's price should use: the user's level, or "none" (pays pump price).
const cardFor = company => {
  const c = loyaltyCards.find(l => l.company === company);
  const id = settings.cards[company];
  if (id === "none") return { ...c, none: true, level: null, discount: 0 };
  const level = c.levels.find(x => x.id === id) || c.levels[0];
  return { ...c, none: false, level, discount: levelDiscount(level) };
};
// "Energy Card 150+ L −0.25 · pump 4.94" / "No card · pump price"
// Self-service line under a podium row: "Self-service −0.10 · pump 4.64" (compact on narrow screens).
const selfText = r => t("self.line", { diff: fmt(r.selfDiff), pump: fmt(r.pumpPrice) });
const cardText = r => (r.card.none
  ? t("card.none")
  : t("card.line", {
      card: cardName(r.card) + (r.card.levels.length > 1 ? " " + levelLabel(r.card, r.card.level) : ""),
      discount: fmt(r.card.discount), pump: fmt(r.pumpPrice) }));

// Chart/JS colors read from the CSS tokens so there is one source of truth.
const css = getComputedStyle(document.documentElement);
const token = name => css.getPropertyValue(name).trim();

const fmt = n => n.toFixed(2);
const logoOf = company => fuelData.find(r => r.company === company).logo;
// Dates: "06 Oct 2026" in English; "06.10.2026" in Georgian and Russian (the usual form there, and it
// needs no grammatical case after a preposition). Month + year: "Oct 2026" / "ოქტ 2026" / "окт. 2026".
const formatDate = iso => {
  const [y, m, d] = iso.split("-");
  return settings.lang === "en" ? `${d} ${t("date.months").split(" ")[m - 1]} ${y}` : `${d}.${m}.${y}`;
};
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
const monthYear = ms => { const d = new Date(ms); return `${t("date.months").split(" ")[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

// Best diesel a brand sells: its premium tier, or its Euro Diesel when it has no premium.
function bestDiesel(row) {
  if (row.premiumDiesel) return { ...row.premiumDiesel, standardOnly: false };
  if (!row.euroDiesel) return null;  // neither diesel on sale right now
  return { ...row.euroDiesel, standardOnly: true };
}

// Fuel categories in display order (diesel first: that's the owner's car).
// Each eyebrow/subtitle gets the fuel's octane or cetane range from the data (specRange), so it follows
// the companies' own figures whenever they change a grade.
// Texts (label, sub, heroEyebrow, heroTitle) are read in the current language each time they're used.
const fuelCategory = (key, pick, eyebrowKey) => ({
  key, pick,
  get label() { return t(`fuel.${key}`); },
  get sub() { return t(`sub.${key}`); },
  get heroEyebrow() { return t(`eyebrow.${eyebrowKey}`); },
  get heroTitle() { return t(`title.${key}`); }
});
const categories = [
  fuelCategory("bestDiesel", bestDiesel,        "bestDiesel"),
  fuelCategory("euroDiesel", r => r.euroDiesel, "euroDiesel"),
  fuelCategory("super",      r => r.super,      "gasoline"),
  fuelCategory("premium",    r => r.premium,    "gasoline"),
  fuelCategory("petrol",     r => r.petrol,     "gasoline")
];

// ---------- Octane / cetane (spec = { type, value, min, source } from data/prices.js) ----------
const specNum = v => String(+(+v).toFixed(1));  // 98, 51.3
// "98 octane" · "cetane 51+" (stated as a minimum) · "cetane 51.3" · "cetane index 53.3"
function specText(s) {
  if (!s) return "";
  if (s.type === "octane") return t("spec.octane", { v: specNum(s.value) });
  return t(s.type === "cetane index" ? "spec.cetaneIndex" : "spec.cetane", { v: specNum(s.value) + (s.min ? "+" : "") });
}
// Where the figure comes from, for tooltips.
function specSource(s, company) {
  if (!s) return "";
  return t(s.source === "guide" ? "spec.guide" : s.source === "standard" ? "spec.standard" : "spec.site", { company });
}
// The range across brands for a category: "92–93 octane" or, for diesel, "cetane 51+" (the lowest
// cetane number any brand states or must meet; Gulf publishes a cetane index, a different scale).
function specRange(cat) {
  const specs = fuelData.map(r => cat.pick(r)).filter(p => p && p.spec).map(p => p.spec);
  const oct = specs.filter(s => s.type === "octane").map(s => s.value);
  if (oct.length) {
    const lo = Math.min(...oct), hi = Math.max(...oct);
    return t("spec.octane", { v: `${specNum(lo)}${hi > lo ? "–" + specNum(hi) : ""}` });
  }
  const cet = specs.filter(s => s.type === "cetane").map(s => s.value);
  return cet.length ? t("spec.cetane", { v: `${Math.floor(Math.min(...cet))}+` }) : "";
}
const eyebrowFor = cat => [cat.heroEyebrow, specRange(cat)].filter(Boolean).join(" · ");
const chartSubFor = cat => (cat.key.includes("iesel") || !specRange(cat) ? cat.sub : `${cat.sub}, ${specRange(cat)}`);

// Sorted [{company, name, price, gap, rank, ...}] for a category; ties share a rank.
// mode "pump" (default): the pump price. "card": loyalty-card price (pump price minus the user's card discount).
// "self": the self-service station price; a brand with none for this fuel isn't ranked (like a fuel not on sale).
// (true/false still work: card / pump.)
function ranked(cat, mode = "pump") {
  if (mode === true) mode = "card";
  if (mode === false) mode = "pump";
  const rows = fuelData
    .filter(r => cat.pick(r))  // a brand that isn't selling this fuel right now isn't ranked
    .filter(r => mode !== "self" || cat.pick(r).selfService != null)
    .map(r => {
      const row = { company: r.company, logo: r.logo, ...cat.pick(r) };
      if (mode === "card") {
        row.card = cardFor(r.company);
        row.pumpPrice = row.price;
        row.price = Math.round((row.price - row.card.discount) * 100) / 100;
      } else if (mode === "self") {
        row.self = true;
        row.pumpPrice = row.price;
        row.price = row.selfService;
        row.selfDiff = Math.round((row.pumpPrice - row.price) * 100) / 100;
      }
      return row;
    })
    .sort((a, b) => a.price - b.price);
  if (!rows.length) return rows;  // e.g. self-service mode before any self-service price has been read
  const min = rows[0].price;
  rows.forEach((r, i) => {
    r.gap = Math.round((r.price - min) * 100) / 100;
    r.rank = i > 0 && r.price === rows[i - 1].price ? rows[i - 1].rank : i + 1;
  });
  return rows;
}

// ---------- Hero: top 3 for the picked fuel ----------
// Opens on the user's default fuel (Settings; Best diesel unless changed).
let heroKey = settings.defaultFuel;
let heroWithCard = settings.showCardPrices;  // off unless the user chose "open with my card prices on"
let heroSelf = false;  // self-service prices: never together with the card prices (card discounts at self-service
                       // stations aren't published consistently, see the Sources tab)
const heroMode = () => (heroSelf ? "self" : heroWithCard ? "card" : "pump");
// Brands that sell `cat` but publish no self-service price for it, for the note under the podium / charts.
const noSelfNote = names => (names.length ? t("self.note", { list: names.join(", ") }) : "");

function renderPodium() {
  const cat = categories.find(c => c.key === heroKey);
  // Top 3, plus any brand tied on price with the 3rd (so nobody is dropped arbitrarily).
  // Positions are simply numbered down the list (P1, P2, P3, P4): equal prices don't share one.
  const rows = ranked(cat, heroMode()).filter(r => r.rank <= 3);

  const eyebrow = document.getElementById("heroEyebrow");
  if (eyebrow.textContent !== eyebrowFor(cat)) {
    eyebrow.textContent = eyebrowFor(cat);
    if (!reducedMotion() && eyebrow.dataset.ready) {
      eyebrow.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.slow, easing: MOTION.ease });
    }
    eyebrow.dataset.ready = "1";
  }
  document.querySelectorAll("#heroTitle > span").forEach(s =>
    s.classList.toggle("current", s.dataset.key === heroKey));
  document.getElementById("cardToggle").setAttribute("aria-checked", heroWithCard);
  document.getElementById("selfToggle").setAttribute("aria-checked", heroSelf);
  document.getElementById("heroNote").textContent = heroSelf
    ? noSelfNote(fuelData.filter(r => cat.pick(r) && cat.pick(r).selfService == null).map(r => r.company)) : "";
  document.getElementById("heroMeta").textContent =
    t("hero.meta", { date: formatDate(lastUpdated), time: lastUpdatedTime });

  // FLIP: remember where every brand's row was (and its price) before re-rendering.
  const podium = document.getElementById("podium");
  const podiumTop = podium.getBoundingClientRect().top;
  const before = new Map();
  podium.querySelectorAll(".podium-row:not(.ghost)").forEach(el => before.set(el.dataset.company, {
    el, top: el.getBoundingClientRect().top, height: el.offsetHeight, price: +el.dataset.price,
    detail: el.querySelector(".podium-product").innerHTML + el.querySelector(".podium-card").innerHTML
  }));

  podium.innerHTML = !rows.length ? `<div class="podium-row empty">${t("self.noneForFuel")}</div>` : rows.map((r, i) => {
    const gapLine = r.gap === 0
      ? `<div class="podium-gap"><span class="badge solid"><span class="long">${t("podium.cheapest")}</span><span class="short">${t("podium.cheapestShort")}</span></span></div>`
      : `<div class="podium-gap">${t("podium.gap", { gap: fmt(r.gap) })}<span class="d-only">${
          t("podium.tank", { tank: fmt(r.gap * TANK_LITERS), liters: TANK_LITERS })}</span></div>`;
    const cardLine = r.card ? cardText(r) : r.self ? selfText(r) : "";
    // Phones: drop the card's name (it's in Sources) so the line fits beside the price.
    const cardHtml = r.self ? `<span class="d-only">${cardLine}</span><span class="m-only">${
          t("self.short", { diff: fmt(r.selfDiff), pump: fmt(r.pumpPrice) })}</span>`
      : !r.card ? "" : r.card.none ? t("card.none")
      : `<span class="d-only">${cardLine}</span><span class="m-only"><span class="card-word">${t("card.word")} </span>${
          t("card.short", { discount: fmt(r.card.discount), pump: fmt(r.pumpPrice) })}</span>`;
    const stdBadge = r.standardOnly
      ? `<span class="badge" title="${t("podium.noPremiumTitle")}"><span class="long">${t("podium.noPremium")}</span><span class="short">${t("podium.noPremiumShort")}</span></span>` : "";
    return `
      <div class="podium-row${i === 0 ? " first" : ""}" data-company="${r.company}" data-price="${r.price}">
        <div class="podium-pos${i === 0 ? " p1" : ""}">P${i + 1}</div>
        <img class="logo" src="${r.logo}" alt="">
        <div class="podium-info">
          <div class="podium-company">${r.company}</div>
          <div class="podium-product"${r.spec ? ` title="${specText(r.spec)} · ${specSource(r.spec, r.company)}"` : ""}><span class="product-name">${r.name}</span>${r.spec ? `<span class="spec"><span class="sep">·</span>${specText(r.spec)}</span>` : ""}${stdBadge}</div>
          <div class="podium-spec">${specText(r.spec)}</div>
          <div class="podium-card"${cardLine ? ` title="${cardLine}"` : ""}>${cardHtml}</div>
        </div>
        <div class="podium-price">
          <div class="value"><span class="num">${fmt(r.price)}</span><span class="currency">₾</span></div>
          ${gapLine}
        </div>
      </div>`;
  }).join("");

  animatePodium(podium, before, podiumTop);
}

function animatePodium(podium, before, podiumTop) {
  const rowsNow = [...podium.querySelectorAll(".podium-row")];
  if (reducedMotion()) return;

  if (!before.size) {  // first paint: rows rise in, one after another
    rowsNow.forEach((el, i) => el.animate(
      [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }],
      { duration: MOTION.slow, delay: 80 + i * 70, easing: MOTION.ease, fill: "backwards" }));
    return;
  }

  const stay = new Set();
  rowsNow.forEach(el => {
    const prev = before.get(el.dataset.company);
    if (!prev) {  // a brand entering the top 3: fades up into its slot after the old one clears
      el.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }],
                 { duration: MOTION.slow, delay: MOTION.fast, easing: MOTION.ease, fill: "backwards" });
      return;
    }
    stay.add(el.dataset.company);
    const dy = prev.top - el.getBoundingClientRect().top;
    if (Math.abs(dy) > 0.5) {  // a brand changing position slides there
      el.classList.add("moving");
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }],
                 { duration: MOTION.slow, easing: MOTION.ease })
        .onfinish = () => el.classList.remove("moving");
    }
    tweenNumber(el.querySelector(".num"), prev.price, +el.dataset.price);
    const detail = el.querySelector(".podium-product").innerHTML + el.querySelector(".podium-card").innerHTML;
    if (detail !== prev.detail) {  // product / card text changed: fade the new text in
      el.querySelectorAll(".podium-product, .podium-card, .podium-gap").forEach(t =>
        t.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.slow, easing: MOTION.ease }));
    }
  });

  // A brand leaving the top 3: its old row stays where it was as a ghost and fades out.
  before.forEach((prev, company) => {
    if (stay.has(company)) return;
    const ghost = prev.el;
    ghost.classList.add("ghost");
    ghost.style.top = `${prev.top - podiumTop}px`;
    ghost.style.height = `${prev.height}px`;
    podium.appendChild(ghost);
    ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MOTION.base, easing: MOTION.ease, fill: "forwards" })
      .onfinish = () => ghost.remove();
  });
}

// ---------- Secondary KPI cards ----------
function renderKpis() {
  const kpiCats = categories.filter(c => c.key !== "bestDiesel");
  document.getElementById("kpiGrid").innerHTML = kpiCats.map(cat => {
    const winners = ranked(cat).filter(r => r.gap === 0);
    const names = winners.map(w => `<strong>${w.company}</strong> ${w.name}` +
      (w.spec ? ` <span class="spec" title="${specSource(w.spec, w.company)}">· ${specText(w.spec)}</span>` : "")).join(", ");
    const tie = winners.length > 1 ? t("kpi.tie") : "";
    return `
      <div class="kpi-card">
        <p class="eyebrow">${t("kpi.card", { title: cat.heroTitle, label: cat.label })}</p>
        <div class="kpi-main">
          <div class="kpi-price">${fmt(winners[0].price)}<span class="currency">₾</span></div>
          <div class="kpi-logos">
            ${winners.map(w => `<img class="logo" src="${w.logo}" alt="">`).join("")}
          </div>
        </div>
        <div class="kpi-who">${names}${tie}</div>
      </div>`;
  }).join("");
}

// ---------- Gap-to-cheapest lollipop charts (Apache ECharts) ----------
const charts = [];

// Axis tick spacing, chosen from the PLOT's real pixel width (panel minus label column and right margin), the
// axis max and the measured label widths, so the labels can never collide however wide the label column,
// the language or the axis max gets. Steps are multiples of 0.02 that land exactly on the max (the smallest
// step that still leaves room); on a very narrow plot that falls back to a single step (cheapest / max).
const TICK_STEP = 0.02, GAP_RIGHT = 64;
const tickLabelWidths = { font: "", zero: 0, value: 0 };
function tickInterval(el, max) {
  const font = `400 11px ${token("--font")}`;
  if (tickLabelWidths.font !== font + t("gap.axisCheapest")) {  // re-measured when the language or font changes
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = font;
    tickLabelWidths.font = font + t("gap.axisCheapest");
    tickLabelWidths.zero = ctx.measureText(t("gap.axisCheapest")).width;
    tickLabelWidths.value = ctx.measureText("+0.00").width;
  }
  const { zero, value } = tickLabelWidths;
  const minPx = Math.max(zero / 2 + value / 2, value) + 16;  // label-to-label distance incl. breathing room
  const plot = Math.max(1, el.clientWidth - gapGridLeft - GAP_RIGHT);
  const steps = Math.round(max / TICK_STEP);
  for (let k = steps; k >= 1; k--) {
    const step = max / k;
    if (Math.abs(step / TICK_STEP - Math.round(step / TICK_STEP)) > 1e-6) continue;  // only whole 0.02 multiples
    if (plot / k >= minPx) return step;
  }
  return max;
}
let gapXMax = 0.16;
let gapGridLeft = 118;

let gapWithCard = settings.showCardPrices;  // gap charts' own switch (independent of the podium switch)
let gapSelf = false;  // the charts' own self-service switch (exclusive with gapWithCard)
const gapMode = () => (gapSelf ? "self" : gapWithCard ? "card" : "pump");
const gapPanels = [];

// Second line under a brand in the gap charts: its octane/cetane, plus "STD" for a standard-diesel fallback.
const rowDetail = r => [specText(r.spec), r.standardOnly ? t("spec.std") : ""].filter(Boolean).join(" · ");

// Builds the five chart cards once; updateGapCharts() fills/refreshes them.
function renderCharts() {
  const grid = document.getElementById("chartGrid");
  categories.forEach(cat => {
    const card = document.createElement("div");
    card.className = "chart-card";
    card.dataset.key = cat.key;
    card.innerHTML = `
      <h3></h3>
      <p class="chart-sub"></p>
      <div class="chart" role="img"></div>`;
    grid.appendChild(card);
    const chart = echarts.init(card.querySelector(".chart"));
    charts.push(chart);
    gapPanels.push({ cat, chart, card });
  });
  updateGapCharts();
}

function updateGapCharts() {
  document.getElementById("gapCardToggle").setAttribute("aria-checked", gapWithCard);
  document.getElementById("gapSelfToggle").setAttribute("aria-checked", gapSelf);
  // Brands with no self-service price in any fuel (the others just lack it for some fuels: no row there).
  document.getElementById("gapNote").textContent = gapSelf
    ? noSelfNote(fuelData.filter(r => !categories.some(c => c.pick(r) && c.pick(r).selfService != null)).map(r => r.company)) : "";
  gapPanels.forEach(({ cat, card }) => {  // titles in the current language
    card.querySelector("h3").textContent = cat.label;
    card.querySelector(".chart-sub").textContent = chartSubFor(cat);
  });
  // One shared x-scale across every panel AND both price modes, so the same gap reads the same
  // everywhere and switching loyalty prices moves the dots, never the axis.
  const maxGap = Math.max(...categories.flatMap(cat =>
    [...ranked(cat), ...ranked(cat, "card"), ...ranked(cat, "self")].map(r => r.gap)));
  // Rounded to 0.04 so both tick spacings (0.02 wide, 0.04 narrow) land on the max.
  const xMax = Math.max(0.08, Math.ceil((maxGap + 0.005) / 0.04) * 0.04);
  gapXMax = xMax;

  const C = {
    primary: token("--primary"),
    ink: token("--ink"),
    body: token("--body"),
    hairline: token("--hairline"),
    stem: token("--stem"),
    canvas: token("--canvas"),
    elevated: token("--canvas-elevated"),
    font: token("--font")
  };
  const slow = reducedMotion() ? 0 : MOTION.slow;

  // Label column (logo + name, octane/cetane underneath) sized to its longest line across every panel,
  // so the cheapest brand's dot (radius 7 at x = 0) never touches a label.
  const measure = document.createElement("canvas").getContext("2d");
  const labelEnd = r => {
    measure.font = `600 13px ${C.font}`;
    const name = measure.measureText(r.company).width;
    measure.font = `400 10px ${C.font}`;
    return 30 + Math.max(name, measure.measureText(rowDetail(r)).width);
  };
  const gridLeft = Math.max(118, Math.ceil(Math.max(...categories.flatMap(cat => ranked(cat).map(labelEnd)))) + 16);
  gapGridLeft = gridLeft;

  gapPanels.forEach(({ cat, chart }) => {
    const rows = ranked(cat, gapMode());
    const byCompany = new Map(rows.map((r, i) => [r.company, { ...r, pos: i }]));
    chart.getDom().setAttribute("aria-label", t("gap.aria", {
      label: cat.label, withCard: gapSelf ? t("gap.ariaSelf") : gapWithCard ? t("gap.ariaWithCard") : "",
      list: rows.map(r => t("gap.ariaItem", { company: r.company, price: fmt(r.price) })).join(", ") }));

    // Data stays in fixed company order, so each brand keeps its data index across updates and
    // ECharts animates that brand's whole row (logo, name, stem, dot, price) from its old rank
    // and gap to the new ones, rather than relabelling rows in place.
    const data = fuelData.map(f => {
      const r = byCompany.get(f.company);
      return { name: f.company, value: r ? [r.gap, r.pos] : ["-", "-"] };  // "-" = not sold: not drawn
    });

    const renderItem = (params, api) => {
      const r = byCompany.get(fuelData[params.dataIndex].company);
      if (!r) return null;
      const [x0, y] = api.coord([0, r.pos]);
      const xg = api.coord([r.gap, r.pos])[0];
      const rowH = api.size([0, 1])[1];
      const width = params.coordSys.x + params.coordSys.width + 64;
      const detail = rowDetail(r);
      const text = (name, style, extra = {}) => ({
        type: "text", name, style: { verticalAlign: "middle", ...style },
        enterFrom: { style: { opacity: 0 } }, ...extra
      });
      return {
        type: "group",
        y,
        transition: ["y"],
        children: [
          {  // invisible full-row hit area for the tooltip, lightly lit on hover
            type: "rect", name: "hit",
            shape: { x: 0, y: -rowH / 2, width, height: rowH },
            style: { fill: "rgba(0,0,0,0)" },
            emphasis: { style: { fill: "rgba(255,255,255,0.04)" } }
          },
          { type: "image", name: "logo", style: { image: r.logo, x: 0, y: -11, width: 22, height: 22 },
            enterFrom: { style: { opacity: 0 } } },
          // Brand name, with its octane/cetane (and "STD" for a standard-diesel fallback) underneath.
          text("name", { text: r.company, x: 30, y: detail ? -7 : 0, fill: C.ink, font: `600 13px ${C.font}` },
               { transition: ["y"] }),
          text("spec", { text: detail, x: 30, y: 8, fill: C.body, font: `400 10px ${C.font}` }),
          {  // stem from the cheapest price out to this brand's price
            type: "line", name: "stem",
            shape: { x1: x0, y1: 0, x2: xg, y2: 0 },
            style: { stroke: C.stem, lineWidth: 2 },
            transition: ["shape"],
            enterFrom: { shape: { x2: x0 } }
          },
          {
            type: "circle", name: "dot",
            shape: { cx: xg, cy: 0, r: 7 },
            style: { fill: r.gap === 0 ? C.primary : C.body, stroke: C.canvas, lineWidth: 2 },
            transition: ["shape", "style"],
            enterFrom: { shape: { cx: x0 } }
          },
          text("price", { text: fmt(r.price) + " ₾", x: 0, y: 0, fill: C.ink, font: `500 12px ${C.font}` }, {
            x: xg + 17,
            extra: { price: r.price },
            transition: ["x", "extra"],
            enterFrom: { x: x0 + 17, style: { opacity: 0 } },
            // the price label counts to its new value while it travels
            during: d => d.setStyle("text", fmt(d.getExtra("price")) + " ₾")
          })
        ]
      };
    };

    chart.setOption({
      animationDuration: reducedMotion() ? 0 : 700,
      animationEasing: "cubicOut",
      animationDurationUpdate: slow,
      animationEasingUpdate: "cubicOut",
      textStyle: { fontFamily: C.font },
      grid: { left: gridLeft, right: GAP_RIGHT, top: 6, bottom: 28 },
      xAxis: {
        type: "value",
        min: 0,
        max: xMax,
        interval: tickInterval(chart.getDom(), xMax),
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: C.hairline, width: 1 } },
        axisLabel: {
          color: C.body,
          fontSize: 11,
          hideOverlap: true,  // last line of defence; tickInterval() already leaves room
          formatter: v => (v === 0 ? t("gap.axisCheapest") : "+" + v.toFixed(2))
        }
      },
      // Rows are positions 0..n-1 on a hidden value axis (top = cheapest).
      yAxis: { type: "value", min: -0.5, max: rows.length - 0.5, inverse: true, show: false },
      tooltip: {
        trigger: "item",
        confine: true,
        backgroundColor: C.elevated,
        borderWidth: 0,
        padding: [10, 14],
        textStyle: { color: C.ink, fontFamily: C.font, fontSize: 12 },
        extraCssText: "border-radius:0;box-shadow:none;",
        formatter: p => {
          const r = byCompany.get(fuelData[p.dataIndex].company);
          const gap = r.gap === 0
            ? t("gap.tipCheapest")
            : t("gap.tipGap", { gap: fmt(r.gap), tank: fmt(r.gap * TANK_LITERS), liters: TANK_LITERS });
          const card = r.card
            ? `<br><span style="color:${C.body}">${cardText(r)}</span>`
            : r.self ? `<br><span style="color:${C.body}">${selfText(r)}</span>` : "";
          const std = r.standardOnly ? `<br><span style="color:${C.body}">${t("gap.tipStd")}</span>` : "";
          const spec = r.spec ? `<br><span style="color:${C.body}">${specText(r.spec)} · ${specSource(r.spec, r.company)}</span>` : "";
          return `<b>${r.company}</b> · ${r.name}<br>${t("gap.tipPrice", { price: fmt(r.price) })}${
            r.card && !r.card.none ? t("gap.tipWithCard") : r.self ? t("gap.tipSelf") : ""}${card}<br><span style="color:${C.body}">${gap}</span>${spec}${std}`;
        }
      },
      series: [{ type: "custom", clip: false, data, renderItem }]
    });
  });
}

// ---------- Five-year history: market range + average per fuel (Apache ECharts) ----------
const historyCharts = [];
const DAY_MS = 86400000;

// Daily prices per brand for one category, ending with today's dashboard prices.
function historyFor(cat) {
  const h = window.fuelHistory;
  const n = h.series.euroDiesel.Wissol.length;
  const start = Date.parse(h.start + "T00:00:00Z");
  const times = Array.from({ length: n }, (_, i) => start + i * DAY_MS);
  const today = Date.parse(lastUpdated + "T00:00:00Z");
  const addToday = today > times[n - 1];
  if (addToday) times.push(today);

  const brands = fuelData.map(row => {
    // Same rule as bestDiesel(): premium tier, or Euro Diesel for a brand that sells no premium.
    const key = cat.key === "bestDiesel" ? (row.premiumDiesel ? "premiumDiesel" : "euroDiesel") : cat.key;
    const values = ((h.series[key] || {})[row.company] || new Array(n).fill(null)).slice();
    if (addToday) values.push(cat.pick(row) ? cat.pick(row).price : null);
    return { company: row.company, logo: row.logo, values };
  });

  const min = [], max = [], avg = [];
  times.forEach((_, i) => {
    const v = brands.map(b => b.values[i]).filter(x => x != null);
    min.push(Math.min(...v));
    max.push(Math.max(...v));
    avg.push(Math.round(v.reduce((a, b) => a + b, 0) / v.length * 1000) / 1000);
  });
  return { times, brands, min, max, avg };
}

function renderHistory() {
  const section = document.getElementById("historySection");
  if (!window.fuelHistory) {  // data/history.js missing: hide rather than show an empty chart
    section.hidden = true;
    return;
  }
  const C = {
    primary: token("--primary"), ink: token("--ink"), body: token("--body"),
    hairline: token("--hairline"), elevated: token("--canvas-elevated"),
    band: token("--band"), font: token("--font")
  };
  const panels = categories.map(cat => ({ cat, h: historyFor(cat) }));

  // One shared price scale across all panels, snapped to 0.50 steps.
  const lo = Math.floor(Math.min(...panels.flatMap(p => p.h.min)) * 2) / 2;
  const hi = Math.ceil(Math.max(...panels.flatMap(p => p.h.max)) * 2) / 2;
  const grid = document.getElementById("historyGrid");
  // Built from scratch on every call (a language change redraws the panels in the new language).
  historyCharts.splice(0).forEach(c => c.dispose());
  grid.innerHTML = "";

  panels.forEach(({ cat, h }) => {
    const iLow = h.min.indexOf(Math.min(...h.min));
    const iHigh = h.max.indexOf(Math.max(...h.max));
    const last = h.times.length - 1;

    const card = document.createElement("div");
    card.className = "chart-card";
    card.dataset.key = cat.key;
    card.innerHTML = `
      <h3>${cat.label}</h3>
      <div class="chart-stats">
        <span>${t("history.low")} <b>${fmt(h.min[iLow])}</b> ${monthYear(h.times[iLow])}</span>
        <span>${t("history.high")} <b>${fmt(h.max[iHigh])}</b> ${monthYear(h.times[iHigh])}</span>
        <span>${t("history.avgToday")} <b>${fmt(h.avg[last])}</b></span>
      </div>
      <div class="chart tall" role="img" aria-label="${t("history.aria", {
        label: cat.label, from: fmt(h.avg[0]), start: monthYear(h.times[0]), to: fmt(h.avg[last]),
        low: fmt(h.min[iLow]), high: fmt(h.max[iHigh]) })}"></div>`;
    grid.appendChild(card);

    const chart = echarts.init(card.querySelector(".chart"));
    historyCharts.push(chart);

    const tooltipRow = (b, v, isMin) => `
      <div style="display:flex;align-items:center;gap:8px;min-width:190px">
        <span style="width:8px;height:8px;flex:none;background:${isMin ? C.primary : "transparent"}"></span>
        <img src="${b.logo}" alt="" style="width:16px;height:16px;object-fit:contain">
        <span style="flex:1">${b.company}</span>
        <b style="font-weight:600">${v == null ? `<span style="color:${C.body};font-weight:400">${t("history.noData")}</span>` : fmt(v)}</b>
      </div>`;

    chart.setOption({
      animationDuration: 500,
      textStyle: { fontFamily: C.font },
      grid: { left: 44, right: 48, top: 12, bottom: 28 },
      xAxis: {
        type: "time",
        min: h.times[0],
        max: h.times[last],
        axisLine: { lineStyle: { color: C.hairline } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { color: C.body, fontSize: 11, formatter: "{yyyy}", hideOverlap: true }
      },
      yAxis: {
        type: "value",
        min: lo,
        max: hi,
        interval: 0.5,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: C.hairline } },
        axisLabel: { color: C.body, fontSize: 11, formatter: v => v.toFixed(2) }
      },
      tooltip: {
        trigger: "axis",
        confine: true,
        axisPointer: { type: "line", lineStyle: { color: C.body, width: 1, type: "solid" } },
        backgroundColor: C.elevated,
        borderWidth: 0,
        padding: [10, 14],
        textStyle: { color: C.ink, fontFamily: C.font, fontSize: 12 },
        extraCssText: "border-radius:0;box-shadow:none;",
        formatter: params => {
          const i = params[0].dataIndex;
          const day = formatDate(isoDay(h.times[i]));
          const rows = h.brands
            .map(b => ({ b, v: b.values[i] }))
            .sort((x, y) => (x.v ?? Infinity) - (y.v ?? Infinity))
            .map(({ b, v }) => tooltipRow(b, v, v === h.min[i])).join("");
          return `<div style="color:${C.body};margin-bottom:6px">${day} · ${cat.label}</div>${rows}
            <div style="color:${C.body};margin-top:6px">${t("history.tipFooter", { avg: fmt(h.avg[i]), spread: fmt(h.max[i] - h.min[i]) })}</div>`;
        }
      },
      series: [
        {
          // Invisible base of the band (cheapest brand)...
          type: "line", stack: "band", silent: true, symbol: "none",
          lineStyle: { opacity: 0 },
          data: h.times.map((t, i) => [t, h.min[i]])
        },
        {
          // ...plus the spread up to the priciest brand, filled as a wash.
          type: "line", stack: "band", silent: true, symbol: "none",
          lineStyle: { opacity: 0 },
          areaStyle: { color: C.band },
          data: h.times.map((t, i) => [t, Math.round((h.max[i] - h.min[i]) * 1000) / 1000])
        },
        {
          type: "line", symbol: "none",
          lineStyle: { color: C.ink, width: 2, join: "round", cap: "round" },
          emphasis: { disabled: true },
          endLabel: { show: true, color: C.ink, fontSize: 12, fontWeight: 500, distance: 6,
                      formatter: p => fmt(p.value[1]) },
          data: h.times.map((t, i) => [t, h.avg[i]])
        }
      ]
    });
  });

  document.getElementById("historyNote").textContent = t("history.note", {
    start: formatDate(window.fuelHistory.start), end: formatDate(lastUpdated), lukoilStart: formatDate("2022-07-15"),
    rompetrolStart: formatDate(ROMPETROL_SINCE), rompetrolPremium: formatDate("2026-10-06") }) + " " + t("history.noteSelf");
}

// ---------- Price board ----------
function renderBoard() {
  const minByCat = Object.fromEntries(categories.map(c => [c.key, ranked(c)[0].price]));
  const boardCats = ["premiumDiesel", "euroDiesel", "super", "premium", "petrol"]
    .map(key => ({ key, label: t(`fuel.${key}`), pick: r => r[key] }));
  const premiumMin = Math.min(...fuelData.filter(r => r.premiumDiesel).map(r => r.premiumDiesel.price));
  const cheapest = { ...minByCat, premiumDiesel: premiumMin };
  // The extra product's note comes from the price feed in English; translated when a translation exists.
  const extraVars = e => ({ name: e.name, price: fmt(e.price), note: t(`extra.${e.note}`).replace(/^extra\./, "") });

  const head = `<thead><tr><th>${t("board.company")}</th>${boardCats.map(c => `<th class="num">${c.label}</th>`).join("")}</tr></thead>`;
  const body = fuelData.map(r => {
    const extras = r.extras.map(e => `<div class="extra">${t("board.alsoSells", extraVars(e))}</div>`).join("");
    const cells = boardCats.map(c => {
      const p = c.pick(r);
      if (!p) return `<td class="num"><span class="none">${t("board.notSold")}</span></td>`;
      const isMin = p.price === cheapest[c.key];
      return `<td class="num">
        <span class="price${isMin ? " cheapest" : ""}"${isMin ? ` title="${t("board.cheapestCol")}"` : ""}>${fmt(p.price)}</span>
        <div class="product">${p.name}</div></td>`;
    }).join("");
    return `<tr><td><div class="company-cell"><img class="logo" src="${r.logo}" alt="">${r.company}</div>${extras}</td>${cells}</tr>`;
  }).join("");

  document.getElementById("board").innerHTML = head + `<tbody>${body}</tbody>`;

  // Phones: fuels x companies, so all five brands fit side by side without sideways scrolling.
  const mHead = `<thead><tr><th><span class="sr-only">${t("board.fuel")}</span></th>${fuelData.map(r =>
    `<th scope="col"><img class="logo" src="${r.logo}" alt=""><span class="co">${r.company}</span></th>`).join("")}</tr></thead>`;
  const mBody = boardCats.map(c => `<tr><th scope="row">${c.label}</th>${fuelData.map(r => {
    const p = c.pick(r);
    if (!p) return `<td><span class="none" title="${t("board.notSold")}">—</span></td>`;
    const isMin = p.price === cheapest[c.key];
    return `<td><span class="price${isMin ? " cheapest" : ""}" title="${r.company} ${p.name}${isMin ? t("board.cheapestTag") : ""}">${fmt(p.price)}</span></td>`;
  }).join("")}</tr>`).join("");
  document.getElementById("boardMobile").innerHTML = mHead + `<tbody>${mBody}</tbody>`;
  document.getElementById("boardNote").textContent = [...fuelData.flatMap(r => r.extras.map(e =>
    t("board.alsoSellsNote", { company: r.company, ...extraVars(e) }))), t("board.lukoilNoPremium")].join(" ");
}

// ---------- Sources ----------
function renderSources() {
  renderSelfSources();
  document.querySelector("#sourcesTable tbody").innerHTML = sources.map(s => `
    <tr>
      <td><div class="company-cell"><img class="logo" src="${logoOf(s.company)}" alt="">${s.company}</div></td>
      <td data-label="${t("sources.current")}"><a href="${s.url}" target="_blank" rel="noopener">${s.url}</a></td>
      <td data-label="${t("sources.history")}">${s.history
        ? `<a href="${s.history}" target="_blank" rel="noopener">${s.history}</a>`
        : `<span class="none">${t("sources.noArchive", { date: formatDate(ROMPETROL_SINCE) })}</span>`}</td>
      <td data-label="${t("sources.checked")}">${formatDate(s.checked)}</td>
    </tr>`).join("");
}

// Self-service prices: where each company's comes from, and what its own pages say about loyalty cards there.
const selfSources = [
  { company: "Wissol", urls: ["https://wissol.ge/en/retail/self-service"] },
  { company: "SOCAR", urls: ["https://sgp.ge/en/self-service", "https://sgp.ge/en/news/Socar-Prime-akhali-gamoweris-funkcia"] },
  { company: "Gulf", urls: ["https://gulf.ge/en/gulf_club"] },
  { company: "Lukoil", urls: ["https://www.lukoil.ge/"] },
  { company: "Rompetrol", urls: ["https://www.rompetrol.ge/en"] }
];
function renderSelfSources() {
  document.querySelector("#selfSourceTable tbody").innerHTML = selfSources.map(s => {
    const checked = (priceFeed.companies[s.company] || {}).selfServiceCheckedAt;
    return `
    <tr>
      <td><div class="company-cell"><img class="logo" src="${logoOf(s.company)}" alt="">${s.company}</div></td>
      <td data-label="${t("selfsrc.colPrice")}">${t(`selfsrc.${s.company}.price`)}</td>
      <td data-label="${t("selfsrc.colCard")}">${t(`selfsrc.${s.company}.card`)}</td>
      <td data-label="${t("loyalty.source")}">${s.urls.map(u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`).join("<br>")}</td>
      <td data-label="${t("sources.checked")}">${checked ? formatDate(checked.slice(0, 10)) : "—"}</td>
    </tr>`;
  }).join("");
}

function renderLoyalty() {
  document.getElementById("loyaltySub").textContent = t("loyalty.sub", { date: formatDate("2026-10-03") });
  document.querySelector("#loyaltyTable tbody").innerHTML = loyaltyCards.map(l => `
    <tr>
      <td><div class="company-cell"><img class="logo" src="${logoOf(l.company)}" alt="">${l.company}</div></td>
      <td data-label="${t("loyalty.card")}">${cardName(l)}</td>
      <td class="num" data-label="${t("loyalty.yourCard")}">${(c => c.none
        ? `<span class="none">${t("loyalty.noCard")}</span>`
        : `<span class="price">−${fmt(c.discount)}</span>${l.levels.length > 1 ? `<div class="product">${levelLabel(l, c.level)}</div>` : ""}`)(cardFor(l.company))}</td>
      <td data-label="${t("loyalty.allLevels")}">${t(`levels.${l.company}`)}</td>
      <td data-label="${t("loyalty.source")}"><a href="${l.url}" target="_blank" rel="noopener">${l.url}</a></td>
    </tr>`).join("");
}

function renderSettings() {
  document.getElementById("settingsGrid").innerHTML = loyaltyCards.map(l => {
    const name = `level-${l.company}`;
    const option = (value, label, note, disc) => `
      <label class="level">
        <input type="radio" name="${name}" value="${value}"${settings.cards[l.company] === value ? " checked" : ""}>
        <span class="level-dot" aria-hidden="true"></span>
        <span><span class="level-name">${label}</span><span class="level-note">${note}</span></span>
        <span class="level-disc">${disc}</span>
      </label>`;
    return `
      <fieldset class="settings-card">
        <legend class="sr-only">${t("settings.legend", { company: l.company, card: cardName(l) })}</legend>
        <div class="settings-head">
          <img class="logo" src="${logoOf(l.company)}" alt="">
          <div><div class="settings-company">${l.company}</div><div class="settings-cardname">${cardName(l)}</div></div>
        </div>
        ${option("none", t("settings.noCard"), t("settings.payPump"), "—")}
        ${l.levels.map(lv => option(lv.id, levelLabel(l, lv), levelNote(l, lv),
          typeof lv.discount === "function" ? t("settings.today", { discount: fmt(levelDiscount(lv)) }) : `−${fmt(lv.discount)}`)).join("")}
        <a class="settings-link" href="${l.url}" target="_blank" rel="noopener">${t("settings.terms", { card: cardName(l) })}</a>
      </fieldset>`;
  }).join("");
  document.getElementById("defaultCardToggle").setAttribute("aria-checked", settings.showCardPrices);
}

let saveStatusTimer;
function settingsChanged() {
  const ok = saveSettings();
  const status = document.getElementById("saveStatus");
  status.textContent = ok ? t("settings.saved") : t("settings.saveFailed");
  if (!reducedMotion()) status.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.base, easing: MOTION.ease });
  clearTimeout(saveStatusTimer);
  saveStatusTimer = setTimeout(() => { status.textContent = ""; }, 2500);
  // Everything that shows card prices picks up the new levels immediately.
  renderPodium();
  if (gapPanels.length) updateGapCharts();
  renderLoyalty();
}

// A changed setting also applies right away, not only on the next visit: the dashboard switches to the
// new default fuel, and "open with my card prices on" flips both loyalty switches.
function applyDefaultFuel(key) {
  heroKey = key;
  if (heroFuelControl) heroFuelControl.set(key);
  chartSwitches.forEach(c => { c.control.set(key); c.show(key, false); });
}
function applyCardDefault(on) {
  heroWithCard = gapWithCard = on;
  ["cardToggle", "gapCardToggle"].forEach(id => document.getElementById(id).setAttribute("aria-checked", on));
  if (on) {  // card prices and self-service prices are never on together
    heroSelf = gapSelf = false;
    ["selfToggle", "gapSelfToggle"].forEach(id => document.getElementById(id).setAttribute("aria-checked", false));
  }
}

// Switches the whole page to another language in place (no reload): static text, every rendered
// section, switch labels, and the charts (once the Georgian font is in, since charts draw on a canvas).
function setLanguage(lang) {
  settings.lang = lang;
  if (languageControl) languageControl.set(lang);  // keeps the Settings switch and the nav menu in step
  renderLangMenu();
  applyStaticText();
  segmentedControls.forEach(c => c.relabel());
  renderHeroTitles();
  renderKpis();
  renderBoard();
  renderSources();
  renderSettings();
  renderFootnote();
  settingsChanged();  // podium, gap charts, loyalty table; shows "Saved" in the new language
  georgianFontReady().then(() => {
    if (!gapPanels.length) return;  // charts not built yet: they'll be built in the new language
    updateGapCharts();
    renderHistory();
    chartSwitches.filter(c => c.gridId === "historyGrid").forEach(c => c.refresh());
    window.dispatchEvent(new Event("resize"));
  });
}

// ---------- Language menu in the nav (the translate icon) ----------
// A menu of the three languages, each in its own language; the current one is ticked. Arrow keys move,
// Escape/Tab or a click elsewhere closes it, and a pick is saved like the Settings switch.
const langButton = document.getElementById("langButton");
const langMenu = document.getElementById("langMenu");
function renderLangMenu() {
  langMenu.innerHTML = LANGS.map(l => `
    <button type="button" role="menuitemradio" tabindex="-1" data-key="${l.key}" lang="${l.lang}"
            aria-checked="${l.key === settings.lang}"><span>${l.label}</span><svg width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5 9.5 18 20 6"/></svg></button>`).join("");
}
const langItems = () => [...langMenu.querySelectorAll("button")];
function openLangMenu(focusItem) {
  if (!langMenu.hidden) return;
  langMenu.hidden = false;
  langButton.setAttribute("aria-expanded", "true");
  if (!reducedMotion()) {
    langMenu.animate([{ opacity: 0, transform: "translateY(-4px)" }, { opacity: 1, transform: "none" }],
                     { duration: MOTION.base, easing: MOTION.ease });
  }
  if (focusItem) (langMenu.querySelector('[aria-checked="true"]') || langItems()[0]).focus();
}
function closeLangMenu(returnFocus) {
  if (langMenu.hidden) return;
  langMenu.hidden = true;
  langButton.setAttribute("aria-expanded", "false");
  if (returnFocus) langButton.focus();
}
function setupLangMenu() {
  renderLangMenu();
  langButton.addEventListener("click", e => (langMenu.hidden ? openLangMenu(e.detail === 0) : closeLangMenu(false)));
  langButton.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); openLangMenu(true); }
  });
  langMenu.addEventListener("click", e => {
    const item = e.target.closest("button");
    if (!item) return;
    closeLangMenu(true);
    if (item.dataset.key !== settings.lang) setLanguage(item.dataset.key);
  });
  langMenu.addEventListener("keydown", e => {
    const items = langItems(), i = items.indexOf(document.activeElement);
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[e.key];
    if (to !== undefined) { e.preventDefault(); items[(to + items.length) % items.length].focus(); }
    else if (e.key === "Tab") closeLangMenu(false);
  });
  document.addEventListener("keydown", e => {  // Escape closes it wherever the focus is (e.g. still on the button)
    if (e.key === "Escape" && !langMenu.hidden) { e.preventDefault(); closeLangMenu(true); }
  });
  document.addEventListener("pointerdown", e => {
    if (!document.getElementById("langPicker").contains(e.target)) closeLangMenu(false);
  });
}

let defaultFuelControl, languageControl;
function setupSettings() {
  renderSettings();
  languageControl = createSegmented(document.getElementById("languageSwitch"), LANGS, settings.lang, setLanguage);
  defaultFuelControl = createSegmented(document.getElementById("defaultFuelSwitch"), categories,
    settings.defaultFuel, key => {
      settings.defaultFuel = key;
      applyDefaultFuel(key);
      settingsChanged();
    });
  document.getElementById("settingsGrid").addEventListener("change", e => {
    if (e.target.type !== "radio") return;
    settings.cards[e.target.name.replace("level-", "")] = e.target.value;
    settingsChanged();
  });
  bindCardSwitch(document.getElementById("defaultCardToggle"), on => {
    settings.showCardPrices = on;
    applyCardDefault(on);
    settingsChanged();
  });
  document.getElementById("resetSettings").addEventListener("click", () => {
    settings = { ...defaultSettings(), lang: settings.lang };  // the language is kept: reset is about prices and cards
    renderSettings();
    defaultFuelControl.set(settings.defaultFuel);
    applyDefaultFuel(settings.defaultFuel);
    applyCardDefault(settings.showCardPrices);
    settingsChanged();
  });
}

function renderFootnote() {
  document.getElementById("dashFootnote").innerHTML = t("dash.footnote", { date: formatDate(lastUpdated) });
}

// ---------- Tabs: sliding underline + panel crossfade ----------
const tabIndicator = document.createElement("span");
tabIndicator.className = "tab-indicator";
tabIndicator.setAttribute("aria-hidden", "true");
document.querySelector(".tabs").appendChild(tabIndicator);

document.querySelectorAll(".tab-button").forEach(btn => {
  btn.addEventListener("click", () => {
    const to = document.getElementById(`tab-${btn.dataset.tab}`);
    const from = document.querySelector(".tab-panel.active");
    document.querySelectorAll(".tab-button").forEach(b => {
      b.classList.toggle("active", b === btn);
      b.setAttribute("aria-selected", b === btn);
    });
    placeIndicator(tabIndicator, btn, true);
    if (from === to) return;

    document.querySelectorAll(".tab-panel").forEach(p => p.getAnimations().forEach(a => a.cancel()));
    const show = () => {
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p === to));
      window.dispatchEvent(new Event("resize"));  // charts measure their now-visible size
      if (!reducedMotion()) {
        to.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }],
                   { duration: MOTION.slow, easing: MOTION.ease });
      }
    };
    if (reducedMotion()) return show();
    // Old page fades out quickly, new page rises in.
    from.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MOTION.fast, easing: MOTION.ease, fill: "forwards" })
      .onfinish = show;
  });
});

// Brand (flag + name) = home: reloads the page (fresh prices), which always opens on the Dashboard tab
// at the top, with the user's saved Settings applied. Scrolling to the top first means the browser
// restores the reloaded page at the top rather than where the user was.
document.getElementById("brandHome").addEventListener("click", e => {
  e.preventDefault();  // "./" would open a folder listing when the page is opened as a local file
  window.scrollTo(0, 0);
  location.reload();
});

// ---------- Motion (shared by every animation on the page) ----------
const MOTION = { fast: 150, base: 250, slow: 450, ease: "cubic-bezier(0.2, 0, 0, 1)" };
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

// Counts a price label from one value to another (an odometer, not a hard swap).
function tweenNumber(el, from, to, duration = MOTION.slow) {
  if (reducedMotion() || from === to || Number.isNaN(from)) { el.textContent = fmt(to); return; }
  const start = performance.now();
  const step = now => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = fmt(from + (to - from) * easeOutCubic(t));
    if (t < 1) requestAnimationFrame(step);
  };
  el.textContent = fmt(from);
  requestAnimationFrame(step);
}

function snapIndicators() {
  placeIndicator(tabIndicator, document.querySelector(".tab-button.active"), false);
  segmentedControls.forEach(c => c.snap());
}
const indicatorObserver = new ResizeObserver(() => snapIndicators());

// Places a sliding indicator over/under `target` (relative to its positioned parent).
function placeIndicator(indicator, target, animate) {
  // Hidden controls (inactive tab, phone-only switch on desktop) have no layout to measure.
  if (!target || !indicator.offsetParent) return;
  if (!animate) indicator.classList.add("no-anim");
  // Sub-pixel geometry (offsetLeft/Width round to whole pixels and can leave a 1px seam).
  const parent = indicator.offsetParent, p = parent.getBoundingClientRect(), t = target.getBoundingClientRect();
  const x = t.left - p.left - parent.clientLeft, y = t.top - p.top - parent.clientTop;
  const isTab = indicator.classList.contains("tab-indicator");
  indicator.style.width = t.width + "px";
  indicator.style.height = isTab ? "" : t.height + "px";
  indicator.style.transform = `translate(${x}px, ${isTab ? 0 : y}px)`;
  if (!animate) {
    indicator.offsetWidth;  // flush so the jump isn't animated
    indicator.classList.remove("no-anim");
  }
}

// Fuel switch selection: clips the white label layer to `target`, gliding there on GLIDE (the loyalty
// switch's spring physics, tuned for a ~20x longer travel; see GLIDE). The dark labels inside are laid over the real buttons,
// so text inverts exactly where the white block is on every frame. Starts from wherever a running
// glide currently is, so quick repeated clicks stay smooth.
function placeThumb(thumb, buttons, target, animate) {
  const group = thumb.parentElement;
  if (!target || !thumb.offsetParent) return;  // hidden switch: snapped again once visible
  const g = group.getBoundingClientRect(), W = group.clientWidth, H = group.clientHeight;
  const box = el => {
    const r = el.getBoundingClientRect();
    return { x: r.left - g.left - group.clientLeft, y: r.top - g.top - group.clientTop, w: r.width, h: r.height };
  };
  [...thumb.children].forEach((label, i) => {
    const b = box(buttons[i]);
    Object.assign(label.style, { left: b.x + "px", top: b.y + "px", width: b.w + "px", height: b.h + "px" });
  });
  const t = box(target);
  const to = [t.y, W - t.x - t.w, H - t.y - t.h, t.x];  // inset: top right bottom left
  const css = v => `inset(${v.map(n => Math.round(n * 100) / 100 + "px").join(" ")})`;
  const from = (getComputedStyle(thumb).clipPath.match(/-?[\d.]+(?=px)/g) || []).map(Number);
  thumb.getAnimations().forEach(a => a.cancel());
  thumb.style.clipPath = css(to);
  if (!animate || reducedMotion() || from.length !== 4 || from.every((v, i) => Math.abs(v - to[i]) < 0.5)) return;
  thumb.animate(GLIDE.map(p => ({ clipPath: css(from.map((f, i) => Math.max(0, f + (to[i] - f) * p))) })),
                { duration: (GLIDE.length - 1) * FRAME_MS, easing: "linear" });
}

// ---------- Loyalty switch animation ----------
// Port of the Motion "bounce vs spring" toggle: the ball is FLIP-animated from where it was to
// its new spot, with a spring (stiffness 700, damping 30) when switching ON and easeOutBounce
// (1.2 s) when switching OFF. Curves are precomputed as keyframes for the Web Animations API.
const FRAME_MS = 1000 / 60;

function springProgress(stiffness = 700, damping = 30, mass = 1) {
  const out = [0];
  let x = 0, v = 0;
  const dt = 1 / 240;  // integrate finer than we sample
  for (let frame = 1; frame < 600; frame++) {
    for (let k = 0; k < 4; k++) {
      v += ((-stiffness * (x - 1) - damping * v) / mass) * dt;
      x += v * dt;
    }
    out.push(x);
    if (Math.abs(x - 1) < 0.001 && Math.abs(v) < 0.01) break;
  }
  out[out.length - 1] = 1;
  return out;
}

// From https://easings.net/#easeOutBounce (same function as the Motion example).
function bounceEase(x) {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}

const SPRING = springProgress();
// The fuel switch's white block uses the same spring model, nearly critically damped (stiffness 400,
// damping 34): it travels up to ~500 px, where the ball's ~11% overshoot would swing ~50 px past the
// segment. This keeps a soft ~2-3 px settle, like the ball's.
const GLIDE = springProgress(400, 34);
const BOUNCE_FRAMES = Math.round(1200 / FRAME_MS);
const BOUNCE = Array.from({ length: BOUNCE_FRAMES + 1 }, (_, i) => bounceEase(i / BOUNCE_FRAMES));

// Wires a .card-switch: flips aria-checked (which moves the ball), lets onChange re-render,
// then animates the ball from where it was.
function bindCardSwitch(button, onChange) {
  button.addEventListener("click", () => {
    const ball = button.querySelector(".ball");
    const from = ball.getBoundingClientRect().left;  // includes any animation still running
    const on = button.getAttribute("aria-checked") !== "true";
    button.setAttribute("aria-checked", on);
    onChange(on);
    animateBall(ball, from - ball.getBoundingClientRect().left, on);
  });
}

// Flips a switch from code (the other price switch was turned on), moving its ball like a click would.
function setSwitch(button, on) {
  const ball = button.querySelector(".ball");
  const from = ball.getBoundingClientRect().left;
  button.setAttribute("aria-checked", on);
  animateBall(ball, from - ball.getBoundingClientRect().left, on);
}

function animateBall(ball, dx, on) {
  ball.getAnimations().forEach(a => a.cancel());
  if (!dx || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const curve = on ? SPRING : BOUNCE;
  ball.animate(curve.map(p => ({ transform: `translateX(${dx * (1 - p)}px)` })),
               { duration: (curve.length - 1) * FRAME_MS, easing: "linear" });
}

// ---------- Fuel switch (segmented radio group next to the hero title) ----------
// One segmented control implementation for every fuel switch (hero + phone chart switches):
// radio-group semantics, sliding thumb, arrow-key navigation.
const segmentedControls = [];

function createSegmented(group, items, initialKey, onSelect) {
  const langAttr = c => (c.lang ? ` lang="${c.lang}"` : "");  // items labelled in their own language
  group.innerHTML = items.map(c =>
    `<button type="button" role="radio" data-key="${c.key}"${langAttr(c)}>${c.label}</button>`).join("");
  const buttons = [...group.querySelectorAll("button")];
  const thumb = document.createElement("span");
  thumb.className = "fuel-switch-thumb";
  thumb.setAttribute("aria-hidden", "true");
  thumb.innerHTML = items.map(c => `<span class="thumb-label"${langAttr(c)}>${c.label}</span>`).join("");
  group.appendChild(thumb);  // appended last so button nth-child rules are unaffected

  let current = initialKey;
  const sync = animate => buttons.forEach(b => {
    const on = b.dataset.key === current;
    b.setAttribute("aria-checked", on);
    b.tabIndex = on ? 0 : -1;
    if (on) placeThumb(thumb, buttons, b, animate);
  });
  const select = (i, focus) => {
    if (buttons[i].dataset.key === current) return;
    current = buttons[i].dataset.key;
    sync(true);
    onSelect(current);
    if (focus) buttons[i].focus();
  };
  buttons.forEach((b, i) => b.addEventListener("click", () => select(i, false)));
  group.addEventListener("keydown", e => {
    const i = buttons.indexOf(document.activeElement);
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (i < 0 || !step) return;
    e.preventDefault();
    select((i + step + buttons.length) % buttons.length, true);
  });

  const control = {
    snap: () => sync(false),
    set: key => { current = key; sync(true); },
    // Re-reads the labels (a language change); the selection snaps to the new segment widths.
    relabel: () => {
      items.forEach((c, i) => { buttons[i].textContent = c.label; thumb.children[i].textContent = c.label; });
      sync(false);
    }
  };
  segmentedControls.push(control);
  buttons.forEach(b => indicatorObserver.observe(b));
  sync(false);
  return control;
}

// Every title is rendered once and stacked (see .hero-title); renderPodium() shows the current one.
// Desktop adds "right now" (its position in the sentence depends on the language).
function renderHeroTitles() {
  document.getElementById("heroTitle").innerHTML = categories.map(c => `<span data-key="${c.key}"${
    c.key === heroKey ? ' class="current"' : ""}><span class="d-only">${t("title.now", { title: c.heroTitle })}</span><span class="m-only">${c.heroTitle}</span></span>`).join("");
}

function setupFuelSwitch() {
  renderHeroTitles();

  bindCardSwitch(document.getElementById("cardToggle"), on => {
    heroWithCard = on;
    if (on && heroSelf) { heroSelf = false; setSwitch(document.getElementById("selfToggle"), false); }
    renderPodium();
  });
  bindCardSwitch(document.getElementById("selfToggle"), on => {
    heroSelf = on;
    if (on && heroWithCard) { heroWithCard = false; setSwitch(document.getElementById("cardToggle"), false); }
    renderPodium();
  });

  heroFuelControl = createSegmented(document.getElementById("fuelSwitch"), categories, heroKey, key => {
    heroKey = key;
    renderPodium();
  });
}
let heroFuelControl;

// Phones: a chart section shows one fuel at a time, chosen with its own switch (desktop shows all 5).
function setupChartSwitch(switchId, gridId) {
  const grid = document.getElementById(gridId);
  const group = document.getElementById(switchId);
  grid.classList.add("single");
  let current = settings.defaultFuel;
  const show = (key, animate) => {
    current = key;
    grid.querySelectorAll(".chart-card").forEach(card => {
      const on = card.dataset.key === key;
      card.classList.toggle("is-current", on);
      if (on && animate && !reducedMotion() && getComputedStyle(group).display !== "none") {
        card.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }],
                     { duration: MOTION.slow, easing: MOTION.ease });
      }
    });
    window.dispatchEvent(new Event("resize"));  // the newly shown chart measures its real size
  };
  const control = createSegmented(group, categories, settings.defaultFuel, key => show(key, true));
  show(settings.defaultFuel, false);
  // refresh: re-marks the shown fuel after the section's cards were rebuilt (language change).
  chartSwitches.push({ gridId, control, show, refresh: () => show(current, false) });
}
const chartSwitches = [];  // phone chart switches, so a new default fuel can be applied to them too

// Charts are only ever resized while visible. A chart on a hidden tab (or a phone-hidden fuel)
// measures 0px wide; resizing it then squashed every dot and stem onto the brand labels, and
// it didn't recover when shown again. Hidden charts are skipped and catch up when shown
// (tab switches and phone chart switches fire a resize after showing them).
const isVisible = chart => chart.getDom().offsetParent !== null && chart.getDom().clientWidth > 0;
window.addEventListener("resize", () => {
  charts.filter(isVisible).forEach(c => {
    c.setOption({ xAxis: { interval: tickInterval(c.getDom(), gapXMax) } });
    c.resize();
  });
  historyCharts.filter(isVisible).forEach(c => c.resize());
});

applyStaticText();  // the saved language (English by default)
setupFuelSwitch();
renderPodium();
// Indicators start in place (no slide on first paint); indicatorObserver re-snaps them whenever the
// controls change size (web font arriving, viewport resize, a hidden switch becoming visible).
snapIndicators();
document.querySelectorAll(".tab-button").forEach(b => indicatorObserver.observe(b));
renderKpis();
renderBoard();
renderSources();
renderLoyalty();
setupSettings();
setupLangMenu();
renderFootnote();
// Wait for Inter so chart canvas text doesn't render in the fallback font.
Promise.all([document.fonts ? document.fonts.ready : null, georgianFontReady()]).then(() => {
  renderCharts();
  setupChartSwitch("gapSwitch", "chartGrid");
  document.getElementById("gapCardToggle").setAttribute("aria-checked", gapWithCard);
  bindCardSwitch(document.getElementById("gapCardToggle"), on => {
    gapWithCard = on;
    if (on && gapSelf) { gapSelf = false; setSwitch(document.getElementById("gapSelfToggle"), false); }
    updateGapCharts();
  });
  bindCardSwitch(document.getElementById("gapSelfToggle"), on => {
    gapSelf = on;
    if (on && gapWithCard) { gapWithCard = false; setSwitch(document.getElementById("gapCardToggle"), false); }
    updateGapCharts();
  });
  renderHistory();
  if (window.fuelHistory) setupChartSwitch("historySwitch", "historyGrid");
});
