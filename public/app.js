"use strict";
// Dashboard Trenér – všechna data z /api, žádná natvrdo v HTML.

// jednobarevné ikony (SVG, barva = currentColor) – stejný styl v menu i ve spodní liště
const ICONS = {
  prehled: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  trener: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 10h18M9 15.5l2 2 4-4"/>',
  aktivity: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  kondice: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  zotaveni: '<path d="M12 20s-7.5-4.6-9.2-9.4A4.6 4.6 0 0 1 12 7.3a4.6 4.6 0 0 1 9.2 3.3C19.5 15.4 12 20 12 20z"/>',
  telo: '<circle cx="12" cy="4.5" r="2"/><path d="M5 8.5h14M12 8.5V14M12 14l-3.5 7M12 14l3.5 7"/>',
  sila: '<path d="M6.5 6v12M17.5 6v12M3 9.5v5M21 9.5v5M6.5 12h11"/>',
  chuze: '<path d="M8.5 3.5c1.8 0 2.8 1.9 2.6 4.3-.2 2.3-1.3 3.7-2.9 3.7S5.6 10 5.7 7.6C5.8 5.2 6.8 3.5 8.5 3.5zM6.3 14h4.4l-.4 3.6a2 2 0 0 1-3.6.4z"/><path d="M15.5 7.5c1.7 0 2.6 1.6 2.4 3.8-.2 2-1.2 3.2-2.7 3.2s-2.5-1.3-2.4-3.4c.1-2.1 1.1-3.6 2.7-3.6zM13.5 17.5h4.2l-.4 2.4a1.9 1.9 0 0 1-3.5.2z"/>',
  vyziva: '<path d="M10 2.5h4M10.5 2.5v3L8 9v10.5A1.5 1.5 0 0 0 9.5 21h5a1.5 1.5 0 0 0 1.5-1.5V9l-2.5-3.5v-3M8 13h8"/>',
  nastaveni: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  kalendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 10h18"/><circle cx="8" cy="14.5" r="1"/><circle cx="12" cy="14.5" r="1"/><circle cx="16" cy="14.5" r="1"/><circle cx="8" cy="18" r="1"/>',
  chat: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A2.5 2.5 0 0 1 3 13.5"/><path d="M8 8.5h8M8 12h5"/>',
  vybaveni: '<circle cx="6" cy="16" r="3.6"/><circle cx="18" cy="16" r="3.6"/><path d="M6 16l4-7h5l3 7M10 9l3 7h-7M14 6h3"/>',
  vice: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k] || ""}</svg>`;

// hlavní stránky (na mobilu ve spodní liště) + další v „Více“
const MAIN = [
  ["prehled", "Přehled"],
  ["trener", "Trenér"],
  ["aktivity", "Aktivity"],
  ["kondice", "Kondice"],
  ["zotaveni", "Zotavení"],
];
const MORE = [
  ["kalendar", "Kalendář"],
  ["chat", "Chat s AI"],
  ["vybaveni", "Vybavení"],
  ["telo", "Tělo"],
  ["sila", "Síla a mobilita"],
  ["chuze", "Chůze a kroky"],
  ["vyziva", "Výživa"],
  ["nastaveni", "Nastavení"],
];

// barvy zón jako v Garminu: tep Z1 šedá · Z2 modrá · Z3 zelená · Z4 oranžová · Z5 červená; výkon Z1–Z7
const HR_ZC = ["var(--z1)", "var(--z2)", "var(--z3)", "var(--z4)", "var(--z6)"];
const PWR_ZC = ["var(--z1)", "var(--z2)", "var(--z3)", "var(--z4)", "var(--z5)", "var(--z6)", "var(--z7)"];
/** index zóny tepu: floors = dolní hranice Z2..Z5 (pod Z2 = Z1) */
const hrZoneIdx = (v, floors) => { let z = 0; for (let i = 0; i < floors.length; i++) if (v >= floors[i]) z = i + 1; return z; };
/** index zóny výkonu: tops = horní hranice Z1..Z6 */
const pwrZoneIdx = (v, tops) => { let z = 0; while (z < tops.length && v > tops[z]) z++; return z; };

// ---------- formát (desetinná čárka, „−“, mezera před jednotkou) ----------
const DASH = "–";
const num = (x, d = 0) => {
  if (x == null || !isFinite(x)) return DASH;
  const r = Math.abs(x).toFixed(d).replace(".", ",");
  return x < 0 && Number(Math.abs(x).toFixed(d)) !== 0 ? "−" + r : r;
};
const signed = (x, d = 0) => (x == null ? DASH : x > 0 ? "+" + num(x, d) : num(x, d));
const thou = (x) => (x == null ? DASH : Math.round(x).toLocaleString("cs-CZ").replace(/\s/g, " "));
const DAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const MONTHS = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];
const dow = (d) => { const g = new Date(d + "T12:00:00Z").getUTCDay(); return g === 0 ? 7 : g; };
const dm = (d) => `${+d.slice(8, 10)}.${+d.slice(5, 7)}.`;
const dayDm = (d) => `${DAYS[dow(d) - 1]} ${dm(d)}`;
const hmm = (s) => { if (s == null) return DASH; const m = Math.round(s / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; };
const mmss = (s) => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, "0"); return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`; };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// běžky: emoji běžkaře neexistuje (⛷️ je sjezdař) → vlastní ikona; v SVG textu grafů 🎿
const XC_SVG = '<svg class="emo" viewBox="0 0 24 24" aria-label="běžky"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9.5 9 19.5M18.5 8.5l-1.7 11" stroke="#8b939c" stroke-width="1.4"/><path d="M13.6 6.6 10.4 11l3.2 2.4-1.6 4.4" stroke="#2f3b4c" stroke-width="2.1"/><path d="M13.6 6.6 10.4 11" stroke="#2f7fd6" stroke-width="3.2"/><path d="M13.6 6.6l3.4 3 2.6-.6M10.4 11l-3.6 1.6" stroke="#2f7fd6" stroke-width="1.9"/><path d="M2.5 20.6h19" stroke="#e0483e" stroke-width="2"/><circle cx="14.5" cy="3.6" r="2.1" fill="#f2b27a" stroke="none"/><path d="M12.5 3.1a2.1 2.1 0 0 1 4 0z" fill="#e0483e" stroke="none"/></g></svg>';
const SPORT_ICON = { ride: "🚴", mtb: "🚵", indoor: "🚴", run: "🏃", hockey: "🏒", skate: "⛸️", xc_ski: XC_SVG, walk: "🚶", hike: "🥾", padel: "🎾", strength: "🏋️", mobility: "🧘", other: "🏅" };
const sportTxt = (s) => (s === "xc_ski" ? "🎿" : SPORT_ICON[s] || "🏅"); // pro SVG <text> a title
/** délka „1 h 10 min“ / „48 min“ (spánek, fáze) */
const dur = (s) => { if (s == null) return DASH; const m = Math.round(s / 60); const h = Math.floor(m / 60); return h ? `${h} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`; };

/**
 * Plynulá čára přes body (monotónní kubická interpolace – bez překmitů nad / pod data).
 * pts = [{x, y}] v px; vrací „M…C…“. Používá se ve všech spojnicových grafech.
 */
function curvePath(pts, move = true) {
  const n = pts.length;
  if (!n) return "";
  const f = (v) => v.toFixed(1);
  if (n < 3) return pts.map((p, i) => `${i === 0 && move ? "M" : "L"}${f(p.x)},${f(p.y)}`).join("");
  const dx = [], m = [], t = new Array(n);
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1].x - pts[i].x || 1e-6; m[i] = (pts[i + 1].y - pts[i].y) / dx[i]; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) t[i] = 0;
    else { const w1 = 2 * dx[i] + dx[i - 1], w2 = dx[i] + 2 * dx[i - 1]; t[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]); }
  }
  let d = `${move ? "M" : "L"}${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    const c = `C${f(pts[i].x + h)},${f(pts[i].y + t[i] * h)} ${f(pts[i + 1].x - h)},${f(pts[i + 1].y - t[i + 1] * h)} ${f(pts[i + 1].x)},${f(pts[i + 1].y)}`;
    d += c;
    if (pieces) pieces.push(`M${f(pts[i].x)},${f(pts[i].y)}${c}`);
  }
  return d;
}
let pieces = null;
/** jednotlivé úseky plynulé čáry (pro čárkování odhadnutých úseků) */
function curvePieces(pts) { pieces = []; curvePath(pts); const out = pieces; pieces = null; return out; }
/** souvislé úseky (bez null) → [[{x,y,i}]] */
function runs(values, X, Y) {
  const out = []; let cur = [];
  values.forEach((v, i) => { if (v == null || !isFinite(v)) { if (cur.length) out.push(cur); cur = []; return; } cur.push({ x: X(i), y: Y(v), i }); });
  if (cur.length) out.push(cur);
  return out;
}
const SPORT_NAME = { ride: "Silniční kolo", mtb: "MTB", indoor: "Trenažér", run: "Běh", hockey: "Hokej", skate: "Brusle", xc_ski: "Běžky", walk: "Chůze", hike: "Turistika", padel: "Padel", strength: "Síla", mobility: "Mobilita", other: "Ostatní" };

// ---------- API ----------
const cache = new Map();
async function api(path, opts) {
  if (!opts && cache.has(path) && Date.now() - cache.get(path).at < 60_000) return cache.get(path).data;
  const r = await fetch("/api/" + path, { credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, ...opts });
  const data = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (!r.ok) throw new Error(data.message || data.error || `HTTP ${r.status}`);
  if (!opts) cache.set(path, { at: Date.now(), data });
  return data;
}

// ---------- tooltip ----------
const tip = document.getElementById("tip");
function showTip(e, html) {
  tip.innerHTML = html;
  tip.classList.add("on");
  const cx = e.touches ? e.touches[0].clientX : e.clientX;
  const cy = e.touches ? e.touches[0].clientY : e.clientY;
  const w = tip.offsetWidth;
  let x = cx + 14;
  if (x + w > innerWidth - 8) x = cx - w - 14;
  tip.style.left = Math.max(8, x) + "px";
  tip.style.top = Math.max(8, cy - tip.offsetHeight - 12) + "px";
}
const hideTip = () => tip.classList.remove("on");
document.addEventListener("scroll", hideTip, { passive: true });

// ---------- grafy (čisté SVG) ----------
const uid = (p) => p + Math.random().toString(36).slice(2, 9);

/**
 * Grafy se kreslí v SKUTEČNÉ šířce kontejneru (px = jednotky SVG) – ostré čáry i text na mobilu i velkém monitoru.
 * sized(fn) vrátí prázdný box; jakmile je v DOM, změří se a vykreslí fn(šířka). Při změně šířky (otočení, okno) znovu.
 */
const sizers = new Map();
function sized(fn) {
  const id = uid("z");
  sizers.set(id, fn);
  return `<div class="sized" id="${id}"></div>`;
}
function renderSized(box) {
  const fn = box._fn || sizers.get(box.id);
  if (!fn) return;
  if (!box._fn) { box._fn = fn; sizers.delete(box.id); sizeObs?.observe(box); }
  const w = Math.round(box.clientWidth);
  if (!w) return; // skrytý (např. jiná záložka na mobilu) – vykreslí se po zobrazení
  if (box.dataset.w && +box.dataset.w === w) return;
  box.dataset.w = w;
  box.innerHTML = fn(Math.max(260, w));
}
// překreslit při KAŽDÉ změně šířky boxu (posuvník, načtený obsah vedle, otevřené menu) – jinak se SVG jen
// zmenší jako obrázek a text i čísla jsou na PC rozmazané / kostrbaté
const sizeObs = typeof ResizeObserver === "function" ? new ResizeObserver((es) => { for (const e of es) if (e.target.isConnected) renderSized(e.target); }) : null;
function hydrate(root = document) { root.querySelectorAll(".sized").forEach(renderSized); }
new MutationObserver((ms) => {
  const fresh = ms.some((m) => m.target.id !== "tip" && [...m.addedNodes].some((n) => n.nodeType === 1 && (n.classList.contains("sized") || n.querySelector(".sized:not([data-w])"))));
  if (fresh) hydrate();
  // 🤖 i po překreslení stránky bez změny adresy (filtry, přepínače)
  const m = document.getElementById("main");
  if (m && typeof addAiButton === "function") addAiButton(m);
}).observe(document.body, { childList: true, subtree: true });
let rsT = 0;
addEventListener("resize", () => { clearTimeout(rsT); rsT = setTimeout(() => hydrate(), 120); });
/** výška grafu podle šířky: na mobilu nižší, ať graf nezabírá celou obrazovku */
const hScale = (h, W) => Math.round(h * clamp(W / 760, 0.62, 1));

function niceTicks(mn, mx, count = 4) {
  if (!(mx > mn)) return [mn];
  const raw = (mx - mn) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = [];
  for (let v = Math.ceil(mn / step) * step; v <= mx + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

/** Hover přes index (sdílený kurzor). getI(px v souřadnicích viewBoxu) → index. */
function bindHover(id, W, getI, xOf, tipFn, top, bottom) {
  setTimeout(() => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.querySelector(".cur");
    const dots = el.querySelector(".dots");
    const move = (e) => {
      const r = el.getBoundingClientRect();
      const cx = ((e.touches ? e.touches[0].clientX : e.clientX) - r.left) * (W / r.width);
      const i = getI(cx);
      if (i == null) return;
      const x = xOf(i);
      if (cur) { cur.setAttribute("x1", x); cur.setAttribute("x2", x); cur.style.opacity = 1; }
      const t = tipFn(i);
      if (dots) dots.innerHTML = (t.dots || []).map((d) => `<circle cx="${x}" cy="${d.y}" r="4" fill="${d.c}" stroke="var(--card)" stroke-width="2"/>`).join("");
      showTip(e, t.html);
    };
    el.addEventListener("mousemove", move);
    el.addEventListener("touchstart", move, { passive: true });
    el.addEventListener("touchmove", move, { passive: true });
    const leave = () => { hideTip(); if (cur) cur.style.opacity = 0; if (dots) dots.innerHTML = ""; };
    el.addEventListener("mouseleave", leave);
    el.addEventListener("touchend", () => setTimeout(leave, 1500));
  });
}

/**
 * Spojnicový graf. series: [{name, values, color, area?, dash?, width?, fmt?, hidden?}]
 * band: {lo, hi, color, name}; xLabel(i) → text osy; zero → osa od 0
 */
function lineChart(o) { return o.W ? lineChartW(o) : sized((W) => lineChartW({ ...o, W })); }
function lineChartW({ W = 760, x, series, band, bands = null, bandSeries = null, avgLine = null, include = null, height = 200, fmt = (v) => num(v, 1), xfmt = (l) => l, zero = false, markIndex = null, yfmt = null, legend = true, minSpan = 0, step: forceStep = null, yticks = null, bandsLegend = true }) {
  const H = hScale(height, W), P = { l: W < 500 ? 32 : 42, r: W < 500 ? 6 : 12, t: 12, b: 26 };
  const vis = series.filter((s) => !s.hidden);
  const all = vis.flatMap((s) => s.values).filter((v) => v != null && isFinite(v));
  if (band) all.push(band.lo, band.hi);
  if (bandSeries) all.push(...bandSeries.lo.filter((v) => v != null), ...bandSeries.hi.filter((v) => v != null));
  if (include) all.push(...include);
  if (!all.length) return `<div class="empty">Data nemám.</div>`;
  let mn = Math.min(...all), mx = Math.max(...all);
  if (zero) mn = Math.min(0, mn);
  if (mx - mn < minSpan) { const c = (mx + mn) / 2; mn = c - minSpan / 2; mx = c + minSpan / 2; }
  const pad = (mx - mn) * 0.1 || 1; if (!zero || mn < 0) mn -= pad; mx += pad;
  const n = x.length;
  const X = (i) => P.l + (i * (W - P.l - P.r)) / Math.max(1, n - 1);
  const Y = (v) => P.t + (1 - (v - mn) / (mx - mn)) * (H - P.t - P.b);
  const id = uid("c");
  let g = `<g class="grid">`;
  // osa: vlastní hodnoty (např. hranice zón formy) nebo „hezká“ čísla
  for (const v of yticks ? yticks.filter((t) => t >= mn && t <= mx) : niceTicks(mn, mx, 4)) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${P.l - 8}" y="${Y(v) + 4}" text-anchor="end">${yfmt ? yfmt(v) : num(v, Math.abs(mx - mn) < 8 ? 1 : 0)}</text>`;
  g += `</g>`;
  const step = forceStep || Math.max(1, Math.ceil(n / Math.max(3, Math.min(7, Math.floor(W / 70)))));
  let xl = "";
  x.forEach((l, i) => { if (i % step === 0 && i < n - step / 2) xl += `<text class="xl" x="${X(i)}" y="${H - 7}" text-anchor="middle">${esc(xfmt(l))}</text>`; });
  xl += `<text class="xl" x="${X(n - 1)}" y="${H - 7}" text-anchor="end">${esc(xfmt(x[n - 1]))}</text>`;
  let b = band ? `<rect x="${P.l}" y="${Y(band.hi)}" width="${W - P.l - P.r}" height="${Math.max(0, Y(band.lo) - Y(band.hi))}" fill="${band.color || "var(--z3)"}" opacity=".12" rx="4"/>` : "";
  // pásma (např. zóny formy) – oříznutá na rozsah grafu, popisek vpravo
  if (bands) for (const z of bands) {
    const hi = Math.min(z.hi ?? mx, mx), lo = Math.max(z.lo ?? mn, mn);
    if (hi <= lo) continue;
    b += `<rect x="${P.l}" y="${Y(hi)}" width="${W - P.l - P.r}" height="${Y(lo) - Y(hi)}" fill="${z.color}" opacity=".13"/>`;
    if (Y(lo) - Y(hi) >= 13) b += `<text class="bandl" x="${P.l + 8}" y="${(Y(hi) + Y(lo)) / 2 + 4}" text-anchor="start" style="fill:${z.color}" paint-order="stroke" stroke="var(--card)" stroke-width="3">${esc(z.name)}</text>`; // vlevo v grafu – stará data jsou méně důležitá než dnešek a výhled
  }
  let defs = "", paths = "";
  // normální rozsah posuvný po dnech (jako v Bevelu): plocha mezi hi a lo
  if (bandSeries) {
    const ok = (i) => bandSeries.lo[i] != null && bandSeries.hi[i] != null;
    let seg = [];
    const flush = () => {
      if (seg.length > 1) {
        const top = curvePath(seg.map((i) => ({ x: X(i), y: Y(bandSeries.hi[i]) })));
        const bot = curvePath([...seg].reverse().map((i) => ({ x: X(i), y: Y(bandSeries.lo[i]) })), false);
        b += `<path d="${top}${bot}Z" fill="${bandSeries.color}" opacity=".14"/>`;
      }
      seg = [];
    };
    x.forEach((_, i) => (ok(i) ? seg.push(i) : flush()));
    flush();
  }
  if (avgLine) {
    const yy = Y(avgLine.v), lbl = avgLine.label, tw = lbl.length * 6.6 + 16, cx = P.l + (W - P.l - P.r) / 2;
    b += `<line x1="${P.l}" x2="${W - P.r}" y1="${yy}" y2="${yy}" stroke="${avgLine.color}" stroke-width="2" stroke-dasharray="1.5 5" stroke-linecap="round"/>`;
    // popisek průměru vlevo nahoře nad čarou (dřív pilulka uprostřed zakrývala body)
    paths += `<text x="${P.l + 6}" y="${yy - 6}" style="fill:${avgLine.color};font-weight:800;font-size:11.5px" paint-order="stroke" stroke="var(--card)" stroke-width="3">${esc(lbl)}</text>`;
  }
  vis.forEach((s, si) => {
    // plynulá čára po souvislých úsecích (mezera v datech = přerušení)
    const segs = runs(s.values, X, Y);
    const d = segs.map((p) => curvePath(p)).join("");
    if (s.area) {
      const gid = `${id}g${si}`;
      defs += `<linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".28"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient>`;
      const base = Y(zero ? 0 : mn);
      const ad = segs.filter((p) => p.length > 1).map((p) => `M${p[0].x.toFixed(1)},${base}${curvePath(p, false)}L${p[p.length - 1].x.toFixed(1)},${base}Z`).join("");
      paths += `<path d="${ad}" fill="url(#${gid})"/>`;
    }
    let stroke = s.color;
    if (s.bandColors && bands) {
      // čára v barvě pásma, ve kterém se hodnota nachází (ostré přechody na hranicích)
      const gid = `${id}b${si}`, y0 = Y(mx), y1 = Y(mn), sp = y1 - y0 || 1;
      const st = [];
      for (const z of bands) { const hi = Math.min(z.hi ?? mx, mx), lo = Math.max(z.lo ?? mn, mn); if (hi <= lo) continue; st.push([(Y(hi) - y0) / sp, (Y(lo) - y0) / sp, z.color]); }
      st.sort((a, b) => a[0] - b[0]);
      defs += `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${y0}" y2="${y1}">${st.map(([a, b, c]) => `<stop offset="${clamp(a, 0, 1).toFixed(4)}" stop-color="${c}"/><stop offset="${clamp(b, 0, 1).toFixed(4)}" stop-color="${c}"/>`).join("")}</linearGradient>`;
      stroke = `url(#${gid})`;
    }
    paths += `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${s.width || 2}" ${s.dash ? 'stroke-dasharray="5 4"' : ""} stroke-linejoin="round" stroke-linecap="round" ${s.opacity ? `opacity="${s.opacity}"` : ""}/>`;
    if (s.dots) s.values.forEach((v, i) => { if (v != null) paths += `<circle cx="${X(i)}" cy="${Y(v)}" r="2.6" fill="${s.color}"/>`; });
    if (s.points) {
      const li = s.values.length - 1 - [...s.values].reverse().findIndex((v) => v != null);
      const r0 = n > 70 ? 0 : n > 40 ? 2.4 : 3.4;
      s.values.forEach((v, i) => { if (v == null) return; paths += i === li ? `<circle cx="${X(i)}" cy="${Y(v)}" r="6" fill="${s.color}" stroke="var(--card)" stroke-width="2.5"/>` : r0 ? `<circle cx="${X(i)}" cy="${Y(v)}" r="${r0}" fill="var(--card)" stroke="${s.color}" stroke-width="1.8"/>` : ""; });
    }
  });
  const mark = markIndex != null ? `<line x1="${X(markIndex)}" x2="${X(markIndex)}" y1="${P.t}" y2="${H - P.b}" stroke="var(--muted)" stroke-dasharray="3 3"/><text class="xl" x="${X(markIndex) + 4}" y="${P.t + 10}">dnes</text>` : "";
  const tipSeries = (i) => vis.filter((s) => !s.noTip && s.values[i] != null && !(s.dash && vis.some((o) => o !== s && !o.dash && o.color === s.color && o.values[i] != null)));
  bindHover(id, W, (cx) => clamp(Math.round(((cx - P.l) / (W - P.l - P.r)) * (n - 1)), 0, n - 1), X, (i) => ({
    html: `<b>${esc(xfmt(x[i]))}</b>` + tipSeries(i).map((s) => `<div><span class="sw" style="background:${s.color}"></span>${esc(s.name)} <b>${s.values[i] == null ? DASH : esc((s.fmt || fmt)(s.values[i]))}</b></div>`).join(""),
    dots: tipSeries(i).map((s) => ({ y: Y(s.values[i]), c: s.bandColors && bands ? (bands.find((z) => (z.lo == null || s.values[i] >= z.lo) && (z.hi == null || s.values[i] < z.hi))?.color || s.color) : s.color })),
  }));
  const leg = legend ? `<div class="legend">${vis.filter((s) => !s.noLegend).map((s) => `<span><i style="background:${s.color}${s.dash ? ";opacity:.6" : ""}"></i>${esc(s.name)}</span>`).join("")}${band ? `<span><i class="bandsw" style="background:${band.color || "var(--z3)"}"></i>${esc(band.name || "norma")}</span>` : ""}${bandSeries ? `<span><i class="bandsw" style="background:${bandSeries.color}"></i>${esc(bandSeries.name || "normální rozsah")}</span>` : ""}${bands && bandsLegend ? bands.map((z) => `<span><i class="bandsw" style="background:${z.color}"></i>${esc(z.name)}${z.text ? ` ${esc(z.text)}` : ""}</span>`).join("") : ""}</div>` : "";
  return `<svg class="chart" id="${id}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${defs}</defs>${g}${b}${paths}${mark}<line class="cur" y1="${P.t}" y2="${H - P.b}"/><g class="dots"></g>${xl}</svg>${leg}`;
}

/**
 * Sloupce: bars [{v | parts:[{v,color,name}] | lo/hi (rozsah), color, dashed}], x labels.
 * mode: 'simple' | 'stack' | 'range'
 */
function barChart(o) { return o.W ? barChartW(o) : sized((W) => barChartW({ ...o, W })); }
function barChartW({ W = 760, x, bars, height = 170, fmt = (v) => num(v), xfmt = (l) => l, todayIndex = null, mode = "simple", yfmt = null, tipFn = null, refLine = null, maxV = null }) {
  const H = hScale(height, W), P = { l: 34, r: 6, t: 10, b: 26 };
  const n = x.length;
  const top = (b) => (mode === "stack" ? (b.parts || []).reduce((s, p) => s + (p.v || 0), 0) : mode === "range" ? b.hi ?? 0 : b.v ?? 0);
  const mn = mode === "range" ? Math.min(...bars.map((b) => b.lo ?? Infinity).filter(isFinite), refLine ?? Infinity) : 0;
  let mx = maxV ?? Math.max(1, ...bars.map(top), refLine ?? 0);
  const lo = mode === "range" ? Math.max(0, Math.floor((mn - 5) / 10) * 10) : 0;
  if (maxV == null) mx = mx * 1.08;
  const bw = (W - P.l - P.r) / n;
  const Y = (v) => P.t + (1 - (v - lo) / (mx - lo)) * (H - P.t - P.b);
  const gap = Math.min(6, bw * 0.25);
  const id = uid("b");
  let g = `<g class="grid">`;
  for (const v of niceTicks(lo, mx, 3)) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${P.l - 8}" y="${Y(v) + 4}" text-anchor="end">${yfmt ? yfmt(v) : num(v)}</text>`;
  g += `</g>`;
  let out = "", xl = "";
  const step = Math.max(1, Math.ceil(n / Math.max(3, Math.min(10, Math.floor(W / 48)))));
  bars.forEach((b, i) => {
    const x0 = P.l + i * bw + gap / 2, w = Math.max(1, bw - gap), r = Math.min(4, w / 2);
    if (mode === "stack") {
      let acc = 0;
      (b.parts || []).forEach((p) => { if (!p.v) return; const y1 = Y(acc + p.v), y0 = Y(acc); out += `<rect x="${x0}" y="${y1}" width="${w}" height="${Math.max(0, y0 - y1)}" fill="${p.color}"/>`; acc += p.v; });
    } else if (mode === "range") {
      if (b.lo != null && b.hi != null) out += `<rect x="${x0}" y="${Y(b.hi)}" width="${w}" height="${Math.max(2, Y(b.lo) - Y(b.hi))}" rx="${r}" fill="${b.color || "var(--acc)"}"/>`;
      if (b.dot != null) out += `<circle cx="${x0 + w / 2}" cy="${Y(b.dot)}" r="3.5" fill="var(--fg)" stroke="var(--card)" stroke-width="1.5"/>`;
    } else if (b.v) {
      const c = b.color || "var(--acc)";
      out += b.dashed
        ? `<rect x="${x0 + 1}" y="${Y(b.v)}" width="${w - 2}" height="${Math.max(0, Y(lo) - Y(b.v))}" rx="${r}" fill="none" stroke="${c}" stroke-dasharray="4 3" stroke-width="1.5"/>`
        : `<rect x="${x0}" y="${Y(b.v)}" width="${w}" height="${Math.max(0, Y(lo) - Y(b.v))}" rx="${r}" fill="${c}"/>`;
    }
    if (i % step === 0 || i === todayIndex) xl += `<text class="xl ${i === todayIndex ? "today" : ""}" x="${P.l + i * bw + bw / 2}" y="${H - 7}" text-anchor="middle">${esc(xfmt(x[i]))}</text>`;
  });
  const ref = refLine != null ? `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(refLine)}" y2="${Y(refLine)}" stroke="var(--muted)" stroke-dasharray="4 4"/>` : "";
  bindHover(id, W, (cx) => { const i = Math.floor((cx - P.l) / bw); return i >= 0 && i < n ? i : null; }, (i) => P.l + i * bw + bw / 2, (i) => ({ html: tipFn ? tipFn(i) : `<b>${esc(xfmt(x[i]))}</b><div>${esc(fmt(top(bars[i])))}${bars[i].dashed ? " (plán)" : ""}</div>` }));
  return `<svg class="chart" id="${id}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${g}${ref}${out}<line class="cur band" y1="${P.t}" y2="${H - P.b}" style="stroke-width:${Math.max(1, bw - gap)}"/>${xl}</svg>`;
}

/** Sparkline (bez os) – volitelně s pásmem normy (průměr ± 1 SD) jako v Bevelu. */
function spark(values, color = "var(--acc)", h = 34, nrm = null, rb = null) {
  const v = values.map((x) => (x == null ? null : +x));
  if (v.filter((x) => x != null).length < 2) return "";
  return sized((W) => sparkW(v, color, h, nrm, W, rb));
}
/** sparkline posledních n dní s pásmem normy počítaným z celé řady (rollingNorm potřebuje předchozí dny) */
function sparkRolling(all, color, h, n = 30) {
  const rb = rollingNorm(all);
  return spark(all.slice(-n), color, h, null, { lo: rb.lo.slice(-n), hi: rb.hi.slice(-n) });
}
function sparkW(v, color, h, nrm, W, rb = null) {
  const ok = v.filter((x) => x != null);
  const lo = nrm ? nrm.mean - nrm.sd : null, hi = nrm ? nrm.mean + nrm.sd : null;
  // osa podle dat (ne podle pásma) → křivka vždy vyplní výšku dlaždice, pásmo se ořízne
  let mn = Math.min(...ok), mx = Math.max(...ok);
  if (mx - mn < 1e-6) { mn -= 1; mx += 1; }
  const pad = 5, sp = mx - mn;
  const X = (i) => pad + (i * (W - 2 * pad)) / (v.length - 1), Y = (x) => 4 + (1 - (x - mn) / sp) * (h - 8);
  const d = runs(v, X, Y).map((p) => curvePath(p)).join("");
  const li = v.length - 1 - [...v].reverse().findIndex((x) => x != null);
  const cY = (x) => Y(clamp(x, mn - sp * 0.08, mx + sp * 0.08));
  let band = "";
  if (rb) {
    // pásmo normy den po dni (průměr ± 1 SD z předchozích 30 dní) – stejně jako v detailu
    const idx = v.map((_, i) => i).filter((i) => rb.lo[i] != null && rb.hi[i] != null);
    if (idx.length > 1) band = `<path d="${curvePath(idx.map((i) => ({ x: X(i), y: cY(rb.hi[i]) })))}${curvePath([...idx].reverse().map((i) => ({ x: X(i), y: cY(rb.lo[i]) })), false)}Z" fill="${color}" opacity=".14"/>`;
  } else if (nrm) band = `<rect x="0" y="${cY(hi).toFixed(1)}" width="${W}" height="${Math.max(1, cY(lo) - cY(hi)).toFixed(1)}" rx="3" fill="${color}" opacity=".13"/>`;
  return `<svg class="spark" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}">${band}<path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${X(li).toFixed(1)}" cy="${Y(v[li]).toFixed(1)}" r="3.2" fill="${color}" stroke="var(--card2)" stroke-width="1.5"/></svg>`;
}
/**
 * Normální rozsah den po dni (jako Bevel): průměr ± 1 směrodatná odchylka z předchozích 30 dní (min. 10 hodnot).
 * all = hodnoty celé historie; vrací {lo, hi} stejně dlouhé.
 */
function rollingNorm(all, win = 30) {
  const lo = [], hi = [];
  all.forEach((_, i) => {
    const w = all.slice(Math.max(0, i - win), i).filter((v) => v != null);
    if (w.length < 10) { lo.push(null); hi.push(null); return; }
    const m = w.reduce((a, b) => a + b, 0) / w.length, sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / (w.length - 1));
    lo.push(m - sd); hi.push(m + sd);
  });
  return { lo, hi };
}
/** stav proti normě: „v normě“ / „pod normou“ / „nad normou“ */
const vsNorm = (v, n) => (v == null || !n ? "" : v < n.mean - n.sd ? "pod normou" : v > n.mean + n.sd ? "nad normou" : "v normě");

/** Prstenec 0–100 (Body Battery). */
function ring(value, { min = null, size = 132, color = "var(--z3)", label = "", sub = "" } = {}) {
  const r = 52, c = 2 * Math.PI * r, v = clamp(value ?? 0, 0, 100);
  const arc = (from, to, col, w = 12) => `<circle cx="66" cy="66" r="${r}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${(c * (to - from)) / 100} ${c}" stroke-dashoffset="${(-c * from) / 100}" transform="rotate(-90 66 66)"/>`;
  return `<svg class="ring" viewBox="0 0 132 132" width="${size}" height="${size}">${arc(0, 100, "var(--card2)")}${min != null ? arc(min, Math.max(min, v), color, 12).replace("stroke-linecap=\"round\"", "") : ""}${arc(0, v, color)}<text x="66" y="64" text-anchor="middle" class="rv">${value == null ? DASH : Math.round(value)}</text><text x="66" y="84" text-anchor="middle" class="rl">${esc(label)}</text>${sub ? `<text x="66" y="100" text-anchor="middle" class="rl">${esc(sub)}</text>` : ""}</svg>`;
}

/**
 * Plocha pod křivkou obarvená po úsecích podle zón (jako v Garminu). pts = [{x, y, z}] v px, z = index barvy.
 * Úsek končí změnou zóny nebo mezerou (gap = true na bodu za mezerou).
 */
function zoneArea(pts, base, colors) {
  let out = "";
  let i = 0;
  while (i < pts.length - 1) {
    const z = pts[i].z;
    let j = i;
    while (j + 1 < pts.length && !pts[j + 1].gap && pts[j + 1].z === z) j++;
    const end = j + 1 < pts.length && !pts[j + 1].gap ? j + 1 : j; // napojit na první bod další zóny
    if (end > i) {
      const seg = pts.slice(i, end + 1);
      const line = seg.map((p, k) => `${k ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");
      out += `<path d="${line}L${seg[seg.length - 1].x.toFixed(1)},${base}L${seg[0].x.toFixed(1)},${base}Z" fill="${colors[z]}" fill-opacity=".5"/><path d="${line}" fill="none" stroke="${colors[z]}" stroke-width="1.6" stroke-linejoin="round"/>`;
    }
    i = end > i ? end : i + 1;
  }
  return out;
}

/**
 * Čára obarvená plynule podle zón (svislý gradient – barva podle výšky hodnoty), pod ní jen jemný stín.
 * d = path čáry, Y = převod hodnoty na px, mn/mx = rozsah osy, bounds = hranice zón (hodnoty), colors = barva každé zóny.
 */
/**
 * Podbarvení pod čarou barvou zóny bodu (Z2 = modrý nádech pod čarou atd.), směrem dolů slábne (maska).
 * pts = [{x, y, z, gap?}] v px.
 */
function zoneFill(pts, base, colors, yTop) {
  const id = uid("zf");
  let paths = "";
  let i = 0;
  while (i < pts.length - 1) {
    const z = pts[i].z;
    let j = i;
    while (j + 1 < pts.length && !pts[j + 1].gap && pts[j + 1].z === z) j++;
    const end = j + 1 < pts.length && !pts[j + 1].gap ? j + 1 : j;
    if (end > i) {
      const seg = pts.slice(i, end + 1);
      paths += `<path d="M${seg[0].x.toFixed(1)},${base}${curvePath(seg, false)}L${seg[seg.length - 1].x.toFixed(1)},${base}Z" fill="${colors[z]}"/>`;
    }
    i = end > i ? end : i + 1;
  }
  return `<defs><linearGradient id="${id}g" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${yTop}" y2="${base}"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#fff" stop-opacity=".05"/></linearGradient><mask id="${id}m" maskUnits="userSpaceOnUse"><rect x="0" y="${yTop}" width="100000" height="${Math.max(0, base - yTop)}" fill="url(#${id}g)"/></mask></defs><g mask="url(#${id}m)">${paths}</g>`;
}

function zoneLine(d, Y, mn, mx, bounds, colors, base, firstX, lastX, width = 2, zpts = null) {
  const id = uid("zg");
  const yTop = Y(mx), yBot = Y(mn), span = yBot - yTop || 1;
  // zóna i leží mezi bounds[i-1] a bounds[i]; barva na středu zóny → plynulé přechody
  const edges = [mn, ...bounds.filter((b) => b > mn && b < mx), mx];
  const zoneAt = (v) => { let z = 0; while (z < bounds.length && v >= bounds[z]) z++; return z; };
  let stops = "";
  for (let i = edges.length - 2; i >= 0; i--) {
    const mid = (edges[i] + edges[i + 1]) / 2;
    const off = clamp((Y(mid) - yTop) / span, 0, 1);
    stops += `<stop offset="${off.toFixed(3)}" stop-color="${colors[zoneAt(mid)]}"/>`;
  }
  const grad = `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${yTop}" y2="${yBot}">${stops}</linearGradient>`;
  const fill = `<linearGradient id="${id}f" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--fg)" stop-opacity=".10"/><stop offset="1" stop-color="var(--fg)" stop-opacity="0"/></linearGradient>`;
  const under = zpts ? zoneFill(zpts, base, colors, yTop) : `<path d="${d}L${lastX},${base}L${firstX},${base}Z" fill="url(#${id}f)"/>`;
  return `<defs>${grad}${fill}</defs>${under}<path d="${d}" fill="none" stroke="url(#${id})" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
}

const minOfDay = (d, ms) => (ms - Date.parse(d.date + "T00:00:00Z")) / 60000 + (d.tzOffsetMin || 0);
const clock = (m) => `${Math.floor(m / 60) % 24}:${String(Math.floor(m % 60)).padStart(2, "0")}`;

/** Časová osa dne 0–24 h + pásma spánku (z událostí Body Battery). */
function dayAxis(d, W, H, P) {
  const X = (m) => P.l + (clamp(m, 0, 1440) / 1440) * (W - P.l - P.r);
  let g = "";
  for (let h = 0; h <= 24; h += W < 560 ? 6 : 3) g += `<line class="gl v" x1="${X(h * 60)}" x2="${X(h * 60)}" y1="${P.t}" y2="${H - P.b}"/><text class="xl" x="${X(h * 60)}" y="${H - 7}" text-anchor="${h === 0 ? "start" : h === 24 ? "end" : "middle"}">${h}:00</text>`;
  // aktivity dne: pruh v barvě akcentu + ikona sportu (jako spánek)
  for (const x of d.acts || []) {
    const a = +x.start_local.slice(11, 13) * 60 + +x.start_local.slice(14, 16), b = a + (x.duration_s || x.moving_s || 0) / 60;
    if (b <= a) continue;
    g += `<rect x="${X(a)}" y="${P.t}" width="${Math.max(2, X(b) - X(a))}" height="${H - P.t - P.b}" fill="var(--acc)" opacity=".1"/><rect x="${X(a)}" y="${P.t - 3}" width="${Math.max(2, X(b) - X(a))}" height="3" rx="1.5" fill="var(--acc)"/><text class="xl" x="${(X(a) + X(b)) / 2}" y="${P.t - 7}" text-anchor="middle">${sportTxt(x.sport)}${X(b) - X(a) > 60 ? " " + esc(SPORT_NAME[x.sport] || "") : ""}</text>`;
  }
  for (const e of d.bbEvents || []) {
    if (e.type !== "SLEEP" || !e.start) continue;
    const a = minOfDay(d, e.start), b = a + e.dur / 60000;
    if (b <= 0 || a >= 1440) continue;
    // popisek nad plochou grafu (dřív se kryl s čarou tepu)
    g += `<rect x="${X(a)}" y="${P.t}" width="${Math.max(0, X(b) - X(a))}" height="${H - P.t - P.b}" fill="var(--srem)" opacity=".09"/><rect x="${X(a)}" y="${P.t - 3}" width="${Math.max(0, X(b) - X(a))}" height="3" rx="1.5" fill="var(--srem)" opacity=".7"/><text class="xl" x="${(X(Math.max(0, a)) + X(Math.min(1440, b))) / 2}" y="${P.t - 7}" text-anchor="middle">🌙 spánek</text>`;
  }
  return { X, g };
}

function dayHrChart(d) {
  const pts0 = (d.hr || []).filter((p) => p[1] != null && p[1] > 0);
  if (pts0.length < 5) return `<div class="empty">Tep během dne zatím nemám.</div>`;
  return sized((W) => dayHrChartW(d, W));
}
function dayHrChartW(d, W) {
  const floors = d.hrFloors ? d.hrFloors.slice(1) : [135, 165, 184, 202];
  const pts0 = (d.hr || []).filter((p) => p[1] != null && p[1] > 0).map(([t, v]) => ({ m: minOfDay(d, t), v })).filter((p) => p.m >= 0 && p.m <= 1440);
  const H = hScale(200, W), P = { l: W < 500 ? 30 : 38, r: W < 500 ? 6 : 10, t: 24, b: 24 };
  const vals = pts0.map((p) => p.v);
  const mn = Math.max(30, Math.floor((Math.min(...vals) - 8) / 10) * 10), mx = Math.max(130, Math.ceil((Math.max(...vals) + 8) / 10) * 10);
  const Y = (v) => P.t + (1 - (v - mn) / (mx - mn)) * (H - P.t - P.b);
  const { X, g } = dayAxis(d, W, H, P);
  let grid = "";
  for (const v of niceTicks(mn, mx, 4)) grid += `<line class="gl" x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="yl" x="${P.l - 6}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
  const pts = pts0.map((p, i) => ({ x: X(p.m), y: Y(p.v), z: hrZoneIdx(p.v, floors), gap: i > 0 && p.m - pts0[i - 1].m > 10 }));
  // plynulá čára po úsecích bez mezer
  const segs = [];
  pts.forEach((p, i) => { if (i === 0 || p.gap) segs.push([]); segs[segs.length - 1].push(p); });
  const line = segs.map((s) => curvePath(s)).join("");
  const id = uid("d");
  bindHover(id, W, (cx) => { let best = 0, bd = Infinity; pts.forEach((p, i) => { const dd = Math.abs(p.x - cx); if (dd < bd) { bd = dd; best = i; } }); return best; }, (i) => pts[i].x, (i) => ({
    html: `<b>${clock(pts0[i].m)}</b><div><span class="sw" style="background:${HR_ZC[pts[i].z]}"></span>tep <b>${pts0[i].v} bpm</b> · Z${pts[i].z + 1}</div>`,
    dots: [{ y: pts[i].y, c: HR_ZC[pts[i].z] }],
  }));
  // čas v zónách dnes (vzorky po 2 min)
  const tz = [0, 0, 0, 0, 0];
  pts0.forEach((p, i) => { const dt = i ? Math.min(10, p.m - pts0[i - 1].m) : 2; tz[hrZoneIdx(p.v, floors)] += dt; });
  const lab = ["Z1", "Z2", "Z3", "Z4", "Z5"].map((z, i) => `<span><i style="background:${HR_ZC[i]}"></i>${z} ${i === 0 ? `do ${floors[0] - 1}` : i < 4 ? `${floors[i - 1]}–${floors[i] - 1}` : `${floors[3]}+`}${tz[i] >= 1 ? ` · ${hmm(tz[i] * 60)} h` : ""}</span>`).join("");
  return `<svg class="chart" id="${id}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${g}${grid}${zoneLine(line, Y, mn, mx, floors, HR_ZC, Y(mn), pts[0].x, pts[pts.length - 1].x, 2, pts)}<line class="cur" y1="${P.t}" y2="${H - P.b}"/><g class="dots"></g></svg>
    <div class="legend">${lab}<span class="sub">bpm · čas v zóně dnes</span></div>`;
}

/** Úseky dne: spánek (události Body Battery) a aktivity (z D1) – pro pásy a ikony nad grafem. */
function daySpans(d) {
  const out = [];
  for (const e of d.bbEvents || []) {
    if (e.type !== "SLEEP" || !e.start) continue;
    out.push({ kind: "sleep", a: minOfDay(d, e.start), b: minOfDay(d, e.start) + e.dur / 60000, ico: "🌙", impact: e.impact });
  }
  for (const x of d.acts || []) {
    const a = +x.start_local.slice(11, 13) * 60 + +x.start_local.slice(14, 16);
    out.push({ kind: "act", a, b: a + (x.duration_s || x.moving_s || 0) / 60, ico: SPORT_ICON[x.sport] || "🏅", txt: sportTxt(x.sport), act: x });
  }
  return out.filter((s) => s.b > 0 && s.a < 1440);
}

/** Stres dne (Garmin dává jen souhrn) a „co nabilo / vybilo“ – jako v Bevelu. */
function dayStressHtml(d) {
  const s = d.stress;
  if (!s) return "";
  const tot = s.rest + s.low + s.med + s.high || 1;
  const rows = [["Vysoký", s.high, "var(--bad)"], ["Střední", s.med, "var(--warn)"], ["Nízký", s.low, "color-mix(in srgb, var(--ok) 55%, var(--card))"], ["Klid", s.rest, "var(--ok)"]];
  return `<div class="sl" style="margin:14px 0 8px">Stres dne${s.level != null ? ` · průměr ${s.level}` : ""}</div><div class="strs">${rows.map(([l, v, c]) => `<div class="str"><span>${l}</span><div class="bal-t"><i class="bal-v" style="width:${(v / tot) * 100}%;background:${c}"></i></div><b>${Math.round((v / tot) * 100)} %</b><small>${hmm(v)} h</small></div>`).join("")}</div>`;
}
function dayEnergyHtml(d) {
  const spans = daySpans(d);
  if (!spans.length && d.bbCharged == null) return "";
  const pts = (d.bb || []).map(([t, v]) => ({ m: minOfDay(d, t), v }));
  const at = (m) => { let best = null; for (const p of pts) if (p.m <= m + 5) best = p; return best?.v ?? null; };
  const items = spans.map((s) => {
    if (s.kind === "sleep") return `<div class="en"><span class="en-i">🌙</span><div><small>${clock(Math.max(0, s.a))}–${clock(s.b)}</small><b>Spánek</b><small>${hmm((s.b - s.a) * 60)} h</small></div><b class="en-v good">${s.impact != null ? `+${s.impact}` : ""}</b></div>`;
    const x = s.act, a0 = at(s.a), a1 = at(s.b);
    const dv = a0 != null && a1 != null && a1 !== a0 ? a1 - a0 : null;
    return `<a class="en" href="#/aktivita/${x.id}"><span class="en-i">${s.ico}</span><div><small>${clock(s.a)}–${clock(s.b)}</small><b>${esc(x.name || SPORT_NAME[x.sport])}</b><small>${x.distance_m ? `${num(x.distance_m / 1000, 1)} km · ` : ""}${x.calories ? `${thou(x.calories)} kcal · ` : ""}zátěž ${num(x.load)}</small></div><b class="en-v ${dv != null && dv < 0 ? "bad" : ""}">${dv != null ? signed(dv) : ""}</b></a>`;
  }).join("");
  return `<div class="sl" style="margin:14px 0 8px">Co nabilo a vybilo${d.bbCharged != null ? ` · <span class="good">+${d.bbCharged}</span> / <span class="bad">−${d.bbDrained}</span>` : ""}</div><div class="ens">${items}</div>`;
}

// ---------- komponenty ----------
const card = (cls, title, src, body, extra = "") => `<section class="card ${cls}" ${extra}>${title || src ? `<header class="ch">${title ? `<h2>${title}</h2>` : "<span></span>"}${src ? `<span class="src">${esc(src)}</span>` : ""}</header>` : ""}${body}</section>`;
const kv = (rows) => `<div class="kv">${rows.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join("")}</div>`;
const greeting = (h) => (h < 10 ? "Dobré ráno" : h < 12 ? "Dobré dopoledne" : h < 18 ? "Dobré odpoledne" : "Dobrý večer");
const toneOf = (flag) => (flag === "red" ? "bad" : flag === "yellow" ? "warn" : "good");
const stat = (label, value, unit, sub, tone = "", extra = "", href = "") => `<${href ? `a href="${href}"` : "div"} class="stat ${tone}"><div class="sl">${label}</div><div class="sv">${value}${unit ? `<small>${unit}</small>` : ""}</div>${sub ? `<div class="ss">${sub}</div>` : ""}${extra}</${href ? "a" : "div"}>`;

function zonesHtml(rows) {
  if (!rows) return "";
  const max = Math.max(1, ...rows.map((z) => z.pct));
  return `<div class="zones">${rows.map((z) => `<span class="zl" style="color:${z.color}">${z.z}</span><div class="zt"><div class="zb" style="width:${z.secs > 0 ? Math.max(1.5, (z.pct / max) * 100) : 0}%;background:${z.color}"></div></div><span class="r">${z.time}</span><span class="r m">${z.pctText}</span>`).join("")}</div>`;
}

// ---------- počasí ----------
/** Stejné pravidlo jako server (okno na jízdu): vhodné = srážky ≤ 30 %, nárazy ≤ 40 km/h, pocitově ≥ 3 °C. */
function hourKind(h) {
  if (h.kind) return [h.kind, h.why || ""];
  if (h.green) return ["ok", "vhodné"];
  if ((h.prob ?? 100) > 30) return ["rain", "déšť " + num(h.prob) + " %"];
  if ((h.gust ?? 99) > 40) return ["wind", "nárazy " + num(h.gust) + " km/h"];
  if ((h.feels ?? -99) < 3) return ["cold", "pocitově " + num(h.feels) + " °C"];
  return ["ok", "vhodné"];
}
function weatherIcon(w) {
  if (!w) return "·";
  if (w.code != null) return wIcon(w.code, w.rainProb);
  if (w.rain) return "🌧️";
  if (w.rainProb >= 30) return "🌦️";
  if (w.gusty) return "💨";
  if (w.tmax < 3) return "🥶";
  return "🌤️";
}
function weatherList(days, temps = null) {
  const rows = days.map(({ label, w }) => {
    if (!w) return `<div class="wrow"><b class="wd">${esc(label)}</b><span class="sub">bez předpovědi</span></div>`;
    const kinds = w.hours.map(hourKind);
    const counts = kinds.reduce((m, [k]) => ((m[k] = (m[k] || 0) + 1), m), {});
    const main = Object.entries(counts).filter(([k]) => k !== "ok" && k !== "cool").sort((a, b) => b[1] - a[1])[0];
    const verdict = w.window ? `<span class="pill ok">jízda ${String(w.window.from).padStart(2, "0")}–${String(w.window.to).padStart(2, "0")} h</span>` : `<span class="pill bad">venku ne: ${main ? { rain: "déšť", wind: "vítr", cold: "zima", hot: "vedro", cool: "chladno" }[main[0]] : "počasí"}</span>`;
    const inWin = (h) => w.window && h.h >= w.window.from && h.h < w.window.to;
    const cells = w.hours.map((h, i) => `<i class="h ${kinds[i][0]}${inWin(h) ? " win" : ""}" data-t='${esc(JSON.stringify({ h: h.h, t: h.temp, f: h.feels, p: h.prob, mm: h.precip, g: h.gust, k: kinds[i][1] }))}'>${h.h % 3 === 1 ? `<em>${num(h.temp)}°</em>` : ""}</i>`).join("");
    return `<div class="wrow"><b class="wd">${esc(label)}</b><span class="wi">${weatherIcon(w)}</span><span class="wt"><b>${num(w.tmax)}°</b> / ${num(w.tmin)}°</span><span class="wm sub">💧 ${num(w.rainProb)} % · 💨 ${num(w.gustMax)} km/h</span>${verdict}<div class="hstrip">${cells}</div></div>`;
  }).join("");
  const t = temps || { cold: 3, hot: 30, ideal: 18 };
  return `<div class="wlist">${rows}</div><div class="legend"><span><i class="lg ok"></i>vhodné</span><span><i class="lg ok win"></i>doporučené okno (nejblíž ${t.ideal} °C)</span><span><i class="lg cool"></i>chladné ráno / večer v teplém dni</span><span><i class="lg cold"></i>zima (pocitově &lt; ${t.cold} °C)</span><span><i class="lg hot"></i>vedro (nad ${t.hot} °C)</span><span><i class="lg rain"></i>srážky &gt; 30 %</span><span><i class="lg wind"></i>vítr &gt; 40 km/h</span><span class="sub">hodiny 7–20, číslo = teplota · hranice v Nastavení</span></div>`;
}
function bindHours(root) {
  root.querySelectorAll(".hstrip i").forEach((el) => {
    const h = JSON.parse(el.getAttribute("data-t"));
    const f = (e) => showTip(e, `<b>${String(h.h).padStart(2, "0")}:00</b> · ${esc(h.k)}<div>${num(h.t)} °C, pocitově ${num(h.f)} °C</div><div>srážky ${num(h.p)} % · ${num(h.mm, 1)} mm · nárazy ${num(h.g)} km/h</div>`);
    el.addEventListener("mousemove", f); el.addEventListener("touchstart", f, { passive: true }); el.addEventListener("mouseleave", hideTip);
  });
}

// ---------- spánek ----------
const STAGE_COLOR = { deep: "var(--sdeep)", rem: "var(--srem)", light: "var(--slight)", awake: "var(--sawake)" };
function sleepBlock(s, compact = false) {
  if (!s) return `<div class="empty">Spánek pro tento den nemám – šipkou ‹ nahoře se vrátíš na předchozí noc.</div>`;
  const total = s.stages.reduce((t, x) => t + x.secs, 0) || 1;
  const bar = `<div class="sbar">${s.stages.map((x) => (x.secs ? `<i style="width:${(x.secs / total) * 100}%;background:${STAGE_COLOR[x.key]}" title="${esc(x.label)}"></i>` : "")).join("")}</div>`;
  // fáze v hodinách a minutách („1 h 10 min“), ne „1:10“
  const leg = `<div class="sleg">${s.stages.map((x) => `<div class="sg"><span><i style="background:${STAGE_COLOR[x.key]}"></i>${esc(x.label)}</span><b>${dur(x.secs)}</b><small class="${x.tone}">${x.key === "awake" ? esc(x.text) : `${x.pct} %${x.opt ? ` · opt. ${x.opt[0]}–${x.opt[1]} %` : ""}`}</small></div>`).join("")}</div>`;
  const head = `<div class="shead"><div><div class="sv">${dur(s.durationS).replace(/ (h|min)/g, "<small> $1</small>")}</div><div class="sub">${s.start && s.end ? `${s.start}–${s.end}` : ""}${s.needMin ? ` · Garmin pro tuto noc chtěl ${dur(s.needMin * 60)}` : ""}</div>${s.nextNeedMin ? `<div class="sub"><b>Potřeba na dnešní noc: ${dur(s.nextNeedMin * 60)}</b> (Garmin)</div>` : ""}</div>${s.score != null ? `<div class="score ${s.scoreTone}">${s.score}<small>skóre</small></div>` : ""}</div>`;
  // 4 dlaždice: tep, VST, dech, stres
  const vit = [
    ["❤️ Tep ⌀", s.hr != null ? `${num(s.hr)} bpm` : DASH, s.hrNorm ? `průměr ${s.hrNorm}` : "", "tep"],
    ["🫀 VST ⌀", s.hrv != null ? `${num(s.hrv)} ms` : DASH, "přes noc", "vst"],
    ["🫁 Dech ⌀", s.resp != null ? `${num(s.resp)} /min` : DASH, s.respLo ? `${num(s.respLo)}–${num(s.respHi)}` : "", "dech"],
    ["😮‍💨 Stres", s.stress != null ? num(s.stress) : DASH, "ve spánku", "stres"],
  ];
  const vitals = `<div class="svit">${vit.map(([k, v, x, h]) => `<a href="#/detail/${h}"><span>${k}</span><b>${v}</b>${x ? `<small>${x}</small>` : ""}</a>`).join("")}</div>`;
  const pts = compact ? "" : `<ul class="points">${s.points.map((p) => `<li class="${p.tone}">${esc(p.text)}</li>`).join("")}</ul>`;
  return `${head}${bar}${leg}${vitals}<p class="verdict-line">${esc(s.verdict)}</p>${pts}`;
}

/** Přepínač dne ‹ datum › (max. 7 dní zpět). onGo(datum | null = dnes). */
function dateNav(cur, min, today, id) {
  const prev = cur > min ? addDay(cur, -1) : null, next = cur < today ? addDay(cur, 1) : null;
  return `<div class="dnav" id="${id}"><button class="btn sm" ${prev ? `data-go="${prev}"` : "disabled"} aria-label="předchozí den">‹</button><label class="dpick" title="vybrat den v kalendáři"><b>${cur === today ? "Dnes" : cur === addDay(today, -1) ? "Včera" : ""} ${dayDm(cur)}${cur.slice(0, 4) !== today.slice(0, 4) ? cur.slice(0, 4) : ""} 📅</b><input type="date" data-pick min="${min}" max="${today}" value="${cur}"></label><button class="btn sm" ${next ? `data-go="${next}"` : "disabled"} aria-label="další den">›</button>${cur !== today ? `<button class="btn sm" data-go="${today}">Dnes</button>` : ""}</div>`;
}
const addDay = (d, n) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
function bindDateNav(el, id, today, set) {
  el.querySelectorAll(`#${id} [data-go]`).forEach((b) => b.addEventListener("click", () => { set(b.dataset.go === today ? null : b.dataset.go); }));
  // klik na datum → kalendář (výběr libovolného dne v historii)
  const inp = el.querySelector(`#${id} [data-pick]`);
  if (inp) {
    // PC (Chrome, Edge): klik na pole data kalendář sám neotevře → showPicker; iPhone otevře výběr nativně
    inp.closest(".dpick").addEventListener("click", (e) => { if (e.target !== inp) e.preventDefault(); try { inp.showPicker(); } catch { if (e.target !== inp) inp.focus(); } });
    inp.addEventListener("change", () => { if (inp.value) set(inp.value >= today ? null : inp.value); });
  }
}

// ---------- stav (jako v Bevelu) a počasí ----------
const STATUS = { active: ["🏃", "Aktivní", "ok"], sick: ["🤒", "Nemocný", "bad"], injured: ["🩹", "Zraněný", "warn"], vacation: ["🏖️", "Dovolená", "info"] };
const untilText = (st) => (st.kind === "active" ? "Do změny" : st.until ? `do ${dayDm(st.until)}` : "Do odvolání");
function statusPill(st) {
  const [ico, label, tone] = STATUS[st.kind] || STATUS.active;
  return `<button class="pillbig st-${tone}" id="statusBtn" aria-label="změnit stav"><span class="pb-ico">${ico}</span><span class="pb-t"><b>${label}</b><small>${untilText(st)}</small></span><span class="pb-chev">⌄</span></button>`;
}
/** WMO kód počasí → ikona */
/** WMO kód (Open-Meteo) → ikona; night = po setmění jasno jako měsíc */
const wIcon = (code, prob, night = false) => code == null ? (prob >= 50 ? "🌧️" : "⛅") : code <= 1 ? (night ? "🌙" : code === 0 ? "☀️" : "🌤️") : code === 2 ? (night ? "☁️" : "⛅") : code === 3 ? "☁️" : code <= 48 ? "🌫️" : code <= 57 ? "🌦️" : code <= 67 ? "🌧️" : code <= 77 ? "🌨️" : code <= 82 ? "🌧️" : code <= 86 ? "🌨️" : "⛈️";
function weatherPill(w) {
  if (!w) return `<div class="pillbig"><span class="pb-ico">·</span><span class="pb-t"><b>${DASH}</b><small>počasí nemám</small></span></div>`;
  return `<a class="pillbig" href="#/trener" onclick="setTimeout(() => document.getElementById('pocasi')?.scrollIntoView({ behavior: 'smooth' }), 900)" title="Počasí na 7 dní v Trenérovi"><span class="pb-ico">${wIcon(w.code, w.prob, new Date().getHours() >= 17 || new Date().getHours() < 7)}</span><span class="pb-t"><b>${num(w.temp)} °C</b><small>${esc(w.place || "")}${w.feels != null && Math.abs(w.feels - w.temp) >= 2 ? ` · pocitově ${num(w.feels)}°` : ""}</small></span></a>`;
}
function openStatusModal(cur, onDone) {
  const ov = document.createElement("div");
  ov.className = "modal";
  let kind = cur.kind;
  const durs = [["", "Do odvolání"], ["0", "Jen dnes"], ["2", "3 dny"], ["6", "Týden"], ["13", "2 týdny"], ["date", "Do data…"]];
  const today = new Date().toISOString().slice(0, 10);
  const render = () => {
    ov.innerHTML = `<div class="modal-in"><div class="ch"><h2>Jak se máš?</h2><button class="btn sm" data-x>✕</button></div>
      <div class="stgrid">${Object.entries(STATUS).map(([k, [i, l, t]]) => `<button class="stopt st-${t} ${k === kind ? "on" : ""}" data-k="${k}"><span>${i}</span>${l}</button>`).join("")}</div>
      ${kind === "active" ? `<p class="note">Aktivní = trénink podle plánu, zátěž se hodnotí.</p><div class="btns"><button class="btn pri" data-save="">Uložit</button></div>`
        : `<div class="sl" style="margin:14px 0 8px">Na jak dlouho?</div><div class="chips2">${durs.map(([v, l]) => `<button class="btn" data-save="${v}">${l}</button>`).join("")}</div><input type="date" id="stDate" min="${today}" style="display:none">
           <p class="note">${kind === "sick" ? "Nemoc: plán stojí, tréninky v tyto dny se smažou (i z Garminu), po návratu 2 dny jen lehce." : kind === "injured" ? "Zranění: plán stojí, tréninky v tyto dny se smažou, zátěž se nehodnotí." : "Dovolená: plán stojí, tréninky v tyto dny se smažou, pohyb pro radost."}</p>`}
      <p class="note" id="stMsg"></p></div>`;
    ov.querySelector("[data-x]").onclick = () => ov.remove();
    ov.querySelectorAll("[data-k]").forEach((b) => (b.onclick = () => { kind = b.dataset.k; render(); }));
    ov.querySelectorAll("[data-save]").forEach((b) => (b.onclick = async () => {
      let until = null;
      if (b.dataset.save === "date") {
        const di = ov.querySelector("#stDate");
        if (di.style.display === "none") { di.style.display = "block"; di.focus(); di.showPicker?.(); return; }
        if (!di.value) return;
        until = di.value;
      } else if (b.dataset.save !== "") until = addDay(today, +b.dataset.save);
      ov.querySelectorAll("button").forEach((x) => (x.disabled = true));
      try {
        const r = await api("status", { method: "POST", body: JSON.stringify({ kind, until }) });
        ov.querySelector("#stMsg").textContent = kind === "active" ? (r.proposal.count ? `Vítej zpět. Návrh plánu (${r.proposal.count} změn) čeká v Trenérovi.` : "Uloženo.") : `Uloženo. Zrušeno tréninků: ${r.removed}.`;
        cache.clear();
        setTimeout(() => { ov.remove(); onDone(); }, 900);
      } catch (e) { ov.querySelector("#stMsg").textContent = e.message; ov.querySelectorAll("button").forEach((x) => (x.disabled = false)); }
    }));
  };
  render();
  ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
}

/** Kruh skóre (0–100), barva přechodem. */
function scoreRing(v, { grad, label = "", sub = "", size = 116 }) {
  const r = 46, c = 2 * Math.PI * r, id = uid("sr");
  const val = v == null ? 0 : clamp(v, 0, 100);
  const arc = (a, b, stroke, w, extra = "") => `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-dasharray="${(c * (b - a)) / 100} ${c}" stroke-dashoffset="${(-c * a) / 100}" transform="rotate(-90 60 60)" ${extra}/>`;
  return `<div class="sring"><svg viewBox="0 0 120 120" width="${size}" height="${size}"><defs><linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${grad[0]}"/><stop offset="1" stop-color="${grad[1]}"/></linearGradient></defs>
    ${arc(0, 100, "var(--card2)", 10)}${val > 0 ? arc(0, Math.max(val, 1.5), `url(#${id}g)`, 10, 'stroke-linecap="round"') : ""}
    <text x="60" y="61" text-anchor="middle" dominant-baseline="central" class="sr-v">${v == null ? DASH : Math.round(v)}</text></svg>${label ? `<b>${esc(label)}</b>` : ""}${sub ? `<small>${sub}</small>` : ""}</div>`;
}

/** Dlaždice metriky: popisek, hodnota, stav proti normě, sparkline 30 dní. */
function metricTile({ label, value, unit = "", state = "", tone = "", spark: sp = "", href = "", foot = "" }) {
  return `<${href ? `a href="${href}"` : "div"} class="mtile ${tone}"><div class="mt-h"><span>${label}</span>${state ? `<em>${state}</em>` : ""}</div><div class="mt-v">${value}${unit ? `<small>${unit}</small>` : ""}</div><div class="mt-vis">${sp}</div>${foot ? `<div class="mt-f">${foot}</div>` : ""}</${href ? "a" : "div"}>`;
}
/** malá stupnice zón formy (−35 … +25) s ukazatelem dneška – do dlaždice Forma */
function formScale(f) {
  if (f == null) return "";
  const lo = -35, hi = 25, pos = (x) => clamp(((x - lo) / (hi - lo)) * 100, 0, 100);
  const segs = [[-35, -30, "var(--z6)"], [-30, -10, "var(--z3)"], [-10, 5, "var(--z1)"], [5, 20, "var(--z2)"], [20, 25, "var(--z4)"]];
  return `<div class="fscale"><div class="fs-t">${segs.map(([a, b, c]) => `<i style="left:${pos(a)}%;width:${pos(b) - pos(a)}%;background:${c}"></i>`).join("")}<b style="left:${pos(f)}%"></b></div></div>`;
}
/** barva hodnoty proti normě: v normě (±1 SD) zelená, mírně mimo (do 2 SD) oranžová, víc červená; „lepší“ směr je zelený */
function stateColor(v, n, lowGood = false) {
  if (v == null || !n || !n.sd) return "var(--ok)";
  const z = (v - n.mean) / n.sd;
  const bad = lowGood ? z : -z; // kladné = horší směr
  return bad <= 1 ? "var(--ok)" : bad <= 2 ? "var(--warn)" : "var(--bad)";
}
const normState = (v, n, lowGood = false) => {
  if (v == null || !n || !n.sd) return ["", ""];
  const z = (v - n.mean) / n.sd, a = Math.abs(z), up = z > 0;
  if (a <= 1) return ["v normě", "good"];
  const better = up === !lowGood; // směr, který je dobrý
  const dir = up ? "nad normou ↑" : "pod normou ↓";
  if (better) return [dir, "good"];
  return a <= 2 ? [`mírně ${up ? "nad" : "pod"} normou`, "warn"] : [`výrazně ${up ? "nad ↑" : "pod ↓"}`, "bad"];
};

// ---------- stránky ----------
let viewDate = null; // vybraný den na Přehledu a v Zotavení (null = dnes)
async function pagePrehled(el) {
  const d = await api("overview" + (viewDate ? `?date=${viewDate}` : ""));
  if (!d.isToday) {
    if (d.hrvPast) d.hrv = { ...d.hrv, ...d.hrvPast };
    if (d.rhrPast) d.rhr = { ...d.rhr, ...d.rhrPast };
    if (d.fitPast) d.strain = { ...d.strain, ...d.fitPast, today: d.strain.today, zone: d.fitPast.form != null ? formZoneName(d.fitPast.form) : null };
  }
  const r = d.readiness;
  const tone = r.state === "green" ? "good" : r.state === "yellow" ? "warn" : "bad";
  const t = d.today;
  const paused = d.status.kind !== "active";
  const co = d.coaching;

  // 1) Dnes: semafor + zhodnocení + co tělo potřebuje + dnešní trénink
  const todayLine = t.done && t.done.length
    ? `<div class="today-act">✅ <div><b>Dnes odjeto</b><div class="sub">${esc(t.done.map((x) => x.name).join(", "))}</div></div></div>`
    : t.name && !paused
      ? `<a class="today-act" href="#/trener"><span class="ico">${({ run: "🏃", xc_ski: XC_SVG, walk: "🚶" })[t.sport] || "🚴"}</span><div><b>${esc(t.name)}</b><div class="sub">${dur((t.durationMin || 0) * 60)}${t.targetText ? " · " + esc(t.targetText) : ""}</div></div><span class="go">→</span></a>`
      : `<div class="today-act"><span class="ico">🛋️</span><div><b>${paused ? "Plán stojí" : "Dnes volno"}</b><div class="sub">Zítra: ${esc(t.tomorrow)}</div></div></div>`;
  const dnes = d.isToday
    ? card(`c8 dnes ${tone}`, "", "", `<div class="dn-top"><span class="badge ${paused ? "" : tone}">${paused ? (STATUS[d.status.kind]?.[0] || "") + " " + esc(d.status.label) : `${r.emoji} ${esc(r.label)}`}</span><span class="sl">${{ rano: "Ranní zhodnocení", den: "Zhodnocení dne", vecer: "Večerní zhodnocení" }[co.period]}</span></div>
      <h2 class="dn-title">${esc(co.title)}</h2><p class="dn-text">${esc(co.text)}</p>
      <div class="dn-grid"><div>${co.needs.length ? `<div class="sl">Co tělo potřebuje</div><ul class="needs">${co.needs.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}</div><div><div class="sl">Trénink</div>${todayLine}${t.name && !t.done?.length && !paused ? `<p class="note">Zítra: ${esc(t.tomorrow)}</p>` : ""}</div></div>`)
    : ""; // zpětný den: bez horní karty, aktivita je dole

  // 2) Spánek (Garmin): skóre, délka, fáze, potřeba
  const sp = d.sleep;
  const spTone = sp ? sp.scoreTone : "";
  const sleepCard = card("c4 sleepmini", `<a href="#/detail/spanek">😴 Spánek →</a>`, "Garmin", sp ? `<a class="sm-wrap" href="#/detail/spanek">${scoreRing(sp.score, { grad: sp.score == null ? ["var(--z1)", "var(--z1)"] : sp.score >= 80 ? ["var(--ok)", "var(--ok)"] : sp.score >= 60 ? ["var(--warn)", "var(--warn)"] : ["var(--bad)", "var(--bad)"], size: 104 })}<div class="sm-r"><div class="mt-v">${dur(sp.durationS).replace(/ (h|min)/g, "<small> $1</small>")}</div><div class="sub">${sp.start && sp.end ? `${sp.start}–${sp.end}` : ""}${sp.needMin ? ` · potřeba ${dur(sp.needMin * 60)}` : ""}</div><span class="chipt ${spTone}">${esc(sp.verdict.replace(/^Skóre \d+ – /, ""))}</span></div></a>
    <div class="sbar">${sp.stages.map((x) => (x.secs ? `<i style="width:${(x.secs / Math.max(1, sp.stages.reduce((a, b) => a + b.secs, 0))) * 100}%;background:${STAGE_COLOR[x.key]}"></i>` : "")).join("")}</div>
    <div class="sm-st">${sp.stages.map((x) => `<span><i style="background:${STAGE_COLOR[x.key]}"></i>${esc(x.label)} <b>${dur(x.secs)}</b></span>`).join("")}</div>
    ${sp.nextNeedMin ? `<p class="note">Na dnešní noc potřebuješ ${dur(sp.nextNeedMin * 60)} (Garmin).</p>` : ""}` : `<div class="empty">Spánek pro tento den nemám.</div>`);

  // 3) Dlaždice
  const hv = d.hrv, rh = d.rhr, st = d.stress, stp = d.steps, sn = d.strain, bb = d.bb;
  const [hvS, hvT] = normState(hv.today, hv.norm), [rhS, rhT] = normState(rh.today, rh.norm, true), [stS, stT] = normState(st.avg, st.norm, true);
  const bbNow = d.isToday ? bb.latest : bb.max;
  const tiles = `<div class="mtiles four c12">
    ${metricTile({ label: "🫀 VST", value: num(hv.today), unit: "ms", state: hvS, tone: hvT, spark: sparkRolling(hv.series.map((x) => x.v), stateColor(hv.today, hv.norm), 56), href: "#/detail/vst", foot: hv.norm ? `norma ${num(hv.norm.mean - hv.norm.sd)}–${num(hv.norm.mean + hv.norm.sd)}` : "" })}
    ${metricTile({ label: "❤️ Klidový tep", value: num(rh.today), unit: "bpm", state: rhS, tone: rhT, spark: sparkRolling(rh.series.map((x) => x.v), stateColor(rh.today, rh.norm, true), 56), href: "#/detail/tep", foot: rh.norm ? `norma ${num(rh.norm.mean)} ± ${num(rh.norm.sd, 1)}` : "" })}
    ${metricTile({ label: "😮‍💨 Stres", value: num(st.avg), state: stS, tone: stT, spark: sparkRolling(st.series.map((x) => x.v), stateColor(st.avg, st.norm, true), 56), href: "#/detail/stres", foot: st.max != null ? `max ${num(st.max)}` : "" })}
    ${metricTile({ label: "👣 Kroky", value: thou(stp.today), state: stp.today != null ? `${num(Math.min(100, (stp.today / stp.goal) * 100))} %` : "", tone: (stp.today ?? 0) >= stp.goal ? "good" : "", spark: `<div class="prog"><i style="width:${clamp(((stp.today || 0) / stp.goal) * 100, 0, 100)}%"></i></div>`, href: "#/chuze", foot: `cíl ${thou(stp.goal)}${stp.floors != null ? ` · ${num(stp.floors)} pater` : ""}` })}
  </div>`;

  // 4) průběh dne
  // vlevo grafy dne (tep, Body Battery), vpravo stav (kroužek Body Battery, stres, co nabilo a vybilo)
  // Body Battery v jedné kartě (půlkruh, čísla, graf, co nabilo a vybilo), vedle tep a stres
  const bbCard = card("c6", `<a href="#/detail/bb">🔋 Body Battery · ${d.isToday ? "dnes" : dayDm(d.date)} →</a>`, "Garmin", `<div id="bbtop"></div><div id="bbday" class="loading sm">Načítám průběh dne…</div><div id="dayenergy"></div>`);
  const hrCard = card("c6", `<a href="#/detail/stres">❤️ Tep a stres · ${d.isToday ? "dnes" : dayDm(d.date)} →</a>`, "Garmin", `<div id="hrday" class="loading sm">Načítám tep…</div><div id="daystress"></div>`);

  // 5) poslední aktivita + počasí
  const la = d.lastActivity;
  const laCard = la
    ? card("c12 lacard", "Poslední aktivita", "", `<a class="lastact" href="#/aktivita/${la.id}"><span class="big-ico">${SPORT_ICON[la.sport] || "🏅"}</span><div><b>${esc(la.name || SPORT_NAME[la.sport])}</b><div class="sub">${dayDm(la.date)}${la.plan ? ` · plán ${la.compliance ? `${num(la.compliance)} %` : "✓"}` : ""}</div></div><span class="go">→</span></a>
      <div class="la-grid">${[la.km ? ["Vzdálenost", num(la.km, 1), "km"] : null, ["Čas", hmm(la.moving_s), "h"], la.elev ? ["Převýšení", num(la.elev), "m"] : null, la.np ? ["Výkon NP", num(la.np), "W"] : null, la.avg_hr ? ["Tep ⌀", num(la.avg_hr), "bpm"] : null, ["Zátěž", num(la.load), ""]].filter(Boolean).slice(0, 6).map(([l, v, u]) => `<div><span>${l}</span><b>${v}${u ? `<small> ${u}</small>` : ""}</b></div>`).join("")}</div>`)
    : card("c12", "Poslední aktivita", "", `<div class="empty">Žádná aktivita za 90 dní.</div>`);

  el.innerHTML = `<div class="head"><div><h1>${greeting(d.hour)}, <span class="acc">${esc(d.name)}</span></h1><div class="sub">data k ${d.lastSync ? new Date(d.lastSync).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" }) : DASH}<span id="watchAt"></span></div></div>${dateNav(d.date, d.minDate, d.todayDate, "pnav")}</div>
  <div class="toprow">${statusPill(d.status)}${d.isToday ? weatherPill(d.weatherNow) : ""}</div>
  <div class="grid prehled">${dnes}${sleepCard}${tiles}${bbCard}${hrCard}${laCard}</div>`;
  bindHours(el);
  bindDateNav(el, "pnav", d.todayDate, (v) => { viewDate = v; route(); });
  el.querySelector("#statusBtn")?.addEventListener("click", () => openStatusModal(d.status, () => route()));
  api("day" + (d.isToday ? "" : `?date=${d.date}`)).then((day) => {
    const hb = el.querySelector("#hrday"), bb2 = el.querySelector("#bbday");
    if (hb) { hb.className = ""; hb.innerHTML = dayHrChart(day); }
    const bbSum = { latest: bb.latest, max: bb.max, min: bb.min, charged: bb.charged, drained: bb.drained };
    if (bb2) { bb2.className = ""; bb2.innerHTML = bbPanel(day, d.isToday, bbSum, "line"); }
    const bt = el.querySelector("#bbtop"); if (bt) bt.innerHTML = bbPanel(day, d.isToday, bbSum, "top");
    const ds = el.querySelector("#daystress"); if (ds) ds.innerHTML = dayStressHtml(day);
    const de = el.querySelector("#dayenergy"); if (de) de.innerHTML = dayEnergyHtml(day);
    // poslední data z hodinek = nejnovější bod tepu / Body Battery (hodinky je pošlou až po synchronizaci s telefonem)
    const lastT = Math.max(0, ...(day.hr || []).map((x) => x[0]), ...(day.bb || []).map((x) => x[0]));
    const wa = el.querySelector("#watchAt");
    if (wa && lastT && d.isToday) { const m = Math.round((Date.now() - lastT) / 60000); wa.innerHTML = ` · hodinky ${new Date(lastT).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })} <span class="${m > 120 ? "warn" : ""}">(před ${m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`})</span>`; }
  }).catch((e) => { for (const s of ["#hrday", "#bbday"]) { const b = el.querySelector(s); if (b) { b.className = ""; b.innerHTML = `<div class="empty">${esc(e.message)}</div>`; } } });
}


/** „Mám vlastní trasu“: délka + s kým → plán den nechá a ostatní dny dopočítá. */
const ownForm = (d) => `<details class="addd own"><summary class="btn sm">🗺️ Vlastní jízda…</summary><form class="ownf" data-date="${d.date}"><label>Délka (h)<input name="h" type="text" inputmode="decimal" placeholder="4 nebo 3:30" required></label><label>Km<input name="km" type="number" min="0" max="400" placeholder="volitelné"></label><label>S kým<input name="with" placeholder="sám / skupina / jméno"></label><button class="btn sm pri" type="submit">Zapsat do plánu</button></form><p class="note">Trasu a tempo volíš ty, trenér započítá zátěž (ve skupině +15 %) a zbytek týdne přepočítá. Jde to i v Telegramu nebo v chatu: „zítra jedu 4 h s Honzou“.</p></details>`;

/** Den plánu. opts: switcher (akce), cons (omezení), plan (všechny dny – pro přesun kvality), types (volby druhu). */
function planDayHtml(d, opts = {}) {
  const ride = !!d.name;
  const sIco = (s) => ({ run: "🏃", xc_ski: XC_SVG, walk: "🚶" })[s] || "🚴";
  const icon = !ride ? (d.kind === "hockey" ? "🏒" : d.kind === "xc_ski" ? XC_SVG : d.kind === "blocked" ? "⛔" : "🛋️") : d.indoor && d.sport === "ride" ? "🏠" : sIco(d.sport);
  const chips = [
    ride ? `<span class="chip">⏱ ${dur((d.durationMin || 0) * 60)}</span>` : "",
    ride || d.load ? `<span class="chip">🔋 zátěž ${num(d.load)}</span>` : "",
    d.form != null ? `<span class="chip">📊 forma ${signed(d.form, 1)}</span>` : "",
    d.weather ? `<span class="chip">${weatherIcon(d.weather)} ${num(d.weather.tmax)}° · ${num(d.weather.rainProb)} %${d.weather.window && ride && !d.indoor && d.sport === "ride" ? ` · okno ${String(d.weather.window.from).padStart(2, "0")}–${String(d.weather.window.to).padStart(2, "0")}` : ""}</span>` : "",
  ].join("");
  // kroky tréninku schované – rozbalí se kliknutím
  const steps = d.steps && d.steps.length ? `<details class="stepsd"><summary>Kroky tréninku (${d.steps.length})</summary><ol class="steps">${d.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></details>` : "";
  const cons = (opts.cons || []).filter((c) => c.date === d.date);
  const CONS_LABEL = { nepojedu: "Nepojedu", nemuzu: "Nemůžu", dovolena: "Dovolená", nemoc: "Nemoc", hokej: "Hokej", bezky: "Běžky", jizda: "Vlastní jízda" };
  const undo = cons.length ? `<div class="cons">${cons.map((c) => `<button class="btn sm" data-undo="${c.date}" data-kind="${c.kind}" title="zrušit omezení">↩️ Zrušit „${CONS_LABEL[c.kind] || c.kind}“</button>`).join("")}</div>` : "";
  let actions = "";
  if (opts.switcher && !d.isPast && (ride || d.kind === "rest")) {
    const sports = [["ride", "🚴", "Kolo (silnice / trenažér)"], ["run", "🏃", "Běh"], ["xc_ski", XC_SVG, "Běžky"]];
    const ut = (opts.types || []).find((x) => x.date === d.date);
    if (ride) {
      const others = (opts.plan || []).filter((x) => x.date !== d.date && !x.isPast && x.date >= d.date.slice(0, 8) + "01");
      const qDay = (opts.plan || []).find((x) => x.kind === "quality" && x.date !== d.date);
      actions = `<div class="pact">
        <div class="sw-sport" data-date="${d.date}">${sports.map(([k, i, t]) => `<button class="${(d.sport || "ride") === k ? "on" : ""}" data-sport="${k}" title="${t}">${i}</button>`).join("")}<button data-sport="rest" title="Volno">🛋️</button></div>
        ${d.kind === "quality" ? `<button class="btn sm" data-type="z2" data-date="${d.date}">↓ Místo toho Z2</button><select class="btn sm" data-move="${d.date}"><option value="">📅 Přesunout kvalitu…</option>${others.map((x) => `<option value="${x.date}">${dayDm(x.date)} · ${esc(x.name || "volno")}</option>`).join("")}</select>` : ""}
        ${(d.kind === "z2" || d.kind === "long") && qDay ? `<button class="btn sm" data-movefrom="${qDay.date}" data-moveto="${d.date}" title="kvalitu z ${dayDm(qDay.date)} dát sem">⚡ Kvalitu sem</button>` : ""}
        ${ut ? `<button class="btn sm" data-type="auto" data-date="${d.date}">↩ Podle plánu</button>` : ""}
        ${d.own ? "" : ownForm(d)}
      </div>`;
    } else {
      actions = `<div class="pact"><details class="addd"><summary class="btn sm">＋ Přidat trénink</summary><div class="sw-sport" data-date="${d.date}">${sports.map(([k, i, t]) => `<button data-sport="${k}" title="${t}">${i} ${t.replace(/ \(.*\)/, "")}</button>`).join("")}</div></details>${ownForm(d)}</div>`;
    }
  }
  return `<article class="pday ${d.isToday ? "today" : ""} ${ride ? "" : "rest"}">
    <div class="pdate"><b>${DAYS[dow(d.date) - 1]}</b><span>${dm(d.date)}</span>${d.isToday ? '<em>dnes</em>' : ""}</div>
    <div class="pbody">
      <div class="ptitle"><span class="pico">${icon}</span><b>${esc(d.name || d.tag)}</b>${ride ? `<span class="tag ${d.tagClass}">${esc(d.tag)}</span>` : ""}${d.orientational ? '<span class="tag ghost">orientační</span>' : ""}</div>
      ${chips ? `<div class="chips">${chips}</div>` : ""}
      ${d.targetText ? `<div class="target">🎯 ${esc(d.targetText)}</div>` : ""}
      ${d.carbs ? `<div class="target">🍬 ${esc(d.carbs.text)}</div>` : ""}
      ${steps}
      ${d.note ? `<p class="note">${esc(d.note)}</p>` : ""}${undo}${actions}
    </div></article>`;
}

/** Zátěž po týdnech: hotovo (plně) + plán (světle), čárkovaně cíl týdne. */
function weekLoadsHtml(w) {
  const bars = w.weeks.map((x) => ({ parts: [{ v: x.done, color: "var(--acc)" }, { v: x.planned, color: "color-mix(in srgb, var(--acc) 35%, transparent)" }] }));
  const lbl = (x) => (x.current ? "tento" : x.future ? "příští" : dm(x.from));
  return barChart({ x: w.weeks.map(lbl), mode: "stack", height: 170, bars, refLine: w.target.mid, todayIndex: w.weeks.findIndex((x) => x.current),
    tipFn: (i) => { const x = w.weeks[i]; return `<b>týden od ${dm(x.from)}</b><div>hotovo ${num(x.done)}${x.planned ? ` · plán ${num(x.planned)}` : ""}${x.current || x.future ? ` · celkem ${num(x.done + x.planned)}` : ""}</div><div>${x.sessions} tréninků · cíl ${w.target.lo}–${w.target.hi}</div>`; } })
    + `<div class="legend"><span><i style="background:var(--acc)"></i>hotovo</span><span><i style="background:color-mix(in srgb, var(--acc) 35%, transparent)"></i>plán</span><span class="sub">čárkovaně = cíl týdne ${w.target.mid} (pásmo ${w.target.lo}–${w.target.hi})</span></div>
    <table class="t wk"><tr><th>Týden</th><th class="r">Hotovo</th><th class="r">Plán</th><th class="r">Tréninky</th></tr>${w.weeks.map((x) => `<tr class="${x.current ? "iv" : ""}"><td>${x.current ? "tento" : x.future ? "příští" : `od ${dm(x.from)}`}</td><td class="r">${x.future ? DASH : num(x.done)}</td><td class="r">${x.planned ? num(x.planned) : DASH}</td><td class="r">${x.sessions}</td></tr>`).join("")}</table>
    <p class="note">Zátěž = TSS (stejné číslo jako Garmin a intervals.icu). Kondice (CTL) ≈ průměrná denní zátěž za 6 týdnů, týden na udržení ≈ 7 × CTL.</p>`;
}

// ---------- Trenér: dnešek, plán týdne (interaktivní), z čeho trenér vychází, AI trenér ----------
const COACH_KEY = "coachAsk";
let tOpen = null; // otevřený den (panel úprav)
function tSportIco(s) { return ({ run: "🏃", xc_ski: XC_SVG, walk: "🚶" })[s] || "🚴"; }
/** Pruh zátěže týdne: hotovo (plně) + plán (světle) proti cílovému pásmu. */
function weekBar(w, label) {
  if (!w) return "";
  const t = w.target || {};
  const max = Math.max(t.hi || 0, (w.done || 0) + (w.planned || 0)) * 1.12 || 1;
  const pc = (v) => clamp((v / max) * 100, 0, 100);
  const total = (w.done || 0) + (w.planned || 0);
  const tone = total < (t.lo || 0) * 0.9 ? "warn" : total > (t.hi || 1e9) * 1.1 ? "bad" : "good";
  return `<div class="wbar"><div class="wb-h"><b>${label}</b><span class="num ${tone}">${thou(total)} <small>/ cíl ${t.lo}–${t.hi}</small></span></div>
    <div class="wb-t"><i class="wb-band" style="left:${pc(t.lo || 0)}%;width:${pc(t.hi || 0) - pc(t.lo || 0)}%"></i><i class="wb-done" style="width:${pc(w.done || 0)}%"></i><i class="wb-plan" style="left:${pc(w.done || 0)}%;width:${pc(w.planned || 0)}%"></i></div>
    <div class="wb-l"><span><i class="wb-sw done"></i>hotovo ${thou(w.done || 0)}</span><span><i class="wb-sw plan"></i>plán ${thou(w.planned || 0)}</span><span><i class="wb-sw band"></i>cíl týdne</span></div></div>`;
}
async function pageTrener(el) {
  const [d, mine] = await Promise.all([api("coach"), api("plan/mine").catch(() => [])]);
  const r = d.readiness, rec = r.recovery, f = r.fitness, p = r.plan;
  const tone = rec.state === "green" ? "good" : rec.state === "yellow" ? "warn" : "bad";
  const paused = d.status && d.status.kind !== "active";
  const skipped = (d.constraints || []).find((c) => c.date === r.date && ["nepojedu", "nemuzu", "dovolena", "nemoc"].includes(c.kind));
  const t = r.today;
  // --- dnešek (tmavá karta) ---
  const todayCard = `<section class="card tdark c12"><span class="td-d">Dnes · ${dayDm(r.date)} · <span class="${tone}">${rec.emoji} ${esc(rec.stateLabel)}</span></span>
    <b class="td-h">${esc(paused ? `${d.status.label} – plán stojí` : skipped ? "Dnes volno (tvoje volba)" : t.decision)}${!paused && t.day && t.day.name && t.decision !== "Odjeto" ? ` · ${dur((t.day.durationMin || 0) * 60)}` : ""}</b>
    <p class="td-p">${esc(paused ? "Stav změníš na Přehledu." : skipped ? "Omylem? Vrať to tlačítkem." : t.decisionWhy)} ${esc("Zítra: " + r.tomorrow)}</p>
    <div class="btns">${paused ? "" : skipped ? `<button class="btn pri" data-undo="${r.date}" data-kind="${skipped.kind}">↩️ Vrátit – dnes pojedu</button>` : `<button class="btn" data-skip="${r.date}">🚫 Dnes nepojedu</button>`}</div></section>`;
  // --- pruh zátěže: tento a příští týden (plán zasahuje do obou) ---
  const wk = d.weeks.weeks;
  const cur = wk.find((x) => x.current), next = wk.find((x) => x.future);
  const wkLabel = (w) => `${dm(w.from)}–${dm(addDay(w.from, 6))}`;
  const inPlan = (w) => w && p.days.some((x) => x.date >= w.from && x.date <= addDay(w.from, 6));
  const bars = (inPlan(cur) ? weekBar({ ...cur, target: d.weeks.target }, `Tento týden · ${wkLabel(cur)}`) : "") + (inPlan(next) ? weekBar({ ...next, target: d.weeks.target }, `Příští týden · ${wkLabel(next)}`) : "");
  // --- dny ---
  const others = (x) => p.days.filter((y) => y.date !== x.date);
  const dayRow = (x) => {
    const ride = !!x.name;
    const q = x.kind === "quality";
    const tags = [q ? '<span class="ttag q">kvalita</span>' : "", x.kind === "long" ? '<span class="ttag">dlouhá</span>' : "", x.own ? '<span class="ttag">vlastní jízda</span>' : "", x.mine ? '<span class="ttag me" title="tvoje úprava">tvoje úprava</span>' : "", x.changed ? '<span class="ttag nz" title="nezapsáno do intervals.icu">nezapsáno</span>' : ""].join("");
    const w = x.weather;
    const wtxt = w ? `${weatherIcon(w)} ${num(w.tmax)}°${w.window && ride && !x.indoor && x.sport === "ride" ? ` · okno ${String(w.window.from).padStart(2, "0")}–${String(w.window.to).padStart(2, "0")} h` : ""}${x.indoor ? " · trenažér" : ""}` : "";
    const open = tOpen === x.date;
    const panel = open && !x.isPast && x.kind !== "blocked" ? `<div class="tpanel">
      ${ride ? `<label class="tp-l">Přesunout na<select data-shift="${x.date}"><option value="">vyber den…</option>${others(x).map((y) => `<option value="${y.date}">${dayDm(y.date)} · ${esc(y.name || "volno")}${y.name ? " (prohodit)" : ""}</option>`).join("")}</select></label>` : ""}
      <div class="tp-g"><span class="tp-k">Druh</span><div class="seg sm">${[["z2", "Z2"], ["quality", "Kvalita"], ["rest", "Volno"]].map(([k, l]) => `<button class="${(k === "rest" && !ride) || (k === "quality" && q) || (k === "z2" && ride && !q) ? "on" : ""}" data-kindset="${k}" data-date="${x.date}">${l}</button>`).join("")}</div></div>
      <div class="tp-g"><span class="tp-k">Sport</span><div class="sw-sport" data-date="${x.date}">${[["ride", "🚴", "Kolo"], ["run", "🏃", "Běh"], ["xc_ski", XC_SVG, "Běžky"], ["walk", "🚶", "Chůze"]].map(([k, i, l]) => `<button class="${ride && x.sport === k ? "on" : ""}" data-sport="${k}" title="${l}">${i}</button>`).join("")}</div></div>
      ${ride && !x.own ? `<div class="tp-g"><span class="tp-k">Délka</span><div class="tp-len"><button class="btn sm" data-len="${x.date}" data-v="${Math.max(20, (x.durationMin || 60) - 15)}">−15 min</button><b class="num">${dur((x.durationMin || 0) * 60)}</b><button class="btn sm" data-len="${x.date}" data-v="${(x.durationMin || 60) + 15}">+15 min</button></div></div>` : ""}
      ${ownForm(x)}
      ${x.steps && x.steps.length ? `<details class="stepsd"><summary>Kroky tréninku (${x.steps.length})</summary><ol class="steps">${x.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></details>` : ""}
      ${x.note ? `<p class="note">${esc(x.note)}</p>` : ""}</div>` : "";
    return `<div class="tday ${x.isToday ? "today" : ""} ${ride ? "" : "rest"} ${q ? "q" : ""} ${open ? "open" : ""}" data-day="${x.date}" ${ride ? 'draggable="true"' : ""}>
      <div class="td-row"><span class="td-date"><b>${DAYS[dow(x.date) - 1]}</b> ${dm(x.date)}</span>
      <span class="td-main">${ride ? `<span class="td-ico">${tSportIco(x.sport)}</span>` : ""}<span class="td-t"><b>${esc(x.name || (x.kind === "blocked" ? x.tag : x.kind === "hockey" ? "Hokej" : "Volno"))}</b>${tags}${x.targetText && ride ? `<small>${esc(x.targetText)}</small>` : ""}</span></span>
      <span class="td-n num">${ride ? `${dur((x.durationMin || 0) * 60)}<small>zátěž ${num(x.load)}</small>${x.targetText ? `<small class="td-tg">${esc(String(x.targetText).replace(/\s*\(.*$/, ""))}</small>` : ""}` : ""}</span>
      <span class="td-w">${wtxt}</span>
      ${x.kind === "blocked" ? "<span></span>" : `<button class="td-btn ${ride ? "" : "add"}" data-open="${x.date}" aria-expanded="${open}" title="${ride ? "Upravit" : "Přidat trénink"}">${open ? "Zavřít" : ride ? "Upravit" : "＋<span> Přidat</span>"}</button>`}</div>${panel}</div>`;
  };
  const prop = d.proposal;
  const pending = prop && prop.items.length ? `<div class="tpend"><span><b>${prop.items.length} ${prop.items.length === 1 ? "změna čeká" : prop.items.length < 5 ? "změny čekají" : "změn čeká"}</b> · do kalendáře a intervals.icu jdou až po potvrzení</span>
    <span class="btns"><button class="btn pri" id="applyAll">✅ Zapsat do intervals.icu</button><button class="btn" id="resetMine">↩ Vrátit moje úpravy</button></span>
    <details class="tp-list"><summary>Co se změní</summary>${prop.items.map((c) => `<div class="tp-ch"><b>${dayDm(c.date)}</b> ${esc(c.action)} – ${esc(c.name)}${c.why ? `<small>${esc(c.why)}</small>` : ""}</div>`).join("")}</details><p class="note" id="applyMsg"></p></div>`
    : `<div class="tpend ok"><span>✓ Kalendář odpovídá plánu</span><span class="btns">${mine.length ? '<button class="btn sm" id="resetMine">↩ Vrátit moje úpravy</button>' : ""}<button class="btn sm" id="newProp">↻ Přepočítat</button></span><p class="note" id="applyMsg"></p></div>`;
  const planCard = card("c12 t-plan", `🗓️ Plán ${dm(p.from)}–${dm(p.to)}`, "plán · Open-Meteo", `${pending}<form class="aiweek" id="aiWeek"><input name="t" placeholder="Pokyn pro AI (nepovinné) – např. víc objemu o víkendu, ve středu nemám čas" autocomplete="off"><button class="btn" type="submit">🤖 AI návrh týdne</button></form>${bars}<div class="tdleg mob-only"><span><i class="me"></i>tvoje úprava</span><span><i class="nz"></i>nezapsáno</span></div><div class="tdays">${p.days.map(dayRow).join("")}</div>${p.warnings.length ? `<ul class="alerts">${p.warnings.map((w) => `<li>⚠️ ${esc(w)}</li>`).join("")}</ul>` : ""}<p class="note">Úpravy: tlačítko „Upravit“ u dne${matchMedia("(pointer: fine)").matches ? " nebo přetáhni trénink myší na jiný den" : ""}. Plán se hned přepočítá, do intervals.icu se zapíše až po potvrzení nahoře.</p>`);
  // --- z čeho trenér vychází ---
  const form = f.form, goalUp = d.goal === "zvyseni" || d.goal === "zavod";
  const why = form == null ? "Formu zatím neznám." : form < -30 ? `Jsi hodně unavený (forma ${signed(form, 1)}) → týden výrazně lehčí, víc volna.` : form < -20 ? `Únava je vysoká (forma ${signed(form, 1)}) → týden lehčí.` : form > 15 && goalUp ? `Jsi odpočatý (forma ${signed(form, 1)})${f.ramp != null && f.ramp < 0 ? " a kondice klesá" : ""} → přidávám zátěž.` : form > 15 ? `Jsi odpočatý (forma ${signed(form, 1)}) – při cíli ${esc(d.goalLabel || "")} držím zátěž.` : `Forma ${signed(form, 1)} je v tréninkovém pásmu → plán drží zátěž.`;
  const qn = p.days.filter((x) => x.kind === "quality").length;
  const stateCard = card("t-state", "Z čeho trenér vychází", "intervals.icu · Garmin", `<div class="tstate">
      <div><span>Kondice (CTL)</span><b class="num">${num(f.ctl, 1)}</b><small class="${f.ramp != null && f.ramp < -1 ? "warn" : ""}">${f.ramp != null ? `${signed(f.ramp, 1)} za týden` : ""}</small></div>
      <div><span>Únava (ATL)</span><b class="num">${num(f.atl, 1)}</b><small>zátěž 7 dní ${thou(f.load7)}</small></div>
      <div><span>Forma (TSB)</span><b class="num">${signed(form, 1)}</b><small class="${form == null ? "" : form < -20 || form > 20 ? "warn" : "good"}">${esc(formZoneName(form))}</small></div>
      <div><span>Připravenost</span><b class="tst-word ${tone}">${esc(({ green: "Dobrá", yellow: "Částečná", red: "Nízká" })[rec.state] || rec.stateLabel)}</b><small>${esc(rec.stateLabel)}</small></div></div>${(d.insights || []).length ? `<div class="insights">${d.insights.map((i) => verdict(i.tone, i.text)).join("")}</div>` : ""}
    <div class="twhy"><b>Proto tento týden</b><p>${why} Cíl zátěže ${p.weeklyTarget.lo}–${p.weeklyTarget.hi}, ${qn ? `${qn}× kvalita` : "bez kvality"}, ${p.days.filter((x) => x.name).length} tréninků.</p></div>
    <details class="gcmp"><summary>Pravidla trenéra</summary><p class="note">Týdenní zátěž z kondice a cíle (max. +10 % proti běžnému týdnu). Forma pod −20 → týden o 12 % lehčí, pod −30 o 25 %. Kvalita 1× (zima) / 2× (sezóna) týdně, nikdy dva dny po sobě ani po hokeji; když týden zaplní tvoje volby, dá se na kolový den. Ráno podle připravenosti: 🟡 kvalita → Z2 nebo zkrácení, 🔴 volno / Z1. Tvoje úpravy (přesun, délka, sport, vlastní jízda) mají přednost, zbytek týdne se dopočítá.</p></details>`);
  // --- AI trenér ---
  let hist = []; try { hist = JSON.parse(localStorage.getItem(COACH_KEY) || "[]"); } catch {}
  const chatCard = card("t-chat", "💬 Řekni trenérovi", "AI · úpravy plánu", `<div class="tmsgs">${hist.length ? hist.slice(-6).map((m) => `<div class="msg ${m.role}"><p>${esc(m.text)}</p>${m.applied && m.applied.length ? `<small class="sub">${m.applied.map(esc).join(" · ")}</small>` : ""}</div>`).join("") : '<div class="empty">Napiš, co se mění – trenér upraví plán (např. „ve středu nestihnu, přesuň kvalitu na čtvrtek“).</div>'}</div>
    <div class="sugg">${["Ve středu nestihnu, přesuň kvalitu na čtvrtek", "Tento týden mám jen 4 hodiny", "Jsem unavený", "V sobotu jedu 4 h s kamarádem"].map((s) => `<button class="btn sm" data-ask="${esc(s)}">${esc(s)}</button>`).join("")}</div>
    <form class="chatform" id="askF"><textarea rows="1" placeholder="Napiš trenérovi…"></textarea><button class="btn pri" type="submit">➤</button></form>${hist.length ? '<button class="btn sm" id="askClr" style="margin-top:6px">Smazat rozhovor</button>' : ""}`);
  // --- cíl, počasí, zátěž po týdnech, intenzita ---
  const cur2 = d.goals.find((g) => g.key === d.goal);
  const goalCard = card("t-goal", "🎯 Cíl tréninku", "", `<div class="seg">${d.goals.map((g) => `<button class="${d.goal === g.key ? "on" : ""}" data-goal="${g.key}">${esc(g.label)}</button>`).join("")}</div><p class="gtext">${esc(cur2 ? cur2.text : "")}</p><p class="note" id="goalMsg"></p>`);
  const weatherCard = card("c12 t-weather", "🌤️ Počasí na trénink · 7 dní", "Open-Meteo", weatherList(p.days.map((x) => ({ label: x.isToday ? "Dnes" : dayDm(x.date), w: x.weather })).filter((x) => x.w)), 'id="pocasi"');
  const loadsCard = card("t-loads", "📈 Zátěž po týdnech", "TSS", weekLoadsHtml(d.weeks));
  const intens = card("t-int", "Průvodce intenzitou", "FTP", `<details><summary>Watty pro jednotlivé jednotky (FTP ${d.intensity.ftp} W)</summary><table class="t"><tr><th>Jednotka</th><th class="r">% FTP</th><th class="r">Watty</th></tr>${d.intensity.targets.map((x) => `<tr><td>${esc(x.name)}</td><td class="r">${x.pct[0]}–${x.pct[1]} %</td><td class="r">${x.w[0]}–${x.w[1]} W</td></tr>`).join("")}</table></details>`);
  el.innerHTML = `<div class="head"><div><h1>Trenér</h1><div class="sub">cíl ${esc(d.goalLabel || "")} · zátěž týdne ${p.weeklyTarget.lo}–${p.weeklyTarget.hi}</div></div></div>
  <div class="grid tgrid">
    <div class="c7 col tcol">${todayCard}${planCard}</div>
    <div class="c5 col tcol">${stateCard}${chatCard}${goalCard}${loadsCard}${intens}</div>
    ${weatherCard}
  </div>`;
  bindHours(el);
  const keepScroll = async () => { const y = scrollY; cache.clear(); await route(); requestAnimationFrame(() => scrollTo(0, y)); };
  const post = async (path, body, msgEl) => { try { await api(path, { method: "POST", body: JSON.stringify(body) }); await keepScroll(); } catch (e) { if (msgEl) msgEl.textContent = e.message; else alert(e.message); } };
  el.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => { tOpen = tOpen === b.dataset.open ? null : b.dataset.open; pageTrener(el).then(() => el.querySelector(`[data-day="${tOpen}"]`)?.scrollIntoView({ block: "nearest" })); }));
  el.querySelectorAll("[data-shift]").forEach((s) => s.addEventListener("change", () => { if (s.value) { tOpen = null; post("plan/shift", { from: s.dataset.shift, to: s.value }); } }));
  el.querySelectorAll("[data-kindset]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.kindset, date = b.dataset.date;
    if (k === "rest") post("plan/sport", { dates: [date], sport: "rest" });
    else { const x = p.days.find((y) => y.date === date); (async () => { if (!x?.name) await api("plan/sport", { method: "POST", body: JSON.stringify({ dates: [date], sport: "ride" }) }); await post("plan/day", { date, type: k }); })(); }
  }));
  el.querySelectorAll(".tpanel .sw-sport button").forEach((b) => b.addEventListener("click", () => post("plan/sport", { dates: [b.parentElement.dataset.date], sport: b.dataset.sport })));
  el.querySelectorAll("[data-len]").forEach((b) => b.addEventListener("click", () => post("plan/len", { date: b.dataset.len, min: +b.dataset.v })));
  el.querySelectorAll(".ownf").forEach((f2) => f2.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(f2);
    const hv = String(fd.get("h") || "").trim().replace(",", ".");
    const m = /^(\d{1,2}):(\d{2})$/.exec(hv);
    const min = m ? +m[1] * 60 + +m[2] : Math.round(parseFloat(hv) * 60);
    if (!(min >= 20 && min <= 720)) { alert("Délku napiš v hodinách, např. 4 nebo 3:30."); return; }
    tOpen = null;
    post("plan/own", { date: f2.dataset.date, min, km: fd.get("km") ? +fd.get("km") : null, with: String(fd.get("with") || "").trim().toLowerCase() === "sám" ? null : String(fd.get("with") || "").trim() || null });
  }));
  // přetažení tréninku myší na jiný den (PC)
  let dragFrom = null;
  el.querySelectorAll(".tday").forEach((row) => {
    row.addEventListener("dragstart", (e) => { dragFrom = row.dataset.day; row.classList.add("drag"); e.dataTransfer.effectAllowed = "move"; });
    row.addEventListener("dragend", () => row.classList.remove("drag"));
    row.addEventListener("dragover", (e) => { if (dragFrom && dragFrom !== row.dataset.day) { e.preventDefault(); row.classList.add("over"); } });
    row.addEventListener("dragleave", () => row.classList.remove("over"));
    row.addEventListener("drop", (e) => { e.preventDefault(); row.classList.remove("over"); if (dragFrom && dragFrom !== row.dataset.day) post("plan/shift", { from: dragFrom, to: row.dataset.day }); dragFrom = null; });
  });
  el.querySelector("#applyAll")?.addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    const msg = el.querySelector("#applyMsg");
    msg.textContent = "Zapisuji do kalendáře a intervals.icu…";
    try { const res = await api(`proposal/${prop.id}/apply`, { method: "POST", body: JSON.stringify({ codes: prop.items.map((c) => c.code) }) }); msg.textContent = [...res.lines, res.verify].join(" · "); setTimeout(keepScroll, 1500); }
    catch (err) { msg.textContent = err.message; e.currentTarget.disabled = false; }
  });
  el.querySelector("#resetMine")?.addEventListener("click", () => { if (confirm("Vrátit všechny tvoje úpravy plánu (přesuny, délky, sporty, vlastní jízdy)?")) post("plan/reset", {}); });
  el.querySelector("#newProp")?.addEventListener("click", () => post("plan/propose", {}));
  el.querySelectorAll("[data-undo]").forEach((b) => b.addEventListener("click", async () => { b.disabled = true; await api("constraint", { method: "DELETE", body: JSON.stringify({ date: b.dataset.undo, kind: b.dataset.kind }) }); keepScroll(); }));
  el.querySelectorAll("[data-skip]").forEach((b) => b.addEventListener("click", async () => { b.disabled = true; await api("constraint", { method: "POST", body: JSON.stringify({ date: b.dataset.skip, kind: "nepojedu", note: "dashboard" }) }); await api("plan/propose", { method: "POST" }); keepScroll(); }));
  el.querySelectorAll("[data-goal]").forEach((b) => b.addEventListener("click", async () => { if (b.classList.contains("on")) return; el.querySelector("#goalMsg").textContent = "Přepočítávám plán…"; await api("settings", { method: "POST", body: JSON.stringify({ goal: b.dataset.goal }) }); keepScroll(); }));
  // AI trenér
  const ask = async (text) => {
    text = text.trim(); if (!text) return;
    hist.push({ role: "user", text });
    const box = el.querySelector(".tmsgs"); box.insertAdjacentHTML("beforeend", `<div class="msg user"><p>${esc(text)}</p></div><div class="msg assistant"><span class="spin"></span></div>`);
    try {
      const res = await api("coach/ask", { method: "POST", body: JSON.stringify({ text }) });
      hist.push({ role: "assistant", text: res.reply, applied: res.applied });
    } catch (e) { hist.push({ role: "assistant", text: `Teď to nejde: ${e.message}` }); }
    try { localStorage.setItem(COACH_KEY, JSON.stringify(hist.slice(-20))); } catch {}
    keepScroll();
  };
  // AI návrh týdne: AI složí týden, server ho zkontroluje a případně opraví, změny čekají na „Zapsat“
  el.querySelector("#aiWeek")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button"), t = e.target.querySelector("input").value.trim();
    btn.disabled = true; btn.innerHTML = "<span class=\"spin\"></span> AI skládá týden…";
    try {
      const res = await api("coach/ai-week", { method: "POST", body: JSON.stringify({ text: t }) });
      hist.push({ role: "user", text: `🤖 AI návrh týdne${t ? `: ${t}` : ""}` });
      hist.push({ role: "assistant", text: res.ok ? `${res.reply} (zátěž ${res.load}, cíl ${res.target.lo}–${res.target.hi})` : res.reply, applied: [...(res.fixed || []).map((x) => `opraveno: ${x}`), ...(res.remaining || []).map((x) => `⚠️ ${x}`)] });
      try { localStorage.setItem(COACH_KEY, JSON.stringify(hist.slice(-20))); } catch {}
    } catch (err) { alert(err.message); }
    keepScroll();
  });
  el.querySelector("#askF").addEventListener("submit", (e) => { e.preventDefault(); const ta = e.target.querySelector("textarea"); ask(ta.value); ta.value = ""; });
  el.querySelector("#askF textarea").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(e.target.value); e.target.value = ""; } });
  el.querySelectorAll("[data-ask]").forEach((b) => b.addEventListener("click", () => ask(b.dataset.ask)));
  el.querySelector("#askClr")?.addEventListener("click", () => { try { localStorage.removeItem(COACH_KEY); } catch {} keepScroll(); });
}


let actFilter = "all";
let actRange = "365"; // "365" | "all" | rok "2024"
let actQuery = "";
let aktView = "list"; // mobil: Seznam | Souhrn roku | Týdenní objem
const isBikeSport = (s) => ["ride", "mtb", "indoor"].includes(s);
/** Řádek aktivity v seznamu. Na mobilu: název přes celou šířku, čísla v jednom řádku pod ním (CSS). */
const actRowHtml = (a) => `<a class="arow" href="#/aktivita/${a.id}"><span class="aico">${SPORT_ICON[a.sport] || "🏅"}</span><span class="aname"><b>${esc(a.name || SPORT_NAME[a.sport])}</b><span class="sub">${dayDm(a.date)}${a.date.slice(0, 4) !== String(new Date().getFullYear()) ? a.date.slice(0, 4) : ""} · ${esc(SPORT_NAME[a.sport] || a.sport)}${a.company ? ` · 👥 ${esc(a.company === "skupina" ? "skupina" : a.company)}` : ""}${a.plan_name ? ` · plán ${a.icu_compliance ? `${num(a.icu_compliance)} %` : "✓"}` : a.is_quality ? " · kvalita" : ""}</span></span><span class="astats"><span class="am">${a.distance_m ? `<b>${num(a.distance_m / 1000, 1)}</b> km · ` : ""}<b>${hmm(a.moving_s)}</b> h</span><span class="sub">${isBikeSport(a.sport) && (a.np || a.avg_power) ? `<b class="pw">${num(a.np || a.avg_power)} W</b> · ` : ""}${a.avg_hr ? `${num(a.avg_hr)} bpm · ` : ""}zátěž ${num(a.load)}</span></span></a>`;
async function pageAktivity(el) {
  const [acts, ride, y] = await Promise.all([api("activities?days=" + (actRange === "365" ? "365" : "all")), api("ride"), api("year")]);
  const yk = y.yearKm;
  const groupOf = (a) => (isBikeSport(a.sport) ? "kolo" : a.sport);
  const inRange = acts.filter((a) => actRange === "365" || actRange === "all" || a.date.startsWith(actRange));
  const sports = [...new Set(inRange.map(groupOf))];
  const years = [...new Set(y.years.map((r) => r.y))];
  const rowHtml = actRowHtml;
  const listHtml = () => {
    const q = actQuery.trim().toLowerCase();
    const list = inRange.filter((a) => (actFilter === "all" || groupOf(a) === actFilter) && (!q || (a.name || "").toLowerCase().includes(q)));
    let month = "";
    const out = list.map((a) => { const m = a.date.slice(0, 7); const head = m !== month ? `<div class="mhead">${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}</div>` : ""; month = m; return head + rowHtml(a); }).join("");
    const km = list.reduce((t, a) => t + (a.distance_m || 0), 0) / 1000, s = list.reduce((t, a) => t + (a.moving_s || 0), 0), up = list.reduce((t, a) => t + (a.elev_gain || 0), 0);
    return `<div class="asum">${list.length} aktivit · ${thou(km)} km · ${hmm(s)} h · ↑ ${thou(up)} m</div>${out || '<div class="empty">Nic nenalezeno.</div>'}`;
  };
  const pct = yk.goal ? Math.min(100, (yk.km / yk.goal) * 100) : null;
  const sportRows = (rows) => rows.map((s) => `<tr><td>${SPORT_ICON[s.sport] || ""} ${esc(SPORT_NAME[s.sport] || s.sport)}</td><td class="r">${s.n}</td><td class="r">${hmm(s.s)} h</td><td class="r">${s.km ? num(s.km) : DASH}</td><td class="r">${s.up ? thou(s.up) : DASH}</td></tr>`).join("");
  const head5 = `<tr><th>Sport</th><th class="r">Počet</th><th class="r">Čas</th><th class="r">km</th><th class="r">↑ m</th></tr>`;
  const past = years.filter((x) => x !== yk.year).map((yy) => {
    const rows = y.years.filter((r) => r.y === yy);
    const bike = rows.filter((r) => isBikeSport(r.sport)).reduce((t, r) => t + (r.km || 0), 0);
    return `<details class="yr"><summary><b>${yy}</b><span>${thou(bike)} km na kole · ${rows.reduce((t, r) => t + r.n, 0)} aktivit · ↑ ${thou(rows.reduce((t, r) => t + (r.up || 0), 0))} m</span></summary><table class="t">${head5}${sportRows(rows)}</table></details>`;
  }).join("");
  // dlaždice: hodnota VČETNĚ jednotky + jasný popis
  const tile = (v, unit, label) => `<div><b>${v}${unit ? `<small> ${unit}</small>` : ""}</b><span>${label}</span></div>`;
  const yearCard = card("ak-year", `🚴 ${yk.year} · souhrn roku`, "Garmin", `
    <div class="sl">Najeto na kole od 1. 1.</div>
    <div class="bignum">${thou(yk.km)}<small> km${yk.goal ? ` z cíle ${thou(yk.goal)} km` : ""}</small></div>
    ${yk.goal ? `<div class="prog big"><i style="width:${pct}%"></i></div><div class="sub">podle plánu bys měl mít ${thou(yk.paceToday)} km · potřeba ${num(yk.perWeekNeeded)} km týdně</div>` : ""}
    <div class="mini-stats yr6">${[
      tile(thou(yk.rides), "", "jízd na kole"),
      tile(thou(yk.up), "m", "převýšení na kole"),
      tile(thou(yk.over100 ?? 0), "", "jízd nad 100 km"),
      tile(num(yk.longest ?? 0), "km", "nejdelší jízda"),
      tile(num(yk.last4wPerWeek), "km", "týdně (průměr 4 týdnů)"),
      tile(thou(yk.projection), "km", "odhad za rok"),
    ].join("")}</div>
    <div class="sl" style="margin:14px 0 4px">Všechny sporty ${yk.year}</div>
    <table class="t">${head5}${sportRows(y.bySport)}</table>
    ${past ? `<div class="yrs"><div class="sl" style="margin:14px 0 6px">Předchozí roky</div>${past}</div>` : ""}`);
  const rangeBtns = [["365", "365 dní"], ["all", "Vše"], ...years.map((x) => [x, x])];
  el.innerHTML = `<div class="head"><div><h1>Aktivity</h1><div class="sub">${actRange === "365" ? "posledních 365 dní" : actRange === "all" ? "celá historie z Garminu" : `rok ${actRange}`} · výkon = NP (normalizovaný)</div></div></div>
  <div class="seg mob-only akseg">${[["list", "Seznam"], ["year", "Souhrn roku"], ["vol", "Týdenní objem"]].map(([k, l]) => `<button class="${aktView === k ? "on" : ""}" data-av="${k}">${l}</button>`).join("")}</div>
  <div class="grid aktgrid" data-view="${aktView}">
   <div class="c7 col ak-list">${card("", "", "", `<div class="afilt"><select id="arange">${rangeBtns.map(([k, l]) => `<option value="${k}" ${actRange === k ? "selected" : ""}>${l}</option>`).join("")}</select><input id="aq" type="search" placeholder="Hledat podle názvu…" value="${esc(actQuery)}"></div>
     <div class="filters">${["all", ...sports].map((s) => `<button class="${actFilter === s ? "on" : ""}" data-f="${s}">${s === "all" ? "Vše" : s === "kolo" ? "🚴 Cyklistika" : `${SPORT_ICON[s] || ""} ${SPORT_NAME[s] || s}`}</button>`).join("")}</div><div class="alist" id="alist">${listHtml()}</div>`)}</div>
   <div class="c5 col">${yearCard}
   ${card("ak-vol", "Týdenní objem na kole · 26 týdnů", "Garmin", `<div class="sl">Kilometry</div>` + barChart({ x: ride.weeks.map((w) => w.from), xfmt: dm, bars: ride.weeks.map((w) => ({ v: w.km, color: "var(--acc)" })), fmt: (v) => num(v) + " km", yfmt: (v) => num(v), height: 150, tipFn: (i) => { const w = ride.weeks[i]; return `<b>týden od ${dm(w.from)}</b><div>${num(w.km)} km · ${num(w.h, 1)} h · zátěž ${num(w.load)} · ${w.n} jízd</div>`; } }) + `<div class="sl" style="margin-top:12px">Hodiny</div>` + barChart({ x: ride.weeks.map((w) => w.from), xfmt: dm, bars: ride.weeks.map((w) => ({ v: w.h, color: "var(--z2)" })), fmt: (v) => num(v, 1) + " h", yfmt: (v) => num(v) + " h", height: 150, tipFn: (i) => { const w = ride.weeks[i]; return `<b>týden od ${dm(w.from)}</b><div>${num(w.h, 1)} h · ${num(w.km)} km · zátěž ${num(w.load)} · ${w.n} jízd</div>`; } }) + `<p class="note">Kilometry a hodiny na kole za týden; detail po najetí nebo dotyku.</p>`)}
   </div></div>`;
  el.querySelectorAll("[data-av]").forEach((b) => b.addEventListener("click", () => {
    aktView = b.dataset.av;
    el.querySelector(".aktgrid").dataset.view = aktView;
    el.querySelectorAll("[data-av]").forEach((x) => x.classList.toggle("on", x === b));
    hydrate(el);
  }));
  el.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => { actFilter = b.dataset.f; pageAktivity(el); }));
  el.querySelector("#arange").addEventListener("change", (e) => { actRange = e.target.value; actFilter = "all"; pageAktivity(el); });
  el.querySelector("#aq").addEventListener("input", (e) => { actQuery = e.target.value; el.querySelector("#alist").innerHTML = listHtml(); });
}

/** Panely průběhu aktivity (pořadí = pořadí v grafu). */
function streamPanels(s, sport) {
  const has = (a) => a && a.some((v) => v != null && v !== 0);
  const run = sport === "run";
  return [
    has(s.hr) ? { key: "hr", name: "Tep", unit: "bpm", values: s.hr, color: "var(--bad)" } : null,
    has(s.watts) ? { key: "w", name: "Výkon", unit: "W", values: s.watts, color: "var(--acc)", smooth: 3 } : null,
    has(s.speed) ? { key: "v", name: run ? "Rychlost" : "Rychlost", unit: "km/h", values: s.speed, color: "var(--z2)", dec: 1, smooth: 2 } : null,
    has(s.cad) ? { key: "c", name: "Kadence", unit: run ? "kr/min" : "ot/min", values: s.cad.map((v) => (v ? v : null)), color: "var(--z7)", smooth: 2 } : null,
    has(s.alt) ? { key: "a", name: "Nadm. výška", unit: "m", values: s.alt, color: "var(--muted)", area: true } : null,
    has(s.resp) ? { key: "r", name: "Dechová frekvence", unit: "dech/min", values: s.resp, color: "var(--z3)", dec: 0, smooth: 2 } : null,
    has(s.temp) ? { key: "t", name: "Teplota", unit: "°C", values: s.temp, color: "var(--z4)", dec: 1 } : null,
    has(s.perf) ? { key: "p", name: "Výkonnostní stav (Garmin)", unit: "", values: s.perf, color: "var(--z5)", signed: true } : null,
    has(s.alt) && s.dist && s.dist.some((v) => v > 500) ? { key: "g", name: "Výška a sklon", unit: "m", values: s.alt, color: "var(--muted)", grade: gradeOf(s.alt, s.dist) } : null,
  ].filter(Boolean).filter((p, _, arr) => !(p.key === "a" && arr.some((x) => x.key === "g")));
}

/** sklon v % na úseku ±50 m kolem bodu (vyhlazený, ať GPS výška nedělá skoky) */
function gradeOf(alt, dist) {
  // body průběhu bývají po ~90 m → okno aspoň ±80 m a vždy aspoň jeden bod na každé straně
  const n = alt.length, out = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (dist[i] == null || alt[i] == null) continue;
    let a = i, b = i;
    while (a > 0 && (a === i || dist[i] - dist[a] < 80) && dist[a - 1] != null && alt[a - 1] != null) a--;
    while (b < n - 1 && (b === i || dist[b] - dist[i] < 80) && dist[b + 1] != null && alt[b + 1] != null) b++;
    const dd = dist[b] - dist[a];
    if (dd >= 40) out[i] = clamp(((alt[b] - alt[a]) / dd) * 100, -25, 25);
  }
  // lehké vyhlazení (3 body), ať jeden skok výšky z GPS nebarví úsek
  return out.map((g, i) => { const w = [out[i - 1], g, out[i + 1]].filter((x) => x != null); return g == null ? null : w.reduce((x, y) => x + y, 0) / w.length; });
}
/** třídy sklonu: barva a popis (klesání modře, rovina šedozeleně, stoupání žlutá → červená) */
// Výška a sklon: stoupání v barvách Garmin ClimbPro (4. kat. zelená → HC vínová), klesání modře, rovina šedě.
// Barvy přes CSS proměnné → ve tmavém režimu světlejší odstíny jako v ClimbPro „Tma“.
const GRADE_CLS = [
  [-Infinity, -8, "var(--g-d2)", "klesání přes 8 %"], [-8, -3, "var(--g-d1)", "klesání 3–8 %"], [-3, 1, "var(--g-flat)", "rovina −3 až +1 %"],
  [1, 3, "var(--g-c4)", "4. kat. 1–3 %"], [3, 6, "var(--g-c3)", "3. kat. 3–6 %"], [6, 9, "var(--g-c2)", "2. kat. 6–9 %"], [9, 12, "var(--g-c1)", "1. kat. 9–12 %"], [12, Infinity, "var(--g-hc)", "HC přes 12 %"],
];
const gradeIdx = (g) => GRADE_CLS.findIndex(([lo, hi]) => g >= lo && g < hi);

/** hlavní průběhy (vždy vidět) a doplňkové (kadence, dech, teplota, výkonnostní stav – na kliknutí) */
// výška a sklon nahrazuje graf nadmořské výšky; bez vzdálenosti (trenažér) zůstane obyčejná výška
const STREAM_MAIN = ["hr", "w", "v", "g", "a"], STREAM_EXTRA = ["c", "r", "t", "p"];
function streamsChart(s, opts = {}) {
  if (!opts.W) return sized((W) => streamsChart(s, { ...opts, W }));
  // sdílená osa (km nebo min), panely pod sebou, jeden kurzor
  const useKm = s.dist && s.dist.some((v) => v > 100);
  const xs = useKm ? s.dist.map((v) => (v == null ? null : v / 1000)) : s.t.map((v) => v / 60);
  const panels = streamPanels(s, opts.sport).filter((p) => !opts.only || opts.only.includes(p.key));
  if (!panels.length) return `<div class="empty">Průběh nemám.</div>`;
  const W = opts.W || 760, GAP = 20, P = { l: W < 500 ? 30 : 44, r: W < 500 ? 4 : 10, t: 12, b: 24 };
  const PH = opts.H ? Math.max(70, (opts.H - P.t - P.b - GAP * (panels.length - 1)) / panels.length) : W < 500 ? 80 : 100;
  const H = P.t + panels.length * (PH + GAP) - GAP + P.b;
  const n = xs.length;
  const xmax = Math.max(...xs.filter((v) => v != null)), xmin = Math.min(...xs.filter((v) => v != null));
  const X = (v) => P.l + ((v - xmin) / (xmax - xmin || 1)) * (W - P.l - P.r);
  const id = uid("s");
  let svg = "", defs = "";
  const Ys = [];
  panels.forEach((p, pi) => {
    let vals = p.values;
    if (p.smooth) vals = vals.map((_, i) => { let s2 = 0, k = 0; for (let j = Math.max(0, i - p.smooth); j <= Math.min(n - 1, i + p.smooth); j++) if (vals[j] != null) { s2 += vals[j]; k++; } return k ? s2 / k : null; });
    const ok = vals.filter((v) => v != null).sort((a, b) => a - b);
    // rozsah podle dat (2.–99,5. percentil), ať je stupnice jemná a výkyvy nedeformují osu; výkon od 0
    let mn = ok[Math.floor(ok.length * 0.02)] ?? ok[0], mx = Math.max(ok[Math.floor(ok.length * 0.995)] ?? ok[ok.length - 1], ok[ok.length - 1] * (p.key === "w" ? 0.8 : 1));
    if (p.key === "w") mn = 0;
    if (p.key === "p") { mn = Math.min(-3, mn); mx = Math.max(3, mx); }
    const pad = (mx - mn) * 0.08 || 1; mx += pad; if (p.key !== "w") mn = p.key === "v" || p.key === "c" ? Math.max(0, mn - pad) : mn - pad;
    vals = vals.map((v) => (v == null ? null : clamp(v, mn, mx)));
    const y0 = P.t + pi * (PH + GAP);
    const Y = (v) => y0 + (1 - (v - mn) / (mx - mn)) * PH;
    Ys.push({ Y, vals, p });
    const segs = runs(vals.map((v, i) => (xs[i] == null ? null : v)), (i) => X(xs[i]), Y);
    const d = segs.map((s2) => curvePath(s2)).join("");
    const gid = `${id}g${pi}`;
    defs += `<linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${p.color}" stop-opacity=".3"/><stop offset="1" stop-color="${p.color}" stop-opacity=".05"/></linearGradient>`;
    const firstI = vals.findIndex((v) => v != null), lastI = n - 1 - [...vals].reverse().findIndex((v) => v != null);
    svg += `<text class="pl" x="${P.l}" y="${y0 - 2}">${p.name}${p.unit ? ` (${p.unit})` : ""}</text>`;
    for (const t of niceTicks(mn, mx, PH > 140 ? 6 : 4)) svg += `<line class="gl" x1="${P.l}" x2="${W - P.r}" y1="${Y(t)}" y2="${Y(t)}"/><text class="yl" x="${P.l - 6}" y="${Y(t) + 4}" text-anchor="end">${p.signed ? signed(t) : num(t)}</text>`;
    // tep a výkon: plocha obarvená podle zón (jako v Garminu), ostatní jednou barvou
    const zf = p.key === "hr" && s.hrFloors ? (v) => hrZoneIdx(v, s.hrFloors) : p.key === "w" && s.pwrTops ? (v) => pwrZoneIdx(v, s.pwrTops) : null;
    if (p.grade) {
      // profil výšky obarvený podle sklonu (plocha i čára v barvě třídy sklonu)
      const zpts = [];
      segs.forEach((sg) => sg.forEach((q, k) => { const g = p.grade[q.i]; zpts.push({ x: q.x, y: q.y, z: g == null ? 2 : gradeIdx(g), gap: k === 0 && zpts.length > 0 }); }));
      // jako tep / výkon: barevná čára a pod ní jen jemný slábnoucí stín v barvě úseku
      const gc = GRADE_CLS.map((c) => c[2]);
      const gid2 = `${id}gs${pi}`;
      defs += `<linearGradient id="${gid2}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--muted)" stop-opacity=".18"/><stop offset="1" stop-color="var(--muted)" stop-opacity=".03"/></linearGradient>`;
      svg += segs.filter((sg) => sg.length > 1).map((sg) => `<path d="M${sg[0].x.toFixed(1)},${y0 + PH}${curvePath(sg, false)}L${sg[sg.length - 1].x.toFixed(1)},${y0 + PH}Z" fill="url(#${gid2})"/>`).join("");
      svg += zoneFill(zpts, y0 + PH, gc.map((c, k) => (k === 2 ? "transparent" : c)), y0);
      let gi = 0;
      while (gi < zpts.length - 1) {
        let gj = gi;
        while (gj + 1 < zpts.length && !zpts[gj + 1].gap && zpts[gj + 1].z === zpts[gi].z) gj++;
        const end = gj + 1 < zpts.length && !zpts[gj + 1].gap ? gj + 1 : gj;
        if (end > gi) svg += `<path d="${curvePath(zpts.slice(gi, end + 1))}" fill="none" stroke="${gc[zpts[gi].z]}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
        gi = end > gi ? end : gi + 1;
      }
      p.zc = GRADE_CLS.map((c) => c[2]);
      p.zf = null;
    } else if (zf) {
      // čára obarvená plynule podle zón (bez výplně po zónách a bez čar hranic)
      p.zc = p.key === "hr" ? HR_ZC : PWR_ZC;
      p.zf = zf;
      const bounds = p.key === "hr" ? s.hrFloors : s.pwrTops.map((t) => t + 0.5);
      // podbarvení pod čarou barvou zóny (jako rychlost / výška, jen v barvě zóny bodu)
      const zpts = [];
      segs.forEach((sg) => sg.forEach((q, k) => zpts.push({ x: q.x, y: q.y, z: zf(vals[q.i]), gap: k === 0 && zpts.length > 0 })));
      svg += zoneLine(d, Y, mn, mx, bounds, p.zc, y0 + PH, X(xs[firstI]), X(xs[lastI]), 2.4, zpts);
    } else {
      const ad = segs.filter((sg) => sg.length > 1).map((sg) => `M${sg[0].x.toFixed(1)},${y0 + PH}${curvePath(sg, false)}L${sg[sg.length - 1].x.toFixed(1)},${y0 + PH}Z`).join("");
      svg += `<path d="${ad}" fill="url(#${gid})"/><path d="${d}" fill="none" stroke="${p.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
  });
  let xl = "";
  for (const t of niceTicks(xmin, xmax, 6)) xl += `<text class="xl" x="${X(t)}" y="${H - 6}" text-anchor="middle">${num(t)}${useKm ? " km" : " min"}</text>`;
  const fmtT = (sec) => `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
  bindHover(id, W, (cx) => {
    const v = xmin + ((cx - P.l) / (W - P.l - P.r)) * (xmax - xmin);
    let best = 0, bd = Infinity;
    for (let i = 0; i < n; i++) if (xs[i] != null && Math.abs(xs[i] - v) < bd) { bd = Math.abs(xs[i] - v); best = i; }
    return best;
  }, (i) => X(xs[i]), (i) => (mapHover?.(i / Math.max(1, n - 1)), {
    html: `<b>${useKm ? num(xs[i], 1) + " km · " : ""}${fmtT(s.t[i])}</b>` + Ys.map(({ p, vals }) => { if (p.grade) { const g = p.grade[i]; return `<div><span class="sw" style="background:${g == null ? p.color : GRADE_CLS[gradeIdx(g)][2]}"></span>Sklon <b>${g == null ? DASH : signed(g, 1) + " %"}</b> · ${num(p.values[i])} m</div>`; } const zi = p.zf && vals[i] != null ? p.zf(vals[i]) : null; return `<div><span class="sw" style="background:${zi != null ? p.zc[zi] : p.color}"></span>${p.name} <b>${p.values[i] == null ? DASH : num(p.values[i], p.dec || 0) + " " + p.unit}</b>${zi != null ? ` · Z${zi + 1}` : ""}</div>`; }).join(""),
    dots: Ys.filter(({ vals }) => vals[i] != null).map(({ Y, vals, p }) => ({ y: Y(vals[i]), c: p.grade ? (p.grade[i] == null ? p.color : GRADE_CLS[gradeIdx(p.grade[i])][2]) : p.zf ? p.zc[p.zf(vals[i])] : p.color })),
  }));
  const leg = "";
  return `<svg class="chart streams" id="${id}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${defs}</defs>${svg}<line class="cur" y1="${P.t}" y2="${H - P.b}"/><g class="dots"></g>${xl}</svg>${opts.noLegend ? "" : leg}`;
}

/** 1. vs. 2. polovina jízdy: tep, výkon, decoupling, drift, výkon na konci Z2 tepu. */
function halvesHtml(h, a) {
  const rows = [];
  if (h) {
    rows.push(["❤️ Průměrný tep", `${num(h.hr[0])} bpm`, `${num(h.hr[1])} bpm`, signed(h.hr[1] - h.hr[0]) + " bpm"]);
    if (h.w) rows.push(["⚡ Průměrný výkon", `${num(h.w[0])} W`, `${num(h.w[1])} W`, signed(h.w[1] - h.w[0]) + " W"]);
    else if (h.spd) rows.push(["🚀 Průměrná rychlost", `${num(h.spd[0], 1)} km/h`, `${num(h.spd[1], 1)} km/h`, signed(h.spd[1] - h.spd[0], 1)]);
    if (h.ef) rows.push([h.w ? "⚖️ Výkon / tep <small>W na 1 tep</small>" : "⚖️ Rychlost / tep", num(h.ef[0], h.w ? 2 : 3), num(h.ef[1], h.w ? 2 : 3), h.ef[0] ? signed(((h.ef[1] - h.ef[0]) / h.ef[0]) * 100, 1) + " %" : ""]);
  }
  const table = rows.length ? `<table class="t halvest"><tr><th></th><th class="r">1. polovina</th><th class="r">2. polovina</th></tr>${rows.map((r) => `<tr><td><b>${r[0]}</b></td><td class="r">${r[1]}</td><td class="r">${r[2]}</td><td hidden class="r">${r[3]}</td></tr>`).join("")}</table>` : `<div class="empty">Na rozdělení na poloviny je aktivita krátká.</div>`;
  const dec = a.icuDecoupling != null ? a.icuDecoupling : h ? h.dec : null;
  const decTone = dec == null ? "" : Math.abs(dec) < 5 ? "good" : dec <= 8 ? "warn" : "bad";
  const tiles = [
    dec != null ? stat("Decoupling", signed(dec, 1), " %", `${a.icuDecoupling != null ? "intervals.icu" : "z průběhu"} · pod 5 % = dobrá vytrvalost`, decTone) : "",
    a.drift != null ? stat("Aerobní drift", num(a.drift, 1), " %", "Garmin průběh, ustálená část", Math.abs(a.drift) < 5 ? "good" : a.drift <= 8 ? "warn" : "bad") : "",
    a.z2Power ? stat("Výkon na konci Z2", num(a.z2Power.w), " W", `při ${a.z2Power.hr} bpm · ${num(a.z2Power.min)} min v Z2`, "") : "",
  ].join("");
  return `${tiles ? `<div class="stats halves">${tiles}</div>` : ""}${table}<p class="note">Decoupling = o kolik % klesl výkon na jeden tep ve 2. polovině. Pod 5 % je aerobní základ dobrý, nad 8 % únava, horko nebo málo jídla. Výkon na konci Z2 = výkon, který tě v této aktivitě stál tep ${a.z2Power ? a.z2Power.hr : "na horní hranici Z2"} (výkon/tep v Z2 × hranice Z2) – roste-li v čase, zlepšuje se vytrvalost.</p>`;
}

/** Další údaje aktivity z Garminu (bod: max. rychlost, kadence, otáčky, dech, kalorie, výška). */
function extraHtml(a) {
  const x = a.extra || {};
  const run = a.sport === "run";
  const rows = [
    x.max_speed ? ["🚀 Rychlost ⌀ / max", `${num(x.avg_speed, 1)} / ${num(x.max_speed, 1)} km/h`] : null,
    a.avgCad ? [run ? "👟 Kadence ⌀ / max" : "🔄 Kadence ⌀ / max", `${num(x.run_cad || a.avgCad)} / ${num(x.max_cad)} ${run ? "kr/min" : "ot/min"}`] : null,
    x.strokes ? [run ? "👟 Kroků celkem" : "🔄 Otáček celkem", thou(x.strokes)] : a.avgCad && a.moving && !run ? ["🔄 Otáček celkem (odhad)", thou((a.avgCad * a.moving) / 60)] : null,
    x.avg_resp ? ["🫁 Dech ⌀ / min / max", `${num(x.avg_resp)} / ${num(x.min_resp)} / ${num(x.max_resp)} /min`] : null,
    a.calories ? ["🔥 Kalorie", `${thou(a.calories)} kcal`] : null,
    x.min_elev != null || x.max_elev != null ? ["⛰️ Výška min / max", `${num(x.min_elev)} / ${num(x.max_elev)} m n. m.`] : null,
    a.elevGain ? ["↕️ Stoupání / klesání", `${num(a.elevGain)} / ${num(x.elev_loss)} m`] : null,
    a.minTemp != null || a.maxTemp != null ? ["🌡️ Teplota min / ⌀ / max", { html: `${num(a.minTemp)} / <em id="tAvg" class="tavg">…</em> / ${num(a.maxTemp)} °C` }] : null,
    a.aerobicTe != null ? ["💚 Aerobní efekt", { html: `${num(a.aerobicTe, 1)} <small>${teWord(a.aerobicTe)}</small>` }] : null,
    x.ana_te != null ? ["💥 Anaerobní efekt", { html: `${num(x.ana_te, 1)} <small>${teWord(x.ana_te)}</small>` }] : null,
    x.te_label ? ["🎯 Hlavní přínos", { html: TE_LABEL[x.te_label] ? `${TE_LABEL[x.te_label][0]} <small>${TE_LABEL[x.te_label][1]}</small>` : esc(x.te_label) }] : null,
  ].filter(Boolean);
  return rows.length ? `<div class="abasics">${rows.map(([k, v]) => `<div><span>${k}</span><b>${v && typeof v === "object" ? v.html : esc(v)}</b></div>`).join("")}</div>` : `<div class="empty">Další údaje nemám.</div>`;
}
// hlavní přínos aktivity podle Garminu: [název, skupina zátěže] – skupiny stejně jako graf zátěže na Kondici
const TE_LABEL = { RECOVERY: ["Regenerace", "nízko aerobní"], AEROBIC_BASE: ["Základ", "nízko aerobní"], TEMPO: ["Tempo", "vysoce aerobní"], LACTATE_THRESHOLD: ["Práh", "vysoce aerobní"], VO2MAX: ["VO2 max", "vysoce aerobní"], ANAEROBIC_CAPACITY: ["Anaerobní kapacita", "anaerobní"], SPEED: ["Sprint", "anaerobní"] };
// stupnice tréninkového efektu Garmin 0–5
const teWord = (v) => (v < 1 ? "bez přínosu" : v < 2 ? "malý přínos" : v < 3 ? "udržuje" : v < 4 ? "zlepšuje" : v < 5 ? "výrazně zlepšuje" : "přetížení");

let lapMode = "plan";
function lapsHtml(a, s) {
  const tbl = a.laps.show
    ? `<table class="t"><tr><th>Okruh</th><th class="r">Čas</th>${a.hasPower ? '<th class="r">Výkon</th>' : ""}<th class="r">Tep ⌀/max</th></tr>${a.laps.rows.map((r) => `<tr class="${r.iv ? "iv" : ""}"><td><b>${esc(r.name)}</b><span class="s2">${esc(r.sub)}</span></td><td class="r">${r.time}</td>${a.hasPower ? `<td class="r">${r.power}</td>` : ""}<td class="r">${r.hr}</td></tr>`).join("")}</table><p class="note">${esc(a.laps.note)}</p>`
    : `<div class="empty">${esc(a.laps.note || "Tréninkové okruhy nejsou – vyber okruhy po km.")}</div>`;
  const sp = s && s.splits ? s.splits : {};
  const modes = [["plan", "Tréninkové"], ...["1", "5", "10"].filter((k) => sp[k] && sp[k].length > 1).map((k) => [k, `po ${k} km`])];
  // tréninkové okruhy chybí (Garmin ani intervals.icu je nedaly) → rovnou po 10 km (jinak 5 / 1 km), ať to není prázdné
  const fallback = ["10", "5", "1"].find((k) => sp[k] && sp[k].length > 1);
  const mode = modes.some(([k]) => k === lapMode) && !(lapMode === "plan" && !a.laps.show) ? lapMode : a.laps.show ? "plan" : fallback || "plan";
  const run = a.sport === "run";
  let body = tbl;
  if (mode !== "plan") {
    const rows = sp[mode];
    const best = Math.max(...rows.map((r) => r.kmh));
    const hasW = rows.some((r) => r.w), hasCad = rows.some((r) => r.cad);
    const pace = (kmh) => `${Math.floor(60 / kmh)}:${String(Math.round(((60 / kmh) % 1) * 60)).padStart(2, "0")}`;
    // jednotky jen v záhlaví, čísla zarovnaná; kadence na mobilu skrytá (class hm)
    body = `<div class="tscroll"><table class="t splits"><tr><th>km</th><th class="r">čas</th><th class="r">${run ? "min/km" : "km/h"}</th>${hasW ? '<th class="r">W</th>' : ""}<th class="r">tep</th>${hasCad ? `<th class="r hm">${run ? "kr/min" : "ot/min"}</th>` : ""}<th class="r">↑ m</th></tr>${rows.map((r) => `<tr class="${r.kmh === best ? "iv" : ""}"><td><b>${num(r.km, r.km % 1 ? 1 : 0)}</b></td><td class="r">${mmss(r.s)}</td><td class="r">${run ? pace(r.kmh) : num(r.kmh, 1)}</td>${hasW ? `<td class="r"><b>${num(r.w)}</b></td>` : ""}<td class="r">${num(r.hr)}</td>${hasCad ? `<td class="r hm">${num(r.cad)}</td>` : ""}<td class="r">${num(r.up)}</td></tr>`).join("")}</table></div><p class="note">Okruhy spočítané z průběhu aktivity, zvýrazněný je nejrychlejší. Výkon a tep = průměr okruhu.</p>`;
  }
  return `${modes.length > 1 ? `<div class="seg sm" id="lapseg">${modes.map(([k, l]) => `<button class="${mode === k ? "on" : ""}" data-lap="${k}">${l}</button>`).join("")}</div>` : ""}${body}`;
}

/** Leaflet (OpenStreetMap) se načte až při první mapě. */
let leafletP = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletP) return leafletP;
  leafletP = new Promise((res, rej) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    js.onload = () => res(window.L); js.onerror = () => rej(new Error("Mapu se nepodařilo načíst."));
    document.head.appendChild(js);
  });
  return leafletP;
}
/** Barvy zón z CSS proměnných (Leaflet potřebuje skutečnou barvu, ne var()). */
const cssColor = (v) => { const m = /^var\((--[\w-]+)\)$/.exec(v); return m ? getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || "#888" : v; };
let mapMode = null; // "w" | "hr" | "spd" | "alt"
const MAP_MODES = { w: [4, "Výkon", "W"], hr: [3, "Tep", "bpm"], spd: [2, "Rychlost", "km/h"], alt: [5, "Výška", "m n. m."] };
let mapKeyP = null;
const mapKeys = () => (mapKeyP ||= api("mapkey").catch(() => ({})));
const isDark = () => { const t = document.documentElement.getAttribute("data-theme"); return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; };

/** Mapa trasy. route = [[lat, lon, km/h, tep, W, m], …]; barva podle zvoleného ukazatele (výkon a tep v barvách zón). */
async function drawMap(box, s, legBox, modeBox) {
  const route = s.route;
  const [L, keys] = await Promise.all([loadLeaflet(), mapKeys()]);
  const key = keys.mapy || null;
  box.innerHTML = "";
  // výška mapy podle tvaru trasy → trasa vyplní mapu, bez prázdných okrajů (šířka/výška v Mercatoru ≈ Δlon·cos(lat) / Δlat)
  const lats = route.map((p) => p[0]), lons = route.map((p) => p[1]);
  const la0 = Math.min(...lats), la1 = Math.max(...lats), lo0 = Math.min(...lons), lo1 = Math.max(...lons);
  const ratio = clamp(((lo1 - lo0) * Math.cos((((la0 + la1) / 2) * Math.PI) / 180)) / Math.max(1e-5, la1 - la0), 0.5, 3);
  const bw = box.clientWidth || 600;
  const maxH = innerWidth >= 1180 ? Math.min(620, innerHeight * 0.7) : innerWidth > 760 ? 460 : Math.min(440, innerHeight * 0.55);
  box.style.height = `${Math.round(clamp((bw / ratio) * 1.06 + 24, 240, maxH))}px`;
  let soft = false;
  try { soft = localStorage.getItem("mapSoft3") === "1"; } catch {} // jemná mapa je tlumená sama, zesvětlení jen na požádání
  box.classList.toggle("soft", soft);
  // PC: kolečko myši; mobil: dvěma prsty (jedním prstem se dál posouvá stránka)
  // plynulý zoom: zlomkové úrovně (kolečko, dva prsty i trasa na celé okno), tlačítka +/− po půl úrovni
  const map = L.map(box, { scrollWheelZoom: true, wheelPxPerZoomLevel: 140, wheelDebounceTime: 20, touchZoom: true, dragging: !L.Browser.mobile, tap: false, attributionControl: true, zoomSnap: 0.05, zoomDelta: 0.5 });
  const layers = {};
  const dark = isDark();
  // jemný podklad (pastelové barvy, tlumené popisky) – jako TomTom / Apple; v tmavém režimu tmavý
  if (keys.tomtom) layers["TomTom jemná"] = L.tileLayer(`https://api.tomtom.com/map/1/tile/basic/${dark ? "night" : "main"}/{z}/{x}/{y}.png?key=${encodeURIComponent(keys.tomtom)}&tileSize=256`, { maxZoom: 20, attribution: "© TomTom" });
  layers["Jemná (CARTO)"] = L.tileLayer(`https://{s}.basemaps.cartocdn.com/rastertiles/${dark ? "dark_all" : "voyager"}/{z}/{x}/{y}{r}.png`, { maxZoom: 20, subdomains: "abcd", attribution: "© OpenStreetMap, © CARTO" });
  if (key) {
    // dlaždice @2x zobrazené jako 256 px: ostré i na retině, popisky běžné velikosti
    const mapy = (set) => L.tileLayer(`https://api.mapy.com/v1/maptiles/${set}/256@2x/{z}/{x}/{y}?apikey=${encodeURIComponent(key)}`, { maxZoom: 19, tileSize: 256, attribution: '<a href="https://api.mapy.com/copyright" target="_blank" rel="noopener">© Seznam.cz a.s. a další</a>' });
    layers["Mapy.com turistická"] = mapy("outdoor");
    layers["Mapy.com základní"] = mapy("basic");
    layers["Mapy.com letecká"] = mapy("aerial");
  }
  layers["OpenStreetMap"] = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" });
  layers["CyclOSM (cyklo)"] = L.tileLayer("https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap, CyclOSM" });
  layers["Turistická (vrstevnice)"] = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17, attribution: "© OpenStreetMap, OpenTopoMap" });
  let saved = null;
  try { saved = localStorage.getItem("mapLayer3"); } catch {}
  const first = layers[saved] ? saved : layers["Mapy.com základní"] ? "Mapy.com základní" : Object.keys(layers)[0];
  layers[first].addTo(map);
  L.control.layers(layers, {}, { position: "topright" }).addTo(map);
  // logo Mapy.com (podmínka používání), jen když je vrstva Mapy.com zapnutá
  const logo = L.control({ position: "bottomleft" });
  logo.onAdd = () => { const d = L.DomUtil.create("div"); d.innerHTML = '<a href="https://mapy.com/" target="_blank" rel="noopener"><img src="https://api.mapy.com/img/api/logo.svg" alt="Mapy.com" style="height:30px;display:block"></a>'; return d; };
  const syncLogo = (name) => { if (name.startsWith("Mapy.com")) logo.addTo(map); else logo.remove(); };
  syncLogo(first);
  // noční mapa: ve tmavém režimu se světlý podklad (Mapy.com, OSM…) převrátí do tmavých barev; trasa zůstává
  const syncNight = (name) => box.classList.toggle("night", dark && !/CARTO|TomTom/.test(name));
  syncNight(first);
  map.on("baselayerchange", (e) => { try { localStorage.setItem("mapLayer3", e.name); } catch {} syncLogo(e.name); syncNight(e.name); });
  // ⤢ vycentrovat trasu (po přiblížení zpět na celou trasu, stejně jako po otevření)
  const fitAll = () => map.fitBounds(L.latLngBounds(route.map((p) => [p[0], p[1]])), { padding: [10, 10] });
  const fitCtl = L.control({ position: "topleft" });
  fitCtl.onAdd = () => { const b = L.DomUtil.create("a", "leaflet-bar mapfit"); b.href = "#"; b.title = "Vycentrovat celou trasu"; b.setAttribute("role", "button"); b.innerHTML = "⤢"; L.DomEvent.on(b, "click", (e) => { L.DomEvent.preventDefault(e); L.DomEvent.stopPropagation(e); fitAll(); }); return b; };
  fitCtl.addTo(map);
  // ◐ zesvětlit podklad (trasa víc vynikne) – malé tlačítko na mapě pod ⤢
  const softCtl = L.control({ position: "topleft" });
  softCtl.onAdd = () => { const b = L.DomUtil.create("a", "leaflet-bar mapfit"); b.href = "#"; b.setAttribute("role", "button"); const upd = () => { b.innerHTML = soft ? "◑" : "◐"; b.title = soft ? "Podklad normální" : "Zesvětlit podklad (trasa víc vynikne)"; b.classList.toggle("on", soft); }; upd(); L.DomEvent.on(b, "click", (e) => { L.DomEvent.preventDefault(e); L.DomEvent.stopPropagation(e); soft = !soft; box.classList.toggle("soft", soft); try { localStorage.setItem("mapSoft3", soft ? "1" : "0"); } catch {} upd(); }); return b; };
  softCtl.addTo(map);

  const has = (k) => route.some((p) => p[MAP_MODES[k][0]] != null);
  const modes = Object.keys(MAP_MODES).filter(has);
  if (!mapMode || !modes.includes(mapMode)) mapMode = has("w") ? "w" : has("hr") ? "hr" : modes[0] || null;
  let lineGroup = L.layerGroup().addTo(map);
  const draw = () => {
    lineGroup.clearLayers();
    let col = () => "#e8650f", leg = "";
    if (mapMode) {
      const idx = MAP_MODES[mapMode][0];
      const vals = route.map((p) => p[idx]).filter((v) => v != null).sort((a, b) => a - b);
      if (mapMode === "w" && s.pwrTops) {
        const zc = PWR_ZC.map(cssColor);
        col = (v) => (v == null ? "#888" : zc[pwrZoneIdx(v, s.pwrTops)]);
        leg = "";
      } else if (mapMode === "hr" && s.hrFloors) {
        const zc = HR_ZC.map(cssColor);
        col = (v) => (v == null ? "#888" : zc[hrZoneIdx(v, s.hrFloors)]);
        leg = "";
      } else {
        const lo = vals[Math.floor(vals.length * 0.05)] ?? 0, hi = vals[Math.floor(vals.length * 0.95)] ?? 1;
        // jedna barva v odstínech: rychlost světle → tmavě modrá, výška písková → oranžová → skoro černá
        const ramp = mapMode === "spd" ? [[199, 225, 255], [79, 155, 236], [24, 82, 168], [8, 38, 92]] : [[247, 214, 150], [240, 138, 36], [158, 62, 14], [38, 22, 14]];
        const mix = (t) => { const x = clamp(t, 0, 1) * (ramp.length - 1), i = Math.min(ramp.length - 2, Math.floor(x)), f = x - i; return `rgb(${ramp[i].map((c, k) => Math.round(c + (ramp[i + 1][k] - c) * f)).join(",")})`; };
        const bucket = (t) => Math.round(clamp(t, 0, 1) * 12) / 12; // 13 odstínů → méně úseků
        col = (v) => (v == null ? "#888" : mix(bucket((v - lo) / (hi - lo || 1))));
        leg = `<span><i style="background:linear-gradient(90deg,${[0, 0.33, 0.66, 1].map(mix).join(",")});width:70px"></i>${MAP_MODES[mapMode][1].toLowerCase()} ${num(lo)}–${num(hi)} ${MAP_MODES[mapMode][2]}</span>`;
      }
      // tmavý lem pod trasou (jako Garmin) → barvy vyniknou i na pestrém podkladu
      L.polyline(route.map((p) => [p[0], p[1]]), { color: "#15130f", weight: 7, opacity: 0.75, lineJoin: "round", lineCap: "round", interactive: false }).addTo(lineGroup);
      // souvislé úseky stejné barvy jako jedna čára (méně prvků = plynulá mapa)
      let seg = [[route[0][0], route[0][1]]], c0 = col(route[1]?.[idx]);
      for (let i = 1; i < route.length; i++) {
        const c = col(route[i][idx]);
        seg.push([route[i][0], route[i][1]]);
        if (c !== c0 || i === route.length - 1) { L.polyline(seg, { color: c0, weight: 4, opacity: 1, lineJoin: "round", lineCap: "round" }).addTo(lineGroup); seg = [[route[i][0], route[i][1]]]; c0 = c; }
      }
    } else {
      L.polyline(route.map((p) => [p[0], p[1]]), { color: "#15130f", weight: 7, opacity: 0.75 }).addTo(lineGroup);
      L.polyline(route.map((p) => [p[0], p[1]]), { color: "#e8650f", weight: 4 }).addTo(lineGroup);
    }
    L.circleMarker([route[0][0], route[0][1]], { radius: 6, color: "#fff", weight: 2, fillColor: "#23955a", fillOpacity: 1 }).addTo(lineGroup).bindTooltip("start");
    L.circleMarker([route[route.length - 1][0], route[route.length - 1][1]], { radius: 6, color: "#fff", weight: 2, fillColor: "#d03c48", fillOpacity: 1 }).addTo(lineGroup).bindTooltip("cíl");
    if (legBox) legBox.innerHTML = leg || !key ? `<div class="legend">${leg}${key ? "" : `<span class="sub">Mapy.com: vlož klíč v Nastavení</span>`}</div>` : "";
  };
  if (modeBox) {
    modeBox.innerHTML = modes.length > 1 ? `<div class="seg sm mapseg">${modes.map((k) => `<button data-mm="${k}" class="${k === mapMode ? "on" : ""}">${MAP_MODES[k][1]}</button>`).join("")}</div>` : "";
    modeBox.querySelectorAll("[data-mm]").forEach((b) => b.addEventListener("click", () => { mapMode = b.dataset.mm; modeBox.querySelectorAll("[data-mm]").forEach((x) => x.classList.toggle("on", x === b)); draw(); }));
  }
  draw();
  fitAll();
  // bod na mapě podle pozice v grafu průběhu (trasa i průběh jsou rovnoměrně vzorkované → podíl délky)
  const dot = L.circleMarker([route[0][0], route[0][1]], { radius: 8, color: "#fff", weight: 3, fillColor: "#e8650f", fillOpacity: 1, interactive: false });
  mapHover = (frac) => {
    if (frac == null) { dot.remove(); return; }
    const p = route[Math.round(clamp(frac, 0, 1) * (route.length - 1))];
    dot.setLatLng([p[0], p[1]]);
    if (!map.hasLayer(dot)) dot.addTo(map);
  };
}
let mapHover = null;

/** Graf přes celou obrazovku; po otočení telefonu se překreslí na šířku. */
function openFullscreen(title, render) {
  const ov = document.createElement("div");
  ov.className = "fs";
  ov.innerHTML = `<div class="fs-head"><b>${esc(title)}</b><span class="sub">otoč telefon na šířku</span><button class="btn" id="fsClose">✕ Zavřít</button></div><div class="fs-body"></div>`;
  document.body.appendChild(ov);
  document.body.classList.add("noscroll");
  // v režimu celé obrazovky prohlížeč kreslí jen tento prvek → tooltip musí být uvnitř, jinak nejsou vidět hodnoty
  ov.appendChild(tip);
  const body = ov.querySelector(".fs-body");
  const draw = () => { const r = body.getBoundingClientRect(); body.innerHTML = render(Math.max(320, Math.round(r.width)), Math.max(260, Math.round(r.height - 30))); };
  draw();
  const onR = () => setTimeout(draw, 150);
  addEventListener("resize", onR);
  try { ov.requestFullscreen?.().then(() => screen.orientation?.lock?.("landscape").catch(() => {})).catch(() => {}); } catch {}
  const close = () => { removeEventListener("resize", onR); try { if (document.fullscreenElement) document.exitFullscreen(); } catch {} document.body.appendChild(tip); ov.remove(); document.body.classList.remove("noscroll"); hideTip(); };
  ov.querySelector("#fsClose").addEventListener("click", close);
}

async function pageAktivita(el, id) {
  const a = await api("activity/" + id);
  const statsTop = a.basics.filter(([k]) => !/Splnění plánu/.test(k)).slice(0, 8).map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join("");
  const gearSel = a.gear && a.gear.list.length && ["ride", "mtb", "indoor", "run", "xc_ski", "walk", "hike"].includes(a.sport)
    ? `<div class="gearsel">🚲 <select id="gearSel" title="vybavení (výchozí podle sportu, změníš tady)"><option value="auto">${a.gear.manual ? "podle sportu" : a.gear.id ? esc(a.gear.list.find((g) => g.id === a.gear.id)?.name || "podle sportu") : "bez vybavení"}</option>${a.gear.list.map((g) => `<option value="${g.id}" ${a.gear.manual && a.gear.id === g.id ? "selected" : ""}>${esc(g.name)}</option>`).join("")}<option value="none" ${a.gear.manual && a.gear.id == null ? "selected" : ""}>bez vybavení</option></select><span class="sub" id="gearMsg"></span></div>` : "";
  const endur = ["ride", "mtb", "run", "xc_ski", "hike", "walk"].includes(a.sport);
  const compSel = endur ? `<div class="gearsel">👥 <select id="compSel"><option value="">Jel jsem sám</option><option value="skupina" ${a.company === "skupina" ? "selected" : ""}>Ve skupině</option>${a.company && a.company !== "skupina" ? `<option value="${esc(a.company)}" selected>S: ${esc(a.company)}</option>` : ""}<option value="__new">S někým… (jméno)</option></select><span class="sub" id="compMsg">${a.company ? "přetažená Z2 se nebere jako chyba" : ""}</span></div>` : "";
  el.innerHTML = `<div class="head"><div><a class="back" href="#/aktivity" data-back>← Zpět</a><h1>${a.emoji} ${esc(a.title)}</h1><div class="sub">${dayDm(a.date)}${a.date.slice(0, 4)} · start ${a.start}${a.unitType ? " · " + esc(a.unitType) : ""}${a.envLabel ? " · " + esc(a.envLabel) : ""}${a.tempText ? " · " + esc(a.tempText) : ""}</div><div class="actsel">${gearSel}${compSel}</div></div></div>
  <div class="verdict goal">🎯 ${esc(a.goal)}${a.compliance != null ? `<span class="pill ok">splnění ${a.compliance} %</span>` : ""}</div>
  <div class="grid">
   ${card("c12", "", "", `<div class="abasics">${statsTop}</div>${a.basicsNote ? `<p class="note">${esc(a.basicsNote)}</p>` : ""}`)}
   ${a.hasStreams ? `<div class="c7 col o-map" id="mapCol">${card("", "🗺️ Trasa", "", `<div id="mapmode"></div><div id="map" class="map loading sm">Načítám mapu…</div><div id="mapleg"></div>`, 'id="mapCard"')}</div>` : ""}
   <div class="${a.hasStreams ? "c5" : "c12"} col o-zones" id="zoneCol">
   ${a.hrZones ? card("", "❤️ Tep – čas v zónách", "Garmin", zonesHtml(a.hrZones) + (a.hrZonesNote ? `<p class="note">${esc(a.hrZonesNote)}</p>` : "")) : ""}
   ${a.pwrZones ? card("", "⚡ Výkon – čas v zónách", "Garmin", zonesHtml(a.pwrZones) + (a.pwrZonesNote ? `<p class="note">${esc(a.pwrZonesNote)}</p>` : "")) : ""}
   </div>
   ${card("c12 o-streams", "📈 Průběh", "", a.hasStreams ? `<button class="btn sm zoom" id="zoomBtn">⛶ Zvětšit</button><div id="streams" class="loading sm">Načítám průběh…</div><div id="streamsX"></div>` : `<div class="empty">Průběh nemám.</div>`)}
   ${a.laps.show || a.hasStreams ? card("c12 o-laps", "🔥 Okruhy", "", `<div id="laps">${lapsHtml(a, null)}</div>`) : ""}
   ${a.hasStreams && a.sport !== "strength" && a.sport !== "mobility" ? card("c7 o-halves", "⚖️ 1. vs. 2. polovina · vytrvalost", "Garmin · intervals.icu", `<div id="halves" class="loading sm">Počítám…</div>`) : ""}
   ${card(a.hasStreams && a.sport !== "strength" && a.sport !== "mobility" ? "c5 o-extra" : "c12 o-extra", "📋 Další údaje", "Garmin", extraHtml(a))}
  </div>`;
  const cs = el.querySelector("#compSel");
  if (cs) cs.addEventListener("change", async () => {
    let v = cs.value;
    if (v === "__new") { v = (prompt("S kým jsi jel?") || "").trim(); if (!v) { cs.value = a.company || ""; return; } }
    const msg = el.querySelector("#compMsg");
    msg.textContent = "Ukládám…";
    try { await api(`activity/${a.id}/company`, { method: "POST", body: JSON.stringify({ company: v || null }) }); cache.clear(); route(); }
    catch (e) { msg.textContent = `Nepovedlo se: ${e.message}`; }
  });
  const gs = el.querySelector("#gearSel");
  if (gs) gs.addEventListener("change", async () => {
    const msg = el.querySelector("#gearMsg");
    msg.textContent = "Ukládám…";
    try {
      await api("gear/assign", { method: "POST", body: JSON.stringify({ activity_id: a.id, gear_id: gs.value === "auto" ? "auto" : gs.value === "none" ? null : Number(gs.value) }) });
      cache.clear();
      // potvrzení s novým nájezdem → je vidět, že se km přepočítaly
      const list = await api("gear");
      msg.textContent = "✓ Uloženo · " + list.filter((g) => !g.to_date).map((g) => `${g.name} ${thou(g.km)} km`).join(" · ");
    } catch (e) { msg.textContent = `Nepovedlo se: ${e.message}`; }
  });
  const removeMap = () => { el.querySelector("#mapCol")?.remove(); const zc = el.querySelector("#zoneCol"); if (zc) { zc.className = "c12 col zgrid"; } };
  const bindLaps = (s) => el.querySelectorAll("[data-lap]").forEach((b) => b.addEventListener("click", () => { lapMode = b.dataset.lap; el.querySelector("#laps").innerHTML = lapsHtml(a, s); bindLaps(s); }));
  bindLaps(null);
  if (a.hasStreams) {
    api(`activity/${id}/streams`).then((s) => {
      const box = el.querySelector("#streams"); if (box) { box.className = ""; box.innerHTML = streamsChart(s, { sport: a.sport, only: STREAM_MAIN }); }
      // doplňkové průběhy (kadence, dech, teplota, výkonnostní stav) jen na požádání
      const extraKeys = streamPanels(s, a.sport).map((p) => p.key).filter((k) => STREAM_EXTRA.includes(k));
      const bx = el.querySelector("#streamsX");
      if (bx && extraKeys.length) {
        const names = streamPanels(s, a.sport).filter((p) => STREAM_EXTRA.includes(p.key)).map((p) => p.name.replace(" (Garmin)", "").toLowerCase());
        bx.innerHTML = `<button class="btn sm" id="moreStreams">＋ Další průběhy (${esc(names.join(", "))})</button><div id="moreBox"></div>`;
        bx.querySelector("#moreStreams").addEventListener("click", (e) => {
          const mb2 = bx.querySelector("#moreBox");
          const open = !mb2.innerHTML;
          mb2.innerHTML = open ? streamsChart(s, { sport: a.sport, only: STREAM_EXTRA }) : "";
          e.currentTarget.textContent = open ? "− Skrýt další průběhy" : `＋ Další průběhy (${names.join(", ")})`;
        });
      }
      el.querySelector("#zoomBtn")?.addEventListener("click", () => openFullscreen(`${a.title} · ${dayDm(a.date)}`, (w, h) => streamsChart(s, { sport: a.sport, W: w, H: h, only: STREAM_MAIN })));
      const hb = el.querySelector("#halves"); if (hb) { hb.className = ""; hb.innerHTML = halvesHtml(s.halves, a); }
      // průměrná teplota z průběhu (Garmin ji v souhrnu nedává)
      const ta = el.querySelector("#tAvg"); if (ta) { const tv = (s.temp || []).filter((v) => v != null); ta.textContent = tv.length ? num(tv.reduce((x, y) => x + y, 0) / tv.length) : "–"; }
      const lb = el.querySelector("#laps"); if (lb) { lb.innerHTML = lapsHtml(a, s); bindLaps(s); }
      const mb = el.querySelector("#map");
      if (mb && s.route) { mb.className = "map"; drawMap(mb, s, el.querySelector("#mapleg"), el.querySelector("#mapmode")).catch((e) => { mb.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }); }
      else removeMap();
    }).catch((e) => { for (const q of ["#streams", "#halves"]) { const box = el.querySelector(q); if (box) { box.className = ""; box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; } } removeMap(); });
  }
}

// ---------- Body Battery (průběh dne) ----------
/**
 * Body Battery dne. Garmin posílá jen několik bodů denně (po synchronizaci hodinek), proto:
 * nahoře to, co je jisté (teď / ráno / minimum / nabito / vybito), pod tím čára jen mezi skutečnými body
 * (žádné dopočítané křivky) a pruh dne se spánkem a aktivitami.
 */
function bbPanel(d, isToday, sum = {}, part = null) {
  const pts = (d.bb || []).map(([t, v]) => ({ m: minOfDay(d, t), v })).filter((p) => p.m >= -1 && p.m <= 1441);
  const last = pts[pts.length - 1] || null;
  const now = isToday ? (sum.latest ?? last?.v ?? null) : (sum.min ?? null);
  const mx = sum.max ?? (pts.length ? Math.max(...pts.map((p) => p.v)) : null);
  const mn = sum.min ?? (pts.length ? Math.min(...pts.map((p) => p.v)) : null);
  const tone = (v) => (v == null ? "var(--z1)" : v >= 60 ? "var(--z3)" : v >= 30 ? "var(--z4)" : "var(--z6)");
  const ago = last && isToday ? Math.round(minOfDay(d, Date.now()) - last.m) : null;
  // varianta A: půlkruh (barva podle úrovně), vedle 4 čísla bez rámečků a emoji
  const kpi = (l, v) => `<div class="bbkA"><span>${l}</span><b>${v}</b></div>`;
  const when = isToday ? (last ? `teď${ago != null && ago > 45 ? ` · před ${ago >= 90 ? `${Math.round(ago / 60)} h` : `${ago} min`}` : ` · ${clock(Math.max(0, last.m))}`}` : "teď") : "večer";
  const L = Math.PI * 80, frac = clamp((now ?? 0) / 100, 0, 1);
  const gauge = `<div class="bbgauge"><svg viewBox="0 0 190 104" width="190" height="104" role="img" aria-label="Body Battery ${now ?? "–"} ze 100"><path d="M15 95 A80 80 0 0 1 175 95" fill="none" stroke="var(--card2)" stroke-width="12" stroke-linecap="round"/>${now != null ? `<path d="M15 95 A80 80 0 0 1 175 95" fill="none" stroke="${tone(now)}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(L * frac).toFixed(1)} ${L.toFixed(1)}"/>` : ""}</svg><div class="bbg-v"><b>${num(now)}</b><small>${when}</small></div></div>`;
  const ch = d.bbCharged ?? sum.charged, dr = d.bbDrained ?? sum.drained;
  const top = `<div class="bbtopA">${gauge}<div class="bbkpisA">${kpi("Ráno", num(mx))}${kpi("Minimum", num(mn))}${kpi("Nabito", ch != null ? `+${num(ch)}` : DASH)}${kpi("Vybito", dr != null ? `−${num(dr)}` : DASH)}</div></div>`;
  const line = pts.length >= 2 ? sized((W) => bbLineW(d, pts, isToday, W)) : `<div class="empty">Průběh dne zatím nemám – Garmin pošle body po synchronizaci hodinek.</div>`;
  // part: "top" = kroužek a čísla, "line" = jen graf (Přehled je dává do dvou karet), jinak obojí
  return part === "top" ? top : part === "line" ? line : top + line;
}
function bbLineW(d, pts, isToday, W) {
  const H = hScale(200, W), P = { l: W < 500 ? 28 : 36, r: W < 500 ? 10 : 14, t: 30, b: 24 };
  const Y = (v) => P.t + (1 - v / 100) * (H - P.t - P.b);
  const X = (m) => P.l + (clamp(m, 0, 1440) / 1440) * (W - P.l - P.r);
  let g = "";
  for (let h = 0; h <= 24; h += W < 560 ? 6 : 3) g += `<text class="xl" x="${X(h * 60)}" y="${H - 7}" text-anchor="${h === 0 ? "start" : h === 24 ? "end" : "middle"}">${h}:00</text>`;
  for (const v of [0, 50, 100]) g += `<line class="gl" x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="yl" x="${P.l - 5}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
  // pruh dne: spánek (nabíjí) a aktivity (vybíjí) – ikona nad grafem
  for (const s of daySpans(d)) {
    const c = s.kind === "sleep" ? "var(--srem)" : "var(--acc)";
    g += `<rect x="${X(s.a)}" y="${P.t}" width="${Math.max(2, X(s.b) - X(s.a))}" height="${H - P.t - P.b}" fill="${c}" opacity=".05"/><rect x="${X(s.a)}" y="${P.t - 6}" width="${Math.max(3, X(s.b) - X(s.a))}" height="4" rx="2" fill="${c}"/><text x="${(X(Math.max(0, s.a)) + X(Math.min(1440, s.b))) / 2}" y="${P.t - 11}" text-anchor="middle" style="font-size:13px">${s.kind === "sleep" ? "🌙" : s.txt}</text>`;
  }
  const id = uid("bb");
  // plocha a čára přímo mezi body (bez vyhlazování – mezi body data nejsou)
  const line = pts.map((p, i) => `${i ? "L" : "M"}${X(p.m).toFixed(1)},${Y(p.v).toFixed(1)}`).join("");
  const area = `${line}L${X(pts[pts.length - 1].m).toFixed(1)},${Y(0)}L${X(pts[0].m).toFixed(1)},${Y(0)}Z`;
  const hi = pts.reduce((a, b) => (b.v > a.v ? b : a)), lo = pts.reduce((a, b) => (b.v < a.v ? b : a)), last = pts[pts.length - 1];
  const lbl = (p, up) => `<text x="${X(p.m)}" y="${Y(p.v) + (up ? -9 : 17)}" text-anchor="middle" class="bbl">${p.v}</text>`;
  const nowM = isToday ? minOfDay(d, Date.now()) : null;
  // varianta A: graf jednou barvou podle úrovně teď (zelená / žlutá / červená), jemná výplň
  const lv = pts[pts.length - 1].v, col = lv >= 60 ? "var(--z3)" : lv >= 30 ? "var(--z4)" : "var(--z6)";
  const svg = `<defs><linearGradient id="${id}g" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${Y(100)}" y2="${Y(0)}"><stop offset="0" stop-color="${col}" stop-opacity=".22"/><stop offset="1" stop-color="${col}" stop-opacity=".02"/></linearGradient></defs>${g}
    <path d="${area}" fill="url(#${id}g)"/><path d="${line}" fill="none" stroke="${col}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((p) => `<circle cx="${X(p.m)}" cy="${Y(p.v)}" r="3" fill="var(--card)" stroke="${col}" stroke-width="2"/>`).join("")}
    ${lbl(hi, true)}${lo !== hi && lo !== last ? lbl(lo, false) : ""}${last !== hi ? lbl(last, true) : ""}
    ${nowM != null && nowM < 1440 ? `<line x1="${X(nowM)}" x2="${X(nowM)}" y1="${P.t}" y2="${H - P.b}" stroke="var(--muted)" stroke-dasharray="2 4"/>` : ""}`;
  bindHover(id, W, (cx) => { let best = 0, bd = Infinity; pts.forEach((p, i) => { const dd = Math.abs(X(p.m) - cx); if (dd < bd) { bd = dd; best = i; } }); return best; }, (i) => X(pts[i].m), (i) => ({ html: `<b>${clock(Math.max(0, pts[i].m))}</b><div>Body Battery <b>${pts[i].v}</b></div>`, dots: [{ y: Y(pts[i].v), c: "var(--fg)" }] }));
  return `<svg class="chart" id="${id}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${svg}<line class="cur" y1="${P.t}" y2="${H - P.b}"/><g class="dots"></g></svg>`;
}

// ---------- Zotavení: rozcestník metrik ----------
async function pageZotaveni(el) {
  const d = await api("recovery" + (viewDate ? `?date=${viewDate}` : ""));
  const r30 = d.rows.slice(-30);
  const n = d.norms;
  const isToday = d.date === d.today;
  const lastOf = (key) => [...d.rows].reverse().find((r) => r[key] != null) || null;
  const tile = (m) => {
    const M = METRICS[m];
    const lr = lastOf(M.key), v = lr ? M.val(lr) : null;
    const nn = M.normOf(n);
    const [stt, tn] = normState(v, nn, M.lowGood);
    return metricTile({ label: `${M.ico} ${M.name}` + (lr && lr.date !== d.date ? ` <small>(${dm(lr.date)})</small>` : ""), value: M.fmtBig(v), unit: M.hours ? "" : M.unit, state: stt, tone: tn,
      spark: sparkRolling(d.rows.map((r) => M.val(r)), stateColor(v, nn, M.lowGood), 60), href: `#/detail/${m}`,
      foot: nn ? `norma ${M.fmt(nn.mean - nn.sd)}–${M.fmt(nn.mean + nn.sd)}${M.hours ? " h" : M.unit ? " " + M.unit : ""}` : "" });
  };
  const rc = d.recovery;
  const stTone = rc ? (rc.state === "green" ? "good" : rc.state === "yellow" ? "warn" : "bad") : "";
  const why = rc ? [...(rc.flags?.counted || []), ...(rc.reasons || [])] : [];
  const sem = rc ? `<div class="semhead ${stTone}"><span class="badge ${stTone}">${rc.emoji} ${esc(rc.stateLabel)}</span><span>${esc(why.length ? why.join(", ") : "VST, klidový tep ani spánek nepřekročily hranice semaforu")}</span><span class="sub">ranní semafor${isToday ? "" : ` · ${dayDm(d.date)}`} · normy z ${rc.normDays} dní</span></div>` : "";
  el.innerHTML = `<div class="head"><div><h1>Zotavení</h1><div class="sub">Pravidelnost spánku (14 dní): ${esc(d.sleepReg.text)}</div></div>${dateNav(d.date, d.minDate, d.today, "znav")}</div><div class="grid">
   ${card("c12 semcard", "", "", sem + `<div class="mtiles six">${["vst", "tep", "spanek", "stres", "bb", "dech"].map(tile).join("")}</div><p class="note">Semafor = VST, klidový tep a spánek proti tvé normě (průměr 60 dní ± 1 směrodatná odchylka). Stres, Body Battery a dech jsou doplňkové.</p>`)}
   ${card("c12", `<a href="#/detail/spanek">😴 Spánek · noc na ${isToday ? "dnešek" : dayDm(d.date)} →</a>`, "Garmin", sleepBlock(d.sleep))}
  </div>`;
  bindDateNav(el, "znav", d.today, (v) => { viewDate = v; route(); });
}

// ---------- detail metriky: jedna šablona pro všechny (Přehled / Zotavení → detail) ----------
const hrsFmt = (v) => (v == null ? DASH : hmm(v * 3600));
const METRICS = {
  vst: { key: "hrv", name: "VST", ico: "🫀", full: "Variabilita srdečního tepu", unit: "ms", dec: 0, color: "var(--m-hrv)", lowGood: false, norm: "hrv",
    about: "Průměrná variabilita tepu během noci (Garmin). Vyšší = nervový systém je odpočatý. Hodnoť ji vždy proti své normě, ne proti jiným lidem. Trenér ji bere do ranního semaforu: VST pod normou ukazuje na únavu, nemoc, stres nebo alkohol." },
  tep: { key: "rhr", name: "Klidový tep", ico: "❤️", full: "Klidový tep", unit: "bpm", dec: 0, color: "var(--m-rhr)", lowGood: true, norm: "rhr",
    about: "Nejnižší ustálený tep dne (Garmin). Nižší = lepší. Zvýšení o několik tepů nad normu několik dní po sobě bývá první známka únavy nebo nemoci – trenér ho proto hlídá v ranním semaforu." },
  spanek: { key: "sleep_s", name: "Spánek", ico: "😴", full: "Spánek", unit: "h", dec: 1, color: "var(--m-sleep)", lowGood: false, norm: "sleep", hours: true,
    about: "Délka spánku a fáze z Garminu, skóre spánku 0–100. Trenér bere délku spánku do ranního semaforu (proti tvému průměru); fáze a skóre jsou doplňkové." },
  stres: { key: "stress", name: "Stres", ico: "😮‍💨", full: "Stres", unit: "", dec: 0, color: "var(--m-stress)", lowGood: true, norm: "stress",
    about: "Garmin odhaduje stres z variability tepu během dne (0–100). Do 25 klid, 26–50 nízký, 51–75 střední, nad 75 vysoký. Jen doplňkový údaj – do semaforu nevstupuje." },
  bb: { key: "bb_max", name: "Body Battery", ico: "🔋", full: "Body Battery", unit: "", dec: 0, color: "var(--m-bb)", lowGood: false, norm: "bb",
    about: "Garmin odhaduje „energii“ 0–100 z VST, stresu, spánku a aktivit. Ráno = kolik se nabilo přes noc, přes den klesá. Garmin přes API posílá jen několik bodů denně (po synchronizaci hodinek), proto je průběh dne hrubý. Do semaforu nevstupuje – ten bere přímo VST, tep a spánek." },
  dech: { key: "resp", name: "Dech", ico: "🫁", full: "Dech ve spánku", unit: "/min", dec: 1, color: "var(--m-resp)", lowGood: true, norm: "resp",
    about: "Průměrný počet nádechů za minutu během spánku (Garmin). U zdravého člověka je velmi stabilní; zvýšení o 1–2 dechy nad normu bývá spolu s vyšším tepem známka nemoci nebo přetížení. Doplňkový údaj – do semaforu nevstupuje." },
};
for (const M of Object.values(METRICS)) {
  M.val = (r) => (r[M.key] == null ? null : M.hours ? r[M.key] / 3600 : r[M.key]);
  M.normOf = (norms) => { const x = norms[M.norm]; return x ? (M.hours ? { mean: x.mean / 3600, sd: x.sd / 3600, n: x.n } : x) : null; };
  M.fmt = (v) => (v == null ? DASH : M.hours ? hrsFmt(v) : num(v, M.dec));
  M.fmtBig = (v) => (v == null ? DASH : M.hours ? dur(v * 3600).replace(/ (h|min)/g, "<small> $1</small>") : num(v, M.dec));
}
/** Hlavička detailu: velká hodnota, stav, normální rozsah a ukazatel, kde je dnešek proti normě a rozsahu období. */
function dheroHtml(M, v, last, today, st, tone, nLo, nHi, okV, u) {
  const lo = Math.min(...okV, nLo ?? Infinity, v ?? Infinity), hi = Math.max(...okV, nHi ?? -Infinity, v ?? -Infinity);
  const pos = (x) => (hi > lo ? clamp(((x - lo) / (hi - lo)) * 100, 0, 100) : 50);
  const gauge = okV.length >= 3 && v != null ? `<div class="dgauge" style="--mc:${M.color}"><div class="dg-track">${nLo != null ? `<i class="dg-band" style="left:${pos(nLo)}%;width:${pos(nHi) - pos(nLo)}%"></i>` : ""}<b class="dg-dot ${tone}" style="left:${pos(v)}%"></b></div><div class="dg-lab"><span>min ${M.fmt(Math.min(...okV))}</span>${nLo != null ? `<span>norma ${M.fmt(nLo)}–${M.fmt(nHi)}</span>` : ""}<span>max ${M.fmt(Math.max(...okV))}</span></div></div>` : "";
  return `<section class="card c12 dhero" style="--mc:${M.color}"><div class="dh-row"><div class="dh-v"><div class="dh-ico">${M.ico}</div><div><div class="dh-big">${M.fmtBig(v)}<small>${esc(u)}</small></div><div class="sub">${last ? (last.date === today ? "dnes" : dayDm(last.date)) : ""}${st ? ` · <span class="${tone}">${st}</span>` : ""}</div></div></div>${nLo != null ? `<div class="nrange"><span class="${tone}">Normální rozsah</span><b>${M.fmt(nLo)}–${M.fmt(nHi)}${esc(u)}</b><small>průměr ± 1 SD za 30 dní</small></div>` : ""}</div>${gauge}</section>`;
}
let detRange = 30;
async function pageDetail(el, which) {
  const M = METRICS[which] || METRICS.vst;
  if (![30, 90, 365].includes(detRange)) detRange = 30;
  const q = [viewDate ? `date=${viewDate}` : "", detRange === 365 ? "hist=400" : ""].filter(Boolean).join("&");
  const [d, day] = await Promise.all([api("recovery" + (q ? `?${q}` : "")), which === "bb" ? api("day" + (viewDate ? `?date=${viewDate}` : "")).catch(() => null) : null]);
  const all = d.rows;
  const nrm = M.normOf(d.norms);
  const u = M.hours ? " h" : M.unit ? " " + M.unit : "";
  const last = [...all].reverse().find((r) => M.val(r) != null);
  const lastV = last ? M.val(last) : null;
  const st = vsNorm(lastV, nrm);
  const tone = !st || st === "v normě" ? "good" : (st === "pod normou") === M.lowGood ? "good" : "warn";
  // 30 dní po dnech, 90 dní po 3 dnech, rok po týdnech (průměr) – delší období jinak jen kmitá nahoru a dolů
  const k = detRange === 365 ? 7 : detRange === 90 ? 3 : 1;
  const allV = all.map(M.val);
  const rn0 = rollingNorm(allV);
  const daily = all.slice(-detRange), dLo = rn0.lo.slice(-detRange), dHi = rn0.hi.slice(-detRange);
  const avgOf = (arr) => { const w = arr.filter((v) => v != null && isFinite(v)); return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null; };
  const groups = [];
  for (let e = daily.length; e > 0; e -= k) groups.unshift([Math.max(0, e - k), e]);
  const rows = k === 1 ? daily : groups.map(([a, b]) => { const g = daily.slice(a, b), o = { date: g[g.length - 1].date, from: g[0].date }; for (const key of Object.keys(g[g.length - 1])) if (key !== "date" && typeof g[g.length - 1][key] !== "object") o[key] = avgOf(g.map((x) => x[key])); o.bb_min = g.some((x) => x.bb_min != null) ? Math.min(...g.map((x) => x.bb_min).filter((v) => v != null)) : null; o.bb_max = avgOf(g.map((x) => x.bb_max)); return o; });
  const rn = k === 1 ? { lo: dLo, hi: dHi } : { lo: groups.map(([a, b]) => avgOf(dLo.slice(a, b))), hi: groups.map(([a, b]) => avgOf(dHi.slice(a, b))) };
  const vals = rows.map(M.val);
  const okV = daily.map(M.val).filter((v) => v != null);
  const nLo = rn0.lo[rn0.lo.length - 1], nHi = rn0.hi[rn0.hi.length - 1];
  const avg = okV.length ? okV.reduce((a, b) => a + b, 0) / okV.length : null;
  // nahoře: dnešní (poslední) hodnota velkým písmem + normální rozsah, jako v Bevelu
  const hero = M.hours
    ? card("c12", `Noc na ${last ? dayDm(last.date) : "dnešek"}`, "Garmin", sleepBlock(d.sleep))
    : which === "bb"
      ? card("c12", `Body Battery · ${day && day.date !== d.today ? dayDm(day.date) : "dnes"}`, "Garmin", day ? bbPanel(day, day.date === d.today, { max: last?.date === d.today ? last.bb_max : null, min: last?.date === d.today ? last.bb_min : null }) + dayEnergyHtml(day) : `<div class="empty">Průběh dne nemám.</div>`)
      : dheroHtml(M, lastV, last, d.today, st, tone, nLo, nHi, okV, u);
  const main = M.hours
    ? barChart({ x: rows.map((r) => r.date), xfmt: dm, mode: "stack", height: 220, yfmt: (v) => num(v) + " h", refLine: nrm ? nrm.mean : null,
        bars: rows.map((r) => ({ parts: [{ v: (r.deep || 0) / 3600, color: "var(--sdeep)" }, { v: (r.rem || 0) / 3600, color: "var(--srem)" }, { v: (r.light || (r.deep == null && r.sleep_s ? r.sleep_s : 0)) / 3600, color: "var(--slight)" }, { v: (r.awake || 0) / 3600, color: "var(--sawake)" }] })),
        tipFn: (i) => { const r = rows[i]; return `<b>${dayDm(r.date)}</b><div>spánek ${hmm(r.sleep_s)} h · skóre ${num(r.sleep_score)}</div><div>hluboký ${hmm(r.deep)} · REM ${hmm(r.rem)} · lehký ${hmm(r.light)} · bdění ${hmm(r.awake)}</div>`; } })
      + `<div class="legend"><span><i style="background:var(--sdeep)"></i>hluboký</span><span><i style="background:var(--srem)"></i>REM</span><span><i style="background:var(--slight)"></i>lehký</span><span><i style="background:var(--sawake)"></i>bdění</span><span class="sub">čárkovaně = tvůj průměr</span></div>`
    : which === "bb"
      ? barChart({ x: rows.map((r) => r.date), xfmt: dm, mode: "range", maxV: 100, height: 210,
          bars: rows.map((r) => ({ lo: r.bb_min, hi: r.bb_max, color: (r.bb_max ?? 0) >= 75 ? "var(--z3)" : (r.bb_max ?? 0) >= 50 ? "var(--z4)" : "var(--bad)" })),
          tipFn: (i) => { const r = rows[i]; return `<b>${dayDm(r.date)}</b><div>ráno ${num(r.bb_max)} → minimum ${num(r.bb_min)}</div><div>nabito +${num(r.bb_charged)} · vybito −${num(r.bb_drained)}</div>${r.load ? `<div>zátěž ${num(r.load)}</div>` : ""}`; } })
        + `<div class="legend"><span><i style="background:var(--z3)"></i>ráno ≥ 75</span><span><i style="background:var(--z4)"></i>50–74</span><span><i style="background:var(--bad)"></i>pod 50</span><span class="sub">sloupec = od minima dne po ranní maximum</span></div>`
      : lineChart({ x: rows.map((r) => r.date), xfmt: dm, height: 320, fmt: (v) => M.fmt(v) + u, bandSeries: { lo: rn.lo, hi: rn.hi, color: M.color, name: "normální rozsah (± 1 SD za 30 dní)" }, avgLine: avg != null ? { v: avg, label: `⌀ ${M.fmt(avg)}${u}`, color: M.color } : null, series: [{ name: M.name, values: vals, color: M.color, width: 2.4, points: true }], minSpan: M.key === "stress" ? 10 : M.key === "resp" ? 1.5 : 4 });
  let extra = "";
  if (M.hours) extra = card("c12", "Skóre spánku", "Garmin", lineChart({ x: rows.map((r) => r.date), xfmt: dm, height: 170, fmt: (v) => num(v), series: [{ name: "skóre", values: rows.map((r) => r.sleep_score), color: "var(--srem)", width: 2.2, points: true }], minSpan: 10 }) + `<p class="note">Pravidelnost (14 dní): ${esc(d.sleepReg.text)}</p>`);
  else if (M.key === "stress") extra = card("c12", "Stres ve spánku a maximum dne", "Garmin", lineChart({ x: rows.map((r) => r.date), xfmt: dm, height: 170, fmt: (v) => num(v), series: [{ name: "max dne", values: rows.map((r) => r.stress_max), color: "var(--z6)", width: 1.6 }, { name: "ve spánku", values: rows.map((r) => r.sleep_stress), color: "var(--z2)", width: 2 }] }));
  else if (M.key === "rhr" && d.recovery?.rhr?.yellowThr) extra = card("c12", "Hranice v ranním semaforu", "trenér", kv([["Žlutá od", num(d.recovery.rhr.yellowThr) + " bpm"], ["Červená od", num(d.recovery.rhr.redThr) + " bpm"], ["Norma (60 dní)", nrm ? `${num(nrm.mean)} ± ${num(nrm.sd, 1)} bpm` : DASH]]));
  else if (M.key === "hrv" && d.recovery?.hrv) extra = card("c12", "V ranním semaforu", "trenér", kv([["Dnešní hodnocení", esc(d.recovery.hrv.rating || "nemám")], ["Norma (60 dní)", esc(d.recovery.hrv.rangeText || DASH) + " ms"]]));
  const chips = Object.entries(METRICS).map(([k, x]) => `<a class="chipl ${k === which ? "on" : ""}" href="#/detail/${k}">${x.ico} ${esc(x.name)}</a>`).join("");
  el.innerHTML = `<div class="head"><div><a class="back" href="#/zotaveni" data-back>← Zpět</a><h1>${M.ico} ${esc(M.full)}</h1></div>
    <div class="seg">${[[30, "30 dní"], [90, "90 dní"], [365, "Rok"]].map(([k, l]) => `<button class="${detRange === k ? "on" : ""}" data-dr="${k}">${l}</button>`).join("")}</div></div>
  <nav class="chipnav">${chips}</nav>
  <div class="grid">
   ${hero}
   ${card("c12", `${M.name} · ${detRange === 365 ? "rok (týdenní průměry)" : detRange === 90 ? "90 dní (průměry po 3 dnech)" : "30 dní"}`, "Garmin", main + (okV.length ? `<p class="note">za ${detRange === 365 ? "rok" : `${detRange} dní`} (po dnech): min ${M.fmt(Math.min(...okV))}${u} · max ${M.fmt(Math.max(...okV))}${u}</p>` : ""))}
   ${extra}
   ${card("c12", "Co to znamená", "", `<p>${esc(M.about)}</p>`)}
  </div>`;
  el.querySelectorAll("[data-dr]").forEach((b) => b.addEventListener("click", () => { detRange = +b.dataset.dr; pageDetail(el, which); }));
}

function powerCurveChart(pc) {
  if (!pc.curves.some((c) => c.points.length)) return `<div class="empty">Křivku výkonu nemám.</div>`;
  return sized((W) => powerCurveChartW(pc, W));
}
function powerCurveChartW(pc, W) {
  const curves = pc.curves.filter((c) => c.points.length);
  const colors = { "42d": "var(--acc)", "90d": "var(--z2)", "1y": "var(--muted)" };
  const names = { "42d": "42 dní", "90d": "90 dní", "1y": "1 rok" };
  const H = hScale(250, W), P = { l: 10, r: 12, t: 12, b: 28 };
  const secs = [...new Set(curves.flatMap((c) => c.points.map((p) => p.secs)))].sort((a, b) => a - b);
  const lmin = Math.log(secs[0]), lmax = Math.log(secs[secs.length - 1]);
  const X = (s) => P.l + ((Math.log(s) - lmin) / (lmax - lmin)) * (W - P.l - P.r);
  const vals = curves.flatMap((c) => c.points.map((p) => p.w)).filter((v) => v);
  const mx = Math.max(...vals) * 1.05, mn = 0;
  const Y = (v) => P.t + (1 - (v - mn) / (mx - mn)) * (H - P.t - P.b);
  const id = uid("p");
  let g = "";
  for (const v of niceTicks(mn, mx, 4)) g += `<line class="gl" x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}"/>`;
  const lab = (s) => (s < 60 ? `${s} s` : s < 3600 ? `${s / 60} min` : `${s / 3600} h`);
  for (const s of [1, 5, 15, 60, 300, 1200, 3600, 7200, 14400].filter((s) => s >= secs[0] && s <= secs[secs.length - 1])) g += `<line class="gl v" x1="${X(s)}" x2="${X(s)}" y1="${P.t}" y2="${H - P.b}"/><text class="xl" x="${X(s)}" y="${H - 8}" text-anchor="middle">${lab(s)}</text>`;
  let paths = "", defs = "";
  [...curves].reverse().forEach((c) => {
    const d = c.points.filter((p) => p.w).map((p, i) => `${i ? "L" : "M"}${X(p.secs).toFixed(1)},${Y(p.w).toFixed(1)}`).join("");
    if (c.id === "42d") {
      defs += `<linearGradient id="${id}g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--acc)" stop-opacity=".25"/><stop offset="1" stop-color="var(--acc)" stop-opacity="0"/></linearGradient>`;
      const pts = c.points.filter((p) => p.w);
      paths += `<path d="${d}L${X(pts[pts.length - 1].secs)},${Y(0)}L${X(pts[0].secs)},${Y(0)}Z" fill="url(#${id}g)"/>`;
    }
    paths += `<path d="${d}" fill="none" stroke="${colors[c.id] || "var(--z5)"}" stroke-width="${c.id === "42d" ? 2.6 : 1.6}" ${c.id === "90d" ? 'stroke-dasharray="5 4"' : ""} stroke-linejoin="round"/>`;
  });
  const ftp = pc.ftp ? `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(pc.ftp)}" y2="${Y(pc.ftp)}" stroke="var(--z5)" stroke-dasharray="2 4"/><text class="xl" x="${W - P.r}" y="${Y(pc.ftp) - 5}" text-anchor="end" style="fill:var(--z5)">FTP ${pc.ftp} W</text>` : "";
  const maps = curves.map((c) => ({ c, m: new Map(c.points.map((p) => [p.secs, p.w])) }));
  bindHover(id, W, (cx) => { let best = 0, bd = Infinity; secs.forEach((s, i) => { const dd = Math.abs(X(s) - cx); if (dd < bd) { bd = dd; best = i; } }); return best; }, (i) => X(secs[i]), (i) => {
    const s = secs[i];
    return {
      html: `<b>${lab(s)}</b>` + maps.map(({ c, m }) => `<div><span class="sw" style="background:${colors[c.id]}"></span>${names[c.id] || c.label} <b>${m.get(s) ? num(m.get(s)) + " W" : DASH}</b>${m.get(s) && pc.weight ? ` · ${num(m.get(s) / pc.weight, 2)} W/kg` : ""}</div>`).join(""),
      dots: maps.filter(({ m }) => m.get(s)).map(({ c, m }) => ({ y: Y(m.get(s)), c: colors[c.id] })),
    };
  });
  const keyPts = [5, 30, 60, 300, 1200, 3600].map((s) => { const m = maps.find((x) => x.c.id === "42d")?.m; const y = maps.find((x) => x.c.id === "1y")?.m; return { s, w: m?.get(s), y: y?.get(s) }; });
  return `<svg class="chart" id="${id}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${defs}</defs>${g}${paths}${ftp}<line class="cur" y1="${P.t}" y2="${H - P.b}"/><g class="dots"></g></svg>
   <div class="legend">${curves.map((c) => `<span><i style="background:${colors[c.id]}"></i>${names[c.id] || c.label}</span>`).join("")}</div>
   <div class="mini-stats pc6">${keyPts.map((k) => `<div><b>${k.w ? num(k.w) : DASH}<small> W</small></b><span>${lab(k.s)} · rok ${k.y ? num(k.y) : DASH}</span></div>`).join("")}</div>`;
}

// zóny formy (TSB) jako v intervals.icu
const FORM_BANDS = [
  { lo: 20, hi: null, color: "var(--z4)", name: "Přechod", text: "nad +20" },
  { lo: 5, hi: 20, color: "var(--z2)", name: "Čerstvý", text: "+5 až +20" },
  { lo: -10, hi: 5, color: "var(--z1)", name: "Šedá zóna", text: "−10 až +5" },
  { lo: -30, hi: -10, color: "var(--z3)", name: "Optimální", text: "−30 až −10" },
  { lo: null, hi: -30, color: "var(--z6)", name: "Vysoké riziko", text: "pod −30" },
];
const formZoneName = (f) => (f == null ? DASH : FORM_BANDS.find((z) => (z.lo == null || f >= z.lo) && (z.hi == null || f < z.hi))?.name || DASH);

/** Přehled zátěže jako v Garmin Connect: denní body zátěže Garminu, barva = hlavní přínos aktivity podle Garminu. */
const LOAD_CAT = { low: ["#38c0d0", "Nízko aerobní"], high: ["#f08a24", "Vysoce aerobní"], ana: ["#8a5cf0", "Anaerobní"], unknown: ["#9a9690", "Neznámý"] };
function loadOverviewHtml(days) {
  if (!days || !days.some((d) => d.acts.length)) return `<div class="empty">Za 4 týdny žádná zátěž.</div>`;
  const order = ["low", "high", "ana", "unknown"];
  const bars = days.map((d) => ({ parts: order.flatMap((k) => d.acts.filter((a) => a.cat === k).map((a) => ({ v: a.load, color: LOAD_CAT[k][0] }))) }));
  const sum = Object.fromEntries(order.map((k) => [k, days.reduce((t, d) => t + d.acts.filter((a) => a.cat === k).reduce((s, a) => s + a.load, 0), 0)]));
  const nonGarmin = days.some((d) => d.acts.some((a) => !a.garmin));
  return barChart({ x: days.map((d) => d.date), xfmt: dm, mode: "stack", height: 190, bars, todayIndex: days.length - 1,
    tipFn: (i) => { const d = days[i]; return `<b>${dayDm(d.date)}</b>${d.acts.length ? d.acts.map((a) => `<div><span class="sw" style="background:${LOAD_CAT[a.cat][0]}"></span>${esc(a.name || SPORT_NAME[a.sport] || a.sport)} <b>${a.load}</b> · ${LOAD_CAT[a.cat][1].toLowerCase()}</div>`).join("") : "<div>bez zátěže</div>"}`; } })
    + `<div class="legend">${order.filter((k) => sum[k] > 0).map((k) => `<span><i style="background:${LOAD_CAT[k][0]}"></i>${LOAD_CAT[k][1]} · ${thou(sum[k])}</span>`).join("")}</div>
    <p class="note">Zátěž = TSS aktivity (stejné číslo v Garminu i intervals.icu), barva = hlavní přínos aktivity podle tréninkového efektu Garminu.</p>`;
}

/** VO2max: spojitá čára, mezi měřeními platí poslední hodnota (Garmin ji mění jen po vhodné aktivitě). */
function vo2Html(v) {
  if (!v.rows.length) return `<div class="empty">VO2max nemám.</div>`;
  const tile = (k, name, ico) => { const x = v[k]; return stat(`${ico} ${name}`, x ? num(x.v) : DASH, "", x ? `naposledy změřeno ${dm(x.date)}${x.date.slice(0, 4)}` : "zatím nemám", ""); };
  const today = new Date().toISOString().slice(0, 10);
  // okno od prvního měření (max. 6 měsíců, min. 30 dní) – ať graf není poloprázdný
  const firstIn = v.rows.find((r) => r.date >= addDay(today, -180))?.date ?? addDay(today, -30);
  const from = [addDay(firstIn, -3), addDay(today, -30)].sort()[0];
  const dates = [];
  for (let d = from; d <= today; d = addDay(d, 1)) dates.push(d);
  const by = new Map(v.rows.map((r) => [r.date, r]));
  // přenesení poslední hodnoty dopředu zvlášť pro kolo a běh (start = poslední měření před oknem)
  const carry = (k) => {
    let cur = [...v.rows].reverse().find((r) => r.date < from && (r.sport === k || r.sport === "both"))?.v ?? null;
    return dates.map((d) => { const r = by.get(d); if (r && (r.sport === k || r.sport === "both")) cur = r.v; return cur; });
  };
  const ride = carry("ride"), run = carry("run");
  const measured = (k) => dates.map((d) => { const r = by.get(d); return r && (r.sport === k || r.sport === "both") ? r.v : null; });
  const mRide = measured("ride"), mRun = measured("run");
  const series = [];
  if (ride.some((x) => x != null)) series.push({ name: "🚴 kolo", values: ride, color: "var(--z2)", width: 2.4 }, { name: "měření kolo", values: mRide, color: "var(--z2)", dots: true, width: 0.01, noLegend: true, noTip: true });
  if (run.some((x) => x != null)) series.push({ name: "🏃 běh", values: run, color: "var(--acc)", width: 2.4 }, { name: "měření běh", values: mRun, color: "var(--acc)", dots: true, width: 0.01, noLegend: true, noTip: true });
  return `<div class="stats tight">${tile("ride", "Kolo", "🚴")}${tile("run", "Běh", "🏃")}</div>` +
    lineChart({ x: dates, xfmt: dm, fmt: (x) => num(x), height: 170, minSpan: 4, series }) +
    `<p class="note">Čára = platná hodnota, tečka = den, kdy Garmin VO2max změnil. Garmin ji počítá zvlášť z běhu a z kola (s wattmetrem); přiřazuji ji podle aktivity v daný den. Hodnoť trend.</p>`;
}

/** FTP: kde se bere, co se přepočítá a kdy udělat test. */
function ftpCard(d) {
  const fc = d.ftpCheck || { suggest: false, title: "", reasons: [] };
  return card("c12", "⚡ FTP – zóny a test", "intervals.icu", `<div id="ftp" class="ftpbox ${fc.suggest ? "warn" : "ok"}"><b>${fc.suggest ? "⚠️" : "✅"} ${esc(fc.title)}</b>${fc.reasons.length ? `<ul>${fc.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}</div>
    ${kv([["FTP teď", `${num(d.ftp)} W${d.ftpSetAt ? ` · od ${dm(d.ftpSetAt)}${d.ftpSetAt.slice(0, 4)}` : ""}`], ["eFTP (odhad z jízd)", d.eftp ? `${d.eftp.w} W · ${dm(d.eftp.date)}` : DASH]])}
    <details class="gcmp"><summary>Jak to funguje (nový test, přepočet aktivit)</summary><p class="note">FTP se bere z intervals.icu (jednou denně). Nový test zadej v intervals.icu (Settings → Ride → FTP) nebo v Telegramu /ftp 280 – nové číslo z intervals.icu má přednost i před ručně zadaným. Když po testu v Garminu uvidíš v intervals.icu pořád staré FTP, zadej ho tam ručně – aplikace ho do druhého dne převezme.</p>
    <p class="note">Co se po změně přepočítá: zóny výkonu, watty v plánu a intervaly (hned) a odhad zátěže aktivit, ke kterým Garmin ani intervals.icu TSS nedaly. <b>Staré aktivity se nepřepočítávají</b> – jejich zátěž (TSS) spočítal Garmin / intervals.icu s FTP platným v den jízdy, a tak je to správně (jinak by se zpětně změnila kondice). Data se ukládají v databázi aplikace, ne v souborech.</p>
    <p class="note">Test doporučím sám (tady a v nedělním souhrnu v Telegramu), když 20 min výkon nebo eFTP z jízd vyjde o 3–5 % nad FTP, eFTP je o 10 % pod ním, nebo je FTP beze změny déle než 8 týdnů v sezóně / 12 mimo ni. Test: 20 min naplno po rozjetí, FTP = 95 % průměru (nebo ramp test na trenažéru).</p></details>`);
}

let kondRange = "90";
async function pageKondice(el) {
  const d = await api(kondRange === "ytd" ? "fitness?range=ytd" : "fitness");
  const m = d.metrics;
  if (!m.length) { el.innerHTML = `<div class="head"><div><h1>Kondice</h1></div></div><div class="card"><div class="empty">Kondici zatím nemám – spočítá se, až se stáhnou aktivity (zadej klíče v Nastavení). První data bývají do hodiny.</div></div>`; return; }
  const proj = d.projection;
  const x = [...m.map((r) => r.date), ...proj.map((p) => p.date)];
  const pad = (arr, k) => [...arr, ...Array(k).fill(null)];
  const pre = (k, arr) => [...Array(k).fill(null), ...arr];
  const lastIdx = m.length - 1;
  const ctlP = pre(lastIdx, [m[lastIdx]?.ctl, ...proj.map((p) => p.ctl)]);
  const atlP = pre(lastIdx, [m[lastIdx]?.atl, ...proj.map((p) => p.atl)]);
  const formP = pre(lastIdx, [m[lastIdx]?.form, ...proj.map((p) => p.form)]);
  const last = d.today || m[lastIdx] || {};
  el.innerHTML = `<div class="head"><div><h1>Kondice</h1><div class="sub">Kondice, únava a forma z intervals.icu · zátěž za 7 dní ${d.loadPast7}</div></div>
    <div class="seg">${[["90", "90 dní"], ["ytd", "Od začátku roku"]].map(([k, l]) => `<button class="${kondRange === k ? "on" : ""}" data-kr="${k}">${l}</button>`).join("")}</div></div>
  <div class="stats">
    ${stat("💪 Kondice (CTL)", num(last.ctl, 1), "", `${(last.ramp ?? 0) > 0.5 ? "📈" : (last.ramp ?? 0) < -0.5 ? "📉" : "➡️"} ramp ${signed(last.ramp, 1)} / 7 dní`, "")}
    ${stat("🥵 Únava (ATL)", num(last.atl, 1), "", "zátěž posledních ~7 dní", "")}
    ${stat(`${last.form == null ? "🎯" : last.form < -30 ? "🚨" : last.form < -10 ? "🏋️" : last.form <= 5 ? "⚖️" : last.form <= 20 ? "✨" : "🛋️"} Forma (TSB)`, signed(last.form, 1), "", `kondice − únava · ${esc(formZoneName(last.form))}`, last.form == null ? "" : last.form < -25 ? "bad" : last.form < -10 ? "warn" : "good")}
    ${stat("⚡ FTP", num(d.ftp), " W", d.ftpCheck?.suggest ? `<span class="warn">⚠️ ${esc(d.ftpCheck.title)}</span>` : d.eftp ? `eFTP ${d.eftp.w} W (intervals.icu)` : "test 20 min", d.ftpCheck?.suggest ? "warn" : "")}
  </div>
  <div class="grid">
   ${card("c12", `📈 Kondice a únava · ${kondRange === "ytd" ? "od 1. 1." : "90 dní"} + výhled 7 dní`, "intervals.icu", lineChart({ x, xfmt: dm, height: 250, markIndex: lastIdx, series: [
     { name: "Kondice (CTL)", values: pad(m.map((r) => r.ctl), proj.length), color: "var(--z2)", width: 2.6, area: true },
     { name: "Únava (ATL)", values: pad(m.map((r) => r.atl), proj.length), color: "var(--z7)", width: 1.8 },
     { name: "výhled CTL", values: ctlP, color: "var(--z2)", dash: true, noLegend: true },
     { name: "výhled ATL", values: atlP, color: "var(--z7)", dash: true, noLegend: true },
   ] }) + `<p class="note">Čárkovaně = výhled podle plánu.</p>`)}
   ${card("c8", "🎯 Forma (TSB)", "intervals.icu", lineChart({ x, xfmt: dm, height: 230, markIndex: lastIdx, include: [-35, 25], bands: FORM_BANDS, yticks: [-30, -10, 5, 20], yfmt: (v) => signed(v), bandsLegend: false, series: [
     { name: "Forma", values: pad(m.map((r) => r.form), proj.length), color: "var(--fg)", width: 3, bandColors: true },
     { name: "výhled", values: formP, color: "var(--fg)", dash: true, opacity: 0.6 },
   ] }) + `<p class="note">Dnes ${signed(last.form, 1)} = <b>${esc(formZoneName(last.form))}</b>. Osa = hranice zón.</p>`)}
   ${card("c4", "🫁 VO2max", "Garmin → intervals.icu", `<div id="vo2" class="loading sm">Načítám…</div>`)}
   ${card("c12", "📅 Přehled zátěže · 4 týdny", "Garmin", loadOverviewHtml(d.loadDays))}
   ${card("c12", "⚡ Křivka výkonu", "intervals.icu", `<div id="pcurve" class="loading sm">Načítám křivku…</div><p class="note">Nejlepší průměrný výkon pro každou délku úsilí (1 s – 4 h). Najeď myší pro W a W/kg.</p>`)}
   ${ftpCard(d)}
   ${card("c6", "✅ Splnění plánu", "plán vs. odjeto", `<div id="anComp" class="loading sm">Načítám…</div>`)}
   ${card("c6", "🎚️ Rozložení intenzity · 80/20", "tep v zónách", `<div id="anInt" class="loading sm">Načítám…</div>`)}
   ${card("c6", "🎯 Kondice k cíli", "CTL", `<div id="anCtl" class="loading sm">Načítám…</div>`)}
   ${card("c6", "💨 Efficiency Factor", "NP / tep", `<div id="anEf" class="loading sm">Načítám…</div>`)}
   ${card("c12", "🔁 Monotónnost a strain", "Foster", `<div id="anMon" class="loading sm">Načítám…</div>`)}
   ${d.warnings.length ? card("c12", "⚠️ Upozornění", "", `<ul class="alerts">${d.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`) : ""}
  </div>`;
  api("analytics").then((a) => fillAnalytics(el, a)).catch((e) => el.querySelectorAll("#anComp,#anInt,#anCtl,#anEf,#anMon").forEach((b) => { b.className = ""; b.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }));
  el.querySelectorAll("[data-kr]").forEach((b) => b.addEventListener("click", () => { if (kondRange === b.dataset.kr) return; kondRange = b.dataset.kr; pageKondice(el); }));
  api("vo2").then((v) => { const b = el.querySelector("#vo2"); if (b) { b.className = ""; b.innerHTML = vo2Html(v); } }).catch((e) => { const b = el.querySelector("#vo2"); if (b) b.innerHTML = `<div class="empty">${esc(e.message)}</div>`; });
  api("power-curve").then((pc) => { const b = el.querySelector("#pcurve"); if (b) { b.className = ""; b.innerHTML = powerCurveChart(pc); } }).catch((e) => { const b = el.querySelector("#pcurve"); if (b) b.innerHTML = `<div class="empty">${esc(e.message)}</div>`; });
}

const TONE_C = { good: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)" };
const verdict = (tone, text) => `<div class="an-v ${tone}"><i></i><span>${esc(text)}</span></div>`;
function fillAnalytics(el, a) {
  const put = (id, html) => { const b = el.querySelector(id); if (b) { b.className = ""; b.innerHTML = html; } };
  // 1) splnění plánu
  const c = a.compliance;
  const wk = c.weeks.slice(-6);
  put("#anComp", (c.count ? `<div class="an-big"><b>${c.loadPct ?? DASH}<small> %</small></b><span>zátěže z plánu za 4 týdny · ${c.doneCount} z ${c.count} tréninků · ${c.goodCount}× v normě (80–120 %)</span></div>` : `<div class="empty sm">Za poslední 4 týdny žádný zapsaný plán – splnění se počítá z tréninků potvrzených do intervals.icu.</div>`)
    + (c.items.length ? `<div class="an-list">${c.items.slice(0, 8).map((i) => `<div><i style="background:${TONE_C[i.tone]}"></i><span class="d">${dayDm(i.date)}</span><span class="t">${esc(i.name)}</span><span class="r num">${i.missed ? "vynecháno" : `${i.done} / ${i.planned} · ${i.pct} %`}</span></div>`).join("")}</div>` : "")
    + (wk.length ? `<div class="sl" style="margin-top:12px">Týdny (zátěž odjetá / plánovaná)</div><div class="an-weeks">${wk.map((w) => `<div class="${w.tone}"><b>${w.pct} %</b><span>${dm(w.from)}</span></div>`).join("")}</div>` : "")
    + `<p class="note">Jako v TrainingPeaks: zelená = 80–120 % plánované zátěže, žlutá = 50–79 % nebo 121–150 %, červená = pod 50 %, nad 150 % nebo vynecháno. Zrušené tréninky (Dnes nepojedu, nemoc) se nepočítají.</p>`);
  // 2) 80/20
  const iw = a.intensity.weeks;
  const iv = a.intensity.verdict;
  put("#anInt", (iv ? verdict(iv.tone, iv.text) : `<div class="empty sm">Za 14 dní málo dat z tepu.</div>`)
    + barChart({ x: iw.map((w) => w.from), xfmt: dm, mode: "stack", maxV: 100, refLine: 80, height: 150, yfmt: (v) => v + " %", bars: iw.map((w) => ({ parts: [{ v: w.easyPct, color: "var(--z2)" }, { v: w.greyPct, color: "var(--z3)" }, { v: w.hardPct, color: "var(--z6)" }] })), tipFn: (i) => { const w = iw[i]; return `<b>týden od ${dm(w.from)}</b><div>lehce ${w.easyPct} % · šedá ${w.greyPct} % · tvrdě ${w.hardPct} %</div><div>${hmm(w.total * 60)} h s tepem</div>`; } })
    + `<div class="legend"><span><i style="background:var(--z2)"></i>lehce Z1–Z2</span><span><i style="background:var(--z3)"></i>šedá zóna Z3</span><span><i style="background:var(--z6)"></i>tvrdě Z4–Z5</span></div>`
    + `<p class="note">Polarizovaný trénink (Seiler): kolem 80 % času lehce, šedé zóny (Z3) co nejméně, zbytek tvrdě. Čára = 80 %. Počítá se čas v zónách tepu ze všech vytrvalostních aktivit.</p>`);
  // 3) kondice k cíli
  const cp = a.ctlPlan;
  put("#anCtl", cp ? verdict(cp.tone, cp.text)
    + `<div class="an-row"><div><span>Teď</span><b>${num(cp.ctl, 1)}</b></div><div><span>Cíl ${dm(cp.goalDate)}</span><b>${cp.target}${cp.suggested ? "<small> návrh</small>" : ""}</b></div><div><span>Růst / týden</span><b>${signed(cp.ramp, 1)}</b></div><div><span>Zátěž týdně</span><b>~${cp.weeklyLoad}</b></div></div>`
    + lineChart({ x: cp.points.map((q) => q.date), xfmt: dm, height: 140, fmt: (v) => num(v, 1), series: [{ name: "plán CTL", values: cp.points.map((q) => q.ctl), color: "var(--z2)", width: 2.4, area: true }], legend: false })
    + `<p class="note">Bezpečný růst kondice je 3–5 bodů CTL týdně, 5–7 je náročné, víc vede k přetížení. Posledních 10 dní před cílem kondice mírně klesne a forma vyroste. Cílovou CTL nastavíš v Nastavení (jinak návrh +4 body týdně).</p>`
    : `<div class="empty sm">Zadej v Nastavení datum cíle (a případně cílovou kondici CTL) – spočítám, jak rychle má kondice růst.</div>`);
  // 4) Efficiency Factor
  const ef = a.ef;
  put("#anEf", verdict(ef.trend == null ? "warn" : ef.trend <= -2 ? "warn" : "good", ef.text)
    + (ef.points.length >= 2 ? lineChart({ x: ef.points.map((q) => q.date), xfmt: dm, height: 150, fmt: (v) => num(v, 2), series: [{ name: "EF", values: ef.points.map((q) => q.ef), color: "var(--acc)", width: 2, points: true }], legend: false, minSpan: 0.2 }) : "")
    + `<p class="note">Efficiency Factor = normalizovaný výkon / průměrný tep na lehkých jízdách (IF pod 0,8, aspoň 40 min). Když roste, jedeš na stejný tep víc wattů – aerobní základ se zlepšuje.</p>`);
  // 5) monotónnost a strain
  const mo = a.monotony;
  put("#anMon", verdict(mo.tone, mo.text)
    + barChart({ x: mo.weeks.map((w) => w.from), xfmt: dm, height: 150, bars: mo.weeks.map((w) => ({ v: w.strain, color: w.monotony > 2 ? "var(--bad)" : w.monotony > 1.5 ? "var(--warn)" : "var(--z2)" })), refLine: mo.strainAvg || null, fmt: (v) => num(v), tipFn: (i) => { const w = mo.weeks[i]; return `<b>týden od ${dm(w.from)}</b><div>strain ${w.strain} · monotónnost ${num(w.monotony, 2)} · zátěž ${w.load}</div>`; } })
    + `<div class="legend"><span><i style="background:var(--z2)"></i>monotónnost do 1,5</span><span><i style="background:var(--warn)"></i>1,5–2</span><span><i style="background:var(--bad)"></i>nad 2</span></div>`
    + `<p class="note">Monotónnost = průměrná denní zátěž / její směrodatná odchylka za týden (Foster). Nad 2 jsou dny moc podobné a roste riziko přetížení a nemoci. Strain = týdenní zátěž × monotónnost; čára = tvůj průměr.</p>`);
}

async function pageTelo(el) {
  const rows = await api("body");
  const w = rows.filter((r) => r.weight_kg != null);
  const fa = rows.filter((r) => r.fitness_age != null);
  el.innerHTML = `<div class="head"><h1>Tělo</h1></div><div class="grid">
   ${card("c6", "⚖️ Váha", "Garmin", (w.length ? `<div class="bignum">${num(w[w.length - 1].weight_kg, 1)}<small> kg · ${dm(w[w.length - 1].date)}</small></div>` + lineChart({ x: w.map((r) => r.date), xfmt: dm, fmt: (v) => num(v, 1) + " kg", series: [{ name: "váha", values: w.map((r) => r.weight_kg), color: "var(--acc)", dots: true, area: true }], minSpan: 2 }) : '<div class="empty">Vážení zatím nemám.</div>'))}
   ${card("c6", "Fitness age", "Garmin", fa.length ? `<div class="bignum">${num(fa[fa.length - 1].fitness_age, 1)}<small> let</small></div>` + lineChart({ x: fa.map((r) => r.date), xfmt: dm, fmt: (v) => num(v, 1), series: [{ name: "fitness age", values: fa.map((r) => r.fitness_age), color: "var(--z3)", dots: true }], minSpan: 2 }) : '<div class="empty">Nemám.</div>')}
  </div>`;
}

/** výchozí díly podle druhu vybavení */
const PART_PRESET = { bike: [["Řetěz", "Vyměněno", 3000, 1000], ["Pláště", "Vyměněno", 4000, 1000], ["Brzdové destičky", "Vyměněno", 2500, 500]], ski: [["Vosk", "Navoskováno", 250, 50], ["Broušení", "Nabroušeno", 1000, 200]], shoe: [["Boty", "Vyměněno", 800, 100]], other: [] };
/** Díly a servis: řádek s km / kontrolou, pruh (zelená → oranžová před servisem → červená po termínu), tlačítko servisu. */
function partsHtml(g) {
  const ps = g.parts || [];
  const rows = ps.map((p) => {
    const pct = p.interval_km ? clamp((p.km / p.interval_km) * 100, 0, 100) : null;
    const tone = p.interval_km ? (p.km >= p.interval_km ? "bad" : p.km >= p.interval_km * 0.85 ? "warn" : "ok") : "";
    return `<div class="gpart ${tone}"><div class="gp-h"><b>${esc(p.name)}</b><span class="num">${thou(p.km)}${p.interval_km ? ` / ${thou(p.interval_km)}` : ""} km</span></div>
      ${pct != null ? `<div class="gp-bar"><i style="width:${pct}%"></i></div>` : ""}
      <div class="gp-f"><button class="btn sm gp-do" data-reset="${p.id}">✓ ${esc(p.name)} – ${esc((p.action || "servis").toLowerCase())}</button><span class="sub">od ${dm(p.since.slice(0, 10))}${p.since.slice(0, 4)}${p.history && p.history.length ? ` · dřív ${p.history.length}×` : ""}</span><button class="gp-del" data-pdel="${p.id}" aria-label="smazat díl ${esc(p.name)}" title="smazat díl">✕</button></div></div>`;
  }).join("");
  const pre = (PART_PRESET[g.kind] || []).filter(([n]) => !ps.some((p) => p.name === n));
  return `<div class="gparts"><div class="sl">Díly a servis</div>${rows || `<p class="sub gp-empty">Zatím žádné díly – přidej je a hlídej km od servisu (upozornění přijde do Telegramu).</p>`}
    <div class="gp-add">${pre.slice(0, 2).map(([n, a, i, r]) => `<button class="btn sm" data-preset='${esc(JSON.stringify({ name: n, action: a, interval_km: i, repeat_km: r }))}' data-gid="${g.id}">＋ ${esc(n)} ${thou(i)} km</button>`).join("")}<details class="addpart"><summary class="btn sm">＋ Jiný díl</summary>
    <form class="pform form-grid" data-gid="${g.id}"><label>Název<input name="name" placeholder="např. Řetěz" required></label><label>Tlačítko<input name="action" placeholder="Vyměněno"></label><label>Kontrola po (km)<input name="interval_km" type="number" min="0"></label><label>Pak každých (km)<input name="repeat_km" type="number" min="0"></label><label>Najeto už teď (km)<input name="start_km" type="number" min="0" value="0"></label><label>Počítat od data<input name="since" type="date"></label><div><button class="btn pri" type="submit">Přidat díl</button></div></form></details></div></div>`;
}
/** druh vybavení: ikona (SVG), barva, název */
const GEAR_KIND = { bike: ["🚲", "Kolo"], ski: ["🎿", "Lyže"], shoe: ["👟", "Boty"], other: ["🎒", "Jiné"] };
const GEAR_ICO = {
  bike: '<circle cx="6" cy="16" r="3.6"/><circle cx="18" cy="16" r="3.6"/><path d="M6 16l4-7h5l3 7M10 9l3 7h-7M14 6h3"/>',
  ski: '<path d="M3 18h18M6 18l3-13M18 18l-3-13"/>',
  shoe: '<path d="M3 16c0-3 1-6 2-8l4 2c1 .5 2 .5 3 0l1-1 7 4c1 .6 1 2.4 1 3v1H3z"/><path d="M3 18h18"/>',
  other: '<rect x="5" y="7" width="14" height="13" rx="2"/><path d="M9 7V5h6v2"/>',
};
GEAR_ICO.road = '<circle cx="5.5" cy="16" r="4"/><circle cx="18.5" cy="16" r="4"/><path d="M5.5 16 10 9h6l2.5 7M10 9l2.5 7h-7M16 9l-.8-3h2.6c1.3 0 1.6 1.4 1 2.4"/>';
GEAR_ICO.mtb = '<circle cx="5.5" cy="16.5" r="4" stroke-width="2.6"/><circle cx="18.5" cy="16.5" r="4" stroke-width="2.6"/><path d="M5.5 16.5 9.5 10H15l3.5 6.5M9.5 10l2.5 6.5h-6.5M15 10l1.5-3.5M14 6.5h4.5M15.6 12.8l1.3 1"/>';
GEAR_ICO.ski = '<path d="M2.5 19.5h15.5c1.6 0 2.6-.9 3.2-2.4M2.5 22h15.5c1.6 0 2.6-.9 3.2-2.4"/><path d="M8 2.5 10 17M15.5 2.5 13.5 17"/><circle cx="9.7" cy="14.6" r="1.1"/><circle cx="13.8" cy="14.6" r="1.1"/>';
const GEAR_COLOR = { road: "var(--z2)", mtb: "var(--z3)", bike: "var(--z2)", ski: "#2aa3c9", shoe: "var(--acc)", other: "var(--z7)" };
/** ikona a barva podle druhu a sportu: silnice ≠ MTB, běžky = lyže s hůlkami */
const gearLook = (g) => { const df = (g.default_for || "").split(","); const k = g.kind === "bike" ? (df.includes("mtb") && !df.includes("ride") ? "mtb" : "road") : g.kind; return { ico: GEAR_ICO[k] || GEAR_ICO.other, color: GEAR_COLOR[k] || "var(--z1)" }; };
const GEAR_SPORTS = [["ride", "Silnice"], ["mtb", "MTB"], ["indoor", "Trenažér"], ["run", "Běh"], ["xc_ski", "Běžky"], ["walk", "Chůze"], ["hike", "Turistika"]];
let gearShow = "active"; // active | retired
async function pageVybaveni(el) {
  const list = await api("gear");
  const form = (g = {}) => `<form class="gform" data-id="${g.id || ""}"><div class="form-grid">
    <label>Název<input name="name" value="${esc(g.name || "")}" placeholder="např. Canyon Endurace" required></label>
    <label>Druh<select name="kind">${Object.entries(GEAR_KIND).map(([k, [, l]]) => `<option value="${k}" ${g.kind === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    <label>Najeto před evidencí (km)<input name="start_km" type="number" min="0" value="${g.start_km || 0}"></label>
    <label>Výchozí od data (prázdné = celá historie)<input name="from_date" type="date" value="${g.from_date || ""}"></label>
    <label>Vyřazeno k datu<input name="to_date" type="date" value="${g.to_date || ""}"></label>
    <label>Poznámka<input name="note" value="${esc(g.note || "")}"></label>
    </div><div class="sl" style="margin:12px 0 6px">Výchozí pro sporty (aktivity bez ručního výběru)</div><div class="chks">${GEAR_SPORTS.map(([k, l]) => `<label class="chk"><input type="checkbox" name="df" value="${k}" ${(g.default_for || "").split(",").includes(k) ? "checked" : ""}> ${l}</label>`).join("")}</div>
    <div class="btns"><button class="btn pri" type="submit">${g.id ? "Uložit" : "Přidat"}</button>${g.id ? `<button class="btn" type="button" data-del="${g.id}">Smazat</button>` : ""}</div>
    <p class="note">Výchozí vybavení se přiřadí všem aktivitám daného sportu (od zvoleného data). Konkrétní aktivitě ho změníš v jejím detailu.</p></form>`;
  const active = list.filter((g) => !g.to_date), retired = list.filter((g) => g.to_date);
  const shown = gearShow === "retired" ? retired : active;
  const cardOf = (g) => {
    const sports = (g.default_for || "").split(",").filter(Boolean).map((s) => SPORT_NAME[s] || s);
    const look = gearLook(g);
    return `<article class="gcard ${g.to_date ? "retired" : ""}" style="--gc:${look.color}">
      <div class="gc-h"><span class="gc-ico"><svg viewBox="0 0 24 24" aria-hidden="true">${look.ico}</svg></span>
        <div class="gc-t"><b>${esc(g.name)}</b><span class="sub">${GEAR_KIND[g.kind]?.[1] || "Jiné"}${sports.length ? ` · výchozí pro ${esc(sports.join(", ").toLowerCase())}` : " · jen ručně"}${g.to_date ? ` · vyřazeno ${dm(g.to_date)}${g.to_date.slice(0, 4)}` : ""}</span></div>
        <button class="gc-edit" data-edit="${g.id}" aria-label="Upravit ${esc(g.name)}" title="Upravit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16z"/></svg></button></div>
      <div class="gc-km"><span class="num">${thou(g.km)}</span><small>km</small><span class="gc-st">${g.n} ${g.kind === "ski" ? "jízd" : g.kind === "shoe" ? "aktivit" : "jízd"} · ${num(g.hours, 0)} h${g.up ? ` · ↑ ${thou(g.up)} m` : ""}</span></div>
      ${g.start_km ? `<div class="sub">včetně ${thou(g.start_km)} km před evidencí</div>` : ""}
      ${partsHtml(g)}
      <a class="gc-link" href="#/vybaveni/${g.id}">Aktivity s tímto vybavením →</a></article>`;
  };
  el.innerHTML = `<div class="head"><div><h1>Vybavení</h1></div><button class="btn pri" id="gearAdd">＋ Přidat vybavení</button></div>
  <div class="seg sm gseg"><button class="${gearShow === "active" ? "on" : ""}" data-gs="active">V provozu · ${active.length}</button><button class="${gearShow === "retired" ? "on" : ""}" data-gs="retired">Vyřazené · ${retired.length}</button></div>
  <div class="ggrid">${shown.map(cardOf).join("") || `<div class="card"><div class="empty">${gearShow === "retired" ? "Žádné vyřazené vybavení." : "Zatím nic. Přidej první kolo nebo lyže tlačítkem nahoře."}</div></div>`}</div>`;
  const reload = () => { cache.clear(); pageVybaveni(el); };
  // úprava / přidání v okně
  const openForm = (g) => {
    const ov = document.createElement("div");
    ov.className = "modal";
    ov.innerHTML = `<div class="modal-in gmodal"><div class="ch"><h2>${g ? `Upravit · ${esc(g.name)}` : "Přidat vybavení"}</h2><button class="btn sm" data-x aria-label="Zavřít">✕</button></div>${form(g || {})}</div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.querySelector("[data-x]").onclick = close;
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    const f = ov.querySelector("form");
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(f);
      const body = { name: fd.get("name"), kind: fd.get("kind"), start_km: fd.get("start_km"), from_date: fd.get("from_date"), to_date: fd.get("to_date"), note: fd.get("note"), default_for: fd.getAll("df") };
      await api(f.dataset.id ? `gear/${f.dataset.id}` : "gear", { method: f.dataset.id ? "PUT" : "POST", body: JSON.stringify(body) });
      close(); reload();
    });
    f.querySelector("[data-del]")?.addEventListener("click", async () => { if (!confirm("Smazat vybavení? Aktivity zůstanou.")) return; await api(`gear/${f.dataset.id}`, { method: "DELETE" }); close(); reload(); });
  };
  el.querySelector("#gearAdd").addEventListener("click", () => openForm(null));
  el.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openForm(list.find((g) => String(g.id) === b.dataset.edit))));
  el.querySelectorAll("[data-gs]").forEach((b) => b.addEventListener("click", () => { gearShow = b.dataset.gs; pageVybaveni(el); }));
  el.querySelectorAll("[data-reset]").forEach((b) => b.addEventListener("click", async () => { if (!confirm(`Zapsat „${b.textContent.replace("✓ ", "")}“ k dnešku? Km dílu začnou od nuly.`)) return; b.disabled = true; await api(`gear/parts/${b.dataset.reset}/reset`, { method: "POST", body: "{}" }); reload(); }));
  el.querySelectorAll("[data-pdel]").forEach((b) => b.addEventListener("click", async () => { if (!confirm("Smazat díl i s historií servisu?")) return; await api(`gear/parts/${b.dataset.pdel}`, { method: "DELETE" }); reload(); }));
  el.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", async () => { b.disabled = true; await api(`gear/${b.dataset.gid}/parts`, { method: "POST", body: b.dataset.preset }); reload(); }));
  el.querySelectorAll(".pform").forEach((f) => f.addEventListener("submit", async (e) => { e.preventDefault(); const fd = new FormData(f); await api(`gear/${f.dataset.gid}/parts`, { method: "POST", body: JSON.stringify(Object.fromEntries(fd)) }); reload(); }));
}

/** Aktivity s jedním vybavením (klik na vybavení). */
async function pageGear(el, id) {
  const { gear: g, acts } = await api(`gear/${id}/activities`);
  const km = acts.reduce((t, a) => t + (a.distance_m || 0), 0) / 1000, s = acts.reduce((t, a) => t + (a.moving_s || 0), 0), up = acts.reduce((t, a) => t + (a.elev_gain || 0), 0);
  let month = "";
  const list = acts.map((a) => { const m = a.date.slice(0, 7); const head = m !== month ? `<div class="mhead">${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}</div>` : ""; month = m; return head + actRowHtml(a); }).join("");
  el.innerHTML = `<div class="head"><div><a class="back" href="#/vybaveni">← Vybavení</a><h1>${GEAR_KIND[g.kind]?.[0] || "🎒"} ${esc(g.name)}</h1><div class="sub">${acts.length} aktivit · ${thou(km)} km${g.start_km ? ` (+ ${thou(g.start_km)} km před evidencí)` : ""} · ${hmm(s)} h · ↑ ${thou(up)} m</div></div></div>
  <div class="grid">${card("c12", "", "", `<div class="alist">${list || '<div class="empty">S tímto vybavením zatím žádná aktivita.</div>'}</div>`)}</div>`;
}

async function pageSila(el) {
  const d = await api("strength");
  const items = [...d.log.map((l) => ({ date: l.date, kind: l.kind === "sila" ? "🏋️ Síla" : "🧘 Mobilita", note: l.note || "", src: "zápis" })), ...d.garmin.map((g) => ({ date: g.date, kind: g.sport === "strength" ? "🏋️ Síla" : "🧘 Mobilita", note: `${g.name || ""} · ${hmm(g.moving_s)}`, src: "Garmin" }))].sort((a, b) => b.date.localeCompare(a.date));
  const weeks = {};
  for (const i of items) { const dt = new Date(i.date + "T12:00:00Z"); dt.setUTCDate(dt.getUTCDate() - (dow(i.date) - 1)); const mon = dt.toISOString().slice(0, 10); weeks[mon] = weeks[mon] || { s: 0, m: 0 }; weeks[mon][i.kind.includes("Síla") ? "s" : "m"]++; }
  const wk = Object.keys(weeks).sort().slice(-12);
  el.innerHTML = `<div class="head"><div><h1>Síla a mobilita</h1><div class="sub">Zapisuj v Telegramu: /sila [poznámka] · /mobilita [poznámka]. Minimum týdne: síla 1×.</div></div></div><div class="grid">
   ${card("c6", "Plnění po týdnech", "zápis · Garmin", wk.length ? barChart({ x: wk, xfmt: dm, mode: "stack", bars: wk.map((k) => ({ parts: [{ v: weeks[k].s, color: "var(--acc)" }, { v: weeks[k].m, color: "var(--z3)" }] })), tipFn: (i) => `<b>týden od ${dm(wk[i])}</b><div>síla ${weeks[wk[i]].s}× · mobilita ${weeks[wk[i]].m}×</div>` }) + `<div class="legend"><span><i style="background:var(--acc)"></i>síla</span><span><i style="background:var(--z3)"></i>mobilita</span></div>` : '<div class="empty">Zatím nic zapsáno.</div>')}
   ${card("c6", "Záznamy · 90 dní", "zápis · Garmin", items.length ? items.map((i) => `<div class="row"><span class="d">${dayDm(i.date)}</span><span class="t"><b>${i.kind}</b><span class="sub">${esc(i.note)}</span></span><span class="r sub">${i.src}</span></div>`).join("") : '<div class="empty">Žádné záznamy.</div>')}
  </div>`;
}

async function pageChuze(el) {
  const rows = await api("steps");
  const last = rows.slice(-30);
  const avg7 = rows.slice(-7).reduce((s, r) => s + (r.steps || 0), 0) / Math.max(1, rows.slice(-7).length);
  const fl = rows.filter((r) => r.floors_up != null);
  const fl30 = last.map((r) => r.floors_up);
  const flAvg7 = fl.slice(-7).reduce((s, r) => s + (r.floors_up || 0), 0) / Math.max(1, fl.slice(-7).length);
  el.innerHTML = `<div class="head"><h1>Chůze a kroky</h1></div><div class="grid">
   ${card("c4", "Průměr 7 dní", "Garmin", `<div class="bignum">${thou(avg7)}<small> kroků</small></div>${fl.length ? `<div class="bignum sm">${num(flAvg7, 1)}<small> pater denně · dnes ${num(fl[fl.length - 1].floors_up)} ↑ / ${num(fl[fl.length - 1].floors_down)} ↓</small></div>` : ""}<p class="note">Dny s ≥ 5 000 kroky se počítají do minima týdne (5 ze 7). Patro = cca 3 m stoupání.</p>`)}
   ${card("c8", "Kroky · 30 dní", "Garmin", barChart({ x: last.map((r) => r.date), xfmt: dm, bars: last.map((r) => ({ v: r.steps, color: (r.steps || 0) >= 5000 ? "var(--z3)" : "var(--z1)" })), refLine: 5000, fmt: (v) => thou(v) + " kroků" }))}
   ${card("c12", "Vystoupaná patra · 30 dní", "Garmin", fl30.some((v) => v != null) ? barChart({ x: last.map((r) => r.date), xfmt: dm, bars: last.map((r) => ({ v: r.floors_up, color: "var(--z7)" })), height: 150, fmt: (v) => num(v) + " pater", tipFn: (i) => `<b>${dayDm(last[i].date)}</b><div>${num(last[i].floors_up)} pater nahoru · ${num(last[i].floors_down)} dolů</div>` }) : '<div class="empty">Patra se doplňují ze synchronizace (historie se stahuje postupně).</div>')}
   ${card("c12", "Kroky · 120 dní", "Garmin", lineChart({ x: rows.map((r) => r.date), xfmt: dm, fmt: thou, series: [{ name: "kroky", values: rows.map((r) => r.steps), color: "var(--acc)", area: true, width: 1.6 }], zero: true }))}
  </div>`;
}

async function pageVyziva(el) {
  const d = await api("fuel");
  const rides = d.rides.map((r) => `<div class="row"><span class="d">${esc(r.label)}</span><span class="t"><b>${esc(r.name)}</b><span class="sub">${hmm((r.min || 0) * 60)} · ${r.fuel.lines.slice(1).map(esc).join(" · ")}</span></span><span class="r">${esc(r.carbs ? r.carbs.text : "jen voda")}</span></div>`).join("");
  const g = d.goalRide.plan;
  el.innerHTML = `<div class="head"><div><h1>Výživa na trénink</h1><div class="sub">Bidon = 60 g (40 g maltodextrin + 20 g fruktóza) · gel Nduranz Energy 45</div></div></div><div class="grid">
   ${card("c7", "Plánované tréninky", "plán", rides || '<div class="empty">V plánu teď žádný trénink.</div>')}
   ${card("c5", "Tabulka", "pravidla", `<table class="t"><tr><th>Délka</th><th class="r">Sacharidy</th></tr>${d.table.map((t) => `<tr><td>${t.dur}</td><td class="r">${t.carbs}</td></tr>`).join("")}</table><p class="note">Ostřejší jednotky spíš horní hranice, klidné a v chladu dolní.</p><table class="t" style="margin-top:10px"><tr><th>Délka</th><th>Z2</th><th>Kvalita</th></tr>${d.examples.map((e) => `<tr><td>${hmm(e.min * 60)}</td><td>${esc(e.z2)}</td><td>${esc(e.quality)}</td></tr>`).join("")}</table>`)}
   ${card("c12", `Cílová jízda: ${esc(d.goalRide.name || "120 km pod 4 h")}`, "odhad", `${kv([["Délka", hmm(g.durationMin * 60) + " h"], ["🍬 Sacharidy", `${g.carbsTotal} g (${g.carbsPerHour} g/h): ${esc(g.carbsPack)}`], ["💧 Tekutiny", `${num(g.fluidPerHour, 2)} l/h · ${num(g.fluidTotal, 1)} l celkem (odhad)`], ["🧂 Sodík", `${g.sodiumPerHour} mg/h (odhad)`]])}
     <p class="note">Odhady: ${g.estimates.map(esc).join("; ")}. ${esc(d.hint)}</p><p class="note">${esc(d.note)} Pij po doušcích každých 15–20 min, jez po malých dávkách, ne vše najednou.</p>`)}
  </div>`;
}

async function pageNastaveni(el) {
  const [s, st, sec] = await Promise.all([api("settings"), api("status"), api("secrets").catch(() => [])]);
  const SEC_LABEL = { GARMIN_API_KEY: ["Garmin API klíč", "Garmin Connect → Nastavení → Personal API"], INTERVALS_API_KEY: ["intervals.icu API klíč", "intervals.icu → Settings → Developer Settings"], INTERVALS_ATHLETE_ID: ["intervals.icu ID sportovce", "např. i696761 (Settings, vpravo nahoře)"], TOMTOM_API_KEY: ["TomTom API klíč (jemná mapa, volitelné)", "zdarma na developer.tomtom.com → Dashboard → Keys (Map Display API); bez klíče se použije jemná mapa CARTO"], MAPY_API_KEY: ["Mapy.com API klíč (mapové podklady)", "zdarma na developer.mapy.com → Můj účet → API klíč; omez ho na doménu trener-app.trener-app.workers.dev"] };
  const secCard = card("c12", "🔑 Připojení (API klíče)", "šifrovaně", `<div class="form-grid">${sec.map((x) => `<label>${SEC_LABEL[x.key]?.[0] || x.key}<input type="password" autocomplete="off" data-sec="${x.key}" placeholder="${x.source ? `nastaveno (${x.source === "dashboard" ? "zde" : "ze souboru"}) ${x.hint}` : "nenastaveno"}"><small class="sub">${SEC_LABEL[x.key]?.[1] || ""}</small></label>`).join("")}</div>
    <div class="btns"><button class="btn pri" id="secSave">Uložit vyplněné</button><button class="btn" id="secTest">Otestovat připojení</button><span class="note" id="secMsg"></span></div>
    <p class="note">Klíč se uloží zašifrovaný v databázi a má přednost před souborem .dev.vars. Prázdné pole = beze změny. Telegram bot se kvůli webhooku nastavuje dál přes soubor. Aplikace je připravená na víc uživatelů (přihlášení nese id uživatele), zatím má jeden účet – další krok popisuje docs/multi-user.md.</p>`);
  const f = (k, label, type = "text", extra = "") => `<label>${label}<input name="${k}" type="${type}" value="${esc(s[k] ?? "")}" ${extra}></label>`;
  const bf = st.state.bf_act || {}, bw = st.state.bf_well || {};
  el.innerHTML = `<div class="head"><h1>Nastavení</h1></div><div class="grid">
   ${card("c8", "Trénink a zprávy", "", `<form id="sf"><div class="form-grid">
     ${f("ftp", "FTP (W)", "number", 'min="80" max="600"')}
     <label>Cíl (stejný jako v Trenérovi, platí do změny)<select name="goal">${[["zvyseni", "Zlepšit kondici"], ["udrzeni", "Udržet formu"], ["pokles", "Řízený pokles (zima)"], ["zavod", "Závod"]].map(([v, l]) => `<option value="${v}" ${s.goal === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
     ${f("goal_name", "Název cíle / závodu")}
     ${f("place_name", "Místo pro počasí (Přehled)")}
     <label>Počasí: jezdím od (pocitově °C)<input name="t_cold" type="number" min="-15" max="20" value="${s.ride_temps?.cold ?? 3}"></label>
     <label>Počasí: vedro nad (°C)<input name="t_hot" type="number" min="20" max="40" value="${s.ride_temps?.hot ?? 30}"></label>
     <label>Počasí: ideální teplota na jízdu (°C)<input name="t_ideal" type="number" min="0" max="30" value="${s.ride_temps?.ideal ?? 18}"></label>
     ${f("goal_date", "Datum cíle", "date")}
     ${f("goal_ctl", "Cílová kondice CTL k datu cíle (prázdné = návrh)", "number", 'min="10" max="150"')}
     ${f("year_km_goal", "Roční cíl km", "number")}
     ${f("rides_per_week", "Tréninky týdně (2–5)", "number", 'min="2" max="5"')}
     ${f("morning_from", "Ranní zpráva od", "time")}
     ${f("morning_to", "Ranní zpráva nejpozději", "time")}
     ${f("evening_time", "Večerní zpráva (zítřek)", "time")}
     ${f("weekly_time", "Týdenní souhrn (neděle)", "time")}
     ${f("garmin_key_created", "Garmin klíč vytvořen", "date")}
     <label class="chk"><input type="checkbox" name="llm_enabled" ${s.llm_enabled ? "checked" : ""}> LLM (Workers AI) pro volné otázky</label>
     <label class="chk"><input type="checkbox" name="llm_polish" ${s.llm_polish ? "checked" : ""}> LLM uhlazuje závěr zpráv</label>
     <label class="chk"><input type="checkbox" name="floor_strength" ${s.floor_strength ? "checked" : ""}> Síla 1× týdně v minimu týdne</label>
     <label class="chk"><input type="checkbox" name="icu_sync" ${s.icu_sync ? "checked" : ""}> Zápis plánu do intervals.icu</label>
   </div><div class="btns"><button class="btn pri" type="submit">Uložit</button><span class="note" id="saved"></span></div></form>`)}
   ${card("c4", "Zóny tepu", s.hr_zones ? s.hr_zones.source : "", s.hr_zones ? kv([...s.hr_zones.floors.map((v, i) => [`Z${i + 1} od`, v + " bpm"]), ["Max", s.hr_zones.max + " bpm"], ["LTHR", (s.hr_zones.lthr ?? DASH) + " bpm"], ["Klidový", (s.hr_zones.rest ?? DASH) + " bpm"]]) : '<div class="empty">Nemám.</div>')}
   ${card("c6", "Stav synchronizace", st.source, kv([
     ["Poslední sync", st.state.last_sync_ok ? new Date(st.state.last_sync_ok).toLocaleString("cs-CZ") : DASH],
     ["Aktivity", `${st.counts.acts} (od ${st.counts.a_from ? dm(st.counts.a_from) + st.counts.a_from.slice(0, 4) : DASH})`],
     ["Dny wellness / noci", `${st.counts.days} / ${st.counts.nights}`],
     ["Backfill aktivit", bf.done ? "hotovo" : `${bf.count ?? 0}…`],
     ["Backfill wellness", bw.done ? "hotovo" : bw.cursor ?? DASH],
     ["Naplánované jednotky", st.counts.planned],
     ["LLM", st.llm ? esc(st.model) : "nedostupné"],
   ]))}
   ${card("c6", "Události", "Cloudflare", `<p class="note">Jeden cron (každých 5 min), sync po malých dávkách. Detail v docs/limits.md.</p><table class="t"><tr><th>Kdy</th><th>Událost</th></tr>${st.logs.slice(0, 8).map((l) => `<tr><td class="sub">${new Date(l.at).toLocaleString("cs-CZ")}</td><td>${esc(l.level)}: ${esc(l.msg)}</td></tr>`).join("")}</table>`)}
   ${await accountCard(el)}
   ${secCard}
   ${card("c12", "Vzhled a účet", "", `<div class="sl" style="margin-bottom:6px">Motiv</div><div class="skins">${SKINS.map(([k, l, d2]) => `<button class="skinopt ${getSkin() === k ? "on" : ""}" data-skin="${k}"><span class="sk-sw sk-${k}"></span><b>${l}</b><small>${d2}</small></button>`).join("")}</div><div class="sl" style="margin:14px 0 6px">Světlý / tmavý (platí pro oba motivy)</div><div class="btns" style="margin-top:0">${["auto", "light", "dark"].map((t) => `<button class="btn" data-theme="${t}">${{ auto: "Podle systému", light: "Světlý", dark: "Tmavý" }[t]}</button>`).join("")}<a class="btn" href="/logout">Odhlásit</a></div>`)}
  </div>`;
  el.querySelector("#sf").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {};
    for (const k of ["ftp", "year_km_goal", "rides_per_week", "goal_ctl"]) body[k] = fd.get(k) ? Number(fd.get(k)) : null;
    for (const k of ["goal", "goal_name", "goal_date", "place_name", "morning_from", "morning_to", "evening_time", "weekly_time", "garmin_key_created"]) body[k] = fd.get(k) || null;
    for (const k of ["llm_enabled", "llm_polish", "icu_sync", "floor_strength"]) body[k] = fd.get(k) === "on";
    body.ride_temps = { cold: Number(fd.get("t_cold") ?? 3), hot: Number(fd.get("t_hot") ?? 30), ideal: Number(fd.get("t_ideal") ?? 18) };
    const r = await api("settings", { method: "POST", body: JSON.stringify(body) });
    cache.clear();
    el.querySelector("#saved").textContent = r.proposal ? `Uloženo. Cíl změněn – ${r.proposal.count} změn v plánu čeká na potvrzení v Trenérovi.` : "Uloženo.";
  });
  el.querySelectorAll("[data-theme]").forEach((b) => b.addEventListener("click", () => setTheme(b.dataset.theme)));
  el.querySelectorAll("[data-skin]").forEach((b) => b.addEventListener("click", () => { setSkin(b.dataset.skin); el.querySelectorAll("[data-skin]").forEach((x) => x.classList.toggle("on", x === b)); }));
  el.querySelector("#secSave")?.addEventListener("click", async () => {
    const msg = el.querySelector("#secMsg");
    let n = 0;
    for (const inp of el.querySelectorAll("[data-sec]")) if (inp.value.trim()) { await api("secrets", { method: "POST", body: JSON.stringify({ key: inp.dataset.sec, value: inp.value.trim() }) }); inp.value = ""; n++; }
    msg.textContent = n ? `Uloženo (${n}). Otestuj připojení.` : "Nic k uložení.";
    cache.clear();
  });
  el.querySelector("#secTest")?.addEventListener("click", async () => { const msg = el.querySelector("#secMsg"); msg.textContent = "Zkouším…"; try { const r = await api("secrets/test", { method: "POST" }); msg.textContent = `Garmin: ${r.garmin} · intervals.icu: ${r.intervals}`; } catch (e) { msg.textContent = e.message; } });
}

// ---------- kalendář ----------
let calMonth = null; // "YYYY-MM"
let calShow = "sleep"; // co ukázat v buňce kromě aktivit: sleep | steps | bb
/** barva sportu v kalendáři (proužek u aktivity) */
const SPORT_COLOR = { ride: "var(--z2)", mtb: "var(--z3)", indoor: "var(--z1)", run: "var(--acc)", xc_ski: "#4fa3d8", walk: "var(--z4)", hike: "var(--z4)", hockey: "var(--z7)", skate: "var(--z7)", padel: "var(--z6)", strength: "var(--z6)", mobility: "var(--srem)", other: "var(--z1)" };
async function pageKalendar(el) {
  const d = await api("calendar" + (calMonth ? `?month=${calMonth}` : ""));
  calMonth = d.month;
  const y = +d.month.slice(0, 4), m = +d.month.slice(5, 7);
  const first = `${d.month}-01`;
  const lead = dow(first) - 1;
  const days = [];
  for (let x = first; x <= d.to; x = addDay(x, 1)) days.push(x);
  const wBy = new Map(d.well.map((w) => [w.date, w]));
  const aBy = new Map(); for (const a of d.acts) aBy.set(a.date, [...(aBy.get(a.date) || []), a]);
  const pBy = new Map(); for (const p of d.plan) if (!aBy.has(p.date) || p.status !== "done") pBy.set(p.date, p);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const metric = (w) => {
    if (!w) return "";
    if (calShow === "sleep" && w.sleep_score != null) { const t = w.sleep_score >= 80 ? "good" : w.sleep_score >= 60 ? "warn" : "bad"; return `<span class="cm ${t}" title="skóre spánku"><i>🌙</i>${w.sleep_score}</span>`; }
    if (calShow === "steps" && w.steps != null) return `<span class="cm ${w.steps >= d.stepsGoal ? "good" : ""}" title="kroky"><i>👣</i>${num(w.steps / 1000, 1)}k</span>`;
    if (calShow === "bb" && w.bb_max != null) { const t = w.bb_max >= 75 ? "good" : w.bb_max >= 50 ? "warn" : "bad"; return `<span class="cm ${t}" title="Body Battery ráno"><i>🔋</i>${w.bb_max}</span>`; }
    return "";
  };
  // zátěž dne → podbarvení buňky (čím víc, tím sytější)
  const dayLoad = (x) => (aBy.get(x) || []).reduce((t, a) => t + (a.load || 0), 0);
  const heat = (l) => (l <= 0 ? 0 : clamp(l / 160, 0.12, 1));
  const cell = (x) => {
    const acts = aBy.get(x) || [], w = wBy.get(x), p = pBy.get(x), l = dayLoad(x);
    const inStatus = d.status && d.status.kind !== "active" && (!d.status.from || x >= d.status.from) && (!d.status.until || x <= d.status.until);
    const we = dow(x) >= 6;
    const planned = !acts.length && p && x >= d.today ? `<div class="cp ${p.kind === "quality" ? "q" : ""}" title="${esc(p.name)}"><span>${p.kind === "quality" ? "⚡" : p.kind === "long" ? "🛣️" : "○"}</span>${esc(p.name.replace(/^Trenažér – /, "🏠 "))}</div>` : "";
    const missed = !acts.length && p && x < d.today && p.status === "missed" ? `<div class="cp miss">✕ vynecháno</div>` : "";
    return `<div class="cday ${x === d.today ? "today" : ""} ${x > d.today ? "fut" : ""} ${inStatus ? "st" : ""} ${we ? "we" : ""}" style="--heat:${heat(l).toFixed(2)}"><div class="cd-h"><b>${+x.slice(8, 10)}</b>${metric(w)}</div>
      <div class="cacts">${acts.map((a) => `<a class="ca" href="#/aktivita/${a.id}" title="${esc(a.name || "")}" style="--sc:${SPORT_COLOR[a.sport] || "var(--z1)"}"><span class="ca-i">${SPORT_ICON[a.sport] || "🏅"}</span><span class="ca-t">${a.km ? `${num(a.km, a.km < 20 ? 1 : 0)} km` : `${a.min} min`}</span></a>`).join("")}</div>
      ${planned}${missed}${l > 0 ? `<div class="cl" title="zátěž ${Math.round(l)}"><i style="width:${clamp(l / 2, 4, 100)}%"></i><span>${Math.round(l)}</span></div>` : ""}</div>`;
  };
  // týdny (po–ne) se souhrnem vpravo
  const weeks = [];
  let wk = Array(lead).fill(null);
  for (const x of days) { wk.push(x); if (wk.length === 7) { weeks.push(wk); wk = []; } }
  if (wk.length) weeks.push([...wk, ...Array(7 - wk.length).fill(null)]);
  const weekSum = (ws) => {
    const as = ws.filter(Boolean).flatMap((x) => aBy.get(x) || []);
    const km = as.reduce((t, a) => t + (a.km || 0), 0), min = as.reduce((t, a) => t + (a.min || 0), 0), l = as.reduce((t, a) => t + (a.load || 0), 0);
    return `<div class="cweek">${as.length ? `<b>${thou(km)}<small> km</small></b><span>${hmm(min * 60)} h</span><span class="sub">zátěž ${thou(l)}</span>` : `<span class="sub">–</span>`}</div>`;
  };
  const grid = weeks.map((ws) => ws.map((x) => (x ? cell(x) : '<div class="cday empty"></div>')).join("") + weekSum(ws)).join("");
  const km = d.acts.reduce((t, a) => t + (a.km || 0), 0), load = d.acts.reduce((t, a) => t + (a.load || 0), 0), mins = d.acts.reduce((t, a) => t + (a.min || 0), 0);
  const ss = d.well.map((w) => w.sleep_score).filter((v) => v != null);
  const stepsOk = d.well.filter((w) => (w.steps || 0) >= d.stepsGoal).length;
  const tile = (ico, v, l) => `<div class="ctile"><small>${ico} ${l}</small><b>${v}</b></div>`;
  el.innerHTML = `<div class="head"><div><h1>Kalendář</h1></div>
    <div class="dnav"><button class="btn sm" data-m="${prev}">‹</button><b>${MONTHS[m - 1]} ${y}</b><button class="btn sm" data-m="${next}">›</button></div></div>
  <div class="ctiles">${tile("🏅", d.acts.length, "aktivit")}${tile("🛣️", thou(km), "km")}${tile("⏱️", hmm(mins * 60), "hodin")}${tile("🔥", thou(load), "zátěž")}${tile("🌙", ss.length ? num(ss.reduce((a, b) => a + b, 0) / ss.length) : DASH, "spánek ⌀ skóre")}${tile("👣", `${stepsOk}`, `dní ${num(d.stepsGoal / 1000)}k+ kroků`)}</div>
  <div class="seg sm calseg">${[["sleep", "🌙 Spánek"], ["steps", "👣 Kroky"], ["bb", "🔋 Body Battery"]].map(([k, l]) => `<button class="${calShow === k ? "on" : ""}" data-cs="${k}">${l}</button>`).join("")}</div>
  <section class="card cal"><div class="cgrid">${DAYS.map((x) => `<div class="cdow">${x}</div>`).join("")}<div class="cdow">Týden</div>${grid}</div>
  <div class="legend"><span>⚡ plánovaná kvalita · 🛣️ dlouhá · ○ plánovaný trénink</span><span>${calShow === "sleep" ? "skóre spánku: zelená ≥ 80, žlutá 60–79" : calShow === "steps" ? `zelená = aspoň ${thou(d.stepsGoal)} kroků` : "Body Battery ráno: zelená ≥ 75"}</span></div></section>`;
  el.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => { calMonth = b.dataset.m; pageKalendar(el); }));
  el.querySelectorAll("[data-cs]").forEach((b) => b.addEventListener("click", () => { calShow = b.dataset.cs; pageKalendar(el); }));
}

// ---------- chat s AI ----------
const CHAT_KEY = "chatHistory";
const loadChat = (k = CHAT_KEY) => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
const saveChat = (h, k = CHAT_KEY) => { try { localStorage.setItem(k, JSON.stringify(h.slice(-40))); } catch {} };
/** jednoduchý markdown: **tučně**, odrážky, odstavce */
const md = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").split(/\n{2,}/).map((p) => (/^\s*[-•*] /m.test(p) ? `<ul>${p.split("\n").filter((l) => l.trim()).map((l) => `<li>${l.replace(/^\s*[-•*] /, "")}</li>`).join("")}</ul>` : `<p>${p.replace(/\n/g, "<br>")}</p>`)).join("");
/**
 * Chat (stránka Chat i panel 🤖 na každé stránce). opts.page = {title, text} – data, která jsou vidět na stránce,
 * AI je dostane navíc ke svému kontextu, takže se dá ptát „co znamená tohle číslo“.
 */
function chatUi(root, { key = CHAT_KEY, sugg = [], page = null } = {}) {
  let hist = loadChat(key);
  root.innerHTML = `<div class="msgs"></div><div class="sugg">${sugg.map((s) => `<button class="btn sm">${esc(s)}</button>`).join("")}</div>
    <form class="chatform"><textarea rows="1" placeholder="Zeptej se…" enterkeyhint="send"></textarea><button class="btn pri" type="submit" aria-label="Odeslat">➤</button></form><div class="aiuse"></div>`;
  const box = root.querySelector(".msgs"), inp = root.querySelector("textarea"), sg = root.querySelector(".sugg");
  // kolik denního limitu Workers AI padlo (odhad; sdílený pro celý účet, obnoví se v 1:00 našeho času)
  const use = (u) => { const el2 = root.querySelector(".aiuse"); if (!el2 || !u) return; const pc = Math.min(100, Math.round((u.used / u.limit) * 100)); el2.innerHTML = `<div class="au-bar"><i style="width:${pc}%" class="${pc >= 85 ? "bad" : pc >= 60 ? "warn" : ""}"></i></div><span>AI dnes ~${pc} % denního limitu zdarma${pc >= 85 ? " – brzy dojde, obnoví se v 1:00" : ""}</span>`; };
  fetch("/api/ai-usage", { credentials: "same-origin", cache: "no-store" }).then((x) => x.json()).then(use).catch(() => {});
  const draw = (pending = false) => {
    box.innerHTML = hist.length || pending ? hist.map((m) => `<div class="msg ${m.role}">${m.role === "assistant" ? md(m.content) : `<p>${esc(m.content)}</p>`}${m.warn ? `<small class="sub">⚠️ odpověď obsahuje číslo, které v tvých datech není – ber s rezervou</small>` : ""}</div>`).join("") + (pending ? `<div class="msg assistant"><span class="spin"></span></div>` : "") : `<div class="empty">${page ? `Ptej se na to, co vidíš na stránce „${esc(page.title || "")}“.` : "Zeptej se na trénink, plán, spánek nebo cokoli dalšího."}</div>`;
    box.scrollTop = box.scrollHeight;
    sg.style.display = hist.length ? "none" : "";
  };
  const send = async (text) => {
    text = text.trim();
    if (!text) return;
    hist.push({ role: "user", content: text });
    saveChat(hist, key); draw(true); inp.value = ""; inp.style.height = "auto";
    try {
      const r = await api("chat", { method: "POST", body: JSON.stringify({ messages: hist.map(({ role, content }) => ({ role, content })), page }) });
      hist.push({ role: "assistant", content: r.answer, warn: !r.checked });
      use(r.ai);
      if (r.action) cache.clear();
    } catch (e) { hist.push({ role: "assistant", content: `Teď to nejde: ${e.message}` }); }
    saveChat(hist, key); draw();
  };
  draw();
  root.querySelector(".chatform").addEventListener("submit", (e) => { e.preventDefault(); send(inp.value); });
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(inp.value); } });
  inp.addEventListener("input", () => { inp.style.height = "auto"; inp.style.height = Math.min(120, inp.scrollHeight) + "px"; });
  sg.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => send(b.textContent)));
  return { clear: () => { hist = []; saveChat(hist, key); draw(); }, focus: () => inp.focus() };
}
async function pageChat(el) {
  el.innerHTML = `<div class="head"><div><h1>Chat s trenérem</h1></div><button class="btn sm" id="chatClear">Smazat konverzaci</button></div>
  <section class="card chat" id="chatBox"></section>`;
  const ui = chatUi(el.querySelector("#chatBox"), { sugg: ["Jaký je dnešní trénink a proč?", "Jak jsem na tom se zotavením?", "Zítra jedu 3 h s kamarádem", "Co mám dnes jíst před jízdou?"] });
  el.querySelector("#chatClear").addEventListener("click", () => ui.clear());
}
/** 🤖 panel s AI nad aktuální stránkou (data stránky jdou jako kontext). */
function openAiPanel() {
  const main = document.getElementById("main");
  const title = (main.querySelector("h1")?.textContent || "Stránka").trim();
  const text = (main.innerText || "").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").slice(0, 3500);
  const ov = document.createElement("div");
  ov.className = "modal aip";
  ov.innerHTML = `<div class="modal-in"><div class="ch"><h2>🤖 Zeptej se · ${esc(title)}</h2><button class="btn sm" data-clr title="smazat konverzaci">🗑</button><button class="btn sm" data-x>✕</button></div><div class="aibox chat"></div></div>`;
  document.body.appendChild(ov);
  const ui = chatUi(ov.querySelector(".aibox"), { key: "chatPage:" + location.hash.split("/")[1], page: { title, hash: location.hash, text }, sugg: ["Co z těch čísel vyplývá?", "Je něco, čeho bych se měl bát?", "Co mám dnes dělat?"] });
  const close = () => ov.remove();
  ov.querySelector("[data-x]").onclick = close;
  ov.querySelector("[data-clr]").onclick = () => ui.clear();
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  setTimeout(() => ui.focus(), 50);
}
/** tlačítko 🤖 do hlavičky každé stránky (vpravo nahoře) */
function addAiButton(el) {
  const head = el.querySelector(".head");
  if (!head || head.querySelector(".aibtn") || location.hash.startsWith("#/chat")) return;
  const b = document.createElement("button");
  b.className = "aibtn";
  b.title = "Zeptat se AI na tuto stránku";
  b.setAttribute("aria-label", "Zeptat se AI");
  b.textContent = "🤖";
  b.addEventListener("click", openAiPanel);
  if (innerWidth <= 760) head.insertBefore(b, head.children[1] || null); // mobil: hned za nadpis (vpravo nahoře)
  else head.appendChild(b); // PC: za přepínači, zarovnané s nimi
}

// ---------- účty: přihlášení, registrace z pozvánky ----------
async function postAuth(path, body) {
  const r = await fetch("/auth/" + path, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
function loginPage(el) {
  el.innerHTML = `<div class="authbox card"><div class="auth-ico"><img src="apple-touch-icon.png" alt=""></div><h1>Trenér</h1><p class="sub">Přihlas se – zařízení si přihlášení pamatuje rok.</p>
    <form id="loginF" class="authf"><label>Jméno<input name="username" autocomplete="username" autocapitalize="none" required></label><label>Heslo<input name="password" type="password" autocomplete="current-password" required></label><button class="btn pri" type="submit">Přihlásit</button><p class="note" id="loginMsg"></p></form>
    <p class="note">Vlastník se může přihlásit i odkazem z Telegramu (/dashboard). Účet ti založí vlastník pozvánkou.</p></div>`;
  el.querySelector("#loginF").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target), msg = el.querySelector("#loginMsg");
    msg.textContent = "Přihlašuji…";
    try { await postAuth("login", { username: fd.get("username"), password: fd.get("password") }); cache.clear(); location.hash = "#/prehled"; route(); }
    catch (err) { msg.textContent = err.message; }
  });
}
function joinPage(el, token) {
  el.innerHTML = `<div class="authbox card"><div class="auth-ico"><img src="apple-touch-icon.png" alt=""></div><h1>Vítej v Trenérovi</h1><p class="sub">Založ si účet. Tvoje data uvidíš jen ty.</p>
    <form id="joinF" class="authf"><label>Jak ti mám říkat<input name="name" placeholder="např. Honza" required></label><label>Přihlašovací jméno<input name="username" autocapitalize="none" placeholder="honza" required pattern="[a-z0-9._-]{3,30}"></label><label>Heslo (aspoň 6 znaků)<input name="password" type="password" autocomplete="new-password" minlength="6" required></label><button class="btn pri" type="submit">Založit účet</button><p class="note" id="joinMsg"></p></form>
    <p class="note">Po založení zadáš v Nastavení svůj Garmin klíč (a případně intervals.icu) – pak se začnou stahovat tvoje data.</p></div>`;
  el.querySelector("#joinF").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target), msg = el.querySelector("#joinMsg");
    msg.textContent = "Zakládám účet…";
    try { await postAuth("join", { token, name: fd.get("name"), username: String(fd.get("username")).toLowerCase(), password: fd.get("password") }); cache.clear(); location.hash = "#/nastaveni"; route(); }
    catch (err) { msg.textContent = err.message; }
  });
}

/** Nastavení → účet (heslo, Telegram) a pro vlastníka správa uživatelů. */
async function accountCard(el) {
  const me = await api("me").catch(() => null);
  if (!me) return "";
  const users = me.role === "owner" ? await api("users").catch(() => []) : [];
  const box = `<div class="form-grid"><label>Přihlašovací jméno<input id="acUser" value="${esc(me.username || "")}" autocapitalize="none"></label>${me.hasPassword ? `<label>Současné heslo<input id="acOld" type="password" autocomplete="current-password"></label>` : ""}<label>${me.hasPassword ? "Nové heslo" : "Heslo"}<input id="acPass" type="password" autocomplete="new-password"></label></div>
    <div class="btns"><button class="btn pri" id="acSave">${me.hasPassword ? "Změnit heslo" : "Nastavit jméno a heslo"}</button><span class="note" id="acMsg"></span></div>
    <div class="sl" style="margin:14px 0 6px">Telegram</div>
    ${me.telegram ? `<p class="note">✅ Propojeno – zprávy chodí do Telegramu.</p>` : `<p class="note">Ranní zhodnocení, rozbory a plán ti může posílat bot v Telegramu.</p><div class="btns"><button class="btn" id="tgLink">Propojit Telegram</button><span class="note" id="tgMsg"></span></div>`}`;
  const ulist = me.role === "owner" ? `<div class="sl" style="margin:16px 0 6px">Uživatelé (${users.filter((u) => u.active).length} / 10)</div>
    <table class="t"><tr><th>Jméno</th><th>Přihlášení</th><th>Telegram</th><th class="r"></th></tr>${users.map((u) => `<tr><td><b>${esc(u.name || (u.role === "owner" ? "ty" : "–"))}</b>${u.role === "owner" ? ' <span class="sub">vlastník</span>' : ""}</td><td>${esc(u.username || "–")}</td><td>${u.tg || u.role === "owner" ? "✅" : "–"}</td><td class="r">${u.role === "owner" ? "" : `<button class="btn sm" data-uact="${u.id}" data-on="${u.active ? 0 : 1}">${u.active ? "Vypnout" : "Zapnout"}</button>`}</td></tr>`).join("")}</table>
    <div class="btns"><button class="btn pri" id="invBtn">＋ Pozvat (odkaz)</button></div><div id="invOut"></div>
    <p class="note">Každý má svá data ve vlastních tabulkách a vlastní Garmin klíč; vidí jen svoje. Do 4 dalších lidí se jejich data stahují každých 5 minut jako tvoje, při víc lidech se střídají (free plán Cloudflare).</p>` : "";
  setTimeout(() => {
    el.querySelector("#acSave")?.addEventListener("click", async () => {
      const msg = el.querySelector("#acMsg");
      try { await api("me/password", { method: "POST", body: JSON.stringify({ username: el.querySelector("#acUser").value, password: el.querySelector("#acPass").value, old: el.querySelector("#acOld")?.value }) }); msg.textContent = "✓ Uloženo."; el.querySelector("#acPass").value = ""; }
      catch (e) { msg.textContent = e.message; }
    });
    el.querySelector("#tgLink")?.addEventListener("click", async () => {
      const r = await api("me/telegram", { method: "POST" });
      el.querySelector("#tgMsg").innerHTML = `Napiš botovi v Telegramu: <b>/start ${r.code}</b> (platí 30 min)`;
    });
    el.querySelector("#invBtn")?.addEventListener("click", async () => {
      try {
        const r = await api("users/invite", { method: "POST" });
        el.querySelector("#invOut").innerHTML = `<div class="invl"><input readonly value="${esc(r.url)}"><button class="btn sm" id="invCopy">Kopírovat</button></div><p class="note">Odkaz platí 7 dní a jen jednou. Pošli ho tomu, koho zveš.</p>`;
        el.querySelector("#invCopy").onclick = () => { navigator.clipboard?.writeText(r.url); el.querySelector("#invCopy").textContent = "✓ Zkopírováno"; };
      } catch (e) { el.querySelector("#invOut").textContent = e.message; }
    });
    el.querySelectorAll("[data-uact]").forEach((b) => b.addEventListener("click", async () => { await api(`users/${b.dataset.uact}/active`, { method: "POST", body: JSON.stringify({ active: b.dataset.on === "1" }) }); cache.clear(); route(); }));
  });
  return card("c12", "👤 Účet", me.role === "owner" ? "vlastník" : "", box + ulist);
}

// ---------- router ----------
function setTheme(t) {
  try { t === "auto" ? localStorage.removeItem("theme") : localStorage.setItem("theme", t); } catch {}
  if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t);
}
try { const t = localStorage.getItem("theme"); if (t) document.documentElement.setAttribute("data-theme", t); } catch {}
// motivy: Původní · A Noční kokpit (tmavý) · B Papír a inkoust (světlý) – jen jiná sada CSS proměnných a písmo nadpisů
const SKINS = [["orig", "Původní", "teplé barvy, oranžový akcent"], ["k", "Kokpit", "modernější, chladné barvy, výraznější čísla"]];
const getSkin = () => { try { const k = localStorage.getItem("skin"); return k === "a" || k === "b" ? "k" : k || "orig"; } catch { return "orig"; } };
function setSkin(k) {
  try { k === "orig" ? localStorage.removeItem("skin") : localStorage.setItem("skin", k); } catch {}
  if (k === "orig") document.documentElement.removeAttribute("data-skin"); else document.documentElement.setAttribute("data-skin", k);
  if (k !== "orig" && !document.getElementById("skinFont")) {
    const l = document.createElement("link");
    l.id = "skinFont"; l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;700&display=swap";
    document.head.appendChild(l);
  }
  hydrateAll();
}
function hydrateAll() { document.querySelectorAll(".sized").forEach((b) => { delete b.dataset.w; renderSized(b); }); }
if (getSkin() !== "orig") setSkin(getSkin());

function menu(active) {
  const link = ([k, l]) => `<a href="#/${k}" class="${k === active ? "on" : ""}"><span class="ico">${icon(k)}</span><span>${l}</span></a>`;
  document.getElementById("menu").innerHTML = MAIN.map(link).join("") + `<div class="msep">Další</div>` + MORE.map(link).join("");
  const moreOn = MORE.some(([k]) => k === active);
  document.getElementById("tabbar").innerHTML = MAIN.map(link).join("") + `<button class="${moreOn ? "on" : ""}" id="moreBtn"><span class="ico">${icon("vice")}</span><span>Více</span></button>`;
  document.getElementById("sheet").innerHTML = `<div class="sheet-in">${MORE.map(link).join("")}</div>`;
  document.getElementById("moreBtn").addEventListener("click", (e) => { e.stopPropagation(); document.getElementById("sheet").classList.toggle("on"); });
}
document.addEventListener("click", (e) => { const sh = document.getElementById("sheet"); if (sh.classList.contains("on") && !e.target.closest(".sheet-in")) sh.classList.remove("on"); });

const ROUTES = { kalendar: pageKalendar, chat: pageChat, prehled: pagePrehled, trener: pageTrener, aktivity: pageAktivity, kolo: pageAktivity, zotaveni: pageZotaveni, kondice: pageKondice, telo: pageTelo, vybaveni: pageVybaveni, sila: pageSila, chuze: pageChuze, vyziva: pageVyziva, nastaveni: pageNastaveni };

let routeSeq = 0;
let prevHash = null, detailOrigin = null; // „← Zpět“ z detailu vede tam, odkud jsem do detailů přišel (Přehled / Zotavení / Trenér)
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-back]");
  const to = location.hash.startsWith("#/detail/") ? detailOrigin : prevHash;
  if (a && to && to !== location.hash) { e.preventDefault(); location.hash = to; }
});
const scrollMem = new Map(); // stránka → pozice (návrat ze detailu aktivity do seznamu)
let curHash = location.hash;
// vysvětlivky (p.note delší než jedna krátká věta) se sbalí do rozklikávacího „ⓘ Vysvětlivky“; víc poznámek
// za sebou = jeden rozklik. Stavové zprávy (s id), poznámky v plánu, formulářích a uvnitř rozkliků zůstávají.
function foldNotes(root) {
  const notes = [...root.querySelectorAll("p.note")].filter((n) => !n.id && !n.closest("details, form, .tdays, .tpend, .modal, .authbox, .err") && n.textContent.trim().length > 70);
  for (const n of notes) {
    if (!n.isConnected || n.closest("details")) continue;
    const prev = n.previousElementSibling;
    if (prev && prev.matches("details.info")) { prev.appendChild(n); continue; }
    const d = document.createElement("details");
    d.className = "info";
    d.innerHTML = "<summary>ⓘ Vysvětlivky</summary>";
    n.replaceWith(d);
    d.appendChild(n);
  }
}
let foldQ = false;
new MutationObserver(() => { if (foldQ) return; foldQ = true; requestAnimationFrame(() => { foldQ = false; const m = document.getElementById("main"); if (m) foldNotes(m); }); }).observe(document.getElementById("main"), { childList: true, subtree: true });

async function route() {
  const seq = ++routeSeq;
  scrollMem.set(curHash, scrollY);
  if (curHash !== location.hash) prevHash = curHash;
  if (location.hash.startsWith("#/detail/") && prevHash && !prevHash.startsWith("#/detail/")) detailOrigin = prevHash;
  curHash = location.hash;
  const [page, arg] = (location.hash.replace(/^#\/?/, "") || "prehled").split("/");
  const main = document.getElementById("main");
  menu(page === "aktivita" || page === "kolo" ? "aktivity" : page === "detail" ? "zotaveni" : page);
  document.getElementById("sheet").classList.remove("on");
  main.innerHTML = `<div class="loading"><span class="spin"></span>Načítám…</div>`;
  hideTip();
  // stránka se kreslí do vlastního kontejneru; starší (pomalejší) požadavek nesmí přepsat novější
  const el = document.createElement("div");
  try {
      mapHover = null;
    if (page === "join") joinPage(el, arg);
    else if (page === "login") loginPage(el);
    else if (page === "aktivita") await pageAktivita(el, arg);
    else if (page === "detail") await pageDetail(el, arg);
    else if (page === "vybaveni" && arg) await pageGear(el, arg);
    else await (ROUTES[page] || pagePrehled)(el);
  } catch (e) {
    if (/přihlášený|login|vypnutý/.test(e.message)) loginPage(el);
    else el.innerHTML = `<div class="err"><b>Data se nepodařilo načíst.</b><br>${esc(e.message)}</div>`;
  }
  if (seq !== routeSeq) return;
  addAiButton(el);
  main.replaceChildren(el);
  const back = scrollMem.get(location.hash);
  if (back && (page === "aktivity" || page === "kolo" || (page === "vybaveni" && arg) || page === "kalendar")) requestAnimationFrame(() => scrollTo(0, back));
  else scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
// aplikace z plochy (iPhone) si pamatuje adresu z doby přidání → po spuštění vždy Přehled
const standalone = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
try { if (standalone && !sessionStorage.getItem("started")) { sessionStorage.setItem("started", "1"); if (!location.hash.startsWith("#/aktivita/")) history.replaceState(null, "", "#/prehled"); } } catch {}
document.documentElement.classList.toggle("standalone", standalone);
route();
api("settings").then((s) => { document.getElementById("brandName").textContent = s.first_name || "Trenér"; }).catch(() => {});
