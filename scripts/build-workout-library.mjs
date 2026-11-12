// Převod knihovny tréninků z projektu Domestique (Apache-2.0, github.com/platypus45/domestique) do úsporné
// podoby pro Trenéra v2. Bere se jen HLAVNÍ ČÁST tréninku (intervaly a pauzy mezi nimi) – rozjetí, dojezd,
// lapy a watty si trenér staví sám podle zón uživatele.
//
// Použití: node scripts/build-workout-library.mjs <cesta k domestique/src/workouts>
// Výstup:  src/core/coach/workouts.data.ts (výběr ~300 tréninků, každý jiného tvaru)
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir) { console.error("chybí cesta ke složce workouts"); process.exit(1); }
const cls = JSON.parse(fs.readFileSync(path.join(dir, ".content_classification.json"), "utf8")).classifications;

const CAT = {
  tempo: "tempo", tempo_intervals: "tempo", tempo_ladder: "tempo",
  sweet_spot: "ss", sweet_spot_ladder: "ss",
  threshold: "thr", threshold_ladder: "thr",
  over_under: "ou",
  vo2max: "vo2", vo2_ladder: "vo2",
  vo2_short: "vo2s",
  anaerobic: "ana",
  neuromuscular: "nm",
};
/** kolik tréninků z kategorie vzít */
const PER_CAT = { tempo: 24, ss: 32, thr: 36, ou: 28, vo2: 32, vo2s: 24, ana: 20, nm: 18 };
const HARD = 0.76; // nad vrškem Z2

/**
 * Délky úseků jako v běžných tréninkových plánech (zdrojové tréninky mají i 17:03 nebo 6:18 – to se nedává).
 * Práce od 10 min: běžné délky (10, 12, 15, 18, 20, 24, 25, 30 … min – srov. knihovna 80/20 Endurance, kde tempo
 * má 15–45 min a cruise intervaly 3–15 min po celých minutách); 2–10 min celé minuty, pod 4 min i půlminuty;
 * 1–2 min po půlminutách; kratší na běžné sekundy. Pauzy od minuty po půlminutách. Konkrétní sada je vlastní volba.
 */
const LONG_MIN = [10, 12, 15, 18, 20, 24, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90];
const SHORT_S = [5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 45];
const nearest = (v, list) => list.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b));
export const tidy = (s, work = true) => {
  if (!work) return s >= 60 ? Math.round(s / 30) * 30 : Math.round(s / 5) * 5 || 5;
  if (s >= 600) return nearest(s / 60, LONG_MIN) * 60;
  if (s >= 240) return Math.round(s / 60) * 60;
  if (s >= 60) return Math.round(s / 30) * 30;
  return nearest(s, SHORT_S);
};
const attr = (tag, k) => { const m = new RegExp(`\\b${k}="([^"]+)"`).exec(tag); return m ? +m[1] : null; };

/** ZWO → plochý seznam úseků [s, podíl FTP] */
function flat(xml) {
  const out = [];
  for (const m of xml.matchAll(/<(Warmup|Cooldown|Ramp|SteadyState|IntervalsT|FreeRide)\b([^>]*)>/g)) {
    const [, t, a] = m;
    const dur = attr(a, "Duration");
    if (t === "IntervalsT") {
      const n = attr(a, "Repeat"), on = attr(a, "OnDuration"), off = attr(a, "OffDuration"), pOn = attr(a, "OnPower"), pOff = attr(a, "OffPower");
      if (!n || !on || pOn == null) return null;
      for (let i = 0; i < n; i++) { out.push([on, pOn]); if (off) out.push([off, pOff ?? 0.5]); }
    } else if (t === "SteadyState") { const p = attr(a, "Power"); if (!dur || p == null) return null; out.push([dur, p]); }
    else if (t === "FreeRide") { if (dur) out.push([dur, 0.6]); }
    else { const lo = attr(a, "PowerLow"), hi = attr(a, "PowerHigh"); if (!dur || lo == null || hi == null) return null; out.push([dur, (lo + hi) / 2]); }
  }
  return out;
}

/** hlavní část: od prvního do posledního těžkého úseku; krátké „probuzení“ v rozjetí se nepočítá */
function mainSet(segs, cat) {
  const short = cat === "nm" || cat === "ana" || cat === "vo2s";
  const isWork = ([d, p]) => p >= HARD && (short || d >= 60);
  let a = segs.findIndex(isWork), b = -1;
  for (let i = segs.length - 1; i >= 0; i--) if (isWork(segs[i])) { b = i; break; }
  if (a < 0 || b < a) return null;
  // krátké tréninky: první těžký úsek hledat až po rozjetí (aspoň 5 min od začátku)
  if (short) { let t = 0; a = -1; for (let i = 0; i < segs.length; i++) { if (t >= 300 && segs[i][1] >= HARD) { a = i; break; } t += segs[i][0]; } if (a < 0 || b < a) return null; }
  const m = segs.slice(a, b + 1).map(([d, p]) => [Math.round(d), Math.round(p * 100)]);
  // sloučit sousední stejné úseky
  const out = [];
  for (const s of m) { const l = out[out.length - 1]; if (l && l[1] === s[1]) l[0] += s[0]; else out.push([...s]); }
  // za poslední těžký úsek stejná pauza jako před ním (ať jde série zapsat jako N× práce + pauza)
  const lastRest = [...out].reverse().find((s) => s[1] < HARD * 100);
  if (lastRest) out.push([...lastRest]);
  // pauza mezi sériemi delší než pauza uvnitř série → rozdělit (série pak vyjde jako N× práce + pauza)
  const norm = [];
  for (let i = 0; i < out.length; i++) {
    const cur = out[i], prevRest = i >= 2 ? out[i - 2] : null;
    if (cur[1] < HARD * 100 && prevRest && prevRest[1] < HARD * 100 && cur[0] > prevRest[0] && i >= 1 && out[i - 1][1] >= HARD * 100) { norm.push([prevRest[0], prevRest[1]], [cur[0] - prevRest[0], 50]); }
    else norm.push(cur);
  }
  return norm;
}

/** najít opakování: [[n, [úseky]] | [s, %]] */
function compress(m) {
  const out = [];
  let i = 0;
  while (i < m.length) {
    let best = null;
    for (let L = 1; L <= 4; L++) {
      if (i + L > m.length) break;
      let r = 1;
      while (i + (r + 1) * L <= m.length && m.slice(i + r * L, i + (r + 1) * L).every((s, k) => s[0] === m[i + k][0] && s[1] === m[i + k][1])) r++;
      const hasWork = m.slice(i, i + L).some((s) => s[1] >= HARD * 100);
      if (r >= 2 && hasWork && (!best || r * L > best.r * best.L)) best = { L, r };
    }
    if (best) { out.push([best.r, m.slice(i, i + best.L)]); i += best.r * best.L; }
    else { out.push(m[i]); i++; }
  }
  return out;
}

const fmtDur = (s) => (s % 60 === 0 ? `${s / 60} min` : s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min`);
function shapeOf(g) {
  const part = (x) => {
    if (typeof x[1] === "number") return fmtDur(x[0]);
    const work = x[1].filter((s) => s[1] >= HARD * 100), rest = x[1].filter((s) => s[1] < HARD * 100);
    if (work.length === 1 && work[0][0] < 60 && rest.length === 1) return `${x[0]}×${work[0][0]}/${rest[0][0]} s`;
    if (work.length === 1) return `${x[0]}×${fmtDur(work[0][0])}`;
    return `${x[0]}×(${work.map((s) => fmtDur(s[0])).join(" + ")})`;
  };
  const works = g.filter((x) => typeof x[1] !== "number" || x[1] >= HARD * 100).map(part);
  const uniq = [...new Set(works)];
  if (uniq.length === 1) return works.length > 1 ? `${works.length}×${uniq[0].includes("×") ? `(${uniq[0]})` : uniq[0]}` : uniq[0];
  return uniq.slice(0, 3).join(" + ");
}

const byCat = {};
let seen = 0, bad = 0;
for (const [file, c] of Object.entries(cls)) {
  const cat = CAT[c.primary];
  if (!cat || !c.objective_coherent || (c.confidence ?? 0) < 0.5) continue;
  seen++;
  const segs = flat(fs.readFileSync(path.join(dir, file), "utf8"));
  const m = segs && mainSet(segs, cat);
  if (!m) { bad++; continue; }
  let g = compress(m);
  // úvodní „probuzení“ před první sérií (krátké jednotlivé úseky) do hlavní části nepatří
  const firstRep = g.findIndex((x) => typeof x[1] !== "number");
  if (firstRep > 0 && g.slice(0, firstRep).every((x) => x[0] <= 300)) g = g.slice(firstRep);
  while (g.length && typeof g[g.length - 1][1] === "number" && g[g.length - 1][1] < HARD * 100) g.pop(); // dojezd si stavíme sami
  const RULE = {
    tempo: { p: [76, 88], work: [600, 5400], restMin: 0 }, ss: { p: [86, 95], work: [300, 2400], restMin: 0.1 }, thr: { p: [94, 106], work: [240, 1800], restMin: 0.15 },
    ou: { p: [84, 122], work: [15, 600], restMin: 0 }, vo2: { p: [105, 123], work: [120, 480], restMin: 0.5 }, vo2s: { p: [108, 136], work: [15, 60], restMin: 0.3 },
    ana: { p: [118, 165], work: [30, 120], restMin: 1 }, nm: { p: [140, 220], work: [5, 30], restMin: 4 },
  }[cat];
  const flatMain = g.flatMap((x) => (typeof x[1] === "number" ? [x] : Array.from({ length: x[0] }, () => x[1]).flat()));
  const total = flatMain.reduce((t, s) => t + s[0], 0);
  const work = flatMain.filter((s) => s[1] >= HARD * 100);
  const tiz = work.reduce((t, s) => t + s[0], 0);
  const score = Math.round(work.reduce((t, s) => t + s[0] * (s[1] / 100) ** 2, 0) / 60);
  const peak = Math.max(...work.map((s) => s[1]));
  const singles = g.filter((x) => typeof x[1] === "number" && x[1] >= HARD * 100).length;
  // čistota: přehledná stavba, rozumná délka, žádné nesmyslné výkony
  if (g.length > 7 || singles > 4 || total < 6 * 60 || total > 80 * 60 || tiz < 60 || peak > 220) { bad++; continue; }
  if ((cat === "tempo" || cat === "ss" || cat === "thr") && tiz < 10 * 60) { bad++; continue; }
  if ((cat === "nm" || cat === "ana") && peak < 115) { bad++; continue; }
  // smysluplnost: většina práce v pásmu kategorie, rozumná délka úseků a dost odpočinku
  const inBand = work.filter((x) => x[1] >= RULE.p[0] && x[1] <= RULE.p[1] && x[0] >= RULE.work[0] && x[0] <= RULE.work[1]);
  if (inBand.reduce((t, x) => t + x[0], 0) < 0.8 * tiz) { bad++; continue; }
  if (work.some((x) => x[1] > RULE.p[1] + 8)) { bad++; continue; }
  const rest = flatMain.filter((x) => x[1] < HARD * 100).reduce((t, x) => t + x[0], 0);
  if (cat !== "ou" && cat !== "tempo" && rest < RULE.restMin * tiz) { bad++; continue; }
  if (cat === "ou" && !(work.some((x) => x[1] >= 102) && work.some((x) => x[1] <= 96))) { bad++; continue; }
  if (g.some((x) => typeof x[1] !== "number" && x[1].filter((y) => y[1] >= HARD * 100).length > 2)) { bad++; continue; }
  const shape = shapeOf(g);
  const sig = JSON.stringify(g);
  (byCat[cat] ??= new Map()).set(sig, { c: cat, n: shape, m: Math.round(total / 60), t: Math.round(tiz / 6) / 10, s: score, p: peak, g, src: file });
}

const picked = [];
for (const [cat, map] of Object.entries(byCat)) {
  // pestrost: z každého tvaru (název) nejvýš 2 varianty, pak rovnoměrně přes náročnost
  const all = [...map.values()].sort((a, b) => a.s - b.s || a.m - b.m || a.src.localeCompare(b.src));
  const perShape = new Map(), pool = [];
  for (const w of all) { const k = perShape.get(w.n) ?? 0; if (k < 2) { perShape.set(w.n, k + 1); pool.push(w); } }
  const want = Math.min(PER_CAT[cat], pool.length);
  const chosen = [];
  for (let i = 0; i < want; i++) chosen.push(pool[Math.round((i * (pool.length - 1)) / Math.max(1, want - 1))]);
  const uniq = [...new Set(chosen)];
  uniq.forEach((w, i) => picked.push({ id: `${cat}${String(i + 1).padStart(2, "0")}`, ...w }));
  console.log(`${cat}: ${map.size} čistých → ${uniq.length} vybráno (náročnost ${uniq[0]?.s}–${uniq[uniq.length - 1]?.s})`);
}

// až po výběru: délky na běžné hodnoty (tidy) a z nich znovu tvar, minuty a náročnost – výběr se tím nemění
for (const w of picked) {
  w.g = w.g.map((x) => (typeof x[1] === "number" ? [tidy(x[0], x[1] >= HARD * 100), x[1]] : [x[0], x[1].map((s) => [tidy(s[0], s[1] >= HARD * 100), s[1]])]));
  const flatMain = w.g.flatMap((x) => (typeof x[1] === "number" ? [x] : Array.from({ length: x[0] }, () => x[1]).flat()));
  const work = flatMain.filter((s) => s[1] >= HARD * 100);
  w.n = shapeOf(w.g);
  w.m = Math.round(flatMain.reduce((t, s) => t + s[0], 0) / 60);
  w.t = Math.round(work.reduce((t, s) => t + s[0], 0) / 6) / 10;
  w.s = Math.round(work.reduce((t, s) => t + s[0] * (s[1] / 100) ** 2, 0) / 60);
}
const rows = picked.map((w) => `  ${JSON.stringify({ id: w.id, c: w.c, n: w.n, m: w.m, t: w.t, s: w.s, g: w.g })},`).join("\n");
const out = `// GENEROVÁNO skriptem scripts/build-workout-library.mjs – neupravovat ručně.
// Hlavní části tréninků převzaté z knihovny projektu Domestique (Apache-2.0,
// https://github.com/platypus45/domestique, Copyright 2026 Domestique contributors), přepsané do vlastní podoby.
// c = kategorie, n = tvar, m = minuty hlavní části, t = minuty nad Z2, s = náročnost (Σ min × IF²),
// g = hlavní část: [s, % FTP] nebo [opakování, [[s, % FTP], …]].
export type LibSeg = [number, number] | [number, [number, number][]];
export interface LibWorkout { id: string; c: string; n: string; m: number; t: number; s: number; g: LibSeg[] }

export const LIBRARY: LibWorkout[] = [
${rows}
] as LibWorkout[];
`;
fs.writeFileSync(new URL("../src/core/coach/workouts.data.ts", import.meta.url), out);
console.log(`\nprošlo ${seen}, vyřazeno ${bad}, zapsáno ${picked.length} tréninků (${Math.round(out.length / 1024)} kB)`);
