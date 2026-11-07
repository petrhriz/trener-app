"use strict";
// Dashboard Trenér – všechna data z /api, žádná natvrdo v HTML.

const PAGES = [
  ["prehled", "Přehled", "▦"],
  ["trener", "Trenér", "◎"],
  ["kolo", "Kolo", "⚲"],
  ["zotaveni", "Zotavení", "♡"],
  ["kondice", "Kondice", "↗"],
  ["telo", "Tělo", "◫"],
  ["sila", "Síla a mobilita", "⇿"],
  ["chuze", "Chůze", "⋰"],
  ["vyziva", "Výživa", "◔"],
  ["nastaveni", "Nastavení", "⚙"],
];

// ---------- formát (desetinná čárka, „−“, mezera před jednotkou) ----------
const DASH = "–";
const num = (x, d = 0) => {
  if (x == null || !isFinite(x)) return DASH;
  const r = Math.abs(x).toFixed(d).replace(".", ",");
  return x < 0 && Number(Math.abs(x).toFixed(d)) !== 0 ? "−" + r : r;
};
const signed = (x, d = 0) => (x == null ? DASH : x > 0 ? "+" + num(x, d) : num(x, d));
const thou = (x) => (x == null ? DASH : Math.round(x).toLocaleString("cs-CZ").replace(/\s/g, "."));
const DAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const dow = (d) => { const g = new Date(d + "T12:00:00Z").getUTCDay(); return g === 0 ? 7 : g; };
const dm = (d) => `${+d.slice(8, 10)}.${+d.slice(5, 7)}.`;
const dayDm = (d) => `${DAYS[dow(d) - 1]} ${dm(d)}`;
const hmm = (s) => { if (s == null) return DASH; const m = Math.round(s / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- API ----------
const cache = new Map();
async function api(path, opts) {
  if (!opts && cache.has(path) && Date.now() - cache.get(path).at < 60_000) return cache.get(path).data;
  const r = await fetch("/api/" + path, { credentials: "same-origin", headers: { "content-type": "application/json" }, ...opts });
  const data = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  if (!opts) cache.set(path, { at: Date.now(), data });
  return data;
}

// ---------- tooltip ----------
const tip = document.getElementById("tip");
function showTip(e, html) {
  tip.innerHTML = html;
  tip.classList.add("on");
  const x = (e.touches ? e.touches[0].clientX : e.clientX) + 12;
  const y = (e.touches ? e.touches[0].clientY : e.clientY) - 36;
  tip.style.left = Math.min(x, innerWidth - tip.offsetWidth - 8) + "px";
  tip.style.top = Math.max(8, y) + "px";
}
const hideTip = () => tip.classList.remove("on");
document.addEventListener("scroll", hideTip, { passive: true });

// ---------- grafy (čisté SVG) ----------
/**
 * series: [{name, values:[number|null], color, dash?, area?}] ; x: [labels]; band: {lo, hi, color}
 */
function lineChart({ x, series, band, height = 220, fmt = (v) => num(v, 1), xfmt = (l) => l, zero = false, markIndex = null }) {
  const W = 760, H = height, P = { l: 40, r: 10, t: 10, b: 24 };
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  if (band) all.push(band.lo, band.hi);
  if (!all.length) return `<div class="note">Data nemám.</div>`;
  let mn = Math.min(...all), mx = Math.max(...all);
  if (zero) mn = Math.min(0, mn);
  const pad = (mx - mn) * 0.08 || 1; mn -= pad; mx += pad;
  const X = (i) => P.l + (i * (W - P.l - P.r)) / Math.max(1, x.length - 1);
  const Y = (v) => P.t + (1 - (v - mn) / (mx - mn)) * (H - P.t - P.b);
  const ticks = 4;
  let g = `<g class="grid">`;
  for (let i = 0; i <= ticks; i++) { const v = mn + ((mx - mn) * i) / ticks; g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${P.l - 6}" y="${Y(v) + 4}" text-anchor="end">${num(v, Math.abs(mx - mn) < 10 ? 1 : 0)}</text>`; }
  g += `</g>`;
  const step = Math.ceil(x.length / 6);
  let xl = "";
  x.forEach((l, i) => { if (i % step === 0 || i === x.length - 1) xl += `<text x="${X(i)}" y="${H - 6}" text-anchor="middle">${esc(xfmt(l))}</text>`; });
  let b = "";
  if (band) b = `<rect x="${P.l}" y="${Y(band.hi)}" width="${W - P.l - P.r}" height="${Math.max(0, Y(band.lo) - Y(band.hi))}" fill="${band.color || "var(--z2)"}" opacity=".12"/>`;
  let paths = "";
  for (const s of series) {
    let d = "", pen = false;
    s.values.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; });
    paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" ${s.dash ? 'stroke-dasharray="5 4"' : ""} stroke-linejoin="round" stroke-linecap="round"/>`;
    if (s.dots) s.values.forEach((v, i) => { if (v != null) paths += `<circle cx="${X(i)}" cy="${Y(v)}" r="2.5" fill="${s.color}"/>`; });
  }
  const mark = markIndex != null ? `<line x1="${X(markIndex)}" x2="${X(markIndex)}" y1="${P.t}" y2="${H - P.b}" stroke="var(--acc)" stroke-dasharray="3 3"/>` : "";
  const id = "c" + Math.random().toString(36).slice(2);
  setTimeout(() => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.querySelector(".cur");
    const move = (e) => {
      const r = el.getBoundingClientRect();
      const cx = ((e.touches ? e.touches[0].clientX : e.clientX) - r.left) * (W / r.width);
      const i = Math.max(0, Math.min(x.length - 1, Math.round(((cx - P.l) / (W - P.l - P.r)) * (x.length - 1))));
      cur.setAttribute("x1", X(i)); cur.setAttribute("x2", X(i)); cur.style.opacity = 1;
      showTip(e, `<b>${esc(xfmt(x[i]))}</b><br>` + series.map((s) => `<span style="color:${s.color}">■</span> ${esc(s.name)}: ${s.values[i] == null ? DASH : esc((s.fmt || fmt)(s.values[i]))}`).join("<br>"));
    };
    el.addEventListener("mousemove", move); el.addEventListener("touchstart", move, { passive: true }); el.addEventListener("touchmove", move, { passive: true });
    el.addEventListener("mouseleave", () => { hideTip(); cur.style.opacity = 0; });
  });
  return `<svg class="chart" id="${id}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${g}${b}${paths}${mark}<line class="cur" y1="${P.t}" y2="${H - P.b}" stroke="var(--fg)" opacity="0"/>${xl}</svg>
  <div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}${band ? `<span><i style="background:${band.color || "var(--z2)"};opacity:.3;height:10px"></i>${esc(band.name || "norma")}</span>` : ""}</div>`;
}

function barChart({ x, values, colors, height = 180, fmt = (v) => num(v), xfmt = (l) => l, dashed = [], todayIndex = null, label = "" }) {
  const W = 760, H = height, P = { l: 36, r: 6, t: 8, b: 24 };
  const mx = Math.max(1, ...values.filter((v) => v != null));
  const bw = (W - P.l - P.r) / x.length;
  const Y = (v) => P.t + (1 - v / mx) * (H - P.t - P.b);
  let bars = "", xl = "";
  const step = Math.ceil(x.length / 10);
  values.forEach((v, i) => {
    const h = v ? H - P.b - Y(v) : 0;
    const c = (colors && colors[i]) || "var(--acc)";
    bars += dashed[i]
      ? `<rect x="${P.l + i * bw + 2}" y="${Y(v || 0)}" width="${bw - 4}" height="${h}" fill="none" stroke="${c}" stroke-dasharray="4 3" rx="3" data-i="${i}"/>`
      : `<rect x="${P.l + i * bw + 2}" y="${Y(v || 0)}" width="${bw - 4}" height="${h}" fill="${c}" rx="3" data-i="${i}"/>`;
    bars += `<rect x="${P.l + i * bw}" y="${P.t}" width="${bw}" height="${H - P.t - P.b}" fill="transparent" data-i="${i}"/>`;
    if (i % step === 0 || i === todayIndex) xl += `<text x="${P.l + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle" ${i === todayIndex ? 'style="fill:var(--fg);font-weight:700;text-decoration:underline"' : ""}>${esc(xfmt(x[i]))}</text>`;
  });
  const id = "b" + Math.random().toString(36).slice(2);
  setTimeout(() => {
    const el = document.getElementById(id);
    if (!el) return;
    const h = (e) => { const i = e.target.getAttribute("data-i"); if (i == null) return; showTip(e, `<b>${esc(xfmt(x[i]))}</b><br>${esc(label)} ${values[i] == null ? DASH : esc(fmt(values[i]))}${dashed[i] ? " (plán)" : ""}`); };
    el.addEventListener("mousemove", h); el.addEventListener("touchstart", h, { passive: true }); el.addEventListener("mouseleave", hideTip);
  });
  return `<svg class="chart" id="${id}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><g class="grid"><line x1="${P.l}" x2="${W - P.r}" y1="${H - P.b}" y2="${H - P.b}"/><text x="${P.l - 6}" y="${P.t + 8}" text-anchor="end">${num(mx)}</text></g>${bars}${xl}</svg>`;
}

// ---------- komponenty ----------
const card = (cls, title, src, body) => `<section class="card ${cls}">${title ? `<h2>${title}</h2>` : ""}${src ? `<span class="src">${esc(src)}</span>` : ""}${body}</section>`;
const kv = (rows) => `<div class="kv">${rows.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join("")}</div>`;
const greeting = (h) => (h < 10 ? "Dobré ráno" : h < 12 ? "Dobré dopoledne" : h < 18 ? "Dobré odpoledne" : "Dobrý večer");

function weatherDay(w, label) {
  if (!w) return `<div class="wday"><div class="top"><b>${esc(label)}</b><span class="sub">bez předpovědi</span></div></div>`;
  const best = w.window ? `${String(w.window.from).padStart(2, "0")}:00–${String(w.window.to).padStart(2, "0")}:00` : "žádné";
  const hours = w.hours.map((h) => `<i class="${h.green ? "g" : ""} ${w.window && h.h >= w.window.from && h.h < w.window.to ? "best" : ""}" data-h='${esc(JSON.stringify(h))}'></i>`).join("");
  return `<div class="wday"><div class="top"><b>${esc(label)}</b><span class="sub">${num(w.tmin)}–${num(w.tmax)} °C · srážky ≤ ${num(w.rainProb)} % (${num(w.rainSum, 1)} mm) · nárazy ${num(w.gustMax)} km/h</span></div>
  <div class="hours">${hours}</div><div class="meta"><span>07</span><span class="best">nejlepší 3 h: <b>${best}</b></span><span>20</span></div></div>`;
}
function bindHours(root) {
  root.querySelectorAll(".hours i").forEach((el) => {
    const h = JSON.parse(el.getAttribute("data-h"));
    const f = (e) => showTip(e, `<b>${String(h.h).padStart(2, "0")}:00</b> · ${num(h.temp)} °C (pocitově ${num(h.feels)})<br>srážky ${num(h.prob)} % · ${num(h.precip, 1)} mm · nárazy ${num(h.gust)} km/h`);
    el.addEventListener("mousemove", f); el.addEventListener("touchstart", f, { passive: true }); el.addEventListener("mouseleave", hideTip);
  });
}

function zonesHtml(rows) {
  if (!rows) return "";
  return `<div class="zones">${rows.map((z) => `<span class="sub">${z.z}</span><div>${z.secs > 0 ? `<div class="zb" style="width:${z.pct}%;background:${z.color}"></div>` : ""}</div><span class="r">${z.time}</span><span class="r">${z.pctText}</span>`).join("")}</div>`;
}

// ---------- stránky ----------
async function pagePrehled(el) {
  const d = await api("overview");
  const y = d.yearKm;
  const pct = y.goal ? Math.min(100, (y.km / y.goal) * 100) : null;
  const behind = y.goal ? y.km - y.paceToday : null;
  const goalCard = card("c8", `${y.year} · kilometry na kole`, "Garmin", `
    <div class="big">${thou(y.km)}<small>${y.goal ? ` / ${thou(y.goal)} km · ${num(pct)} %` : " km"}</small></div>
    ${y.goal ? `<div class="bar"><i style="width:${pct}%"></i><b style="left:${Math.min(100, (y.paceToday / y.goal) * 100)}%"><span>tempo dnes ${thou(y.paceToday)}</span></b></div><div class="axis"><span>0</span><span>${thou(y.goal / 2)}</span><span>${thou(y.goal)} km</span></div>` : `<p class="note">Roční cíl km nastav v Nastavení.</p>`}
    <div class="tiles">
      ${y.goal ? `<div class="tile"><div class="v" style="color:${behind < 0 ? "var(--pink)" : "var(--ok)"}">${signed(behind)}<small> km</small></div><div class="l">${behind < 0 ? "za tempem cíle" : "před tempem cíle"}</div></div>
      <div class="tile"><div class="v">${num(y.perWeekNeeded)}<small> km/týd</small></div><div class="l">potřeba do konce roku</div></div>` : ""}
      <div class="tile"><div class="v">${num(y.last4wPerWeek)}<small> km/týd</small></div><div class="l">posledních 4 týdnů</div></div>
      <div class="tile"><div class="v">${thou(y.projection)}<small> km</small></div><div class="l">odhad konce roku tímto tempem</div></div>
      <div class="tile"><div class="v">${y.rides}</div><div class="l">jízd letos</div></div>
    </div>`);
  const ev = d.goal.date
    ? `<div style="display:flex;gap:18px;align-items:center"><div class="big acc-t">${d.goal.daysLeft}</div><div><div class="mid">${esc(d.goal.name || "Cíl")}</div><div class="sub">${dm(d.goal.date)} · dní do cíle</div></div></div>`
    : `<div class="mid">${esc(d.goal.name || "Bez pevného cíle")}</div><div class="sub">Režim: ${esc(d.goalLabel)}. Datum cíle nastav v Nastavení.</div>`;
  const evCard = card("c4", "Cíl", "nastavení", `${ev}<div class="tiles"><div class="tile"><div class="v">${num(d.form.ctl, 1)}</div><div class="l">kondice (CTL)</div></div><div class="tile"><div class="v">${signed(d.form.form, 1)}</div><div class="l">forma · ${esc(d.form.zone || DASH)}</div></div></div>`);
  const weekRows = d.week.map((w) => {
    const done = w.done.length > 0;
    const st = done ? "ok" : w.planned && w.date < d.date ? "miss" : w.isToday ? "today" : "";
    const right = done ? w.done.map((a) => `${a.km ? num(a.km, 1) + " km · " : ""}${a.min} min`).join("<br>") : w.planned ? (w.planned.status === "návrh" ? "návrh" : `${hmm((w.planned.min || 0) * 60)}`) : "";
    return `<div class="row ${w.isToday ? "today-row" : ""}"><span class="dot ${st}">${done ? "✓" : st === "miss" ? "!" : ""}</span><span class="d">${esc(w.label)}</span><span class="t"><b>${esc(done ? w.done.map((a) => a.name).join(", ") : w.planned ? w.planned.name : "Volno")}</b>${done && w.planned ? `<span class="sub">plán: ${esc(w.planned.name)}</span>` : ""}</span><span class="r">${right}</span></div>`;
  }).join("");
  const v = d.vitals;
  const vit = card("c4", "Ranní hodnoty", "Garmin", `
    <div class="verdict ${v.state}">${v.emoji} ${esc(v.label)}</div>
    ${kv([
      ["HRV", v.hrv != null ? `${num(v.hrv)} ms · ${esc(v.hrvRating || DASH)}` : "nemám"],
      ["Klidový tep", v.rhr != null ? `${num(v.rhr)} bpm · ${esc(v.rhrRating || DASH)}` : "nemám"],
      ["Spánek", v.sleep != null ? `${hmm(v.sleep)} h${v.sleepScore != null ? ` · ${num(v.sleepScore)} ${esc(v.sleepRating)}` : ""}` : "nemám"],
      ["Body Battery max", num(v.bb)],
      ["Stres průměr", num(v.stress)],
      ["Kroky", thou(v.steps)],
    ])}<p class="note">Body Battery a stres jsou jen doplňkové, do semaforu nevstupují.</p>`);
  el.innerHTML = `<div class="head"><div><h1>${greeting(d.hour).replace(/(\S+)$/, '<span class="acc">$1</span>')}, ${esc(d.name)}</h1><div class="sub">${esc(d.goalLabel)}</div></div><div class="sub">Data k ${d.lastSync ? new Date(d.lastSync).toLocaleString("cs-CZ") : DASH}</div></div>
  <div class="grid">${goalCard}${evCard}
  ${card("c8", "Tento týden · plán vs. hotovo", "plán · Garmin", weekRows)}
  ${card("c4", "Počasí na jízdu · 3 dny", "Open-Meteo", d.weather.map((w) => weatherDay(w.w, w.label)).join("") + `<p class="note">Zelená = srážky ≤ 30 %, nárazy ≤ 40 km/h, pocitově ≥ 3 °C. Najeď na hodinu pro detail.</p>`)}
  ${vit}</div>`;
  bindHours(el);
}

function planDayHtml(d) {
  const steps = d.steps && d.steps.length ? `<ol>${d.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : "";
  return `<div class="plan-day"><h3>${dayDm(d.date)}${d.isToday ? " · dnes" : ""} <span class="tag ${d.tagClass}">${esc(d.tag)}</span>${d.orientational ? '<span class="sub">orientační</span>' : ""}${d.changed ? `<span class="tag">${esc(d.changed)}</span>` : ""}</h3>
  ${kv([
    ["🌤️ Počasí", esc(d.weatherText) + (d.weather && d.weather.window && !d.indoor ? ` · okno ${String(d.weather.window.from).padStart(2, "0")}–${String(d.weather.window.to).padStart(2, "0")} h` : "")],
    ...(d.name ? [["🚴 Jízda", `${esc(d.name)} · ${hmm((d.durationMin || 0) * 60)}${d.indoor ? "" : " · venku"}`]] : []),
    ...(d.targetText ? [["🎯 Cíl", esc(d.targetText)]] : []),
    ...(d.carbs ? [["🍬 Sacharidy", esc(d.carbs.text)]] : []),
    ...(d.name || d.load ? [["🔋 Zátěž", `${num(d.load)}${d.loadNote ? ` (${esc(d.loadNote)})` : ""}`]] : []),
    ["📊 Forma", d.form != null ? `${signed(d.form, 1)} (${esc(d.formZone)})` : DASH],
  ])}${steps}${d.note ? `<p class="note">${esc(d.note)}</p>` : ""}</div>`;
}

async function pageTrener(el) {
  const d = await api("coach");
  const r = d.readiness, rec = r.recovery, f = r.fitness;
  const ind = (name, i, val, extra) => `<tr class="${i.flag !== "none" && !i.expected ? "iv" : ""}"><td><span class="flag ${i.status !== "ok" ? "none" : i.flag === "none" ? "" : i.flag}"></span><b>${name}</b><span class="s2">${i.status === "insufficient" ? `nehodnotím, jen ${i.norm.n} hodnot` : i.status === "missing" ? "nemám" : `<b>${esc(i.rating || "")}</b>${i.expected ? ` · po ${esc(rec.dayAfter)} očekávané, nepočítám` : ""}${extra ? " · " + extra : ""}`}</span></td><td class="r">${val}</td><td class="r">${i.avg7 != null ? (name === "Spánek" ? hmm(i.avg7) + " h" : num(i.avg7) + (name === "HRV" ? " ms" : " bpm")) : DASH}</td><td class="r">${esc(i.rangeText || (i.norm.n ? hmm(i.norm.mean) + " h" : DASH))}</td></tr>`;
  const recTable = `<table class="t"><tr><th>Ukazatel</th><th class="r">Dnes</th><th class="r">Průměr 7 d</th><th class="r">Norma 60 d</th></tr>
    ${ind("HRV", rec.hrv, rec.hrv.today != null ? num(rec.hrv.today) + " ms" : "nemám", rec.hrv.norm.n ? `průměr 60 d ${num(rec.hrv.norm.mean)} ms (SD ${num(rec.hrv.norm.sd, 1)}) · ${rec.hrv.norm.n} hodnot` : "")}
    ${ind("Klidový tep", rec.rhr, rec.rhr.today != null ? num(rec.rhr.today) + " bpm" : "nemám", rec.rhr.norm.n ? `průměr 60 d ${num(rec.rhr.norm.mean)} bpm` : "")}
    ${ind("Spánek", { ...rec.sleep, rangeText: rec.sleep.norm.n ? hmm(rec.sleep.norm.mean) + " h" : DASH }, rec.sleep.today != null ? hmm(rec.sleep.today) + " h" : "nemám", rec.sleep.score != null ? `skóre ${num(rec.sleep.score)}${rec.sleep.q ? ` (${rec.sleep.q})` : ""} · průměr skóre 7 d ${num(rec.sleep.scoreAvg7)}, 60 d ${num(rec.sleep.scoreAvg60)}` : "")}
  </table>`;
  const fitTable = `<table class="t"><tr><th>Ukazatel</th><th class="r">${esc(f.col1)}</th><th class="r">${esc(f.col2)}</th><th class="r">Změna</th></tr>${f.rows.map((x) => `<tr class="${x.iv ? "iv" : ""}"><td><b>${esc(x.label)}</b><span class="s2">${esc(x.sub)}</span></td><td class="r">${x.v1}</td><td class="r">${x.v2}</td><td class="r">${x.diff}</td></tr>`).join("")}</table><p class="note">${esc(f.note)}</p>`;
  const t = r.today;
  const todayCard = `<div class="verdict ${rec.state}">${rec.emoji} ${esc(rec.stateLabel)} · ${esc(t.decision)}</div><p>${esc(t.decisionWhy)}</p>${t.day && t.day.name && t.decision !== "Odjeto" ? planDayHtml(t.day) : ""}<p class="note">➡️ Zítra: ${esc(r.tomorrow)}</p>
    <div class="btns"><button class="btn" data-skip="${r.date}">🚫 Dnes nepojedu</button></div>`;
  const prop = d.proposal;
  const changes = prop && prop.items.length
    ? `<div>${prop.items.map((c) => `<label class="chg"><input type="checkbox" checked value="${c.code}"><span><b>${c.code}</b> · ${dayDm(c.date)}: ${esc(c.action)} – ${esc(c.name)}${c.why ? ` – ${esc(c.why)}` : ""}</span></label>`).join("")}</div><div class="btns"><button class="btn pri" id="applyBtn">✅ Zapsat vybrané</button><button class="btn" id="newProp">↻ Nový návrh</button></div><p class="note" id="applyMsg"></p>`
    : `<p>Kalendář odpovídá plánu, nic neměním.</p><div class="btns"><button class="btn" id="newProp">↻ Přepočítat návrh</button></div><p class="note" id="applyMsg"></p>`;
  const floor = d.floor.map((x) => `<div class="row"><span class="dot ${x.done ? "ok" : x.planned ? "today" : ""}">${x.done ? "✓" : ""}</span><span class="t"><b>${esc(x.label)}</b>${x.count != null ? `<span class="sub">tento týden ${x.count}×</span>` : ""}</span><span class="r">${x.done ? "splněno" : x.planned ? "v plánu" : "zbývá"}</span></div>`).join("");
  const full = d.full;
  const intens = `<table class="t"><tr><th>Jednotka</th><th class="r">% FTP</th><th class="r">Watty</th></tr>${d.intensity.targets.map((x) => `<tr><td>${esc(x.name)}</td><td class="r">${x.pct[0]}–${x.pct[1]} %</td><td class="r">${x.w[0]}–${x.w[1]} W</td></tr>`).join("")}</table><p class="note">Z aktuálního FTP ${d.intensity.ftp} W. Žádné rampy – každý krok má rozsah wattů.</p>`;
  const p = r.plan;
  el.innerHTML = `<div class="head"><div><h1>Trenér · <span class="acc">${dayDm(r.date)}</span></h1><div class="sub">${esc(d.goalLabel)} · normy z ${rec.normDays} dní</div></div><div class="pill-row">${["zvyseni", "udrzeni", "pokles"].map((g) => `<button class="btn ${d.goal === g ? "pri" : ""}" data-goal="${g}">${{ zvyseni: "Zlepšit", udrzeni: "Udržet", pokles: "Řízený pokles" }[g]}</button>`).join("")}</div></div>
  <div class="grid">
    ${card("c5", "Dnešní brána", "Garmin · Open-Meteo", todayCard)}
    ${card("c7", "😴 Zotavení", "Garmin", recTable)}
    ${card("c7", "📊 Kondice, únava a forma", "výpočet z aktivit", fitTable)}
    ${card("c5", "Podlaha týdne", "Garmin · záznamy", floor + `<p class="note">Plný týden: ${full.rides} jízdy, kvalita ${full.quality ? `${full.quality.count} z ${full.quality.limit}` : DASH}, zátěž ${full.done} / cíl ${full.target.lo}–${full.target.hi}.</p>`)}
    ${card("c7", "🗓️ Plán " + dm(p.from) + "–" + dm(p.to), "plán · Open-Meteo", p.days.map(planDayHtml).join("") + (p.warnings.length ? `<ul class="alerts">${p.warnings.map((w) => `<li>⚠️ ${esc(w)}</li>`).join("")}</ul>` : ""))}
    <div class="c5" style="display:flex;flex-direction:column;gap:18px">
      ${card("", "✏️ Návrh změn", "", changes)}
      ${r.warnings.length ? card("", "⚠️ Upozornění", "", `<ul class="alerts">${r.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`) : ""}
      ${card("", "Průvodce intenzitou", "nastavení FTP", intens)}
    </div>
  </div>`;
  el.querySelectorAll("[data-goal]").forEach((b) => b.addEventListener("click", async () => { await api("settings", { method: "POST", body: JSON.stringify({ goal: b.dataset.goal }) }); cache.clear(); route(); }));
  el.querySelectorAll("[data-skip]").forEach((b) => b.addEventListener("click", async () => { b.disabled = true; await api("constraint", { method: "POST", body: JSON.stringify({ date: b.dataset.skip, kind: "nepojedu", note: "dashboard" }) }); await api("plan/propose", { method: "POST" }); cache.clear(); route(); }));
  const nb = el.querySelector("#newProp");
  if (nb) nb.addEventListener("click", async () => { nb.disabled = true; await api("plan/propose", { method: "POST" }); cache.clear(); route(); });
  const ab = el.querySelector("#applyBtn");
  if (ab) ab.addEventListener("click", async () => {
    ab.disabled = true;
    const codes = [...el.querySelectorAll(".chg input:checked")].map((i) => i.value);
    try { const res = await api(`proposal/${prop.id}/apply`, { method: "POST", body: JSON.stringify({ codes }) }); el.querySelector("#applyMsg").textContent = [...res.lines, res.verify].join(" · "); cache.clear(); }
    catch (e) { el.querySelector("#applyMsg").textContent = e.message; }
  });
}

async function pageKolo(el) {
  const [acts, ride] = await Promise.all([api("activities?days=120"), api("ride")]);
  const curveSecs = ride.curve42.map((c) => c.secs);
  const lab = (s) => (s < 60 ? `${s} s` : s < 3600 ? `${s / 60} min` : "1 h");
  const list = acts.slice(0, 40).map((a) => `<div class="row"><span class="d">${dayDm(a.date)}</span><span class="t"><a href="#/aktivita/${a.id}"><b>${esc(a.name || a.sport)}</b></a><span class="sub">${esc(a.sport)}${a.is_quality ? " · kvalita" : ""}</span></span><span class="r">${a.distance_m ? num(a.distance_m / 1000, 1) + " km · " : ""}${hmm(a.moving_s)} · 🔋 ${num(a.load)}</span></div>`).join("");
  el.innerHTML = `<div class="head"><h1>Kolo</h1></div><div class="grid">
  ${card("c7", "Aktivity · 120 dní", "Garmin", list || '<p class="note">Žádné aktivity.</p>')}
  <div class="c5" style="display:flex;flex-direction:column;gap:18px">
  ${card("", "Křivka výkonu", "Garmin", lineChart({ x: curveSecs, xfmt: lab, fmt: (v) => num(v) + " W", series: [
      { name: "posledních 42 dní", values: ride.curve42.map((c) => c.w), color: "var(--acc)", dots: true },
      { name: "předchozích 42 dní", values: ride.curvePrev42.map((c) => c.w), color: "var(--z2)", dash: true },
      { name: "365 dní", values: ride.curve365.map((c) => c.w), color: "var(--muted)", width: 1 },
    ] }) + `<p class="note">FTP ${ride.ftp ?? DASH} W. Nejlepší výkony z jízd s wattmetrem.</p>`)}
  ${card("", "Týdenní objem · 26 týdnů", "Garmin", barChart({ x: ride.weeks.map((w) => w.from), xfmt: dm, values: ride.weeks.map((w) => w.km), fmt: (v) => num(v) + " km", label: "" }) + barChart({ x: ride.weeks.map((w) => w.from), xfmt: dm, values: ride.weeks.map((w) => w.load), colors: ride.weeks.map(() => "var(--z2)"), fmt: (v) => "zátěž " + num(v), height: 120 }))}
  </div></div>`;
}

async function pageAktivita(el, id) {
  const a = await api("activity/" + id);
  const laps = a.laps.show
    ? `<table class="t"><tr><th>Okruh</th><th class="r">Čas</th>${a.hasPower ? '<th class="r">Výkon</th>' : ""}<th class="r">Tep ⌀/max</th></tr>${a.laps.rows.map((r) => `<tr class="${r.iv ? "iv" : ""}"><td><b>${esc(r.name)}</b><span class="s2">${esc(r.sub)}</span></td><td class="r">${r.time}</td>${a.hasPower ? `<td class="r">${r.power}</td>` : ""}<td class="r">${r.hr}</td></tr>`).join("")}</table>`
    : "";
  el.innerHTML = `<div class="head"><div><h1>${a.emoji} ${esc(a.title)}</h1><div class="sub">${dayDm(a.date)} · start ${a.start}${a.unitType ? " · " + esc(a.unitType) : ""}${a.envLabel ? " · " + esc(a.envLabel) : ""}${a.tempText ? " · " + esc(a.tempText) : ""}</div></div><a href="#/kolo">← Kolo</a></div>
  <div class="verdict">${esc(a.verdict)}</div>
  <div class="grid">
   ${card("c6", "🎯 Splnění cíle", "Garmin · intervals.icu", `<p>${esc(a.goal)}</p>`)}
   ${card("c6", "📏 Základ", "Garmin", kv(a.basics) + (a.basicsNote ? `<p class="note">${esc(a.basicsNote)}</p>` : ""))}
   ${a.isBike ? card("c6", "🔥 Okruhy", "intervals.icu", laps + `<p class="note">${esc(a.laps.note)}</p>`) : ""}
   ${a.hrZones ? card("c6", "❤️ Tep – čas v zónách", "Garmin", zonesHtml(a.hrZones) + (a.hrZonesNote ? `<p class="note">${esc(a.hrZonesNote)}</p>` : "")) : ""}
   ${a.pwrZones ? card("c6", "⚡ Výkon – čas v zónách", "Garmin", zonesHtml(a.pwrZones) + (a.pwrZonesNote ? `<p class="note">${esc(a.pwrZonesNote)}</p>` : "")) : ""}
  </div>`;
}

async function pageZotaveni(el) {
  const d = await api("recovery");
  const rows = d.rows.slice(-90);
  const x = rows.map((r) => r.date);
  const band = (n, k = 1) => (n ? { lo: n.mean - k * n.sd, hi: n.mean + k * n.sd, name: "norma 60 d (± 1 SD)" } : null);
  el.innerHTML = `<div class="head"><h1>Zotavení</h1><div class="sub">Pravidelnost spánku (14 dní): ${esc(d.sleepReg.text)}</div></div><div class="grid">
   ${card("c6", "HRV", "Garmin Venu 3", lineChart({ x, xfmt: dm, fmt: (v) => num(v) + " ms", series: [{ name: "HRV (noc)", values: rows.map((r) => r.hrv), color: "var(--acc)" }], band: band(d.norms.hrv) }))}
   ${card("c6", "Klidový tep", "Garmin", lineChart({ x, xfmt: dm, fmt: (v) => num(v) + " bpm", series: [{ name: "klidový tep", values: rows.map((r) => r.rhr), color: "var(--bad)" }], band: d.norms.rhr ? { lo: d.norms.rhr.mean - d.norms.rhr.sd, hi: Math.max(d.norms.rhr.mean + 2 * d.norms.rhr.sd, d.norms.rhr.mean + 3), name: "norma (do +2 SD)" } : null }))}
   ${card("c6", "Spánek", "Garmin", lineChart({ x, xfmt: dm, fmt: (v) => hmm(v * 3600) + " h", series: [{ name: "délka (h)", values: rows.map((r) => (r.sleep_s != null ? r.sleep_s / 3600 : null)), color: "var(--z2)" }], band: d.norms.sleep ? { lo: (d.norms.sleep.mean - d.norms.sleep.sd) / 3600, hi: (d.norms.sleep.mean + d.norms.sleep.sd) / 3600 } : null }) + lineChart({ x, xfmt: dm, height: 140, fmt: (v) => num(v), series: [{ name: "skóre spánku", values: rows.map((r) => r.sleep_score), color: "var(--z3)" }] }))}
   ${card("c6", "Body Battery a stres", "Garmin · doplňkové", lineChart({ x, xfmt: dm, fmt: (v) => num(v), zero: true, series: [{ name: "Body Battery max", values: rows.map((r) => r.bb_max), color: "var(--z3)" }, { name: "Body Battery min", values: rows.map((r) => r.bb_min), color: "var(--z1)" }, { name: "stres průměr", values: rows.map((r) => r.stress), color: "var(--z5)", dash: true }] }) + `<p class="note">Body Battery a stres do semaforu nevstupují.</p>`)}
  </div>`;
}

async function pageKondice(el) {
  const d = await api("fitness");
  const m = d.metrics;
  const proj = d.projection;
  const x = [...m.map((r) => r.date), ...proj.map((p) => p.date)];
  const pad = (arr, n) => [...arr, ...Array(n).fill(null)];
  const pre = (n, arr) => [...Array(n).fill(null), ...arr];
  const lastIdx = m.length - 1;
  const ctlP = pre(lastIdx, [m[lastIdx]?.ctl, ...proj.map((p) => p.ctl)]);
  const atlP = pre(lastIdx, [m[lastIdx]?.atl, ...proj.map((p) => p.atl)]);
  const chartData = d.chart;
  el.innerHTML = `<div class="head"><h1>Kondice</h1><div class="sub">Cíl týdne ${d.target.lo}–${d.target.hi} · posledních 7 dní ${d.loadPast7} · příštích 7 dní ${d.loadNext7} (odhad)</div></div><div class="grid">
   ${card("c12", "Kondice / únava · 90 dní + výhled 7 dní", "výpočet z aktivit", lineChart({ x, xfmt: dm, height: 260, markIndex: lastIdx, series: [
     { name: "Kondice (CTL)", values: pad(m.map((r) => r.ctl), proj.length), color: "var(--z2)", width: 2.5 },
     { name: "Únava (ATL)", values: pad(m.map((r) => r.atl), proj.length), color: "var(--bad)" },
     { name: "výhled CTL", values: ctlP, color: "var(--z2)", dash: true },
     { name: "výhled ATL", values: atlP, color: "var(--bad)", dash: true },
   ] }))}
   ${card("c8", "Forma (TSB)", "výpočet", lineChart({ x, xfmt: dm, height: 200, markIndex: lastIdx, band: { lo: -30, hi: -10, color: "var(--z3)", name: "Optimální (−30 až −10)" }, series: [
     { name: "Forma ráno", values: pad(m.map((r) => r.form), proj.length), color: "var(--acc)" },
     { name: "výhled", values: pre(lastIdx + 1, proj.map((p) => p.form)), color: "var(--acc)", dash: true },
   ] }) + `<p class="note">Zóny: Přechod nad +20 · Čerstvý +5 až +20 · Šedá zóna −10 až +5 · Optimální −30 až −10 · Vysoké riziko pod −30.</p>`)}
   ${card("c4", "Zátěž 7 dní zpět a 7 dopředu", "Garmin · plán", barChart({ x: chartData.map((c) => c.date), xfmt: (l) => DAYS[dow(l) - 1], values: chartData.map((c) => c.load), colors: chartData.map((c) => (c.quality ? "var(--z5)" : "var(--z2)")), dashed: chartData.map((c) => c.planned), todayIndex: 7, label: "zátěž" }) + `<div class="legend"><span><i style="background:var(--z2)"></i>Z2 / ostatní</span><span><i style="background:var(--z5)"></i>kvalita</span><span>čárkovaně = plán (odhad)</span></div>`)}
   ${card("c12", "📊 Tabulka", "výpočet", `<table class="t"><tr><th>Ukazatel</th><th class="r">${esc(d.table.col1)}</th><th class="r">${esc(d.table.col2)}</th><th class="r">Změna</th></tr>${d.table.rows.map((x) => `<tr class="${x.iv ? "iv" : ""}"><td><b>${esc(x.label)}</b><span class="s2">${esc(x.sub)}</span></td><td class="r">${x.v1}</td><td class="r">${x.v2}</td><td class="r">${x.diff}</td></tr>`).join("")}</table>${d.warnings.length ? `<ul class="alerts">${d.warnings.map((w) => `<li>⚠️ ${esc(w)}</li>`).join("")}</ul>` : ""}`)}
  </div>`;
}

async function pageTelo(el) {
  const rows = await api("body");
  const w = rows.filter((r) => r.weight_kg != null);
  const fa = rows.filter((r) => r.fitness_age != null);
  const vo = rows.filter((r) => r.vo2max != null).slice(-120);
  el.innerHTML = `<div class="head"><h1>Tělo</h1></div><div class="grid">
   ${card("c6", "Váha", "Garmin · /vaha", w.length ? `<div class="big">${num(w[w.length - 1].weight_kg, 1)}<small> kg</small></div>` + lineChart({ x: w.map((r) => r.date), xfmt: dm, fmt: (v) => num(v, 1) + " kg", series: [{ name: "váha", values: w.map((r) => r.weight_kg), color: "var(--acc)", dots: true }] }) : '<p class="note">Vážení nemám. Zapiš /vaha 75,5 v Telegramu.</p>')}
   ${card("c6", "Fitness age", "Garmin", fa.length ? `<div class="big">${num(fa[fa.length - 1].fitness_age, 1)}<small> let</small></div>` + lineChart({ x: fa.map((r) => r.date), xfmt: dm, fmt: (v) => num(v, 1), series: [{ name: "fitness age", values: fa.map((r) => r.fitness_age), color: "var(--z3)", dots: true }] }) : '<p class="note">Nemám.</p>')}
   ${card("c12", "VO2max (odhad Garminu, jen trend)", "intervals.icu ← Garmin", vo.length ? lineChart({ x: vo.map((r) => r.date), xfmt: dm, fmt: (v) => num(v), series: [{ name: "VO2max", values: vo.map((r) => r.vo2max), color: "var(--z2)", dots: true }] }) + '<p class="note">Odhad z tepu a výkonu, ne měření. Hodnoť jen průměry a trend.</p>' : '<p class="note">Nemám.</p>')}
  </div>`;
}

async function pageSila(el) {
  const d = await api("strength");
  const items = [...d.log.map((l) => ({ date: l.date, kind: l.kind === "sila" ? "🏋️ Síla" : "🧘 Mobilita", note: l.note || "", src: "zápis" })), ...d.garmin.map((g) => ({ date: g.date, kind: g.sport === "strength" ? "🏋️ Síla" : "🧘 Mobilita", note: `${g.name || ""} · ${hmm(g.moving_s)}`, src: "Garmin" }))].sort((a, b) => b.date.localeCompare(a.date));
  const weeks = {};
  for (const i of items) { const mon = (() => { const dt = new Date(i.date + "T12:00:00Z"); dt.setUTCDate(dt.getUTCDate() - (dow(i.date) - 1)); return dt.toISOString().slice(0, 10); })(); weeks[mon] = weeks[mon] || { s: 0, m: 0 }; weeks[mon][i.kind.includes("Síla") ? "s" : "m"]++; }
  const wk = Object.keys(weeks).sort().slice(-12);
  el.innerHTML = `<div class="head"><h1>Síla a mobilita</h1><div class="sub">Zapisuj v Telegramu: /sila [poznámka] · /mobilita [poznámka]. Podlaha týdne: síla 1×.</div></div><div class="grid">
   ${card("c6", "Plnění po týdnech", "zápis · Garmin", wk.length ? barChart({ x: wk, xfmt: dm, values: wk.map((k) => weeks[k].s), fmt: (v) => v + "× síla", label: "" }) + barChart({ x: wk, xfmt: dm, values: wk.map((k) => weeks[k].m), colors: wk.map(() => "var(--z3)"), fmt: (v) => v + "× mobilita", height: 120 }) : '<p class="note">Zatím nic zapsáno.</p>')}
   ${card("c6", "Záznamy · 90 dní", "zápis · Garmin", items.length ? items.map((i) => `<div class="row"><span class="d">${dayDm(i.date)}</span><span class="t"><b>${i.kind}</b><span class="sub">${esc(i.note)}</span></span><span class="r sub">${i.src}</span></div>`).join("") : '<p class="note">Žádné záznamy.</p>')}
  </div>`;
}

async function pageChuze(el) {
  const rows = await api("steps");
  const last = rows.slice(-30);
  const avg7 = rows.slice(-7).reduce((s, r) => s + (r.steps || 0), 0) / Math.max(1, rows.slice(-7).length);
  el.innerHTML = `<div class="head"><h1>Chůze a kroky</h1></div><div class="grid">
   ${card("c4", "Průměr 7 dní", "Garmin", `<div class="big">${thou(avg7)}<small> kroků</small></div><p class="note">Dny s ≥ 5 000 kroky tento týden se počítají do podlahy týdne.</p>`)}
   ${card("c8", "Kroky · 30 dní", "Garmin", barChart({ x: last.map((r) => r.date), xfmt: dm, values: last.map((r) => r.steps), colors: last.map((r) => ((r.steps || 0) >= 5000 ? "var(--green)" : "var(--z1)")), fmt: (v) => thou(v) + " kroků", label: "" }))}
   ${card("c12", "Kroky · 120 dní", "Garmin", lineChart({ x: rows.map((r) => r.date), xfmt: dm, fmt: thou, series: [{ name: "kroky", values: rows.map((r) => r.steps), color: "var(--acc)" }] }))}
  </div>`;
}

async function pageVyziva(el) {
  const d = await api("fuel");
  const rides = d.rides.map((r) => `<div class="row"><span class="d">${esc(r.label)}</span><span class="t"><b>${esc(r.name)}</b><span class="sub">${hmm((r.min || 0) * 60)} · ${r.fuel.lines.slice(1).map(esc).join(" · ")}</span></span><span class="r">${esc(r.carbs ? r.carbs.text : "jen voda")}</span></div>`).join("");
  const g = d.goalRide.plan;
  el.innerHTML = `<div class="head"><h1>Výživa na jízdu</h1><div class="sub">Bidon = 60 g (40 g maltodextrin + 20 g fruktóza) · gel Nduranz Energy 45</div></div><div class="grid">
   ${card("c7", "Plánované jízdy", "plán", rides || '<p class="note">V plánu teď žádná jízda.</p>')}
   ${card("c5", "Tabulka", "pravidla", `<table class="t"><tr><th>Délka</th><th class="r">Sacharidy</th></tr>${d.table.map((t) => `<tr><td>${t.dur}</td><td class="r">${t.carbs}</td></tr>`).join("")}</table><p class="note">Ostřejší jednotky spíš horní hranice, klidné a v chladu dolní.</p><table class="t" style="margin-top:10px"><tr><th>Délka</th><th>Z2</th><th>Kvalita</th></tr>${d.examples.map((e) => `<tr><td>${hmm(e.min * 60)}</td><td>${esc(e.z2)}</td><td>${esc(e.quality)}</td></tr>`).join("")}</table>`)}
   ${card("c12", `Cílová jízda: ${esc(d.goalRide.name || "120 km pod 4 h")}`, "odhad", `${kv([["Délka", hmm(g.durationMin * 60) + " h"], ["🍬 Sacharidy", `${g.carbsTotal} g (${g.carbsPerHour} g/h): ${esc(g.carbsPack)}`], ["💧 Tekutiny", `${num(g.fluidPerHour, 2)} l/h · ${num(g.fluidTotal, 1)} l celkem (odhad)`], ["🧂 Sodík", `${g.sodiumPerHour} mg/h (odhad)`]])}
     <p class="note">Odhady: ${g.estimates.map(esc).join("; ")}. ${esc(d.hint)}</p><p class="note">${esc(d.note)} Pij po doušcích každých 15–20 min, jez po malých dávkách, ne vše najednou.</p>`)}
  </div>`;
}

async function pageNastaveni(el) {
  const [s, st] = await Promise.all([api("settings"), api("status")]);
  const f = (k, label, type = "text", extra = "") => `<label>${label}<input name="${k}" type="${type}" value="${esc(s[k] ?? "")}" ${extra}></label>`;
  const bf = st.state.bf_act || {}, bw = st.state.bf_well || {};
  el.innerHTML = `<div class="head"><h1>Nastavení</h1></div><div class="grid">
   ${card("c8", "Trénink a zprávy", "", `<form id="sf"><div class="form-grid">
     ${f("ftp", "FTP (W)", "number", 'min="80" max="600"')}
     <label>Cíl<select name="goal">${[["zvyseni", "Zlepšení kondice"], ["udrzeni", "Udržení formy"], ["pokles", "Řízený pokles (zima)"], ["zavod", "Závod"]].map(([v, l]) => `<option value="${v}" ${s.goal === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
     ${f("goal_name", "Název cíle / závodu")}
     ${f("goal_date", "Datum cíle", "date")}
     ${f("year_km_goal", "Roční cíl km", "number")}
     ${f("rides_per_week", "Jízdy týdně (2–5)", "number", 'min="2" max="5"')}
     ${f("morning_from", "Ranní zpráva od", "time")}
     ${f("morning_to", "Ranní zpráva nejpozději", "time")}
     ${f("evening_time", "Večerní zpráva (zítřek)", "time")}
     ${f("weekly_time", "Týdenní souhrn (neděle)", "time")}
     ${f("garmin_key_created", "Garmin klíč vytvořen", "date")}
     <label class="chk"><input type="checkbox" name="llm_enabled" ${s.llm_enabled ? "checked" : ""}> LLM (Workers AI) pro volné otázky</label>
     <label class="chk"><input type="checkbox" name="llm_polish" ${s.llm_polish ? "checked" : ""}> LLM uhlazuje závěr zpráv</label>
     <label class="chk"><input type="checkbox" name="icu_sync" ${s.icu_sync ? "checked" : ""}> Zápis plánu do intervals.icu</label>
   </div><div class="btns"><button class="btn pri" type="submit">Uložit</button><span class="note" id="saved"></span></div></form>`)}
   ${card("c4", "Zóny tepu", s.hr_zones ? s.hr_zones.source : "", s.hr_zones ? kv([...s.hr_zones.floors.map((v, i) => [`Z${i + 1} od`, v + " bpm"]), ["Max", s.hr_zones.max + " bpm"], ["LTHR", (s.hr_zones.lthr ?? DASH) + " bpm"], ["Klidový", (s.hr_zones.rest ?? DASH) + " bpm"]]) : '<p class="note">Nemám.</p>')}
   ${card("c6", "Stav synchronizace", st.source, kv([
     ["Poslední sync", st.state.last_sync_ok ? new Date(st.state.last_sync_ok).toLocaleString("cs-CZ") : DASH],
     ["Aktivity", `${st.counts.acts} (od ${st.counts.a_from ? dm(st.counts.a_from) + st.counts.a_from.slice(0, 4) : DASH})`],
     ["Dny wellness / noci", `${st.counts.days} / ${st.counts.nights}`],
     ["Backfill aktivit", bf.done ? "hotovo" : `${bf.count ?? 0}…`],
     ["Backfill wellness", bw.done ? "hotovo" : bw.cursor ?? DASH],
     ["Naplánované jednotky", st.counts.planned],
     ["LLM", st.llm ? esc(st.model) : "nedostupné"],
   ]))}
   ${card("c6", "Limity free plánu", "Cloudflare", `<p class="note">Jeden cron (*/15), sync po malých dávkách, LLM jen pro hotové zprávy. Detail v docs/limits.md.</p><table class="t"><tr><th>Kdy</th><th>Událost</th></tr>${st.logs.slice(0, 8).map((l) => `<tr><td class="sub">${new Date(l.at).toLocaleString("cs-CZ")}</td><td>${esc(l.level)}: ${esc(l.msg)}</td></tr>`).join("")}</table>`)}
   ${card("c12", "Vzhled", "", `<div class="btns">${["auto", "light", "dark"].map((t) => `<button class="btn" data-theme="${t}">${{ auto: "Podle systému", light: "Světlý", dark: "Tmavý" }[t]}</button>`).join("")}</div>`)}
  </div>`;
  el.querySelector("#sf").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {};
    for (const k of ["ftp", "year_km_goal", "rides_per_week"]) body[k] = fd.get(k) ? Number(fd.get(k)) : null;
    for (const k of ["goal", "goal_name", "goal_date", "morning_from", "morning_to", "evening_time", "weekly_time", "garmin_key_created"]) body[k] = fd.get(k) || null;
    for (const k of ["llm_enabled", "llm_polish", "icu_sync"]) body[k] = fd.get(k) === "on";
    await api("settings", { method: "POST", body: JSON.stringify(body) });
    cache.clear();
    el.querySelector("#saved").textContent = "Uloženo.";
  });
  el.querySelectorAll("[data-theme]").forEach((b) => b.addEventListener("click", () => setTheme(b.dataset.theme)));
}

// ---------- router ----------
function setTheme(t) {
  try { t === "auto" ? localStorage.removeItem("theme") : localStorage.setItem("theme", t); } catch {}
  if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t);
}
try { const t = localStorage.getItem("theme"); if (t) document.documentElement.setAttribute("data-theme", t); } catch {}

function menu(active) {
  const html = PAGES.map(([k, l, i]) => `<a href="#/${k}" class="${k === active ? "on" : ""}"><span class="ico">${i}</span><span>${l}</span></a>`).join("");
  document.getElementById("menu").innerHTML = html;
  document.getElementById("tabbar").innerHTML = html;
}

const ROUTES = { prehled: pagePrehled, trener: pageTrener, kolo: pageKolo, zotaveni: pageZotaveni, kondice: pageKondice, telo: pageTelo, sila: pageSila, chuze: pageChuze, vyziva: pageVyziva, nastaveni: pageNastaveni };

let routeSeq = 0;
async function route() {
  const seq = ++routeSeq;
  const [page, arg] = (location.hash.replace(/^#\/?/, "") || "prehled").split("/");
  const main = document.getElementById("main");
  menu(page === "aktivita" ? "kolo" : page);
  main.innerHTML = `<div class="loading">Načítám…</div>`;
  hideTip();
  // stránka se kreslí do vlastního kontejneru; starší (pomalejší) požadavek nesmí přepsat novější
  const el = document.createElement("div");
  try {
    if (page === "aktivita") await pageAktivita(el, arg);
    else await (ROUTES[page] || pagePrehled)(el);
  } catch (e) {
    el.innerHTML = `<div class="err"><b>Data se nepodařilo načíst.</b><br>${esc(e.message)}</div>`;
  }
  if (seq !== routeSeq) return;
  main.replaceChildren(el);
  scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
route();
api("settings").then((s) => { document.getElementById("brandName").textContent = s.first_name || "Trenér"; }).catch(() => {});
