// Srovnání kondice (CTL), únavy (ATL) a formy přes celou historii: intervals.icu vs. vlastní výpočet aplikace.
// Vlastní výpočet = stejný vzorec jako src/core/fitness.ts (exponenciální průměr 42 / 7 dní) nad zátěží aktivit
// z D1, BEZ kotev z intervals.icu. Vypisuje jen tréninková čísla (žádné klíče).
// Spuštění: node scripts/compare-kondice.mjs [od=2019-01-01]
import { execSync } from "node:child_process";
import { readDevVars, ROOT } from "./devvars.mjs";

const { vars } = readDevVars();
const d1 = (sql) => JSON.parse(execSync(`npx wrangler d1 execute trener-db --remote --json --command "${sql.replace(/"/g, '\\"')}"`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64e6 }))[0].results;
const auth = "Basic " + Buffer.from(`API_KEY:${vars.INTERVALS_API_KEY}`).toString("base64");
const icu = async (p) => { const r = await fetch(`https://intervals.icu/api/v1${p}`, { headers: { Authorization: auth } }); if (!r.ok) throw new Error(`${r.status} ${p}`); return r.json(); };
const A = vars.INTERVALS_ATHLETE_ID;

const FROM = process.argv[2] ?? "2019-01-01";
const today = new Date().toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const range = (a, b) => { const o = []; for (let d = a; d <= b; d = addDays(d, 1)) o.push(d); return o; };
const K_CTL = 0.0235, K_ATL = 0.1331;
const series = (loads, from, to) => { let p = { ctl: 0, atl: 0 }; const m = new Map(); for (const d of range(from, to)) { const l = loads.get(d) ?? 0; p = { ctl: p.ctl + (l - p.ctl) * K_CTL, atl: p.atl + (l - p.atl) * K_ATL }; m.set(d, p); } return m; };

// intervals.icu: wellness (CTL/ATL) a aktivity (zátěž) po rocích
const wel = new Map(), icuLoad = new Map();
let icuActs = 0;
for (let y = +FROM.slice(0, 4); y <= +today.slice(0, 4); y++) {
  const a = `${y}-01-01` < FROM ? FROM : `${y}-01-01`, b = `${y}-12-31` > today ? today : `${y}-12-31`;
  for (const w of await icu(`/athlete/${A}/wellness?oldest=${a}&newest=${b}`)) if (w.ctl != null) wel.set(w.id, { ctl: w.ctl, atl: w.atl });
  for (const x of await icu(`/athlete/${A}/activities?oldest=${a}&newest=${b}`)) {
    const d = String(x.start_date_local ?? "").slice(0, 10);
    if (!d) continue;
    icuActs++;
    icuLoad.set(d, (icuLoad.get(d) ?? 0) + (x.icu_training_load ?? 0));
  }
}
// aplikace: zátěž aktivit (Garmin + zátěž z intervals.icu nebo vlastní odhad) a uložené daily_metrics
const ours = d1(`SELECT date, SUM(COALESCE(load,0)) l, COUNT(*) n FROM activities WHERE date >= '${FROM}' GROUP BY date`);
const ourLoad = new Map(ours.map((r) => [r.date, r.l]));
const stored = new Map(d1(`SELECT date, ctl, atl FROM daily_metrics WHERE date >= '${FROM}'`).map((r) => [r.date, r]));

const start = [...wel.keys(), ...ourLoad.keys()].sort()[0];
const mine = series(ourLoad, start, today); // vlastní výpočet z naší zátěže
const fromIcuLoads = series(icuLoad, start, today); // náš vzorec nad zátěží z intervals.icu → ověří vzorec

const f1 = (x) => (x == null ? "  –  " : x.toFixed(1).padStart(5));
console.log(`Aktivit: intervals.icu ${icuActs}, aplikace ${ours.reduce((t, r) => t + r.n, 0)}. Dní s CTL v intervals.icu: ${wel.size} (od ${[...wel.keys()].sort()[0]}).\n`);
console.log("Rok  | zátěž icu / app | CTL ⌀ icu  app  vzorec(icu zátěž) | max |Δ CTL| app | ⌀ |Δ forma| app | uložené ⌀ CTL");
for (let y = +start.slice(0, 4); y <= +today.slice(0, 4); y++) {
  const ds = range(`${y}-01-01`, `${y}-12-31`).filter((d) => d >= start && d <= today);
  const w = ds.filter((d) => wel.has(d));
  const avg = (f, arr = w) => (arr.length ? arr.reduce((t, d) => t + f(d), 0) / arr.length : null);
  const sum = (m) => ds.reduce((t, d) => t + (m.get(d) ?? 0), 0);
  const maxD = w.length ? Math.max(...w.map((d) => Math.abs(mine.get(d).ctl - wel.get(d).ctl))) : null;
  const dForm = avg((d) => Math.abs((mine.get(d).ctl - mine.get(d).atl) - (wel.get(d).ctl - wel.get(d).atl)));
  console.log(`${y} | ${String(Math.round(sum(icuLoad))).padStart(5)} / ${String(Math.round(sum(ourLoad))).padStart(5)} | ${f1(avg((d) => wel.get(d).ctl))} ${f1(avg((d) => mine.get(d).ctl))} ${f1(avg((d) => fromIcuLoads.get(d).ctl))}            | ${f1(maxD)}          | ${f1(dForm)}         | ${f1(avg((d) => stored.get(d)?.ctl ?? 0, ds.filter((d) => stored.has(d))))}`);
}
// den po dni posledních 10 dní
console.log("\nPosledních 10 dní: datum | CTL icu / app | ATL icu / app | forma icu / app");
for (const d of range(addDays(today, -10), addDays(today, -1))) {
  const w = wel.get(d), m = mine.get(d);
  if (w && m) console.log(`${d} | ${f1(w.ctl)} / ${f1(m.ctl)} | ${f1(w.atl)} / ${f1(m.atl)} | ${f1(w.ctl - w.atl)} / ${f1(m.ctl - m.atl)}`);
}
