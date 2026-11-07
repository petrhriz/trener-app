// Fáze 2: srovnání s intervals.icu – zátěž aktivit (kalibrace hrTSS) a CTL/ATL/forma za posledních 14 dní.
// Vypisuje jen tréninková čísla (žádné klíče).
import { execSync } from "node:child_process";
import { readDevVars, ROOT } from "./devvars.mjs";

const { vars } = readDevVars();
const d1 = (sql) => {
  const out = execSync(`npx wrangler d1 execute trener-db --remote --json --command "${sql.replace(/"/g, '\\"')}"`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return JSON.parse(out)[0].results;
};
const auth = "Basic " + Buffer.from(`API_KEY:${vars.INTERVALS_API_KEY}`).toString("base64");
const icu = (p) => fetch(`https://intervals.icu/api/v1${p}`, { headers: { Authorization: auth } }).then((r) => r.json());

const today = new Date().toISOString().slice(0, 10);
const from = new Date(Date.now() - 120 * 86400_000).toISOString().slice(0, 10);

// 1) zátěž aktivit
const ours = d1(`SELECT id, date, sport, name, load, load_source, hr_z, moving_s, avg_hr, np, tss_garmin FROM activities WHERE date >= '${from}'`);
const theirs = await icu(`/athlete/${vars.INTERVALS_ATHLETE_ID}/activities?oldest=${from}&newest=${today}`);
const byExt = new Map(theirs.map((a) => [String(a.external_id ?? ""), a]));
const pairs = [];
for (const o of ours) {
  const t = [...byExt.entries()].find(([k]) => k.includes(o.id))?.[1];
  if (t && t.icu_training_load != null) pairs.push({ o, t });
}
console.log(`Spárováno ${pairs.length} aktivit z ${ours.length} (posledních 120 dní).`);
const bySrc = {};
for (const { o, t } of pairs) {
  (bySrc[o.load_source] ??= []).push({ ours: o.load, icu: t.icu_training_load, o, t });
}
for (const [src, arr] of Object.entries(bySrc)) {
  const diff = arr.map((x) => x.ours - x.icu);
  const mean = diff.reduce((a, b) => a + b, 0) / diff.length;
  const mae = diff.reduce((a, b) => a + Math.abs(b), 0) / diff.length;
  const ratio = arr.reduce((a, x) => a + x.ours, 0) / Math.max(1, arr.reduce((a, x) => a + x.icu, 0));
  console.log(`${src.padEnd(11)} n=${String(arr.length).padStart(3)}  průměrný rozdíl ${mean.toFixed(1)}  MAE ${mae.toFixed(1)}  poměr náš/icu ${ratio.toFixed(2)}`);
}

// kalibrace sazeb hrTSS (nejmenší čtverce, nezáporné): icu_load ≈ Σ h_zóna × sazba
const hz = pairs.filter(({ o }) => o.hr_z && (o.load_source === "hr_zones")).map(({ o, t }) => ({ h: JSON.parse(o.hr_z).map((s) => s / 3600), y: t.icu_training_load }));
if (hz.length >= 8) {
  // jednoduchý gradientní sestup s nezápornými sazbami
  let r = [30, 55, 70, 90, 120];
  for (let it = 0; it < 20000; it++) {
    const g = [0, 0, 0, 0, 0];
    for (const x of hz) {
      const pred = x.h.reduce((s, v, i) => s + v * r[i], 0);
      const e = pred - x.y;
      x.h.forEach((v, i) => (g[i] += e * v));
    }
    r = r.map((v, i) => Math.max(5, v - (0.05 * g[i]) / hz.length));
  }
  const err = (rates) => hz.reduce((s, x) => s + Math.abs(x.h.reduce((a, v, i) => a + v * rates[i], 0) - x.y), 0) / hz.length;
  console.log(`Kalibrace hrTSS (n=${hz.length}): sazby Z1..Z5 = ${r.map((v) => Math.round(v)).join(", ")}  MAE ${err(r).toFixed(1)} (původní sazby MAE ${err([30, 55, 70, 90, 120]).toFixed(1)})`);
}

// 2) CTL / ATL / forma – posledních 14 dní
const w = await icu(`/athlete/${vars.INTERVALS_ATHLETE_ID}/wellness?oldest=${new Date(Date.now() - 15 * 86400_000).toISOString().slice(0, 10)}&newest=${today}`);
const m = d1(`SELECT date, ctl, atl FROM daily_metrics WHERE date >= '${new Date(Date.now() - 15 * 86400_000).toISOString().slice(0, 10)}'`);
const mBy = new Map(m.map((x) => [x.date, x]));
console.log("\nDatum       CTL náš/icu    ATL náš/icu    forma náš/icu");
for (const x of w.slice(0, -1)) {
  const o = mBy.get(x.id);
  if (!o || x.ctl == null) continue;
  const f = (v) => (v == null ? "  –  " : v.toFixed(1).padStart(5));
  console.log(`${x.id}  ${f(o.ctl)} / ${f(x.ctl)}  ${f(o.atl)} / ${f(x.atl)}  ${f(o.ctl - o.atl)} / ${f(x.ctl - x.atl)}`);
}
