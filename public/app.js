"use strict";
// Dashboard Kadence – všechna data z /api, žádná natvrdo v HTML.

// jednobarevné ikony (SVG, barva = currentColor) – stejný styl v menu i ve spodní liště
const ICONS = {
  prehled: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  trener: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 10h18M9 15.5l2 2 4-4"/>',
  aktivity: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  kondice: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  zotaveni: '<path d="M12 20s-7.5-4.6-9.2-9.4A4.6 4.6 0 0 1 12 7.3a4.6 4.6 0 0 1 9.2 3.3C19.5 15.4 12 20 12 20z"/>',
  chuze: '<path d="M8.5 3.5c1.8 0 2.8 1.9 2.6 4.3-.2 2.3-1.3 3.7-2.9 3.7S5.6 10 5.7 7.6C5.8 5.2 6.8 3.5 8.5 3.5zM6.3 14h4.4l-.4 3.6a2 2 0 0 1-3.6.4z"/><path d="M15.5 7.5c1.7 0 2.6 1.6 2.4 3.8-.2 2-1.2 3.2-2.7 3.2s-2.5-1.3-2.4-3.4c.1-2.1 1.1-3.6 2.7-3.6zM13.5 17.5h4.2l-.4 2.4a1.9 1.9 0 0 1-3.5.2z"/>',
  nastaveni: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  kalendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 10h18"/><circle cx="8" cy="14.5" r="1"/><circle cx="12" cy="14.5" r="1"/><circle cx="16" cy="14.5" r="1"/><circle cx="8" cy="18" r="1"/>',
  vybaveni: '<circle cx="6" cy="16" r="3.6"/><circle cx="18" cy="16" r="3.6"/><path d="M6 16l4-7h5l3 7M10 9l3 7h-7M14 6h3"/>',
  profil: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 4.2-6.5 8-6.5s7.2 2.5 8 6.5"/>',
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
/** krátké názvy pro dlaždice v „Více“ (mobil) */
const SHORT = { vybaveni: "Vybavení", nastaveni: "Nastavení" };
const MORE = [
  ["profil", "Profil"],
  ["kalendar", "Kalendář"],
  ["vybaveni", "Vybavení"],
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
// escapuje i apostrof – hodnoty jdou i do atributů v apostrofech (data-t='…')
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// odkaz Počasí → Trenér: po přechodu sjet na okna (bez inline onclick kvůli CSP)
document.addEventListener("click", (e) => { if (e.target.closest?.("[data-topocasi]")) setTimeout(() => document.getElementById("pocasi")?.scrollIntoView({ behavior: "smooth" }), 900); });
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// ---------- ikony (styl Duotón): obrys v barvě skupiny, uzavřené plochy (.f) průsvitně, plné body (.fs) ----------
// [CSS proměnná barvy nebo "" = barva okolního textu, obsah SVG 24 × 24]. Žádná emoji – vlastní SVG všude.
const BIKE_SVG = '<circle class="f" cx="5" cy="17" r="3.8"/><circle class="f" cx="19" cy="17" r="3.8"/><path d="M5 17h6.5L17 10.5M17 10.5 19 17M8.6 10l2.9 7M17 10.5l1.4-.5.3 1.5"/><circle class="fs" cx="16.4" cy="4.3" r="2"/><path d="M8.6 10 14 7.3l3 3.2M8.6 10l3.6 3-.7 4"/>';
const HEART_SVG = '<path class="f" d="M12 20s-7.5-4.6-9.2-9.4A4.6 4.6 0 0 1 12 7.3a4.6 4.6 0 0 1 9.2 3.3C19.5 15.4 12 20 12 20z"/>';
const THERMO_SVG = '<path class="f" d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z"/><path d="M12 10v6"/>';
const IC = {
  // sporty
  kolo: ["--z2", BIKE_SVG],
  mtb: ["--z3", '<path class="f" d="M.8 8.2 3.6 3.6l1.6 2.2 1.2-1.4 2.2 3.8z"/><g transform="translate(0 -.6) rotate(-8 12 17)"><circle class="f" cx="5" cy="17" r="3.8"/><circle class="f" cx="19" cy="17" r="3.8"/><path d="M5 17h6.5L17 10.5M17 10.5 19 17M8.6 10l2.9 7M16 9.6h2.6"/><circle class="fs" cx="16.4" cy="4.3" r="2"/><path d="M8.6 10 14 7.3l3 3.2M8.6 10l3.6 3-.7 4"/></g><path d="M1 22.6 23 19.5"/>'],
  trenazer: ["--z1", `<g transform="translate(0 -1.6)">${BIKE_SVG}</g><path d="M5 15.4 2.4 21.6M5 15.4l2.6 6.2M1.2 21.6h7.6M16.6 21.6h4.8"/>`],
  beh: ["--acc", '<circle class="fs" cx="15.2" cy="3.8" r="2"/><path d="M13.8 7.2 11.4 12.3"/><path d="M13.5 8.1 16.1 10.2l2.3-1.6M13.5 8.1l-2.9 1.3-1.9 2.4"/><path d="M11.4 12.3l3.3 2.6-.9 5.1h1.6M11.4 12.3 9.4 16.1l-3.5 1.5"/>'],
  chuze: ["--z4", '<circle class="fs" cx="12.8" cy="3.7" r="2"/><path d="M12.4 7.1 11.7 12.6"/><path d="M12.3 7.9l2.3 3.3 1.8.9M12.3 7.9l-2.4 2.8-.4 2.6"/><path d="M11.7 12.6l2.5 3.4.4 4.4h1.6M11.7 12.6 9.9 16.4l-1.9 3.9"/>'],
  turistika: ["--z4", '<circle class="fs" cx="11.8" cy="3.7" r="2"/><path class="f" d="M7.6 6.6h3l-.4 5.4H7.2z"/><path d="M11.4 7.1 10.8 12.6"/><path d="M11.3 7.9l2.7 2.6 1.9-.3M11.3 7.9l-1.3 3.5"/><path d="M10.8 12.6l2.4 3.4.4 4.4h1.6M10.8 12.6 9 16.4l-1.9 3.9M16.9 8.5v12"/>'],
  bezky: ["--ski", '<circle class="fs" cx="15" cy="4.1" r="2"/><path d="M14 7.3 11.2 12.4M13.7 8.1l3.8 2M13.7 8.1l-3.4.9-1.6 2.2M17.5 10.1l-1 9.6M11.2 12.4l2.8 3-.5 4.2M11.2 12.4 9 16l-3 3.6M2.5 19.9h17c.9 0 1.6-.5 1.9-1.3"/>'],
  sjezd: ["--ski", '<circle class="fs" cx="15.6" cy="5.2" r="2"/><path d="M14.2 8.2 9.6 11.4M13.8 8.6l3.2 2.6M17 11.2l2 6.2M9.6 11.4l3.8 2.2-1.8 3.5M4.2 14.9l14.4 4.5c.9.3 1.8 0 2.4-.8"/>'],
  brusle: ["--z7", '<path class="f" d="M6 3.5h4.5v6.2l6 2.3c1.6.6 2.5 1.7 2.5 3.2V16H6z"/><path d="M8.5 6.5h2M8.5 9h2M4 19.5h14.5a2 2 0 0 0 2-2M8 16v3.5M16 16v3.5"/>'],
  padel: ["--z7", '<path class="f" d="M14.6 3.6c3 1.4 3.7 5.4 1.6 8.7-2 3.1-5.4 4.4-7.9 3-2.6-1.4-2.9-5.3-.8-8.5 2-3.1 4.7-4.4 7.1-3.2z"/><path d="M9.5 15.6 6.6 20.6M8.4 8.6h.01M11 9.7h.01M13.6 10.8h.01M10.6 6.4h.01M13.2 7.5h.01M9 12h.01M11.6 13.1h.01"/><circle class="fs" cx="19.4" cy="16.6" r="1.8"/>'],
  sila: ["--z6", '<rect class="f" x="4.2" y="7" width="3.2" height="10" rx="1.2"/><rect class="f" x="16.6" y="7" width="3.2" height="10" rx="1.2"/><path d="M2 9.6v4.8M22 9.6v4.8M7.4 12h9.2"/>'],
  mobilita: ["--z6", '<circle class="fs" cx="12" cy="4" r="2"/><path d="M12 7.2v6M4 9.6h16M12 13.2l4.6 1.6.9 5.2M12 13.2 6 20M3 21h18"/>'],
  ostatni: ["--z1", '<path d="M8 2.8l2.7 7.7M16 2.8l-2.7 7.7M8 2.8h8"/><circle class="f" cx="12" cy="15.6" r="5.2"/><path d="m12 13 .9 1.8 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z"/>'],
  // zdraví
  zotaveni: ["--ok", HEART_SVG],
  vst: ["--m-hrv", HEART_SVG + '<path d="M5 12.5h3l1.5-2.5 2.5 5 2-3.5h5"/>'],
  tep: ["--m-rhr", '<path d="M2 12.5h4l2.5-6 4 12 3-9 2 3H22"/>'],
  spanek: ["--m-sleep", '<path class="f" d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/><path d="M14.5 3.5h4l-4 4.5h4"/>'],
  noc: ["--m-sleep", '<path class="f" d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'],
  dech: ["--m-resp", '<path d="M12 3v8M12 11l-3 2M12 11l3 2"/><path class="f" d="M8.5 7C5.5 7 3.5 12 3.5 16.5c0 2.2 1.3 3.5 3 3.5S10 18.8 10 17v-6.5C10 8.3 9.5 7 8.5 7zM15.5 7c3 0 5 5 5 9.5 0 2.2-1.3 3.5-3 3.5S14 18.8 14 17v-6.5C14 8.3 14.5 7 15.5 7z"/>'],
  stres: ["--m-stress", '<path class="f" d="M3.5 17.5a8.5 8.5 0 1 1 17 0z"/><path d="M12 17.5l4.5-5.5M6.5 13.5l1 .6M12 9v1.5M17.5 13.5l-1 .6"/>'],
  energie: ["--m-bb", '<rect class="f" x="3" y="7" width="16" height="10" rx="2.5"/><path d="M21.5 10.5v3M6.5 10v4M9.5 10v4"/>'],
  unava: ["--warn", '<rect class="f" x="3" y="7" width="16" height="10" rx="2.5"/><path d="M21.5 10.5v3M6.5 10v4"/>'],
  vaha: ["--z1", '<rect class="f" x="3.5" y="4" width="17" height="16" rx="4"/><path d="M8.5 10a5 5 0 0 1 7 0M12 10.5l1.8-2"/>'],
  kroky: ["--z4", '<path class="f" d="M8 3c1.9 0 3 1.8 3 4.2 0 2.2-.9 4.3-2.9 4.3S5 9.6 5 7.2C5 4.8 6.1 3 8 3zM16 7c1.9 0 3 1.8 3 4.2 0 2.2-.9 4.3-2.9 4.3S13 13.6 13 11.2C13 8.8 14.1 7 16 7z"/><path class="f" d="M6.2 13.8h3.6v1.4a1.8 1.8 0 0 1-3.6 0zM14.2 17.8h3.6v1.4a1.8 1.8 0 0 1-3.6 0z"/>'],
  vo2: ["--m-resp", '<circle class="f" cx="9" cy="13" r="5.5"/><path d="M15.5 6.5a2 2 0 1 1 3.8 1c-.4.9-1.6 1.9-3.8 3.5h4"/>'],
  fitage: ["--z3", '<path d="M7 3c0 4.5 10 4.5 10 9s-10 4.5-10 9M17 3c0 4.5-10 4.5-10 9s10 4.5 10 9M7.6 4.8h8.8M8.4 10.2h7.2M8.4 13.8h7.2M7.6 19.2h8.8"/>'],
  teplota: ["--acc", THERMO_SVG],
  voda: ["--z2", '<path class="f" d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>'],
  // trénink a hodnoty aktivit
  kvalita: ["--acc", '<path class="f" d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z"/>'],
  ftp: ["--acc", '<circle class="f" cx="12" cy="12" r="9"/><path d="M13 6.5l-4 6h3.5l-1 5 4-6.5H12z"/>'],
  cil: ["--acc", '<circle class="f" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>'],
  kalendar: ["--acc", '<rect class="f" x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 10h18M8 14.5h.01M12 14.5h.01M16 14.5h.01"/>'],
  kondice: ["--ok", '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'],
  pokles: ["--warn", '<path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/>'],
  rovne: ["", '<path d="M4 12h15M13 6l6 6-6 6"/>'],
  dolu: ["", '<path d="M12 4v15M6 13l6 6 6-6"/>'],
  zatez: ["--acc", '<path class="f" d="M12 21a6.5 6.5 0 0 0 6.5-6.5c0-4.5-4-6.5-4.5-11-2.5 2-4 4.5-3.5 7.5-1.5-.5-2.5-2-2.5-3.5-1.5 1.5-2.5 4-2.5 7A6.5 6.5 0 0 0 12 21z"/>'],
  interval: ["--z7", '<circle class="f" cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M10 2.5h4M12 2.5V6M18.5 6.5l1.5-1.5"/>'],
  rychlost: ["--z2", '<path d="M2.5 8h5M1.5 12h4.5M2.5 16h5"/><path class="f" d="M9.5 6h5.5l5.5 6-5.5 6H9.5l5.5-6z"/>'],
  pomer: ["--z3", '<path d="M12 3.5v17M7.5 20.5h9M4.5 6.5h15"/><path class="f" d="M2.5 13.5 4.5 7l2 6.5a2 2 0 0 1-4 0zM17.5 13.5 19.5 7l2 6.5a2 2 0 0 1-4 0z"/>'],
  graf: ["--z2", '<path d="M4 20.5h16"/><rect class="f" x="5" y="11" width="3.2" height="9.5" rx="1"/><rect class="f" x="10.4" y="6" width="3.2" height="14.5" rx="1"/><rect class="f" x="15.8" y="13.5" width="3.2" height="7" rx="1"/>'],
  intenzita: ["--acc", '<path d="M5 4v16M12 4v16M19 4v16"/><rect class="f" x="3" y="12" width="4" height="3" rx="1"/><rect class="f" x="10" y="7" width="4" height="3" rx="1"/><rect class="f" x="17" y="14" width="4" height="3" rx="1"/>'],
  kadence: ["--z3", '<circle class="f" cx="12" cy="12" r="3"/><path d="M12 12l4.5 5.5M16.5 17.5H19M19.5 9.5A8 8 0 0 0 5.2 7.5M4.5 14.5a8 8 0 0 0 5 5.1M5 4v3.5h3.5"/>'],
  delka: ["--z4", '<rect class="f" x="2.5" y="8" width="19" height="8" rx="1.5"/><path d="M6.5 8v3M10.5 8v4.5M14.5 8v3M18.5 8v4.5"/>'],
  chodidlo: ["--z4", '<path class="f" d="M10 3c2.4 0 3.8 2.4 3.8 5.6 0 3-1.2 5.4-3.7 5.4S6.2 11.6 6.2 8.6C6.2 5.4 7.6 3 10 3z"/><path class="f" d="M7.8 15.6h4.6v1.4a2.3 2.3 0 0 1-4.6 0z"/><path d="M3 21h18"/>'],
  oscilace: ["--m-resp", '<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>'],
  vybuch: ["--z6", '<path class="f" d="M12 2.5l2 5.2 5.4-1.6-2.8 4.9 4.9 2.8-5.5.9.9 5.5-4.9-3-3.1 4.6-.9-5.5-5.5.5 3.9-3.9L4 7.3l5.5 1.2z"/>'],
  trasa: ["--z2", '<circle class="f" cx="6" cy="18" r="2.2"/><circle class="f" cx="18" cy="6" r="2.2"/><path d="M8.2 18h7.3a3 3 0 0 0 0-6h-7a3 3 0 0 1 0-6h7.3"/>'],
  mapa: ["--z2", '<path class="f" d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/>'],
  satelit: ["", '<path class="f" d="M3 7.5 7.5 3l3 3L6 10.5zM18 13.5l3 3-4.5 4.5-3-3z"/><rect class="f" x="9" y="9" width="6" height="6" rx="1.2" transform="rotate(45 12 12)"/><path d="M8.3 8.3l1.2 1.2M14.5 14.5l1.2 1.2"/>'],
  hory: ["--z3", '<path class="f" d="M2.5 20 9 8.5l4 6 2.5-3.5 6 9z"/><path d="M7.3 11.5 9 13l1.5-1.5"/>'],
  skupina: ["--z7", '<circle class="f" cx="9" cy="8" r="3.2"/><path d="M3 20c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5"/><circle class="f" cx="17" cy="9" r="2.6"/><path d="M16.5 14.5c2.5 0 4.2 1.7 4.5 4.5"/>'],
  vybaveni: ["--z2", '<circle class="f" cx="6" cy="16" r="3.6"/><circle class="f" cx="18" cy="16" r="3.6"/><path d="M6 16l4-7h5l3 7M10 9l3 7h-7M14 6h3"/>'],
  boty: ["--acc", '<path class="f" d="M3 16.5v-8l4 .5 2 3 5 1.5 5.5 1.5a2 2 0 0 1 1.5 2v1H3z"/><path d="M3 19.5h18M9.5 11.5l1.5-1M11.5 13l1.5-1"/>'],
  batoh: ["--z1", '<rect class="f" x="5" y="6" width="14" height="15" rx="4"/><path d="M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6M8.5 13h7v4h-7z"/>'],
  volno: ["--z1", '<path class="f" d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><path class="f" d="M3 12a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3z"/><path d="M5 17v2.5M19 17v2.5"/>'],
  svezi: ["--ok", '<path class="f" d="M11 3l1.8 4.7L17.5 9.5l-4.7 1.8L11 16l-1.8-4.7L4.5 9.5l4.7-1.8z"/><path d="M18.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>'],
  // plnění plánu a stav
  odjeto: ["--ok", '<circle class="f" cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7 5.8-5.7"/>'],
  castecne: ["--warn", '<circle cx="12" cy="12" r="9"/><path class="fs" d="M12 3a9 9 0 0 1 0 18z"/>'],
  vynechano: ["--bad", '<circle class="f" cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>'],
  presun: ["", '<path d="M7 4 3 8l4 4M3 8h13M17 12l4 4-4 4M21 16H8"/>'],
  pauza: ["--z1", '<circle class="f" cx="12" cy="12" r="9"/><path d="M10 8.5v7M14 8.5v7"/>'],
  navic: ["--z2", '<circle class="f" cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'],
  aktivni: ["--ok", '<circle class="f" cx="12" cy="12" r="9"/><path d="M6.5 12H9l1.5-3 3 6 1.5-3h2.5"/>'],
  nemocny: ["--bad", THERMO_SVG],
  zraneny: ["--warn", '<rect class="f" x="2.5" y="8" width="19" height="8" rx="4" transform="rotate(-45 12 12)"/><path d="M10.5 10.5h.01M13.5 13.5h.01M13.5 10.5h.01M10.5 13.5h.01"/>'],
  dovolena: ["--z2", '<circle class="f" cx="19.3" cy="4.7" r="2.2"/><g transform="rotate(-18 11 13)"><path class="f" d="M3.5 12.5a7.5 7.5 0 0 1 15 0z"/><path d="M11 12.5V21"/></g><path d="M3 21h18"/>'],
  nelze: ["--bad", '<circle class="f" cx="12" cy="12" r="9"/><path d="M7.5 12h9"/>'],
  // vybavení: kola bez jezdce podle druhu, trenažér, lyže
  silnicni: ["--z2", '<circle class="f" cx="5" cy="16.5" r="3.9"/><circle class="f" cx="19" cy="16.5" r="3.9"/><path d="M5 16.5h6.5L16.5 10H9.2M5 16.5 9.2 10M9.2 10l2.3 6.5M16.5 10 19 16.5M8 10h2.6M16.5 10l.4-2h1.8c1 0 1.4.8 1.1 1.6l-.4 1"/>'],
  horske: ["--z3", '<circle class="f" cx="5" cy="16.5" r="3.9"/><circle class="f" cx="19" cy="16.5" r="3.9"/><circle class="fs" cx="5" cy="16.5" r="1.1"/><circle class="fs" cx="19" cy="16.5" r="1.1"/><path d="M5 16.5h6.5L16 9.5H9.5M5 16.5 9.5 9.5M9.5 9.5l2 7M16 9.5l3 7M15.2 7.6h3.4M8.2 9.5h2.6"/><path d="M17.2 12.2l.9 2" stroke-width="3"/>'],
  gravel: ["--z4", '<circle class="f" cx="5" cy="16.5" r="3.9"/><circle class="f" cx="19" cy="16.5" r="3.9"/><circle cx="5" cy="16.5" r="2.5"/><circle cx="19" cy="16.5" r="2.5"/><path d="M5 16.5h6.5L16.5 10H9.2M5 16.5 9.2 10M9.2 10l2.3 6.5M16.5 10 19 16.5M8 10h2.6M16.5 10l.3-2h1.9l.8 2.4"/>'],
  trenazerVyb: ["--z1", '<rect class="f" x="7" y="7" width="10" height="9" rx="2.5"/><circle cx="12" cy="11.5" r="2.4"/><path d="M12 11.5h.01M9 16l-4 4.5M15 16l4 4.5M3.5 20.5h17M12 4v3"/>'],
  lyze: ["--ski", '<path d="M2.5 19.5h15.5c1.6 0 2.6-.9 3.2-2.4M2.5 22h15.5c1.6 0 2.6-.9 3.2-2.4"/><path d="M8 2.5 10 17M15.5 2.5 13.5 17"/><circle class="fs" cx="9.7" cy="14.6" r="1.1"/><circle class="fs" cx="13.8" cy="14.6" r="1.1"/>'],
  zakaz: ["--bad", '<circle class="f" cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>'],
  // ovládání a rozhraní (bez barvy = barva textu, sedí i na tlačítkách)
  ai: ["--acc", '<path class="f" d="M11 3l1.8 4.7L17.5 9.5l-4.7 1.8L11 16l-1.8-4.7L4.5 9.5l4.7-1.8z"/><path d="M18.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>'],
  sync: ["", '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 3.5V8h4.5M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20.5V16h-4.5"/>'],
  upravit: ["", '<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5zM13.5 7l3 3"/>'],
  smazat: ["", '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/>'],
  stahnout: ["", '<path d="M12 3.5v12M7 11l5 5 5-5M4 20.5h16"/>'],
  odeslat: ["", '<path d="M12 16V4M7 8.5l5-5 5 5M4 20.5h16"/>'],
  odkaz: ["", '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'],
  varovani: ["--warn", '<path class="f" d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.2h.01"/>'],
  info: ["", '<circle class="f" cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8h.01"/>'],
  kniha: ["--z2", '<path class="f" d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 0 2 2h13v-3M8 7.5h7"/>'],
  zpet: ["", '<path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'],
  domov: ["", '<path class="f" d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'],
  svet: ["--z2", '<circle class="f" cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3z"/>'],
  presne: ["--acc", '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle class="fs" cx="12" cy="12" r="2"/>'],
  pocasi: ["--z2", '<circle class="f" cx="8.5" cy="8.5" r="3.5"/><path d="M8.5 2v1.5M2 8.5h1.5M3.9 3.9l1 1M13.1 3.9l-1 1"/><path class="f" d="M9 20a3.5 3.5 0 0 1-.4-7 5 5 0 0 1 9.4 1.2A3 3 0 0 1 17.5 20z"/>'],
  dest: ["--z2", '<path class="f" d="M7 15a4 4 0 0 1-.6-8A5.5 5.5 0 0 1 17 7.5a3.8 3.8 0 0 1 .5 7.5z"/><path d="M8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5"/>'],
  vitr: ["", '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"/>'],
  slunce: ["--z4", '<circle class="f" cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'],
  cas: ["--z7", '<circle class="f" cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'],
  historie: ["", '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5M3.5 4v4.5H8M12 7.5V12l3 2"/>'],
  klic: ["--warn", '<circle class="f" cx="8" cy="15" r="4.5"/><path d="M11.2 11.8 20 3M17 6l2.5 2.5M14.5 8.5l2 2"/>'],
  log: ["", '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>'],
  vzhled: ["", '<path class="f" d="M12 3a9 9 0 0 0 0 18c1.4 0 2.2-1 2.2-2.1 0-.6-.2-1-.6-1.5-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.4 17 3 12 3z"/><path d="M7.4 12.4h.01M9.2 8.2h.01M13.6 6.8h.01M17 9.8h.01"/>'],
  chat: ["", '<path class="f" d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A2.5 2.5 0 0 1 3 13.5z"/><path d="M8 8.5h8M8 12h5"/>'],
  profil: ["", '<circle class="f" cx="12" cy="8" r="4"/><path d="M4 21c.8-4 4.2-6.5 8-6.5s7.2 2.5 8 6.5"/>'],
  model: ["", '<rect class="f" x="6" y="6" width="12" height="12" rx="2.5"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3M10 10h4v4h-4z"/>'],
  kompas: ["--acc", '<circle class="f" cx="12" cy="12" r="9"/><path class="fs" d="M15.8 8.2 13.4 13.4 8.2 15.8l2.4-5.2z"/>'],
};
/** ikona jako HTML (velikost podle písma okolí) */
const ic = (k) => { const x = IC[k] || IC.ostatni; return `<span class="ic"${x[0] ? ` style="--c:var(${x[0]})"` : ""}><svg class="i" viewBox="0 0 24 24" aria-hidden="true">${x[1]}</svg></span>`; };
/** ikona uvnitř SVG grafu (střed cx, cy; velikost s) */
const icSvg = (k, cx, cy, s = 13) => { const x = IC[k] || IC.ostatni; return `<svg class="i" x="${(cx - s / 2).toFixed(1)}" y="${(cy - s / 2).toFixed(1)}" width="${s}" height="${s}" viewBox="0 0 24 24" style="color:var(${x[0] || "--muted"})">${x[1]}</svg>`; };
/** semafor zotavení jako barevná tečka (good / warn / bad) */
const sdot = (t) => `<i class="sdot ${t}" aria-hidden="true"></i>`;
const SPORT_IC = { ride: "kolo", mtb: "mtb", indoor: "trenazer", run: "beh", skate: "brusle", xc_ski: "bezky", walk: "chuze", hike: "turistika", padel: "padel", strength: "sila", mobility: "mobilita", other: "ostatni" };
const SPORT_ICON = Object.fromEntries(Object.entries(SPORT_IC).map(([s, k]) => [s, ic(k)]));
/** délka „1 h 10 min“ / „48 min“ (spánek, fáze) */
/** čas aktivity: pod hodinu „40 min“, jinak „1:25 h“ → [číslo, jednotka] */
const hU = (s) => (s != null && s < 3600 ? [String(Math.round(s / 60)), "min"] : [hmm(s), "h"]);
const hUt = (s) => hU(s).join(" ");
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
/** souvislé úseky (bez null) → [[{x,y,i}]] */
function runs(values, X, Y) {
  const out = []; let cur = [];
  values.forEach((v, i) => { if (v == null || !isFinite(v)) { if (cur.length) out.push(cur); cur = []; return; } cur.push({ x: X(i), y: Y(v), i }); });
  if (cur.length) out.push(cur);
  return out;
}
const SPORT_NAME = { ride: "Silniční kolo", mtb: "Horské kolo", indoor: "Trenažér", run: "Běh", skate: "Brusle", xc_ski: "Běžky", walk: "Chůze", hike: "Turistika", padel: "Padel", strength: "Síla", mobility: "Mobilita", other: "Ostatní" };

// ---------- API ----------
const cache = new Map();
/** GET se drží minutu v paměti; stejný dotaz, který zrovna běží, se neposílá podruhé (víc míst stránky čeká na jednu odpověď). */
const inflight = new Map();
let cacheGen = 0;
// po uložení změny (cache.clear) se nesmí vrátit ani uložit odpověď dotazu odeslaného před změnou
{ const clear = cache.clear.bind(cache); cache.clear = () => { cacheGen++; inflight.clear(); clear(); }; }
function api(path, opts) {
  if (opts) return apiFetch(path, opts);
  if (cache.has(path) && Date.now() - cache.get(path).at < 60_000) return Promise.resolve(cache.get(path).data);
  if (inflight.has(path)) return inflight.get(path);
  const gen = cacheGen;
  const p = apiFetch(path).then((data) => { if (gen === cacheGen) cache.set(path, { at: Date.now(), data }); return data; }).finally(() => { if (inflight.get(path) === p) inflight.delete(path); });
  inflight.set(path, p);
  return p;
}
async function apiFetch(path, opts) {
  const r = await fetch("/api/" + path, { credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, ...opts });
  const data = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (!r.ok) throw new Error(data.message || data.error || `HTTP ${r.status}`);
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
let tipLeave = null;
document.addEventListener("touchstart", (e) => { if (tipLeave && !e.target.closest?.("svg.chart")) { tipLeave(); tipLeave = null; } }, { passive: true, capture: true });
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
  // tlačítko AI i po překreslení stránky bez změny adresy (filtry, přepínače)
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
    el.addEventListener("touchend", () => { tipLeave = leave; });
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
  // normální rozsah posuvný po dnech: plocha mezi hi a lo
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
    const yy = Y(avgLine.v), lbl = avgLine.label;
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
    html: `<b>${esc(xfmt(x[i]))}</b>` + tipSeries(i).map((s) => { const z = s.bandColors && bands ? bands.find((b) => (b.lo == null || s.values[i] >= b.lo) && (b.hi == null || s.values[i] < b.hi)) : null; return `<div><span class="sw" style="background:${z ? z.color : s.color}"></span>${esc(s.name)} <b>${s.values[i] == null ? DASH : esc((s.fmt || fmt)(s.values[i]))}</b>${z ? ` · <b style="color:${z.color}">${esc(z.name)}</b>` : ""}</div>`; }).join(""),
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
function barChartW({ W = 760, x, bars, height = 170, fmt = (v) => num(v), xfmt = (l) => l, todayIndex = null, mode = "simple", yfmt = null, tipFn = null, refLine = null, maxV = null, band = null }) {
  const H = hScale(height, W), P = { l: 34, r: 6, t: 10, b: 26 };
  const n = x.length;
  const top = (b) => (mode === "stack" ? (b.parts || []).reduce((s, p) => s + (p.v || 0), 0) : mode === "range" ? b.hi ?? 0 : b.v ?? 0);
  const mn = mode === "range" ? Math.min(...bars.map((b) => b.lo ?? Infinity).filter(isFinite), refLine ?? Infinity) : 0;
  let mx = maxV ?? Math.max(1, ...bars.map(top), refLine ?? 0, ...(band ? band.hi.filter((v) => v != null) : []));
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
    // sloupce nejvýš 18 px široké a zaoblení podle šířky – 12 měsíčních sloupců pak nepůsobí hranatě proti 26 týdenním
    const w = Math.max(1, Math.min(18, bw - gap)), x0 = P.l + i * bw + (bw - w) / 2, r = Math.min(w / 2, Math.max(4, w * 0.3));
    if (mode === "stack") {
      let acc = 0;
      // složený sloupec zaoblený jako ostatní: díly se ořežou tvarem celého sloupce
      let parts = "";
      (b.parts || []).forEach((p) => { if (!p.v) return; const y1 = Y(acc + p.v), y0 = Y(acc); parts += `<rect x="${x0}" y="${y1}" width="${w}" height="${Math.max(0, y0 - y1)}" fill="${p.color}"/>`; acc += p.v; });
      if (parts) out += `<clipPath id="${id}c${i}"><rect x="${x0}" y="${Y(acc)}" width="${w}" height="${Math.max(0, Y(lo) - Y(acc))}" rx="${r}"/></clipPath><g clip-path="url(#${id}c${i})">${parts}</g>`;
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
  // pásmo normy (lo–hi po sloupcích) jako plocha za sloupci
  let bandSvg = "";
  if (band) {
    const pts = band.lo.map((v, i) => (v != null && band.hi[i] != null ? i : null)).filter((i) => i != null);
    if (pts.length > 1) {
      const cx = (i) => P.l + i * bw + bw / 2;
      bandSvg = `<path d="M${pts.map((i) => `${cx(i)},${Y(band.hi[i])}`).join("L")}L${pts.slice().reverse().map((i) => `${cx(i)},${Y(band.lo[i])}`).join("L")}Z" fill="color-mix(in srgb, ${band.color || "var(--acc)"} 22%, transparent)"/>`;
    }
  }
  const ref = refLine != null ? `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(refLine)}" y2="${Y(refLine)}" stroke="var(--muted)" stroke-dasharray="4 4"/>` : "";
  bindHover(id, W, (cx) => { const i = Math.floor((cx - P.l) / bw); return i >= 0 && i < n ? i : null; }, (i) => P.l + i * bw + bw / 2, (i) => ({ html: tipFn ? tipFn(i) : `<b>${esc(xfmt(x[i]))}</b><div>${esc(fmt(top(bars[i])))}${bars[i].dashed ? " (plán)" : ""}</div>` }));
  return `<svg class="chart" id="${id}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${g}${bandSvg}${out}${ref}<line class="cur band" y1="${P.t}" y2="${H - P.b}" style="stroke-width:${Math.max(1, bw - gap)}"/>${xl}</svg>`;
}

/** Sparkline (bez os) – volitelně s pásmem normy (průměr ± 1 SD). */
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
 * Normální rozsah den po dni: průměr ± 1 směrodatná odchylka z předchozích 30 dní (min. 10 hodnot).
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
  return `<defs><linearGradient id="${id}g" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${yTop}" y2="${base}"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="${id}m" maskUnits="userSpaceOnUse"><rect x="0" y="${yTop}" width="100000" height="${Math.max(0, base - yTop)}" fill="url(#${id}g)"/></mask></defs><g mask="url(#${id}m)">${paths}</g>`;
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
    g += `<rect x="${X(a)}" y="${P.t}" width="${Math.max(2, X(b) - X(a))}" height="${H - P.t - P.b}" fill="var(--acc)" opacity=".1"/><rect x="${X(a)}" y="${P.t - 3}" width="${Math.max(2, X(b) - X(a))}" height="3" rx="1.5" fill="var(--acc)"/>${X(b) - X(a) > 60 ? `${icSvg(SPORT_IC[x.sport] || "ostatni", (X(a) + X(b)) / 2 - 24, P.t - 11, 12)}<text class="xl" x="${(X(a) + X(b)) / 2 + 6}" y="${P.t - 7}" text-anchor="middle">${esc(SPORT_NAME[x.sport] || "")}</text>` : icSvg(SPORT_IC[x.sport] || "ostatni", (X(a) + X(b)) / 2, P.t - 11, 12)}`;
  }
  for (const e of d.bbEvents || []) {
    if (e.type !== "SLEEP" || !e.start) continue;
    const a = minOfDay(d, e.start), b = a + e.dur / 60000;
    if (b <= 0 || a >= 1440) continue;
    // popisek nad plochou grafu (dřív se kryl s čarou tepu)
    g += `<rect x="${X(a)}" y="${P.t}" width="${Math.max(0, X(b) - X(a))}" height="${H - P.t - P.b}" fill="var(--srem)" opacity=".09"/><rect x="${X(a)}" y="${P.t - 3}" width="${Math.max(0, X(b) - X(a))}" height="3" rx="1.5" fill="var(--srem)" opacity=".7"/>${icSvg("noc", (X(Math.max(0, a)) + X(Math.min(1440, b))) / 2 - 26, P.t - 11, 12)}<text class="xl" x="${(X(Math.max(0, a)) + X(Math.min(1440, b))) / 2 + 6}" y="${P.t - 7}" text-anchor="middle">spánek</text>`;
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
    out.push({ kind: "sleep", a: minOfDay(d, e.start), b: minOfDay(d, e.start) + e.dur / 60000, ico: ic("noc"), impact: e.impact });
  }
  for (const x of d.acts || []) {
    const a = +x.start_local.slice(11, 13) * 60 + +x.start_local.slice(14, 16);
    out.push({ kind: "act", a, b: a + (x.duration_s || x.moving_s || 0) / 60, ico: SPORT_ICON[x.sport] || ic("ostatni"), act: x });
  }
  return out.filter((s) => s.b > 0 && s.a < 1440);
}

/** Stres dne (Garmin dává jen souhrn) a „co nabilo / vybilo“. */
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
    if (s.kind === "sleep") return `<div class="en"><span class="en-i">${ic("noc")}</span><div><small>${clock(Math.max(0, s.a))}–${clock(s.b)}</small><b>Spánek</b><small>${hmm((s.b - s.a) * 60)} h</small></div><b class="en-v good">${s.impact != null ? `+${s.impact}` : ""}</b></div>`;
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
const stat = (label, value, unit, sub, tone = "", extra = "", href = "") => `<${href ? `a href="${href}"` : "div"} class="stat ${tone}"><div class="sl">${label}</div><div class="sv">${value}${unit ? `<small>${unit}</small>` : ""}</div>${sub ? `<div class="ss">${sub}</div>` : ""}${extra}</${href ? "a" : "div"}>`;

function zonesHtml(rows) {
  if (!rows) return "";
  const max = Math.max(1, ...rows.map((z) => z.pct));
  return `<div class="zones">${rows.map((z) => `<span class="zl" style="color:${z.color}">${z.z}</span><div class="zt"><div class="zb" style="width:${z.secs > 0 ? Math.max(1.5, (z.pct / max) * 100) : 0}%;background:${z.color}"></div></div><span class="r">${z.time}</span><span class="r m">${z.pctText}</span>`).join("")}</div>`;
}

// ---------- počasí ----------
/** Stejné pravidlo jako server (okno na jízdu): vhodné = srážky ≤ 30 %, nárazy ≤ 40 km/h, teplota vzduchu ≥ 3 °C. */
function hourKind(h) {
  if (h.kind) return [h.kind, h.why || ""];
  if (h.green) return ["ok", "vhodné"];
  if ((h.prob ?? 100) > 30) return ["rain", "déšť " + num(h.prob) + " %"];
  if ((h.gust ?? 99) > 40) return ["wind", "nárazy " + num(h.gust) + " km/h"];
  if ((h.temp ?? -99) < 3) return ["cold", num(h.temp) + " °C"];
  return ["ok", "vhodné"];
}
function weatherIcon(w) {
  if (!w) return "·";
  if (w.code != null) return wIcon(w.code, w.rainProb);
  if (w.rain) return wIcon(63, 80);
  if (w.rainProb >= 30) return wIcon(80, w.rainProb);
  return wIcon(2, 0);
}
function weatherList(days, temps = null) {
  const rows = days.map(({ label, w }) => {
    if (!w) return `<div class="wrow"><b class="wd">${esc(label)}</b><span class="sub">bez předpovědi</span></div>`;
    const kinds = w.hours.map(hourKind);
    const counts = kinds.reduce((m, [k]) => ((m[k] = (m[k] || 0) + 1), m), {});
    const main = Object.entries(counts).filter(([k]) => k !== "ok" && k !== "cool").sort((a, b) => b[1] - a[1])[0];
    const verdict = w.window ? `<span class="pill ok">jízda ${String(w.window.from).padStart(2, "0")}–${String(w.window.to).padStart(2, "0")} h</span>` : `<span class="pill bad">venku ne: ${main ? { rain: "déšť", wind: "vítr", cold: "zima", hot: "vedro", cool: "chladno", dark: "tma" }[main[0]] : "počasí"}</span>`;
    const inWin = (h) => w.window && h.h >= w.window.from && h.h < w.window.to;
    const cells = w.hours.map((h, i) => `<i class="h ${kinds[i][0]}${inWin(h) ? " win" : ""}" data-t='${esc(JSON.stringify({ h: h.h, t: h.temp, f: h.feels, p: h.prob, mm: h.precip, g: h.gust, k: kinds[i][1] }))}'>${h.h % 3 === 1 ? `<em>${num(h.temp)}°</em>` : ""}</i>`).join("");
    return `<div class="wrow"><b class="wd">${esc(label)}</b><span class="wi">${weatherIcon(w)}</span><span class="wt"><b>${num(w.tmax)}°</b> / ${num(w.tmin)}°</span><span class="wm sub">${ic("voda")} ${num(w.rainProb)} % · ${ic("vitr")} ${num(w.gustMax)} km/h</span>${verdict}<div class="hstrip">${cells}</div></div>`;
  }).join("");
  const t = temps || { cold: 3, hot: 30, ideal: 18 };
  return `<div class="wlist">${rows}</div><details class="info wleg"><summary>ⓘ Vysvětlivky</summary><div class="legend"><span><i class="lg ok"></i>vhodné</span><span><i class="lg ok win"></i>doporučené okno (nejblíž ${t.ideal} °C)</span><span><i class="lg cool"></i>chladné ráno / večer v teplém dni</span><span><i class="lg cold"></i>zima (pocitově &lt; ${t.cold} °C)</span><span><i class="lg hot"></i>vedro (nad ${t.hot} °C)</span><span><i class="lg rain"></i>srážky &gt; 30 %</span><span><i class="lg wind"></i>vítr &gt; 40 km/h</span><span><i class="lg dark"></i>tma (do 30 min po západu slunce)</span><span class="sub">hodiny 7–20 (v létě od rozednění), číslo = teplota · hranice v Nastavení</span></div></details>`;
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
  const head = `<div class="shead"><div><div class="sv">${dur(s.durationS).replace(/ (h|min)/g, "<small> $1</small>")}</div><div class="sub">${s.start && s.end ? `${s.start}–${s.end}` : ""}${s.needMin ? ` · potřeba ${dur(s.needMin * 60)}` : ""}</div>${s.nextNeedMin ? `<div class="sub"><b>Potřeba na dnešní noc: ${dur(s.nextNeedMin * 60)}</b> (cíl + spánkový dluh)</div>` : ""}</div>${s.score != null ? `<div class="score ${s.scoreTone}">${s.score}<small>skóre${s.garminScore != null ? ` · Garmin ${s.garminScore}` : ""}</small></div>` : ""}</div>`;
  // 4 dlaždice: tep, VST, dech, stres
  const vit = [
    [(ic("tep") + " Tep"), s.hr != null ? `${num(s.hr)} bpm` : DASH, s.hrNorm ? `tvoje norma ${s.hrNorm}` : "", "tep"],
    [(ic("vst") + " VST"), s.hrv != null ? `${num(s.hrv)} ms` : DASH, "přes noc", "vst"],
    [(ic("dech") + " Dech"), s.resp != null ? `${num(s.resp)} /min` : DASH, s.respLo ? `rozsah ${num(s.respLo)}–${num(s.respHi)}` : "", "dech"],
    [(ic("stres") + " Stres"), s.stress != null ? num(s.stress) : DASH, "ve spánku", "stres"],
  ];
  const vitals = `<div class="svit">${vit.map(([k, v, x, h]) => `<a href="#/detail/${h}"><span>${k}</span><b>${v}</b>${x ? `<small>${x}</small>` : ""}</a>`).join("")}</div>`;
  const pts = compact ? "" : `<ul class="points">${s.points.map((p) => `<li class="${p.tone}">${esc(p.text)}</li>`).join("")}</ul>`;
  return `${head}${bar}${leg}${vitals}<p class="verdict-line">${esc(s.verdict)}</p>${pts}`;
}

/** Přepínač dne ‹ datum › (max. 7 dní zpět). onGo(datum | null = dnes). */
function dateNav(cur, min, today, id, compact = false) {
  const prev = cur > min ? addDay(cur, -1) : null, next = cur < today ? addDay(cur, 1) : null;
  if (compact) return `<div class="dnav cdnav" id="${id}"><button class="btn sm" ${prev ? `data-go="${prev}"` : "disabled"} aria-label="předchozí den">‹</button><label class="dpick" title="vybrat den v kalendáři"><b>${cur === today ? "Dnes" : cur === addDay(today, -1) ? "Včera" : dayDm(cur)}</b><input type="date" data-pick min="${min}" max="${today}" value="${cur}"></label><button class="btn sm" ${next ? `data-go="${next}"` : "disabled"} aria-label="další den">›</button></div>`;
  return `<div class="dnav" id="${id}"><button class="btn sm" ${prev ? `data-go="${prev}"` : "disabled"} aria-label="předchozí den">‹</button><label class="dpick" title="vybrat den v kalendáři"><b>${cur === today ? "Dnes" : cur === addDay(today, -1) ? "Včera" : ""} ${dayDm(cur)}${cur.slice(0, 4) !== today.slice(0, 4) ? cur.slice(0, 4) : ""} ${ic("kalendar")}</b><input type="date" data-pick min="${min}" max="${today}" value="${cur}"></label><button class="btn sm" ${next ? `data-go="${next}"` : "disabled"} aria-label="další den">›</button>${cur !== today ? `<button class="btn sm" data-go="${today}">Dnes</button>` : ""}</div>`;
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

// ---------- stav a počasí ----------
const STATUS = { active: [ic("aktivni"), "Aktivní", "ok"], sick: [ic("nemocny"), "Nemocný", "bad"], injured: [ic("zraneny"), "Zraněný", "warn"], vacation: [ic("dovolena"), "Dovolená", "info"] };
const untilText = (st) => (st.kind === "active" ? "Do změny" : st.until ? `do ${dayDm(st.until)}` : "Do odvolání");
function statusPill(st) {
  const [ico, label, tone] = STATUS[st.kind] || STATUS.active;
  return `<button class="pillbig st-${tone}" id="statusBtn" aria-label="stav ${label}${st.kind === "active" ? "" : ` ${untilText(st)}`} – změnit" title="${label}${st.kind === "active" ? "" : ` · ${untilText(st)}`}"><span class="pb-ico">${ico}</span><span class="pb-t"><b>Stav</b></span></button>`;
}
/** WMO kód počasí → ikona */
/** WMO kód (Open-Meteo) → ikona; night = po setmění jasno jako měsíc */
const WX_ICON = (code, prob, night) => {
  const dn = night ? "night" : "day";
  if (code == null) return prob >= 50 ? "rain" : `partly-cloudy-${dn}`;
  if (code === 0) return `clear-${dn}`;
  if (code <= 2) return `partly-cloudy-${dn}`;
  if (code === 3) return `overcast-${dn}`;
  if (code <= 48) return `fog-${dn}`;
  if (code <= 55) return "drizzle";
  if (code <= 57) return "sleet";
  if (code <= 65) return "rain";
  if (code <= 67) return "sleet";
  if (code <= 77) return "snow";
  if (code <= 82) return `partly-cloudy-${dn}-rain`;
  if (code <= 86) return `partly-cloudy-${dn}-snow`;
  return code === 95 ? `thunderstorms-${dn}-rain` : "thunderstorms-rain";
};
const WX_WORD = (code) => (code == null ? "" : code === 0 ? "jasno" : code <= 2 ? "polojasno" : code === 3 ? "zataženo" : code <= 48 ? "mlha" : code <= 57 ? "mrholení" : code <= 67 ? "déšť" : code <= 77 ? "sněžení" : code <= 82 ? "přeháňky" : code <= 86 ? "sněhové přeháňky" : "bouřka");
/** WMO kód (Open-Meteo) → ikona (obrázek); night = noc podle východu / západu slunce */
const wIcon = (code, prob, night = false) => `<img class="wxi" src="wx/${WX_ICON(code, prob, night)}.svg" alt="${WX_WORD(code)}" title="${WX_WORD(code)}">`;
function weatherPill(w) {
  if (!w) return `<div class="pillbig"><span class="pb-ico">·</span><span class="pb-t"><b>${DASH}</b><small>počasí nemám</small></span></div>`;
  return `<a class="pillbig" href="#/pocasi" title="Počasí po hodinách a mapa"><span class="pb-ico">${wIcon(w.code, w.prob, new Date().getHours() >= 17 || new Date().getHours() < 7)}</span><span class="pb-t"><b>${num(w.temp)}°</b><small>${w.feels != null ? `pocit ${num(w.feels)}°` : esc(w.place || "")}</small></span></a>`;
}
/** počasí minulého dne: ikona, max / min, srážky */
function weatherDayPill(w) {
  return `<div class="pillbig"><span class="pb-ico">${wIcon(w.code, (w.precip || 0) >= 1 ? 60 : 0)}</span><span class="pb-t"><b>${num(w.tmax)}°<small> / ${num(w.tmin)}°</small></b><small>${(w.precip || 0) >= 0.2 ? `${num(w.precip, 1)} mm` : "sucho"}</small></span></div>`;
}
function openStatusModal(cur, onDone) {
  const ov = document.createElement("div");
  ov.className = "modal stmodal";
  let kind = cur.kind;
  const durs = [["", "Do odvolání"], ["0", "Jen dnes"], ["2", "3 dny"], ["6", "Týden"], ["13", "2 týdny"], ["date", "Do data…"]];
  const today = localToday();
  const render = () => {
    ov.innerHTML = `<div class="modal-in"><div class="ch"><h2>Stav</h2><button class="btn sm" data-x>✕</button></div>
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


/**
 * Tep během dne po 2 min (Garmin). Osa Y dynamicky od nejnižšího po nejvyšší tep dne (ne pevně 40–200),
 * takže je vidět i klidný den bez aktivity. Barva čáry podle zón tepu, pásy spánku a aktivit, bublina s časem.
 */
function hrDayHtml(d, isToday) {
  const hrp = (d.hr || []).filter((q) => q[1] != null && q[1] > 0).map(([t, v]) => ({ m: minOfDay(d, t), v })).filter((q) => q.m >= 0 && q.m <= 1440);
  if (hrp.length < 5) return `<div class="empty">Tep za tento den zatím nemám – Garmin ho pošle po synchronizaci hodinek.</div>`;
  const vals = hrp.map((q) => q.v), lo = Math.min(...vals), hi = Math.max(...vals);
  const awake = hrp.filter((q) => !daySpans(d).some((s) => s.kind === "sleep" && q.m >= s.a && q.m <= s.b)).map((q) => q.v);
  const avgAw = awake.length ? Math.round(awake.reduce((a, b) => a + b, 0) / awake.length) : null;
  const k = [["Klidový", d.hrRest], ["Nejnižší", lo], ["Průměr přes den", avgAw], ["Nejvyšší", hi]];
  return sized((W) => hrDayChartW(d, hrp, isToday, W)) + `<div class="hd-k">${k.map(([l, v]) => `<div><span>${l}</span><b>${v != null ? `${num(v)} <small>bpm</small>` : DASH}</b></div>`).join("")}</div>`;
}
function hrDayChartW(d, hrp, isToday, W) {
  const H1 = 190, AX = 20, P = { l: 4, r: 30, t: 18 }, H = P.t + H1 + AX;
  const vals = hrp.map((q) => q.v);
  const lo = Math.max(25, Math.min(...vals, d.hrRest ?? 999) - 3), hi = Math.max(...vals) + 3;
  const X = (m) => P.l + (clamp(m, 0, 1440) / 1440) * (W - P.l - P.r);
  const Y = (v) => P.t + (1 - (v - lo) / (hi - lo || 1)) * H1;
  const id = uid("hd");
  let g = "";
  // vodorovné čáry: klidový tep, ~polovina rozsahu, maximum dne (popisky vpravo mimo graf)
  const ticks = [...new Set([d.hrRest ?? lo + 3, Math.round((lo + hi) / 2), hi - 3].map((v) => Math.round(v)))];
  for (const v of ticks) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" class="gl" stroke-dasharray="2 4"/><text class="yl" x="${W - P.r + 4}" y="${Y(v) + 4}">${v}</text>`;
  for (const sp of daySpans(d)) {
    const c = sp.kind === "sleep" ? "var(--srem)" : "var(--acc)";
    g += `<rect x="${X(sp.a)}" y="${P.t}" width="${Math.max(2, X(sp.b) - X(sp.a))}" height="${H1}" fill="${c}" opacity=".07" rx="4"/><rect x="${X(sp.a)}" y="${P.t - 8}" width="${Math.max(3, X(sp.b) - X(sp.a))}" height="3" rx="1.5" fill="${c}" opacity=".8"/>`;
  }
  // čára po 2 min; mezera > 20 min (hodinky sundané) = přerušení
  const segs = [];
  hrp.forEach((q, i) => { if (i === 0 || q.m - hrp[i - 1].m > 20) segs.push([]); segs[segs.length - 1].push({ x: X(q.m), y: Y(q.v) }); });
  const floors = d.hrFloors ? d.hrFloors.slice(1) : [135, 165, 184, 202];
  const off = (v) => clamp((Y(v) - P.t) / H1, 0, 1);
  let zs = "";
  for (let z = 4; z >= 0; z--) { const top = z === 4 ? hi + 50 : floors[z] - 0.01, bot = z === 0 ? lo - 50 : floors[z - 1]; zs += `<stop offset="${off(top).toFixed(4)}" style="stop-color:${HR_ZC[z]}"/><stop offset="${off(bot).toFixed(4)}" style="stop-color:${HR_ZC[z]}"/>`; }
  g += `<defs><linearGradient id="${id}h" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${P.t}" y2="${P.t + H1}">${zs}</linearGradient></defs>
    <path d="${segs.filter((sg) => sg.length > 1).map((sg) => curvePath(sg)).join("")}" fill="none" stroke="url(#${id}h)" stroke-width="1.8" stroke-linejoin="round"/>`;
  for (let h = 0; h <= 24; h += 6) g += `<text class="xl" x="${X(h * 60)}" y="${H - 5}" text-anchor="${h === 0 ? "start" : h === 24 ? "end" : "middle"}">${h === 24 ? "24" : `${h}:00`}</text>`;
  const nowM = isToday ? minOfDay(d, Date.now()) : null;
  if (nowM != null && nowM < 1440) g += `<line x1="${X(nowM)}" x2="${X(nowM)}" y1="${P.t}" y2="${P.t + H1}" stroke="var(--muted)" stroke-dasharray="2 4" opacity=".6"/>`;
  bindHover(id, W, (cx) => { let best = 0, bd = Infinity; hrp.forEach((q, i) => { const dd = Math.abs(X(q.m) - cx); if (dd < bd) { bd = dd; best = i; } }); return best; }, (i) => X(hrp[i].m), (i) => {
    const q = hrp[i], z = hrZoneIdx(q.v, floors);
    return { html: `<b>${clock(Math.max(0, Math.round(q.m)))}</b><div><span class="sw" style="background:${HR_ZC[z]}"></span>tep <b>${q.v} bpm</b> · Z${z + 1}</div>`, dots: [{ y: Y(q.v), c: HR_ZC[z] }] };
  });
  return `<svg class="chart" id="${id}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${g}<line class="cur" y1="${P.t}" y2="${P.t + H1}"/><g class="dots"></g></svg>`;
}

/** Zotavení 0–100 % jako zelený kroužek (karta Dnes). */
/** barevné rodiny kroužků: od světlého tónu na začátku po sytý na 100 % */
const RING_COL = { rec: ["#b9e33f", "#0f9138"], energy: ["#ffc93d", "#ec5f08"], sleep: ["#86adff", "#4a2fd6"] };
const mixHex = (a, b, t) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) + (parseInt(b.slice(i, i + 2), 16) - parseInt(a.slice(i, i + 2), 16)) * t).toString(16).padStart(2, "0")).join("");
/**
 * Kroužek s přechodem podél oblouku: barva v každém místě odpovídá poloze na CELÉM kruhu, takže nízká hodnota
 * končí světlým tónem a vysoká sytým (čím lepší, tím sytější). Číslo přesně uprostřed, popisek pod kroužkem (mimo SVG).
 */
// kroužky na Přehledu (Nastavení → Vzhled): pct = „%“ u čísla
const ringPref = () => { try { return { pct: localStorage.getItem("ringPct") === "1" }; } catch { return { pct: false }; } };
// dřív volitelné motivy a styly kroužků – staré volby z prohlížeče pryč
try { localStorage.removeItem("skin"); localStorage.removeItem("ringStyle"); } catch {}
function gradRing(v, kind, { size = 112, stroke = 10, label = "", home = false } = {}) {
  const [c0, c1] = RING_COL[kind] || RING_COL.rec;
  const R = 50 - stroke / 2 - 1, C = 2 * Math.PI * R, val = v == null ? 0 : clamp(v, 0, 100);
  const len = (C * val) / 100, n = Math.max(1, Math.ceil(len / 2.5));
  let segs = "";
  for (let i = 0; i < n; i++) {
    const a = (len * i) / n, l = len / n + (i < n - 1 ? 0.6 : 0);
    segs += `<circle cx="50" cy="50" r="${R.toFixed(2)}" fill="none" stroke="${mixHex(c0, c1, (a + l / 2) / C)}" stroke-width="${stroke}" stroke-dasharray="${l.toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-a).toFixed(2)}" transform="rotate(-90 50 50)"/>`;
  }
  // zaoblené konce oblouku
  const cap = (frac, col) => { const ang = frac * 2 * Math.PI - Math.PI / 2; return `<circle cx="${(50 + R * Math.cos(ang)).toFixed(2)}" cy="${(50 + R * Math.sin(ang)).toFixed(2)}" r="${stroke / 2}" fill="${col}"/>`; };
  const caps = val > 0 ? cap(0, c0) + cap(val / 100, mixHex(c0, c1, val / 100)) : "";
  // „%“ hned za číslem na stejném účaří (poloviční velikost), celé „71 %“ uprostřed kroužku
  const pct = home && v != null && ringPref().pct;
  const txt = pct
    ? `<text x="50" y="61" text-anchor="middle"><tspan class="gr-v">${Math.round(v)}</tspan><tspan class="gr-p" dx="0.6">%</tspan></text>`
    : `<text x="50" y="51" text-anchor="middle" dominant-baseline="central" class="gr-v">${v == null ? DASH : Math.round(v)}</text>`;
  return `<span class="gring" style="--rs:${size}px;--gc:${c1};--gc2:${mixHex(c0, c1, 0.45)}"><svg viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${esc(label)} ${v ?? "–"} %">
    <circle class="gr-track" cx="50" cy="50" r="${R.toFixed(2)}" fill="none" stroke="var(--card2)" stroke-width="${stroke}"/>${segs}${caps}
    ${txt}</svg>${label ? `<b>${esc(label)}</b>` : ""}</span>`;
}
/** Zotavení 0–100 % (karta Dnes). */
function recRing(v, size = 132, home = false) { return gradRing(v, "rec", { size, stroke: 9, label: "Zotavení", home }); }
/**
 * Kroužek spánku: oblouk dlouhý podle skóre (47 = 47 % kruhu), rozdělený barvami fází v poměru jejich délky
 * (hluboký → REM → lehký, od vrcholu doprava). Zbytek kruhu šedý.
 */
function sleepRing(sp, size = 112) {
  const r = 50, c = 2 * Math.PI * r, score = sp?.score == null ? 0 : clamp(sp.score, 0, 100);
  const arcLen = (c * score) / 100;
  const st = (sp?.stages || []).filter((x) => x.key !== "awake" && x.secs > 0);
  const tot = st.reduce((a, x) => a + x.secs, 0) || 1;
  // zaoblený jen začátek a konec celého oblouku (jako tři kroužky nahoře); mezi fázemi rovné konce s mezerou
  const gap = st.length > 1 && arcLen > 20 ? 2 : 0, W = 12;
  const inset = arcLen > W ? W / 2 : 0;
  const usable = Math.max(0, arcLen - 2 * inset - gap * (st.length - 1));
  const at = (p) => { const ang = p / r - Math.PI / 2; return [(60 + r * Math.cos(ang)).toFixed(2), (60 + r * Math.sin(ang)).toFixed(2)]; };
  const capC = (p, col) => { const [x, y] = at(p); return `<circle cx="${x}" cy="${y}" r="${W / 2}" fill="${col}"/>`; };
  let off = inset, segs = "";
  for (const x of st) {
    const len = Math.max(0.8, (usable * x.secs) / tot);
    segs += `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${STAGE_COLOR[x.key]}" stroke-width="${W}" stroke-dasharray="${len.toFixed(2)} ${c.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 60 60)"/>`;
    off += len + gap;
  }
  if (st.length && inset) segs += capC(inset, STAGE_COLOR[st[0].key]) + capC(off - gap, STAGE_COLOR[st[st.length - 1].key]);
  if (!st.length && score > 0) segs = `<circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--srem)" stroke-width="${W}" stroke-linecap="round" stroke-dasharray="${Math.max(0.01, arcLen - W)} ${c}" stroke-dashoffset="${-W / 2}" transform="rotate(-90 60 60)"/>`;
  return `<svg class="slring" viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="Skóre spánku ${sp?.score ?? "–"}">
    <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--card2)" stroke-width="12"/>${segs}
    <text x="60" y="${sp?.garminScore != null ? 57 : 61}" text-anchor="middle" dominant-baseline="central" class="sr-v">${sp?.score == null ? DASH : Math.round(sp.score)}</text>
    ${sp?.garminScore != null ? `<text x="60" y="82" text-anchor="middle" class="rr-l">Garmin ${Math.round(sp.garminScore)}</text>` : ""}</svg>`;
}
/** Baterie energie: plná výplň = teď, světlá = maximum dne (co se od něj vybilo), číslo uprostřed. */
/** Spánková bilance: součet „spánek − cíl“ za 7 nocí; sloupečky = jednotlivé noci (nahoru nad cíl, dolů pod cíl) */
function sleepBalTile(sb) {
  if (!sb) return metricTile({ label: (ic("spanek") + " Spánková bilance"), value: DASH, href: "#/detail/spanek", foot: "7 nocí proti cíli" });
  const m = sb.min, h = `${m < 0 ? "−" : "+"}${hmm(Math.abs(m) * 60)}`;
  const tone = m >= -60 ? "good" : m >= -240 ? "warn" : "bad";
  const word = m >= 60 ? "rezerva" : m >= -60 ? "vyrovnaná" : m >= -240 ? "mírný dluh" : "dluh";
  const mx = Math.max(60, ...sb.nights.map((n) => Math.abs(n.d ?? 0)));
  const bars = sb.nights.map((n) => n.d == null ? `<span></span>` : `<span><i class="${n.d >= 0 ? "up" : "dn"}" style="height:${Math.max(3, (Math.abs(n.d) / mx) * 50)}%"></i></span>`).join("");
  return metricTile({ label: (ic("spanek") + " Spánková bilance"), value: h, unit: "h", state: word, tone, spark: `<div class="sbal">${bars}</div>`, href: "#/detail/spanek", foot: `7 nocí · proti tvým obvyklým ${hmm(sb.baseMin * 60)} h` });
}
/** Dlaždice metriky: popisek, hodnota, stav proti normě, sparkline 30 dní. */
function metricTile({ label, value, unit = "", state = "", tone = "", spark: sp = "", href = "", foot = "" }) {
  return `<${href ? `a href="${href}"` : "div"} class="mtile ${tone}"><div class="mt-h"><span>${label}</span>${state ? `<em>${state}</em>` : ""}</div><div class="mt-v">${value}${unit ? `<small>${unit}</small>` : ""}</div><div class="mt-vis">${sp}</div>${foot ? `<div class="mt-f">${foot}</div>` : ""}</${href ? "a" : "div"}>`;
}
/** z-skóre proti normě; n.q = krok zaokrouhlení zdroje (dech z Garminu po 1) → odchylku zmenší o půl kroku */
const qz = (v, n) => { const d = v - n.mean; return (n.q ? Math.sign(d) * Math.max(0, Math.abs(d) - n.q / 2) : d) / n.sd; };
/** barva hodnoty proti normě: v normě (±1 SD) zelená, mírně mimo (do 2 SD) oranžová, víc červená; „lepší“ směr je zelený */
function stateColor(v, n, lowGood = false) {
  if (v == null || !n || !n.sd) return "var(--ok)";
  const z = qz(v, n);
  const bad = lowGood ? z : -z; // kladné = horší směr
  return bad <= 1 ? "var(--ok)" : bad <= 2 ? "var(--warn)" : "var(--bad)";
}
const normState = (v, n, lowGood = false) => {
  if (v == null || !n || !n.sd) return ["", ""];
  const z = qz(v, n), a = Math.abs(z), up = v > n.mean;
  if (a <= 1) return ["v normě", "good"];
  const better = up === !lowGood; // směr, který je dobrý
  const dir = up ? "nad normou ↑" : "pod normou ↓";
  if (better) return [dir, "good"];
  return a <= 2 ? [`mírně ${up ? "nad" : "pod"} normou`, "warn"] : [`výrazně ${up ? "nad ↑" : "pod ↓"}`, "bad"];
};

// ---------- stránky ----------
const TI = {
  temp: `<svg viewBox="0 0 24 24" fill="none" stroke="var(--acc)" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z"/></svg>`,
  rain: `<svg viewBox="0 0 24 24" fill="none" stroke="var(--z2)" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/></svg>`,
  wind: `<svg viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"/></svg>`,
};
/** Zítřek ve dvou řádcích: trénink a délka, pod tím počasí s ikonami (místo jedné dlouhé věty). */
function tomorrowHtml(t) {
  const x = t.tomorrowInfo;
  if (!x) return t.tomorrow ? `<div class="sub">Zítra: ${esc(t.tomorrow)}</div>` : "";
  const what = x.name ? `<b>${esc(x.name)}</b>${x.minutes ? ` · ${dur(x.minutes * 60)}` : ""}` : `<b>${esc(x.tag || "volno")}</b>`;
  const w = [];
  if (x.tmax != null) w.push(`<span>${TI.temp}${num(x.tmax)} / ${num(x.tmin)} °C</span>`);
  if (x.rainProb != null) w.push(`<span>${TI.rain}${x.rainProb <= 20 ? "sucho" : `déšť ${num(x.rainProb)} %`}</span>`);
  if (x.gust != null) w.push(`<span>${TI.wind}${num(x.gust)} km/h</span>`);
  return `<div class="tmw"><span class="sub">Zítra:</span> ${what}</div>${w.length ? `<div class="tmw-w">${w.join("")}</div>` : ""}`;
}
/** „před 14 min“ / „před 2 h“ (oranžově, když data z hodinek nepřišla přes 2 h) */
const syncAgo = (t) => { const m = Math.max(0, Math.round((Date.now() - t) / 60000)); const txt = m < 60 ? `před ${m} min` : m < 48 * 60 ? `před ${Math.round(m / 60)} h` : `před ${Math.round(m / 1440)} dny`; return m > 120 ? `<span class="warn">${txt}</span>` : txt; };
let viewDate = null; // vybraný den na Přehledu a v Zotavení (null = dnes)
/** Nadcházející trénink na Přehledu: dnešní, nebo nejbližší další (průběh jako v Trenérovi). */
function nextWorkoutCard(n, today) {
  if (!n) return "";
  const tomorrow = new Date(new Date(today + "T12:00").getTime() + 864e5).toISOString().slice(0, 10);
  const when = n.date === today ? "Dnešní trénink" : n.date === tomorrow ? "Zítřejší trénink" : `Trénink · ${dayDm(n.date)}`;
  const kind = [SPORT_NAME[n.sport === "ride" ? "ride" : n.sport]?.toLowerCase().replace("silniční kolo", "kolo"), n.indoor ? "trenažér" : ""].filter(Boolean).join(" · ");
  const sub = [n.minutes ? dur(n.minutes * 60) : "", n.load ? `zátěž ${num(n.load)}` : "", n.targetText ? esc(n.targetText) : ""].filter(Boolean).join(" · ");
  return `<section class="card c12 nxw"><header class="nxw-h"><span class="nxw-l">${when}</span><span class="nxw-k">${tSportIco(n.sport)} ${esc(kind)}</span></header>
    <h3 class="nxw-t">${esc(n.name)}</h3>${sub ? `<div class="sub">${sub}</div>` : ""}
    ${n.workout ? workoutSvg(n.workout, n.ftp) : ""}
    <div class="btns"><a class="btn pri" href="#/trener" data-tfocus="${n.date}" data-tmode="peek">Otevřít trénink</a><a class="btn link" href="#/trener" data-tfocus="${n.date}" data-tmode="edit">Upravit</a></div></section>`;
}
/** den, na který se má Trenér po příchodu z Přehledu posunout (a případně otevřít úpravu) */
let tFocus = null;
document.addEventListener("click", (e) => { const a = e.target.closest?.("[data-tfocus]"); if (!a) return; tFocus = { date: a.dataset.tfocus, mode: a.dataset.tmode }; tOpen = a.dataset.tmode === "edit" ? a.dataset.tfocus : null; });
function applyTFocus(el) {
  const f = tFocus; tFocus = null;
  const row = f && el.querySelector(`.tday[data-day="${f.date}"]`);
  if (!row) return;
  if (f.mode === "peek" && !row.classList.contains("open")) row.classList.add("peek");
  row.scrollIntoView({ block: "center" });
}
/** Trasa aktivity jako svítící čára v podkladu karty (bez mapy): ~160 bodů, šířka zkrácená podle zeměpisné šířky. */
function routeGlowSvg(route) {
  const pts = (route || []).filter((p) => p && isFinite(p[0]) && isFinite(p[1]));
  if (pts.length < 10) return "";
  const step = Math.max(1, Math.floor(pts.length / 160));
  const sp = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
  const lats = sp.map((p) => p[0]), lons = sp.map((p) => p[1]);
  const la0 = Math.min(...lats), la1 = Math.max(...lats), lo0 = Math.min(...lons), lo1 = Math.max(...lons);
  const k = Math.cos((((la0 + la1) / 2) * Math.PI) / 180);
  const w = Math.max(1e-6, (lo1 - lo0) * k), h = Math.max(1e-6, la1 - la0);
  const S = 100 / Math.max(w, h), W = w * S, H = h * S;
  const d = sp.map((p, i) => `${i ? "L" : "M"}${((p[1] - lo0) * k * S).toFixed(1)} ${((la1 - p[0]) * S).toFixed(1)}`).join("");
  return `<svg viewBox="-6 -6 ${(W + 12).toFixed(1)} ${(H + 12).toFixed(1)}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><path class="rg-glow" d="${d}"/><path class="rg-line" d="${d}"/></svg>`;
}
async function routeGlow(box, id) {
  if (!box) return;
  // aktivita bez trasy (průběh chybí) se nezkouší znovu při každém otevření Přehledu
  try { if (localStorage.getItem("noRoute") === id) return; } catch {}
  const none = () => { try { localStorage.setItem("noRoute", id); } catch {} };
  try { const s = await api(`activity/${id}/streams`); const svg = routeGlowSvg(s.route); if (svg) { box.innerHTML = svg; box.classList.add("on"); } else none(); } catch { none(); }
}
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
  const pastActs = (d.acts || []).filter((x) => (x.moving_s ?? 0) >= 10 * 60);
  const todayLine = !d.isToday
    ? (pastActs.length ? pastActs.map((x) => `<a class="today-act" href="#/aktivita/${x.id}"><span class="ico">${SPORT_ICON[x.sport] || ic("ostatni")}</span><div><b>${esc(x.name || SPORT_NAME[x.sport] || "aktivita")}</b><div class="sub">${dur(x.moving_s || 0)}${x.km ? ` · ${num(x.km, 1)} km` : ""}${x.load != null ? ` · zátěž ${num(x.load)}` : ""}</div></div><span class="go">→</span></a>`).join("") : `<div class="today-act"><span class="ico">${ic("volno")}</span><div><b>Volno</b></div></div>`)
    : t.done && t.done.length
    ? t.done.map((x) => `<a class="today-act" href="#/aktivita/${x.id}"><span class="ico">${ic("odjeto")}</span><div><b>Dnes odtrénováno</b><div class="sub">${esc(x.name)}${x.load != null ? ` · zátěž ${num(x.load)}` : ""}</div></div><span class="go">→</span></a>`).join("")
    : t.name && !paused
      ? `<a class="today-act" href="#/trener"><span class="ico">${tSportIco(t.sport)}</span><div><b>${esc(t.name)}</b><div class="sub">${dur((t.durationMin || 0) * 60)}${t.targetText ? " · " + esc(t.targetText) : ""}</div></div><span class="go">→</span></a>`
      : `<div class="today-act"><span class="ico">${ic("volno")}</span><div><b>${paused ? "Plán stojí" : "Dnes volno"}</b>${tomorrowHtml(t)}</div></div>`;
  const dnes = true
    ? card(`c8 dnes ${tone}`, "", "", `<div class="dn-wrap">${r.score != null ? `<div class="dn-rings"><a class="dn-side" href="#/detail/bb">${gradRing(d.bb.latest ?? d.bb.min, "energy", { size: 84, stroke: 9, label: "Energie", home: true })}</a><a class="dn-ring" href="#/zotaveni">${recRing(r.score, 132, true)}</a><a class="dn-side" href="#/detail/spanek">${gradRing(d.sleep?.score ?? null, "sleep", { size: 84, stroke: 9, label: "Spánek", home: true })}</a></div>` : ""}<div class="dn-body">${paused ? `<div class="dn-top"><span class="badge">${(STATUS[d.status.kind]?.[0] || "") + " " + esc(d.status.label)}</span></div>` : ""}
      <div class="dn-head"><h2 class="dn-title"><span class="dn-dot ${paused ? "" : tone}" aria-hidden="true"></span>${esc(co.title)}</h2></div>${d.isToday ? `<div class="ainote" data-ainote="prehled"></div>` : ""}${d.isToday ? "" : `<p class="dn-text">${esc(co.text)}</p>`}
      <div class="dn-grid"><div><div class="sl">${d.isToday ? "Trénink" : "Odtrénováno"}</div>${todayLine}${d.isToday && t.name && !t.done?.length && !paused ? `<p class="note">Zítra: ${esc(t.tomorrow)}</p>` : ""}</div><div>${co.needs.length ? `<div class="sl">Co tělo potřebuje</div><ul class="needs">${co.needs.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}</div></div></div></div>`)
    : ""; // zpětný den: bez horní karty, aktivita je dole

  // 2) Spánek (Garmin): skóre, délka, fáze, potřeba
  const sp = d.sleep;
  const spTone = sp ? sp.scoreTone : "";
  const sleepCard = card("c4 sleepmini", `<a href="#/detail/spanek">${ic("spanek")} Spánek →</a>`, "výpočet", sp ? `<a class="sm-wrap" href="#/detail/spanek">${sleepRing(sp, 112)}<div class="sm-r"><div class="mt-v">${dur(sp.durationS).replace(/ (h|min)/g, "<small> $1</small>")}</div><div class="sub">${sp.start && sp.end ? `${sp.start}–${sp.end}` : ""}${sp.needMin ? ` · potřeba ${dur(sp.needMin * 60)}` : ""}</div><span class="chipt ${spTone}">${esc(sp.verdict.replace(/^Skóre \d+ – /, ""))}</span></div></a>
    <div class="sm-st">${sp.stages.map((x) => `<span><i style="background:${STAGE_COLOR[x.key]}"></i>${esc(x.label)} <b>${dur(x.secs)}</b></span>`).join("")}</div>
    ${sp.nextNeedMin ? `<p class="note">${d.isToday ? "Na dnešní noc potřebuješ" : "Na další noc byla potřeba"} ${dur(sp.nextNeedMin * 60)}.</p>` : ""}` : `<div class="empty">Spánek pro tento den nemám.</div>`);

  // 3) Dlaždice
  const hv = d.hrv, rh = d.rhr, st = d.stress, stp = d.steps, bb = d.bb;
  const [hvS, hvT] = normState(hv.today, hv.norm), [rhS, rhT] = normState(rh.today, rh.norm, true), [stS, stT] = normState(st.avg, st.norm, true);
  // energie (náhrada Body Battery): plná výplň = teď, světlá = maximum dne
  const bbN = bb.latest ?? bb.min, bbM = bb.max;
  const bbT = bbN == null ? "" : bbN >= 50 ? "good" : bbN >= 25 ? "warn" : "bad";
  const tiles = `<div class="mtiles five ptiles c12">
    ${metricTile({ label: (ic("energie") + " Energie"), value: bbN != null ? num(bbN) : DASH, unit: bbN != null ? "%" : "", state: bbN == null ? "" : bbN >= 50 ? "dost" : bbN >= 25 ? "středně" : "málo", tone: bbT, spark: bbN != null ? `<div class="ebat">${batteryIcon(bbN, { showNum: false, max: bbM })}</div>` : "", href: "#/detail/bb", foot: bbM != null && bbN != null ? `max ${num(bbM)} · vybito ${num(Math.max(0, bbM - bbN))}` : "" })}
    ${metricTile({ label: (ic("vst") + " VST"), value: num(hv.today), unit: "ms", state: hvS, tone: hvT, spark: sparkRolling(hv.series.map((x) => x.v), stateColor(hv.today, hv.norm), 76), href: "#/detail/vst", foot: hv.norm ? `norma ${num(hv.norm.mean - hv.norm.sd)}–${num(hv.norm.mean + hv.norm.sd)}` : "" })}
    ${metricTile({ label: (ic("tep") + " Klidový tep"), value: num(rh.today), unit: "bpm", state: rhS, tone: rhT, spark: sparkRolling(rh.series.map((x) => x.v), stateColor(rh.today, rh.norm, true), 76), href: "#/detail/tep", foot: rh.norm ? `norma ${num(rh.norm.mean)} ± ${num(rh.norm.sd, 1)}` : "" })}
    ${metricTile({ label: (ic("stres") + " Stres"), value: num(st.avg), state: stS, tone: stT, spark: sparkRolling(st.series.map((x) => x.v), stateColor(st.avg, st.norm, true), 76), href: "#/detail/stres", foot: st.max != null ? `max ${num(st.max)}` : "" })}
    ${sleepBalTile(d.sleepBal)}
    ${metricTile({ label: (ic("kroky") + " Kroky"), value: thou(stp.today), state: stp.today != null ? `${num(Math.min(100, (stp.today / stp.goal) * 100))} %` : "", tone: (stp.today ?? 0) >= stp.goal ? "good" : "", spark: `<div class="prog"><i style="width:${clamp(((stp.today || 0) / stp.goal) * 100, 0, 100)}%"></i></div>`, href: "#/chuze", foot: `cíl ${thou(stp.goal)}${stp.floors != null ? ` · ${num(stp.floors)} pater` : ""}` })}
  </div>`;

  // 4) průběh dne
  // vlevo grafy dne (tep, Body Battery), vpravo stav (kroužek Body Battery, stres, co nabilo a vybilo)
  // Body Battery v jedné kartě (půlkruh, čísla, graf, co nabilo a vybilo), vedle tep a stres
  // průběh energie je v detailu (dlaždice Energie → #/detail/bb), na Přehledu jen stav v dlaždici
  const bbCard = "";
  const hrCard = "";

  // 5) poslední aktivita + počasí
  const la = d.lastActivity;
  const laCard = la
    ? card("c12 lacard", "Poslední aktivita", "", `<a class="lastact" href="#/aktivita/${la.id}"><span class="big-ico">${SPORT_ICON[la.sport] || ic("ostatni")}</span><div><b>${esc(la.name || SPORT_NAME[la.sport])}</b><div class="sub">${dayDm(la.date)}${la.plan ? ` · plán ${la.compliance ? `${num(la.compliance)} %` : "✓"}` : ""}</div></div><span class="go">→</span></a><div class="la-route" aria-hidden="true"></div>
      <div class="la2"><div class="la2-main">${la.km ? `<div><span>Vzdálenost</span><b>${num(la.km, 1)}<small> km</small></b></div>` : ""}<div><span>Čas</span><b>${hU(la.moving_s)[0]}<small> ${hU(la.moving_s)[1]}</small></b></div></div><div class="la2-sub">${[la.elev ? `<span><b>${num(la.elev)}</b> m</span>` : "", la.np ? `<span><b>${num(la.np)}</b> W</span>` : "", la.avg_hr ? `<span><b>${num(la.avg_hr)}</b> bpm</span>` : "", la.load != null ? `<span>zátěž <b>${num(la.load)}</b></span>` : ""].filter(Boolean).join("")}</div></div>`)
    : card("c12", "Poslední aktivita", "", `<div class="empty">Žádná aktivita za 90 dní.</div>`);

  const longDate = new Date(d.date + "T12:00").toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" });
  el.innerHTML = `<div class="head"><div><h1>${greeting(d.hour)}${d.name ? `, <span class="acc">${esc(d.name)}</span>` : ""}</h1><div class="sub"><span class="plong">${longDate[0].toUpperCase() + longDate.slice(1)}</span>${d.isToday ? `<span id="watchAt">${d.lastSync ? ` · ${ic("sync")} ${syncAgo(new Date(d.lastSync).getTime())}` : ""}</span>` : ""}</div></div></div>
  <div class="pbar">${dateNav(d.date, d.minDate, d.todayDate, "pnav", true)}${d.isToday ? weatherPill(d.weatherNow) : d.weatherDay ? weatherDayPill(d.weatherDay) : ""}${statusPill(d.status)}</div>
  ${d.carry ? `<p class="carry">${ic("noc")} Zotavení, spánek a VST jsou zatím z noci na ${dayDm(d.carry)} – dnešní přijdou po synchronizaci hodinek.</p>` : ""}
  <div class="grid prehled">${dnes}${d.isToday && !paused ? nextWorkoutCard(d.next, d.todayDate) : ""}${sleepCard}${tiles}${bbCard}${hrCard}${laCard}</div>`;
  if (la && !["indoor", "strength", "mobility"].includes(la.sport)) routeGlow(el.querySelector(".la-route"), la.id);
  el.querySelector("#aiDay")?.addEventListener("click", () => openAiPanel({ title: `Den ${dayDm(d.date)}`,
    extra: [`DEN ${d.date}${d.isToday ? " (dnes)" : ""}`, `Zotavení ${r.score ?? "?"} % (${r.label})${r.scoreDrags?.length ? `; snižuje: ${r.scoreDrags.join(", ")}` : ""}${r.scoreBoosts?.length ? `; zvyšuje: ${r.scoreBoosts.join(", ")}` : ""}`, r.reasons?.length ? `Důvody: ${r.reasons.join("; ")}` : "", d.sleep ? `Spánek: skóre ${d.sleep.score}, ${dur(d.sleep.durationS)}, potřeba ${d.sleep.needMin ? dur(d.sleep.needMin * 60) : "?"}` : "", `Energie: teď ${d.bb.latest ?? "?"}, max dne ${d.bb.max ?? "?"}`, `VST ${d.hrv.today ?? "?"} ms (norma ${d.hrv.norm ? `${d.hrv.norm.mean}±${d.hrv.norm.sd}` : "?"}), klidový tep ${d.rhr.today ?? "?"} (norma ${d.rhr.norm?.mean ?? "?"}), stres ${d.stress.avg ?? "?"}`, `Zátěž dne ${d.strain.today}, včera ${d.strain.yesterday}, 7 dní ${d.strain.load7 ?? d.fitPast?.load7 ?? "?"}; forma ${num(d.strain.form, 1)}`, (d.acts || []).length ? `Aktivity dne: ${d.acts.map((x) => `${x.name} ${dur(x.moving_s || 0)} zátěž ${x.load}`).join("; ")}` : "Aktivity dne: žádné"].filter(Boolean).join("\n"),
    ask: `Zhodnoť ${d.isToday ? "můj dnešní den" : `den ${dayDm(d.date)}`}: zotavení, spánek, energii a zátěž. Vysvětli souvislosti (např. jestli nižší zotavení plyne z předchozího tréninku, spánku nebo stresu) a co z toho plyne pro trénink.` }));
  bindHours(el);
  bindDateNav(el, "pnav", d.todayDate, (v) => { viewDate = v; route(); });
  el.querySelector("#statusBtn")?.addEventListener("click", () => openStatusModal(d.status, () => route()));
  api("day" + (d.isToday ? "" : `?date=${d.date}`)).then((day) => {
    // poslední data z hodinek = nejnovější bod tepu / Body Battery (hodinky je pošlou až po synchronizaci s telefonem)
    const lastT = Math.max(0, ...(day.hr || []).map((x) => x[0]), ...(day.bb || []).map((x) => x[0]));
    const wa = el.querySelector("#watchAt");
    if (wa && lastT && d.isToday) wa.innerHTML = ` · ${ic("sync")} ${syncAgo(lastT)}`;
  }).catch(() => {});
}


/** „Mám vlastní trasu“: délka + s kým → plán den nechá a ostatní dny dopočítá. */
const ownForm = (d) => `<details class="addd own"><summary class="btn sm">${ic("trasa")} Vlastní jízda…</summary><form class="ownf" data-date="${d.date}"><label>Délka (h)<input name="h" type="text" inputmode="decimal" placeholder="4 nebo 3:30" required></label><label>Km<input name="km" type="number" min="0" max="400" placeholder="volitelné"></label><label>S kým<input name="with" placeholder="sám / skupina / jméno"></label><button class="btn sm pri" type="submit">Zapsat do plánu</button></form><p class="note">Trasu a tempo volíš ty, trenér započítá zátěž (ve skupině +15 %) a zbytek týdne přepočítá. Jde to i v chatu: „zítra jedu 4 h s kamarádem“.</p></details>`;


/** Zátěž po týdnech: hotovo (plně) + plán (světle), čárkovaně cíl týdne. */
function weekLoadsHtml(w) {
  const bars = w.weeks.map((x) => ({ parts: [{ v: x.done, color: "var(--acc)" }, { v: x.planned, color: "color-mix(in srgb, var(--acc) 35%, transparent)" }] }));
  const lbl = (x) => (x.current ? "tento" : x.future ? "příští" : dm(x.from));
  return barChart({ x: w.weeks.map(lbl), mode: "stack", height: 170, bars, refLine: w.target.mid, todayIndex: w.weeks.findIndex((x) => x.current),
    tipFn: (i) => { const x = w.weeks[i]; return `<b>týden od ${dm(x.from)}</b><div>hotovo ${num(x.done)}${x.planned ? ` · plán ${num(x.planned)}` : ""}${x.current || x.future ? ` · celkem ${num(x.done + x.planned)}` : ""}</div><div>${x.sessions} tréninků · cíl ${w.target.lo}–${w.target.hi}</div>`; } })
    + `<div class="legend"><span><i style="background:var(--acc)"></i>hotovo</span><span><i style="background:color-mix(in srgb, var(--acc) 35%, transparent)"></i>plán</span><span class="sub">čárkovaně = cíl týdne ${w.target.mid} (pásmo ${w.target.lo}–${w.target.hi})</span></div>
    <table class="t wk"><tr><th>Týden</th><th class="r">Hotovo</th><th class="r">Plán</th><th class="r">Tréninky</th></tr>${w.weeks.map((x) => `<tr class="${x.current ? "iv" : ""}"><td>${x.current ? "tento" : x.future ? "příští" : `od ${dm(x.from)}`}</td><td class="r">${x.future ? DASH : num(x.done)}</td><td class="r">${x.planned ? num(x.planned) : DASH}</td><td class="r">${x.sessions}</td></tr>`).join("")}</table>
    <p class="note">Zátěž = TSS z wattmetru, bez wattmetru HRSS z tepu; na trenažéru vyšší z obou (uvnitř tě stejný výkon stojí víc). Kondice (CTL) ≈ průměrná denní zátěž za 6 týdnů, týden na udržení ≈ 7 × CTL.</p>`;
}

// ---------- Trenér: dnešek, plán týdne (interaktivní), z čeho trenér vychází, AI trenér ----------
const COACH_KEY = "coachAsk";
/** krátká hláška dole na obrazovce (chyba akce, kterou jinak nic neukáže) */
function toast(text) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = text; t.classList.add("on");
  clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.remove("on"), 5000);
}
/** chyba akce: ukázat a tlačítko znovu povolit */
const fail = (err, btn) => { if (btn) btn.disabled = false; toast(`Nepovedlo se: ${err?.message || err}`); };
// pojistka: chyba v akci, kterou nic nezachytilo, se aspoň ukáže
window.addEventListener("unhandledrejection", (e) => { const m = e.reason?.message || String(e.reason || ""); if (m) toast(`Nepovedlo se: ${m}`); });
/** dnešní datum v místním čase (ne UTC – kolem půlnoci by vyšel včerejšek) */
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
let tOpen = null; // otevřený den (panel úprav)
function tSportIco(s) { return ic(({ run: "beh", xc_ski: "bezky", walk: "chuze" })[s] || "kolo"); }
/** Pruh zátěže týdne: hotovo (plně) + plán (světle) proti cílovému pásmu. */
/**
 * Kalendář trenéra: sbalené 2 minulé týdny, tento týden (odjeto + plán), příští týden přesně a další dva
 * orientačně. Řádek = týden (pruh zátěže proti cíli, kondice), sloupce po–ne. Klik na budoucí den otevře
 * jeho úpravu přímo pod týdnem (`detail` = HTML panelu pro den `sel`).
 */
function coachCalendar(d, co, sel, detail) {
  if (!co || co.version !== 3 || !co.horizon) return "";
  const T = d.readiness.date;
  // druh dne = barva dlaždice a proužku (kvalita / Z2 a dlouhý), ne písmena
  const ROLE = { key: ["kvalita", "q"], long: ["dlouhý", "e"], endurance: ["Z2", "e"], rest: ["volno", "r"] };
  const pastBy = new Map((d.past || []).map((x) => [x.date, x]));
  const futBy = new Map(co.horizon.flatMap((w) => w.days.map((x) => [x.date, x])));
  const hm = (m) => (m >= 60 ? `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, "0")}` : `${Math.round(m)}′`);
  const cell = (date, orient) => {
    const day = Number(date.slice(8, 10));
    const cls = `${date === T ? " today" : ""}${date === sel ? " sel" : ""}${orient ? " or" : ""}`;
    const ps = pastBy.get(date);
    if (ps && date < T) {
      const acts = ps.acts;
      if (!acts.length) return ps.plan ? `<div class="cc-d miss${cls}" title="${dayDm(date)} · v plánu ${esc(ps.plan.name)}, neodjeto"><b>${day}</b><i>✕</i><span>neodjeto</span></div>` : `<div class="cc-d e${cls}"><b>${day}</b></div>`;
      const min = acts.reduce((t, a) => t + a.min, 0), load = acts.reduce((t, a) => t + a.load, 0), q = acts.some((a) => a.q);
      return `<a class="cc-d done${q ? " q" : ""}${cls}" href="#/aktivita/${acts[0].id}" title="${dayDm(date)} · ${esc(acts.map((a) => a.name || a.sport).join(", "))} · zátěž ${load}"><b>${day}</b><em class="ok" aria-label="odjeto">✓</em><i>${SPORT_ICON[acts[0].sport] || ic("ostatni")}</i><span>${hm(min)}</span></a>`;
    }
    const x = futBy.get(date);
    // dnešek už odjetý: ukázat odjeté, klik vede na aktivitu
    if (ps && ps.acts.length) { const a = ps.acts[0]; return `<a class="cc-d done${a.q ? " q" : ""}${cls}" href="#/aktivita/${a.id}"><b>${day}</b><em class="ok" aria-label="odjeto">✓</em><i>${SPORT_ICON[a.sport] || ic("ostatni")}</i><span>${hm(ps.acts.reduce((t, y) => t + y.min, 0))}</span></a>`; }
    if (!x || date < T) return `<div class="cc-d e${cls}"><b>${day}</b></div>`;
    if (x.blocked) return `<div class="cc-d blk${cls}" title="${dayDm(date)} · nelze"><b>${day}</b><i>${ic("nelze")}</i></div>`;
    const [lab, rc] = ROLE[x.role] || ROLE.rest;
    if (x.role === "rest") return `<button type="button" class="cc-d e free${cls}" data-ccday="${date}" title="${dayDm(date)} · volno – klik přidá trénink" aria-label="${dayDm(date)} volno, přidat trénink"><b>${day}</b><i class="add" aria-hidden="true">+</i></button>`;
    return `<button type="button" class="cc-d plan r-${rc}${cls}" data-ccday="${date}" title="${dayDm(date)} · ${esc(x.name || lab)} · ${hm(x.minutes)} · zátěž ${x.load}" aria-label="${dayDm(date)} ${esc(lab)}, ${hm(x.minutes)}"><b>${day}</b><i>${tSportIco(x.sport)}</i><span>${hm(x.minutes)}</span></button>`;
  };
  const n1 = (v) => (v == null ? DASH : num(v, 1));
  const W0 = co.horizon[0].weekStart;
  /** orientační týden: jen soupis, co se má odjet (druh, sport, délka) – dny a časy dostane, až bude příští týden */
  const SUM_ROLE = { key: ["Kvalita", "q", 0], long: ["Dlouhý Z2", "e", 1], endurance: ["Z2", "e", 2] };
  const summary = (w) => {
    const tr = w.days.filter((x) => !x.blocked && x.role !== "rest" && SUM_ROLE[x.role]).sort((a, b) => SUM_ROLE[a.role][2] - SUM_ROLE[b.role][2] || (b.minutes || 0) - (a.minutes || 0));
    const blk = w.days.filter((x) => x.blocked).length;
    const blkTxt = blk ? ` · ${blk} ${blk === 1 ? "den" : "dny"} nelze` : "";
    if (!tr.length) return `<div class="cc-sum"><p class="cc-foot">Bez tréninku${blkTxt}</p></div>`;
    const mins = tr.reduce((t, x) => t + (x.minutes || 0), 0);
    const item = (x) => { const [l, rc] = SUM_ROLE[x.role]; return `<div class="cc-tr r-${rc}"><span class="cc-tr-i">${tSportIco(x.sport)}</span><span class="cc-tr-t"><b>${l}</b><small>${({ ride: "kolo", run: "běh", xc_ski: "běžky", walk: "chůze" })[x.sport] || ""}</small></span><span class="cc-tr-d">${hm(x.minutes || 0)}</span></div>`; };
    return `<div class="cc-sum"><div class="cc-trs">${tr.map(item).join("")}</div><p class="cc-foot">${tr.length} ${tr.length >= 5 ? "tréninků" : "tréninky"} · celkem ${hm(mins)}${mins >= 60 ? " h" : ""} · dny se určí týden předem${blkTxt}</p></div>`;
  };
  const grid = (ws, orient) => `<div class="cc-r">${[0, 1, 2, 3, 4, 5, 6].map((k) => cell(addDay(ws, k), orient)).join("")}</div>`;
  const span = (ws) => `${ws.slice(5, 7) === addDay(ws, 6).slice(5, 7) ? `${Number(ws.slice(8, 10))}.` : dm(ws)}–${dm(addDay(ws, 6))}`;
  const inWeek = (ws) => sel && sel >= ws && sel <= addDay(ws, 6);
  // minulé týdny: sbalené, souhrn v jednom řádku
  const pw = d.pastWeeks || [];
  const past = pw.length ? `<details class="cc-past"${ccPastOpen ? " open" : ""}><summary>${pw.length} ${pw.length === 1 ? "minulý týden" : "minulé týdny"} <span class="sub">· zátěž ${pw.map((w) => w.load).join(" · ")}</span></summary>${pw.map((w) => `<div class="cc-w past"><div class="cc-s"><span class="cc-wl">${span(w.weekStart)}</span><span class="cc-num">zátěž <b>${w.load}</b>${w.ctlEnd != null ? ` · kondice ${n1(w.ctlEnd)}` : ""}</span></div>${grid(w.weekStart, false)}</div>`).join("")}</details>` : "";
  const weeks = co.horizon.map((w, i) => {
    const total = w.done + w.load;
    const goal = i === 0 ? w.done + w.target : w.target;
    const tag = i === 0 ? "tento" : i === 1 ? "příští" : "orientačně";
    const max = Math.max(goal * 1.2, total, 1);
    const ok = goal ? Math.abs(total - goal) <= goal * 0.1 : true;
    const pct = (v) => clamp((v / max) * 100, 0, 100);
    const bar = `<span class="cc-bar" title="zátěž ${total} / cíl ${goal}">${total > 0 ? `<i class="${ok ? "" : "warn"}" style="width:${pct(total)}%"></i>` : ""}${i === 0 && w.done ? `<i class="dn" style="width:${pct(w.done)}%"></i>` : ""}<u style="left:${pct(goal)}%"></u></span>`;
    const orient = !w.detail && i > 0;
    const ctlUp = w.ctlEnd != null && w.ctlStart != null ? (w.ctlEnd - w.ctlStart >= 0.05 ? "up" : w.ctlEnd - w.ctlStart <= -0.05 ? "dn" : "") : "";
    return `<div class="cc-w ${i === 0 ? "cur" : orient ? "orient" : "next"}"><div class="cc-s"><span class="cc-wl">${span(w.weekStart)} <em>${tag}</em>${w.recoveryWeek ? ' <em class="lt">lehčí</em>' : ""}</span><span class="cc-num"><b>${total}</b><small> / ${goal}</small></span>${bar}<span class="cc-ctl ${ctlUp}" title="kondice (CTL) na začátku → na konci týdne">${n1(w.ctlStart)} → <b>${n1(w.ctlEnd)}</b></span></div>${orient ? summary(w) : grid(w.weekStart, orient)}${inWeek(w.weekStart) ? detail : ""}</div>`;
  }).join("");
  const head = `<div class="cc-h">${DAYS.map((x, k) => `<span class="${k + 1 === dow(T) ? "now" : ""}">${x}</span>`).join("")}</div>`;
  const legend = `<div class="cc-leg"><span><i class="r-q"></i>kvalita</span><span><i class="r-e"></i>Z2 a dlouhý</span><span><i class="dn"></i>odjeto</span><span class="sub">Pruh = zátěž týdne proti cíli (čárka), vpravo kondice začátek → konec týdne.</span></div>`;
  return card("c12 t-cal", (ic("kalendar") + " Plán na 4 týdny"), W0 ? `${dm(W0)}–${dm(addDay(W0, 27))}` : "", `<div class="ccal">${past}${head}${weeks}</div>${legend}<p class="note">Klikni na budoucí den – otevře se jeho úprava. Tento a příští týden mají konkrétní dny a tréninky (každý den se přepočítají podle kondice, únavy a předpovědi počasí). Další dva týdny jsou jen soupis, co se má odjet – dny dostanou, až budou příští týden.</p>`, 'data-tt="tyden"');
}

function weekBar(w, label) {
  if (!w) return "";
  const t = w.target || {};
  const max = Math.max(t.hi || 0, (w.done || 0) + (w.planned || 0)) * 1.12 || 1;
  const pc = (v) => clamp((v / max) * 100, 0, 100);
  const total = (w.done || 0) + (w.planned || 0);
  const tone = total < (t.lo || 0) * 0.9 ? "warn" : total > (t.hi || 1e9) * 1.1 ? "bad" : "good";
  return `<div class="wbar"><div class="wb-h"><b>${label}</b><span class="num ${tone}">${thou(total)} <small>/ cíl ${t.lo}–${t.hi}</small></span></div>
    <div class="wb-t"><i class="wb-band" style="left:${pc(t.lo || 0)}%;width:${pc(t.hi || 0) - pc(t.lo || 0)}%"></i>${total > 0 ? `<i class="wb-plan" style="width:${pc(total)}%"></i>` : ""}${w.done > 0 ? `<i class="wb-done" style="width:${pc(w.done)}%"></i>` : ""}</div>
    <div class="wb-l"><span><i class="wb-sw done"></i>hotovo ${thou(w.done || 0)}</span><span><i class="wb-sw plan"></i>plán ${thou(w.planned || 0)}</span><span><i class="wb-sw band"></i>cíl týdne</span></div></div>`;
}
let tTab = (() => { try { return localStorage.getItem("tTab") || "tyden"; } catch { return "tyden"; } })(), tMoreOpen = false;
/** kalendář trenéra: otevřený den (úprava pod jeho týdnem) a rozbalené minulé týdny */
let ccOpen = null, ccEdit = false, ccPastOpen = false;
// ---------- graf tréninku ----------
/** výška kroků podle tepu (Z1–Z5), když krok nemá watty */
const WZ_PCT = [0.5, 0.65, 0.82, 0.97, 1.1];
const wkPct = (s, ftp) => (s.lo != null && s.hi != null && ftp ? (s.lo + s.hi) / 2 / ftp : WZ_PCT[(s.z || 2) - 1] ?? 0.65);
/** zóna výkonu (Coggan Z1–Z7) z podílu FTP */
const wkZone = (p) => (p < 0.55 ? 1 : p < 0.76 ? 2 : p < 0.91 ? 3 : p < 1.06 ? 4 : p < 1.21 ? 5 : p < 1.5 ? 6 : 7);
/** Hlavní část kvality, kterou jde upravit (stejně jako editableBlock na serveru). */
const edIdx = (w) => { let i = w.blocks.findIndex((b) => (b.reps || 1) > 1 && b.steps.length); if (i < 0) i = w.blocks.findIndex((b) => b.kind === "work" && b.steps.length); return i; };
/** Sloupec = krok tréninku: šířka = délka, výška a barva = intenzita. `hl` = zvýraznit blok (upravovaná série). */
function workoutSvg(w, ftp, hl = null) {
  if (!w || !w.blocks || !w.blocks.length) return "";
  const segs = [];
  w.blocks.forEach((b, bi) => { for (let r = 0; r < (b.reps || 1); r++) b.steps.forEach((s) => segs.push({ d: s.dur_s, p: wkPct(s, ftp), bi, t: s.lo != null && s.hi != null ? `${s.lo}–${s.hi} W` : s.hrLo ? `${s.hrLo}–${s.hrHi} bpm` : `Z${s.z || 2} tepu` })); });
  const tot = segs.reduce((t, s) => t + s.d, 0) || 1;
  const W = 600, H = 64, maxP = Math.max(1.2, ...segs.map((s) => s.p));
  let x = 0;
  const rects = segs.map((s) => {
    const w2 = (s.d / tot) * W, h = Math.max(4, (s.p / maxP) * (H - 4));
    const r = `<rect x="${x.toFixed(1)}" y="${(H - h).toFixed(1)}" width="${Math.max(0.6, w2 - 0.8).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="var(--z${wkZone(s.p)})"${hl != null && s.bi !== hl ? ' opacity=".45"' : ""}><title>${dur(s.d)} · ${s.t}</title></rect>`;
    x += w2;
    return r;
  }).join("");
  const fy = (H - (1 / maxP) * (H - 4)).toFixed(1);
  return `<div class="wkg"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Průběh tréninku">${rects}${ftp ? `<line x1="0" x2="${W}" y1="${fy}" y2="${fy}" class="wkg-ftp"/>` : ""}</svg><div class="wkg-ax"><span>0</span><span>${ftp ? "čárkovaně = FTP" : ""}</span><span>${dur(tot)}</span></div></div>`;
}
/** Úprava kvality: opakování, délka úseku, intenzita (uloží se jako tvoje úprava dne). */
function stepEditor(x, mine) {
  if (x.kind !== "quality" || !x.workout) return "";
  const i = edIdx(x.workout);
  if (i < 0) return "";
  const b = x.workout.blocks[i], s = b.steps[0], series = (b.reps || 1) > 1 || b.steps.length > 1;
  const m = (mine || []).find((y) => y.date === x.date && y.kind === "kroky");
  let cur = 0; try { cur = m ? JSON.parse(m.note).pct || 0 : 0; } catch { cur = 0; }
  return `<div class="tp-g"><span class="tp-k">Kroky</span><form class="stepf" data-date="${x.date}">${series ? `<label>Opakování<input name="reps" type="number" min="1" max="12" value="${b.reps || 1}"></label>` : ""}<label>Úsek (min)<input name="work" type="number" min="0.5" max="30" step="0.5" value="${Math.round((s.dur_s / 60) * 2) / 2}"></label><label>Intenzita<select name="pct">${[-10, -5, 0, 5, 10].map((v) => `<option value="${v}" ${v === cur ? "selected" : ""}>${v > 0 ? "+" : ""}${v} %</option>`).join("")}</select></label><button class="btn sm pri">Uložit úpravu</button>${m ? `<button type="button" class="btn sm" data-stepreset="${x.date}">Zpět na návrh trenéra</button>` : ""}</form></div>
      <p class="note">Mění hlavní část (zvýrazněná v grafu). Pracovní čas jde zvednout nejvýš o polovinu, intenzita ±10 %. Trenér přepočítá zátěž a den bere jako tvoji volbu.</p>`;
}

/** Pravidla Trenéra v3 – krátce, se zdroji (docs/trener/zdroje.md). */
/** Nápověda na stránce Trenér: týden, cesta do hodinek, lapy, hodnocení intervalů. */
const COACH_HELP = `<div class="chelp">
  <details class="gcmp"><summary>Jak vzniká plán týdne</summary><ul class="rules3">
    <li>Trenér spočítá cílovou zátěž týdne z tvé kondice a cíle a rozdělí ji do dnů: 1× kvalita v zimě (říjen–únor), 2× v sezóně, nikdy dva dny po sobě, zbytek Z2 a volno.</li>
    <li>Každé ráno podle zotavení (VST, klidový tep, spánek): ${sdot("good")} beze změny, ${sdot("warn")} kvalita → Z2 nebo kratší, ${sdot("bad")} volno nebo Z1.</li>
    <li>Tvoje úpravy (přesun, délka, sport, vlastní jízda, chat) mají přednost – zbytek týdne se dopočítá. Vynechané se nedohání.</li>
    <li>Změny plánu se do kalendáře zapíšou až po <b>Zapsat</b>.</li></ul></details>
  <details class="gcmp"><summary>Jak se trénink dostane do Garminu</summary><ul class="rules3">
    <li>Po <b>Zapsat</b> jde trénink do kalendáře intervals.icu a odtud do Garmin Connect (v intervals.icu musí být zapnuté nahrávání plánovaných tréninků do Garminu).</li>
    <li>V hodinkách / Edge: Trénink → Kalendář (nebo nabídka dnešního tréninku po startu jízdy) → spustit. Kroky pak vedou samy: cíl wattů nebo tepu, zbývající čas.</li>
    <li>Bez intervals.icu: u dne stáhni <b>${ic("stahnout")} FIT soubor</b> a nahraj ho kabelem do složky Garmin/NewFiles.</li></ul></details>
  <details class="gcmp"><summary>Kdy zmáčknout lap</summary><ul class="rules3">
    <li><b>Kroky na čas</b> (intervaly a pauzy v opakování, rozjetí u Z2 jízdy) skončí samy – nic nemačkej.</li>
    <li><b>Kroky do lapu</b> ukončíš sám tlačítkem Lap, až jsi připravený. Čas u nich je jen vodítko.</li>
    <li><b>Kvalita:</b> rozjetí končí lapem – zmáčkni, až jsi rozjetý a máš před sebou úsek bez křižovatek. Delší pauza mezi bloky taky lapem. Poslední krok „Z2 a dojezd“ lapem ukončíš trénink.</li>
    <li><b>Z2 jízda:</b> Z2 končí lapem – zmáčkni ho, až budeš ~5 min od domova, a dojeď lehce (vyjetí). Když se cítíš dobře a chceš jízdu protáhnout, prostě jeď dál – hodinky ti Z2 samy neukončí.</li>
    <li><b>Rychlý závěr:</b> lapem na konci Z2 spustíš závěr (ten běží na čas), pak vyjetí do lapu.</li>
    <li>Lap navíc uprostřed kroku nemačkej – rozdělí okruh a pak nesedí s plánem. Běh a běžky jsou bez lapů, vše na čas.</li></ul></details>
  <details class="gcmp"><summary>Jak se hodnotí intervaly</summary><ul class="rules3">
    <li>Každý krok tréninku = jeden okruh (lap). Proto je důležité mačkat lap jen tam, kde ho plán čeká. V intervals.icu zapni <b>Use laps for intervals</b>, jinak se okruhy z hodinek nenačtou.</li>
    <li>Za interval se počítá okruh s délkou ±25 % plánu. U kvality se pak hodnotí průměrný výkon proti pásmu a nárůst tepu od prvního k poslednímu intervalu:</li>
    <li>${ic("odjeto")} <b>posun</b> (příště o stupeň těžší): všechny v pásmu, poslední aspoň 98 % prvního, tep +5 bpm nebo méně. U cíle Udržet a Zima se jen opakuje.</li>
    <li>${ic("presun")} <b>zopakovat</b>: poslední interval pod pásmem, tep +8 bpm a víc, nebo výkon nedržel.</li>
    <li>${ic("dolu")} <b>ubrat</b> (o stupeň níž): nedokončeno nebo 2+ intervaly pod pásmem.</li>
    <li>Bez okruhů rozhoduje splnění z intervals.icu: 95 %+ posun, 75–94 % zopakovat, méně ubrat. Bez wattmetru se hodnotí podle splnění.</li></ul></details>
  <details class="gcmp"><summary>Zátěž, kondice a forma</summary><ul class="rules3">
    <li><b>Zátěž (TSS)</b>: 100 = hodina na prahu. Z výkonu, bez wattmetru z tepu (HRSS); na trenažéru vyšší z obou.</li>
    <li><b>Kondice (CTL)</b> = průměrná denní zátěž 6 týdnů, <b>únava (ATL)</b> = 7 dní, <b>forma (TSB)</b> = kondice − únava.</li>
    <li>Splněno = intervals.icu hlásí aspoň 80 % (nebo zátěž 80–125 % plánu).</li></ul></details>
</div>`;

const RULES3 = `<ul class="rules3">
  <li><b>Cíl týdne</b> = 7 × kondice + 45,6 × růst. Zlepšit +3 za týden (nad kondicí 45 +4), Udržet 0, Zima k zimnímu základu (vrchol sezóny − 42,5 %), ladění −2. <small>TrainingPeaks, Friel</small></li>
  <li><b>Přidávání</b> nejvýš +30 % proti obvyklým 4 týdnům, pak +15 % za týden. Každý 4. týden lehčí, o 40–50 % méně. <small>Friel 3:1</small></li>
  <li><b>Týden od pondělí.</b> Vynechané se nedohání, odjeté navíc se odečte od zbytku týdne.</li>
  <li><b>Kostra:</b> nejvýš 3 dny tréninku za sebou, kvalita ne den po kvalitě ani po dlouhém, dlouhý o víkendu.</li>
  <li><b>Délky ze zátěže</b> podle sportu – změna sportu drží zátěž. Zima a Udržet v zimě: Z2 i dlouhá do 2 h.</li>
  <li><b>Ráno:</b> ${sdot("warn")} dnes bez kvality, ${sdot("bad")} volno nebo Z1. Únava (forma pod −20, horší rána, VST pod normou) ubírá týden.</li>
  <li><b>Intenzita 80/20:</b> lehce = Z1–Z2, středně = Z3, intenzivně = Z4 a výš. <small>Seiler</small></li>
</ul>`;

/** „Z čeho trenér vychází“ pro v3: tři řádky čísel, jedna věta souhrnu, čas v zónách za 28 dní. */
function why3(d, co, p, f) {
  const h0 = co.horizon[0];
  const goalTxt = co.floor != null ? `zimní základ <b>${num(co.floor, 1)}</b>` : co.ramp > 0 ? `růst <b>+${num(co.ramp, 0)}</b> za týden` : co.ramp < 0 ? `${num(co.ramp, 0)} za týden` : "kondici držet";
  const nTr = h0.days.filter((x) => x.role !== "rest" && !x.blocked).length;
  const nK = h0.days.filter((x) => x.role === "key").length;
  const rows = [
    ["Cíl", `${esc(d.goalLabel || "")} · ${esc(co.phaseLabel)} · ${goalTxt}${co.recoveryWeek ? " · lehčí týden" : ""}`],
    ["Kondice", `začátek týdne ${num(co.ctlWeekStart, 1)} · dnes ${num(f.ctl, 1)} · neděle <b>${num(co.ctlTarget, 1)}</b>`],
    ["Tento týden", `zátěž <b>${thou(co.load)}</b>${h0.done ? ` (odjeto ${thou(h0.done)})` : ""} · zbývá ${nTr} tréninků${nK ? ` · ${nK}× kvalita` : ""} · ${num(co.hours, 2).replace(/,?0+$/, "")} h`],
  ];
  const sum = co.notes && co.notes[0] ? `<p class="tproj">${esc(co.notes[0])}</p>` : "";
  const more = (co.notes || []).slice(1);
  const CATN = { tempo: "tempo", ss: "sweet spot", thr: "práh", ou: "over-under", vo2: "VO2max", vo2s: "VO2 krátké", ana: "anaerobní", nm: "sprinty" };
  const OUT = { posun: ["good", "zvládnuto → příště těžší"], zopakovat: ["", "napůl → stejný stupeň"], ubrat: ["warn", "nezvládnuto → příště lehčí"], nove: ["", "první měření"] };
  const ST = { missed: "neodjeto – stupeň beze změny", other: "jiný trénink – stupeň beze změny", ambiguous: "víc tréninků, nejasné – beze změny" };
  const lk = co.lastKeys || [];
  const kHtml = lk.length ? `<div class="sl" style="margin-top:12px">Poslední kvality</div><ul class="rules3">${lk.map((k) => { const o = k.state === "done" ? OUT[k.outcome] || ["", k.outcome] : ["", ST[k.state] || k.state]; return `<li><b>${dm(k.date)} ${esc(CATN[k.cat] || k.cat)}</b> (stupeň ${k.level + 1}${k.newLevel != null && k.newLevel !== k.level ? ` → ${k.newLevel + 1}` : ""}): <span class="${o[0]}">${esc(o[1])}</span>${k.text ? ` <small>${esc(k.text)}</small>` : ""}</li>`; }).join("")}</ul>` : "";
  const z = d.zones28 || [];
  const zHtml = z.length ? `<div class="sl" style="margin-top:12px">Čas v zónách · posledních 28 dní</div>${z.map((g) => `<div class="z28"><div class="z28-h"><b>${esc(g.label)}</b><span>${num(g.hours, 1)} h · lehce <b>${g.low} %</b> · středně ${g.mid} % · intenzivně ${g.high} %</span></div>${zonesHtml(g.rows)}</div>`).join("")}<p class="note">80/20: lehce (Z1–Z2) by mělo být kolem 80 % času. V plánu tohoto týdne je nad Z2 ${co.plannedHard} %.</p>` : `<p class="note">Čas v zónách za 28 dní zatím nemám.</p>`;
  return `<div class="twhy"><div class="kv why3">${rows.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join("")}</div>${sum}${kHtml}${more.length ? `<details class="gcmp"><summary>Podrobnosti k cíli (${more.length})</summary><ul class="rules3">${more.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>` : ""}${zHtml}</div>`;
}

/** Trenér zapnout / vypnout (vypnutí smaže budoucí naplánované tréninky i v kalendáři). */
async function setCoachOn(el, on, btn) {
  if (!on && !confirm("Vypnout trenéra?\n\nNaplánované tréninky od zítřka se smažou (i z kalendáře intervals.icu a Garminu). Odjeté tréninky a dnešek zůstanou. Trenér se dá kdykoli zase zapnout – plán pak navrhne znovu.")) return;
  btn.disabled = true;
  try { await api("coach/enabled", { method: "POST", body: JSON.stringify({ on }) }); await pageTrener(el); } catch (err) { fail(err, btn); }
}

/** Trenér vypnutý: jezdíš sám, stránka ukazuje tento týden proti zátěži na udržení kondice. */
function pageTrenerFree(el, d) {
  const w = d.week, t = w.target;
  const pct = t.mid ? Math.min(100, Math.round((w.done / t.mid) * 100)) : 0;
  const tone = w.done >= t.lo ? "good" : "";
  const perDay = w.left && w.daysLeft ? Math.round(w.left / w.daysLeft) : 0;
  const status = !t.mid ? "Kondici zatím neznám – cíl se spočítá po prvních týdnech dat."
    : w.done >= t.hi ? `Splněno s rezervou – ${num(w.done)} z ${num(t.mid)}. Kondice poroste, další jízdy už jsou navíc.`
    : w.done >= t.lo ? `Splněno – ${num(w.done)} z ${num(t.mid)}. Kondice se udrží.`
    : `Do udržení kondice chybí ${num(w.left)}${w.daysLeft > 1 ? ` (${w.daysLeft} dní do konce týdne, asi ${num(perDay)} denně)` : " (poslední den týdne)"}.`;
  const bar = `<div class="fbar"><div class="fbar-in ${tone}" style="width:${pct}%"></div><div class="fbar-t" style="left:${t.mid ? Math.min(100, (t.lo / t.mid) * 100) : 0}%"></div></div>`;
  const weekCard = card("c12", (ic("cil") + " Tento týden"), w.ctl != null ? `kondice ${num(w.ctl, 1)}` : "",
    `<div class="stats tight">${stat("Hotovo", num(w.done), "", `${pct} % cíle`, tone)}${stat("Na udržení", num(t.mid), "", `pásmo ${t.lo}–${t.hi}`, "")}${stat("Zbývá", num(w.left), "", w.daysLeft > 1 ? `${w.daysLeft} dní` : "dnes", "")}</div>${bar}<p class="note">${esc(status)}</p>
    <p class="note">Cíl = 7 × kondice z konce minulého týdne: s takovou zátěží týdne kondice zůstane stejná (TrainingPeaks, Friel). Víc = kondice roste, míň = klesá.</p>`);
  const list = d.acts.length ? `<div class="alist">${d.acts.map((a) => `<a class="row" href="#/aktivita/${a.id}"><span class="d">${dayDm(a.date)}</span><span class="t">${SPORT_ICON[a.sport] || ic("ostatni")} ${esc(a.name || "aktivita")}</span><span class="r">${hmm(a.moving_s)} h${a.km ? ` · ${num(a.km, 1)} km` : ""} · <b>${num(a.load)}</b></span></a>`).join("")}</div>` : `<div class="empty">Tento týden zatím nic odjeto.</div>`;
  el.innerHTML = `<div class="head"><div><h1>Trenér</h1><div class="sub">vypnutý · jezdíš podle sebe</div></div><button class="btn pri" id="coachOn">Zapnout trenéra</button></div>
  <div class="grid">
    ${weekCard}
    ${card("c6", (ic("kolo") + " Odjeto tento týden"), `${d.acts.length}×`, list)}
    ${card("c6", (ic("kondice") + " Zátěž po týdnech"), "TSS / HRSS", weekLoadsHtml(d.weeks))}
  </div>`;
  el.querySelector("#coachOn").addEventListener("click", (e) => setCoachOn(el, true, e.currentTarget));
}

async function pageTrener(el) {
  const [d, mine] = await Promise.all([api("coach"), api("plan/mine").catch(() => [])]);
  if (d.free) return pageTrenerFree(el, d);
  const r = d.readiness, rec = r.recovery, f = r.fitness, p = r.plan;
  const co = d.coach; // Trenér v2 (uložený plán podle profilu); null = starý trenér
  const hTxt = (x) => String(x).replace(".", ",");
  const coLine = co ? `<p class="tproj"><b>${esc(co.phaseLabel)}</b>${co.cycle ? ` · týden ${co.cycleIdx} ze ${co.cycleLen || 4}${co.recoveryWeek ? " (lehčí)" : co.nextRecovery ? ` · lehčí týden od ${dm(co.nextRecovery)}` : ""}` : ""} · cíl týdne <b>${co.load}</b> zátěže (asi ${hTxt(co.hours)} h) · na udržení kondice ${co.keepLoad} · poslední 4 týdny ${co.recentLoad}</p>` : "";
  const tone = rec.state === "green" ? "good" : rec.state === "yellow" ? "warn" : "bad";
  const paused = d.status && d.status.kind !== "active";
  const skipped = (d.constraints || []).find((c) => c.date === r.date && ["nepojedu", "nemuzu", "dovolena", "nemoc"].includes(c.kind));
  const t = r.today;
  // --- dnešek: stav, co dnes (nebo odjeto s odkazem), zítřek jedním řádkem ---
  const ti = r.tomorrowInfo || t.tomorrowInfo || null;
  const tmLine = ti ? `${ti.name ? esc(ti.name) : esc(ti.tag || "volno")}${ti.minutes ? ` · ${dur(ti.minutes * 60)}` : ""}${ti.rainProb != null && ti.rainProb > 40 ? ` · ${ic("dest")} déšť ${num(ti.rainProb)} %` : ti.tmax != null ? ` · ${num(ti.tmax)}°` : ""}` : esc(String(r.tomorrow || "").replace(/^[^:]*:\s*/, ""));
  const doneActs = (t.done || []).filter((x) => x.id);
  const todayCard = `<section class="card tdark c12" data-tt="tyden"><span class="td-d">Dnes · ${dayDm(r.date)} · <span class="${tone}">${sdot(tone)} ${esc(rec.stateLabel)}</span></span>
    ${doneActs.length && !paused ? doneActs.map((x) => `<a class="td-h td-done" href="#/aktivita/${x.id}"><span class="go">→</span>${ic("odjeto")} Odtrénováno: ${esc(x.name)}</a>`).join("") : `<b class="td-h">${esc(paused ? `${d.status.label} – plán stojí` : skipped ? "Dnes volno (tvoje volba)" : t.decision)}${!paused && t.day && t.day.name && t.decision !== "Odtrénováno" ? ` · ${dur((t.day.durationMin || 0) * 60)}` : ""}</b>`}
    <p class="td-p">${paused ? "Stav změníš na Přehledu." : skipped ? "Omylem? Vrať to tlačítkem." : doneActs.length ? doneActs.map((x) => `${x.load != null ? `zátěž <b>${num(x.load)}</b> <small class="u">${x.unit || ""}</small>` : ""}${x.compliance != null ? ` · splněno <b class="${x.compliance >= 80 && x.compliance <= 125 ? "good" : "warn"}">${x.compliance} %</b>` : ""}`).join("<br>") : esc(t.decisionWhy)}</p>
    <p class="td-tm"><b>Zítra:</b> ${tmLine}</p>
    <div class="btns">${paused ? "" : skipped ? `<button class="btn pri" data-undo="${r.date}" data-kind="${skipped.kind}">${ic("zpet")} Vrátit – dnes pojedu</button>` : t.decision === "Odtrénováno" || t.decision === "Volno" ? "" : `<button class="btn" data-skip="${r.date}">${ic("zakaz")} Dnes nepojedu</button>`}</div></section>`;
  // --- týden: 7 dní jako ikony (odjeto zeleně, dnes orámované) + pruh hotovo / plán / cíl ---
  const wk = d.weeks.weeks;
  const cur = wk.find((x) => x.current), next = wk.find((x) => x.future);
  const wkLabel = (w) => `${dm(w.from)}–${dm(addDay(w.from, 6))}`;
  const inPlan = (w) => w && p.days.some((x) => x.date >= w.from && x.date <= addDay(w.from, 6));
  const rc = d.recent || [];
  const mon = addDay(r.date, -(dow(r.date) - 1));
  const stripDay = (date) => {
    const pd = p.days.find((x) => x.date === date), past = rc.find((x) => x.date === date);
    const acts = (past && past.acts) || [];
    const done = acts.length > 0 || (date === r.date && doneActs.length > 0);
    // kvalita = sytější barva (naplánovaná oranžově, odtrénovaná zeleně), ikona vždy sport; prázdný den vždy tečka
    const ico = done ? (SPORT_ICON[(acts[0] || {}).sport || (date === r.date ? (doneActs[0] || {}).sport : "")] || ic("odjeto")) : pd && pd.name ? tSportIco(pd.sport) : "·";
    const q = done ? acts.some((a) => a.q) || !!(past && past.plan && past.plan.kind === "quality") || (date === r.date && !!pd && pd.kind === "quality") : !!pd && pd.kind === "quality";
    return `<button type="button" class="tsd ${done ? "done" : ""} ${pd && pd.name && !done ? "pl" : ""} ${date === r.date ? "today" : ""} ${q ? "q" : ""}" ${pd && date >= r.date ? `data-peek="${date}"` : ""} title="${dayDm(date)}${pd && pd.name ? ` · ${esc(pd.name)}` : ""}"><i>${ico}</i><b>${DAYS[dow(date) - 1]}</b><small>${Number(date.slice(8, 10))}.</small></button>`;
  };
  const strip = `<div class="tstrip-sc" id="tStrip">${[-7, 0, 7].map((o) => `<div class="tstrip" data-wk="${o}">${[0, 1, 2, 3, 4, 5, 6].map((k) => stripDay(addDay(mon, o + k))).join("")}</div>`).join("")}</div>`;
  // v3: každý týden má svůj cíl (tento = odjeto + cíl zbylých dní, příští = cíl celého týdne)
  const band = (x) => ({ lo: Math.round(x * 0.9), hi: Math.round(x * 1.1) });
  const hz = co && co.version === 3 && co.horizon ? co.horizon : null;
  const tCur = hz ? band(hz[0].done + hz[0].target) : d.weeks.target, tNext = hz && hz[1] ? band(hz[1].target) : d.weeks.target;
  const bars = (cur ? weekBar({ ...cur, target: tCur }, `Tento týden · ${wkLabel(cur)}`) : "") + (inPlan(next) ? weekBar({ ...next, target: tNext }, `Příští týden · ${wkLabel(next)}`) : "");
  const weekCard = card("c12 t-week", "", "", strip + bars, 'data-tt="tyden"');
  // --- dny: podrobný plán (8 dní) + výhled trenéra (4 týdny, jen druh / sport / délka) ---
  const HZ_KIND = { key: "quality", long: "long", endurance: "z2", easy: "z2", rest: "rest" };
  const HZ_NAME = { key: "Kvalita", long: "Z2", endurance: "Z2", easy: "Lehce" };
  const hzDays = hz ? hz.flatMap((w) => w.days.map((x) => ({ ...x, orient: !w.detail }))) : [];
  /** den pro úpravy: z podrobného plánu, jinak z výhledu trenéra (orient = náhled, kroky se upřesní 2 týdny předem) */
  const dayAt = (date) => {
    const x = p.days.find((y) => y.date === date);
    if (x) return x;
    const h = hzDays.find((y) => y.date === date);
    if (!h || date < r.date) return null;
    if (h.blocked) return { date, kind: "blocked", tag: "nelze", orient: h.orient };
    const rest = h.role === "rest";
    return { date, orient: h.orient, kind: HZ_KIND[h.role] || "z2", name: rest ? null : h.name || HZ_NAME[h.role] || "Trénink", sport: h.sport, durationMin: rest ? null : h.minutes, load: rest ? 0 : h.load, workout: rest ? null : h.workout || null, steps: rest ? [] : h.steps || [], targetText: rest ? null : h.targetText || null, why: h.why || [] };
  };
  /** kam jde trénink přesunout: všechny budoucí dny plánu i výhledu */
  const shiftTargets = (x) => [...new Set([...p.days.map((y) => y.date), ...hzDays.map((y) => y.date)])].filter((dt) => dt >= r.date && dt !== x.date).sort().map(dayAt).filter((y) => y && y.kind !== "blocked");
  /** odhad sacharidů na trénink (podle délky a intenzity) – jen gramy */
  const carbsHtml = (x) => (x.carbs ? `<p class="tcarb">Sacharidy: <b>~${x.carbs.total} g</b> <span class="sub">(${x.carbs.note ? esc(x.carbs.note) : `${x.carbs.perHour} g/h`})</span></p>` : "");
  const panelHtml = (x) => {
    const ride = !!x.name;
    const q = x.kind === "quality";
    return `${ride ? `<label class="tp-l">Přesunout na<select data-shift="${x.date}"><option value="">vyber den…</option>${shiftTargets(x).map((y) => `<option value="${y.date}">${dayDm(y.date)} · ${esc(y.name || "volno")}${y.name ? " (prohodit)" : ""}</option>`).join("")}</select></label>` : ""}
      <div class="tp-g"><span class="tp-k">Druh</span><div class="seg sm">${[["z2", "Z2"], ["quality", "Kvalita"], ["rest", "Volno"]].map(([k, l]) => `<button class="${(k === "rest" && !ride) || (k === "quality" && q) || (k === "z2" && ride && !q) ? "on" : ""}" data-kindset="${k}" data-date="${x.date}">${l}</button>`).join("")}</div></div>
      <div class="tp-g"><span class="tp-k">Sport</span><div class="sw-sport" data-date="${x.date}">${[["ride", ic("kolo"), "Kolo"], ["run", ic("beh"), "Běh"], ["xc_ski", ic("bezky"), "Běžky"], ["walk", ic("chuze"), "Chůze"]].map(([k, i, l]) => `<button class="${ride && x.sport === k ? "on" : ""}" data-sport="${k}" title="${l}">${i}</button>`).join("")}</div></div>
      ${ride && x.sport === "ride" ? `<div class="tp-g"><span class="tp-k">Kde</span><div class="seg sm">${[["auto", "Podle trenéra", null], ["out", "Venku", false], ["in", "Trenažér", true]].map(([k, l, v]) => `<button class="${(x.indoorChoice ?? null) === v ? "on" : ""}" data-indoor="${x.date}" data-v="${k}" title="${k === "in" ? "Na trenažéru se šlape pořád – stejná zátěž za kratší čas" : k === "auto" ? "Trenažér při špatném počasí a u kvality v zimě" : "Venku"}">${l}</button>`).join("")}</div></div>` : ""}
      ${ride && !x.own ? `<div class="tp-g"><span class="tp-k">Délka</span><div class="tp-len"><button class="btn sm" data-len="${x.date}" data-v="${Math.max(20, (x.durationMin || 60) - 15)}">−15 min</button><b class="num">${dur((x.durationMin || 0) * 60)}</b><button class="btn sm" data-len="${x.date}" data-v="${(x.durationMin || 60) + 15}">+15 min</button></div></div>` : ""}
      ${ownForm(x)}
      ${ride && x.workout ? workoutSvg(x.workout, d.ftp, q ? edIdx(x.workout) : null) : ""}
      ${ride && x.workout ? `<div class="btns"><a class="btn sm" href="/api/plan/fit?date=${x.date}" download="${x.date}-workout.fit">${ic("stahnout")} FIT soubor</a><span class="note">bez intervals.icu: nahraj kabelem do složky Garmin/NewFiles</span></div>` : ""}
      ${stepEditor(x, mine)}
      ${x.steps && x.steps.length ? `<details class="stepsd"><summary>Kroky tréninku (${x.steps.length})</summary><ol class="steps">${x.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></details>` : ""}
      ${carbsHtml(x)}
      ${x.note ? `<p class="note">${esc(x.note)}</p>` : ""}`;
  };
  const dayRow = (x) => {
    const ride = !!x.name;
    const q = x.kind === "quality";
    const tags = [x.own ? '<span class="ttag">vlastní jízda</span>' : ""].join("");
    const w = x.weather;
    const wtxt = w ? `${weatherIcon(w)} ${num(w.tmax)}°${w.window && ride && !x.indoor && x.sport === "ride" ? ` · okno ${String(w.window.from).padStart(2, "0")}–${String(w.window.to).padStart(2, "0")} h` : ""}${x.indoor ? " · trenažér" : ""}` : "";
    const open = tOpen === x.date;
    const panel = open && !x.isPast && x.kind !== "blocked" ? `<div class="tpanel">${panelHtml(x)}</div>` : "";
    return `<div class="tday ${x.isToday ? "today" : ""} ${ride ? "" : "rest"} ${q ? "q" : ""} ${open ? "open" : ""}" data-day="${x.date}" ${ride ? 'draggable="true"' : ""}>
      <div class="td-row"><span class="td-date"><b>${DAYS[dow(x.date) - 1]}</b> ${dm(x.date)}${q ? '<span class="ttag q">kvalita</span>' : ""}</span>
      <span class="td-main">${ride ? `<span class="td-ico">${tSportIco(x.sport)}</span>` : ""}<span class="td-t"><b>${esc(x.name || (x.kind === "blocked" ? x.tag : "Volno"))}</b>${tags}${x.targetText && ride ? `<small>${esc(x.targetText)}</small>` : ""}</span></span>
      <span class="td-n num">${ride ? `${dur((x.durationMin || 0) * 60)}<small>zátěž ${num(x.load)}</small>${x.targetText ? `<small class="td-tg">${esc(String(x.targetText).replace(/\s*\(.*$/, ""))}</small>` : ""}` : ""}</span>
      <span class="td-w">${wtxt}</span>
      ${x.kind === "blocked" ? "<span></span>" : `<button class="td-btn ${ride ? "" : "add"}" data-open="${x.date}" aria-expanded="${open}" title="${ride ? "Upravit" : "Přidat trénink"}">${open ? "Zavřít" : ride ? "Upravit" : "Přidat"}</button>`}</div>${!open && ride ? `<div class="tpeek">${x.workout ? workoutSvg(x.workout, d.ftp) : ""}${x.steps && x.steps.length ? `<ol class="steps">${x.steps.map((st) => `<li>${esc(st)}</li>`).join("")}</ol>` : `<p class="sub">${esc(x.targetText || "Kroky tréninku nemám.")}</p>`}${carbsHtml(x)}${x.why && x.why.length ? `<p class="note">${esc(x.why.join(" · "))}</p>` : ""}</div>` : ""}${panel}</div>`;
  };
  // detail dne z kalendáře (pod jeho týdnem)
  const ccX = ccOpen ? dayAt(ccOpen) : null;
  if (ccOpen && (!ccX || ccX.kind === "blocked")) ccOpen = null;
  // klik = popis tréninku (rozpis úseků, graf průběhu); úpravy až po „Upravit“
  const ccView = (x) => {
    if (!x.name) return `<p class="sub">Volný den.</p><div class="btns"><button type="button" class="btn sm" data-ccedit>＋ Přidat trénink</button></div>`;
    const why = x.note || (x.why || []).map((s) => s[0].toUpperCase() + s.slice(1)).join(". ");
    return `${x.targetText ? `<p class="cc-tg">${esc(x.targetText)}</p>` : ""}
      ${x.workout ? workoutSvg(x.workout, d.ftp) : ""}
      ${x.steps && x.steps.length ? `<ol class="steps">${x.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : x.workout ? "" : `<p class="sub">Rozpis tréninku zatím nemám.</p>`}
      ${carbsHtml(x)}
      ${why ? `<p class="note">${esc(why)}</p>` : ""}
      ${x.orient ? `<p class="note">Orientační náhled – konkrétní kvalitu, délky a watty trenér upřesní 2 týdny předem podle kondice, únavy a počasí.</p>` : ""}
      <div class="btns"><button type="button" class="btn sm pri" data-ccedit>${ic("upravit")} Upravit</button>${x.workout ? `<a class="btn sm" href="/api/plan/fit?date=${x.date}" download="${x.date}-workout.fit">${ic("stahnout")} FIT soubor</a>` : ""}</div>`;
  };
  const ccDetail = ccOpen ? `<div class="cc-det" id="ccDet"><div class="cc-dh"><div><b>${dayDm(ccX.date)}</b> · ${esc(ccX.name || "Volno")}${ccX.orient ? ' <span class="ttag">orientačně</span>' : ""}
      ${ccX.name ? `<div class="sub">${tSportIco(ccX.sport)} ${dur((ccX.durationMin || 0) * 60)} · zátěž ${num(ccX.load)}</div>` : ""}</div>
      <div class="btns cc-dbt">${ccEdit ? '<button type="button" class="btn sm" data-ccview>Hotovo</button>' : ""}<button type="button" class="btn sm" data-ccclose aria-label="Zavřít">✕</button></div></div>
      ${ccEdit ? `<div class="tpanel">${panelHtml(ccX)}</div>` : `<div class="cc-view">${ccView(ccX)}</div>`}</div>` : "";
  const RS = { done: [ic("odjeto"), "splněno", "good"], partial: [ic("castecne"), "částečně", "warn"], missed: [ic("vynechano"), "vynecháno", "bad"], skipped: [ic("pauza"), "volno (tvoje volba)", ""], extra: [ic("navic"), "navíc mimo plán", ""] };
  const nPlan = rc.filter((x) => x.plan && x.status !== "skipped").length, nOk = rc.filter((x) => x.status === "done").length;
  const recentRows = rc.map((x) => { const [ic, lab, tn] = RS[x.status] || ["•", x.status, ""]; return `<div class="tr-row"><span class="tr-d"><b>${DAYS[dow(x.date) - 1]}</b> ${dm(x.date)}</span><span class="tr-m"><span class="tr-p">${x.plan ? `plán: ${esc(x.plan.name)}${x.plan.min ? ` · ${dur(x.plan.min * 60)}` : ""}${x.plan.load ? ` · zátěž ${num(x.plan.load)}` : ""}` : "bez plánu"}</span>${x.acts.length ? x.acts.map((a) => `<a href="#/aktivita/${a.id}" class="tr-a">${SPORT_ICON[a.sport] || ic("ostatni")} ${esc(a.name || SPORT_NAME[a.sport] || "")} · ${hUt(a.moving_s)} · zátěž ${num(a.load)}</a>`).join("") : `<span class="sub">nic odjeto</span>`}</span><span class="tr-s ${tn}">${ic} ${lab}${x.compliance != null ? `<small>${x.compliance} %</small>` : ""}</span></div>`; }).join("");
  // nedělní vyhodnocení plnění minulého týdne + historie verzí plánu (proč se plán změnil)
  const adh = co && co.adherence;
  const adhLine = adh ? `<p class="tproj">Minulý týden (${dm(adh.weekStart)}–${dm(addDay(adh.weekStart, 6))}): odjeto <b>${adh.trained} z ${adh.planned}</b> tréninků${adh.pct != null ? ` (${adh.pct} %)` : ""}, zátěž ${adh.loadDone} z ${adh.loadPlanned} → ${adh.factor < 1 ? `<b class="warn">tento týden o ${Math.round((1 - adh.factor) * 100)} % lehčí</b>` : "plán beze změny"}.</p>` : "";
  const histCard = co ? card("t-hist", (ic("historie") + " Plnění a změny plánu"), "verze", `${adhLine}<details class="thist" id="tHist"><summary>Historie změn plánu (proč se plán změnil)</summary><div class="th-list">Načítám…</div></details>`, 'data-tt="proc"') : "";
  const recentCard = rc.length ? card("t-recent", `Posledních ${rc.length} tréninků`, nPlan ? `splněno ${nOk} z ${nPlan}` : "bez plánu", `<details class="trecent2"><summary>${nPlan ? `Splněno <b>${nOk} z ${nPlan}</b> plánovaných` : "Žádný z nich nebyl v plánu"} · zobrazit</summary><div class="tr-list">${recentRows}</div><p class="note">Splněno = intervals.icu hlásí splnění aspoň 80 % (nebo zátěž 80–125 % plánu, když workout nebyl spárovaný).</p></details>`, 'data-tt="proc"') : "";
  // --- změny čekají: plovoucí lišta nad spodní lištou (jen když něco čeká) ---
  const prop = d.proposal;
  const nItems = prop && prop.items.length ? prop.items.length : 0;
  const pendBar = nItems ? `<div class="tpendbar" data-tt="tyden"><details><summary><b>${nItems} ${nItems === 1 ? "změna čeká" : nItems < 5 ? "změny čekají" : "změn čeká"}</b> na zápis <span class="sub">· co se změní</span></summary><div class="tp-list2">${prop.items.map((c) => `<div class="tp-ch"><b>${dayDm(c.date)}</b> ${esc(c.action)} – ${esc(c.name)}${c.why ? `<small>${esc(c.why)}</small>` : ""}</div>`).join("")}</div></details><button class="btn pri" id="applyAll">Zapsat</button><p class="note" id="applyMsg"></p></div>` : "";
  // --- ⋯ u plánu: přepočítat, vrátit úpravy, AI návrh týdne (+ poslední odpověď AI) ---
  let hist = []; try { hist = JSON.parse(localStorage.getItem(COACH_KEY) || "[]"); } catch {}
  const lastAiIdx = hist.map((m) => m.role === "user" && /AI návrh týdne/.test(m.text)).lastIndexOf(true);
  const lastAi = lastAiIdx >= 0 ? hist[lastAiIdx + 1] : null;
  const more = `<details class="tmore"${tMoreOpen ? " open" : ""}><summary aria-label="Další akce s plánem">⋯</summary><div class="tmore-in">
    <div class="btns"><button class="btn sm" id="newProp">↻ Přepočítat</button>${mine.length ? `<button class="btn sm" id="resetMine">${ic("zpet")} Vrátit moje úpravy</button>` : ""}</div>
    ${co ? "" : `<form class="aiweek" id="aiWeek"><input name="t" placeholder="Pokyn pro AI (nepovinné) – např. víc objemu o víkendu" autocomplete="off"><button class="btn" type="submit">${ic("ai")} AI návrh týdne</button></form>`}
    ${lastAi && !co ? `<div class="aiw-res"><p>${esc(lastAi.text)}</p>${lastAi.applied && lastAi.applied.length ? `<small class="sub">${lastAi.applied.map(esc).join(" · ")}</small>` : ""}</div>` : ""}
    ${!nItems ? `<p class="note">✓ Kalendář odpovídá plánu.</p>` : ""}</div></details>`;
  const planCard = card("c12 t-plan", `${ic("kalendar")} Plán ${dm(p.from)}–${dm(p.to)}`, "", `${more}${coLine}<div class="tdays">${p.days.map(dayRow).join("")}</div>${p.warnings.length ? `<ul class="alerts">${p.warnings.map((w) => `<li>${ic("varovani")} ${esc(w)}</li>`).join("")}</ul>` : ""}<p class="note">Úpravy: tlačítko „Upravit“ u dne${matchMedia("(pointer: fine)").matches ? " nebo přetáhni trénink myší na jiný den" : ""}. Plán se hned přepočítá, do intervals.icu se zapíše až po potvrzení.</p>`, 'data-tt="tyden"');
  // --- z čeho trenér vychází ---
  const form = f.form, goalUp = d.goal === "zvyseni" || d.goal === "zavod";
  const why = form == null ? "Formu zatím neznám." : form < -30 ? `Jsi hodně unavený (forma ${signed(form, 1)}) → týden výrazně lehčí, víc volna.` : form < -20 ? `Únava je vysoká (forma ${signed(form, 1)}) → týden lehčí.` : form > 15 && goalUp ? `Jsi odpočatý (forma ${signed(form, 1)})${f.ramp != null && f.ramp < 0 ? " a kondice klesá" : ""} → přidávám zátěž.` : form > 15 ? `Jsi odpočatý (forma ${signed(form, 1)}) – při cíli ${esc(d.goalLabel || "")} držím zátěž.` : `Forma ${signed(form, 1)} je v tréninkovém pásmu → plán drží zátěž.`;
  const qn = p.days.filter((x) => x.kind === "quality").length;
  const dist = co && co.distribution;
  const whyTxt = co ? `Cíl týdne se počítá z kondice (${num(f.ctl, 0)} → na udržení ${co.keepLoad} zátěže týdně) a fáze ${esc(co.phaseLabel)} (${co.ramp > 0 ? "+" : ""}${num(co.ramp, 1)} bodu týdně). Strop je +30 % proti průměru posledních 4 týdnů (${co.recentLoad}), ať se nepřidává skokem. Když týden odjedeš, kondice bude kolem ${num(co.ctlTarget, 1)}. Co vynecháš, se nedohání.${form != null && form < -20 ? ` Únava je vysoká (forma ${signed(form, 1)}), proto je týden lehčí.` : ""}` : null;
  // kolo (watty) a běh (tep) zvlášť – zóny různých sportů nejsou totéž, celek je jen orientační
  const sportDist = (s, label) => (s ? `${label} lehce ${s.low} % · středně ${s.mid} % · intenzivně ${s.high} % (${num(s.hours, 1)} h, ${s.method === "power" ? "watty" : s.method === "hr" ? "tep" : "watty i tep"})` : "");
  const split = dist && dist.ride && dist.run ? ` Zvlášť: ${sportDist(dist.ride, "kolo")}; ${sportDist(dist.run, "běh")}.` : "";
  const distTxt = co ? `<p class="tproj">${dist ? `Posledních ${dist.days} dní: lehce <b>${dist.low} %</b> · středně ${dist.mid} % · intenzivně ${dist.high} % času (${num(dist.hours, 1)} h v zónách).${split}` : "Rozdělení intenzity zatím nemám (málo dat o čase v zónách)."} V plánu tohoto týdne je nad Z2 ${co.plannedHard} % času.</p>` : "";
  const rulesTxt = co
    ? "Zátěž týdne = 7 × kondice + 45,6 × růst podle fáze (zimní pokles −1, udržování 0, základ +1, rozvoj +1,5 až +3 body týdně). Strop: nejvýš +30 % proti průměru posledních 4 týdnů. Délky jízd vycházejí ze zátěže a mají strop podle toho, co poslední měsíc jezdíš (nejdelší Z2 týdne nejvýš o 15 % delší než tvoje nejdelší jízda). Forma nesmí v plánu spadnout pod −20 (v rozvoji −30). Pořadí důležitosti je kvalita, nejdelší Z2 týdne, pak ostatní Z2: když týden vyjde jen na dva tréninky, zůstanou ty důležité. Kvality se střídají (práh, sweet spot, tempo, over-under, VO2, krátké VO2, anaerobní, sprinty) a vybírají se z knihovny tak, aby se neopakovaly; po zvládnuté kvalitě je další o stupeň těžší. Pravidla: nejvýš 3 tréninky za sebou, kvalita nikdy den po kvalitě ani po nejdelší Z2 týdne, nad Z2 nejvýš pětina času. Ráno podle zotavení: žluté → kvalita se přesune, červené → volno nebo Z1. Vynechaná kvalita se sama posune na další vhodný den, vynechaná Z2 propadne. Když trénink přetáhneš jinam, zbytek týdne se přeskládá. Plán je uložený – mění se jen, když se změní zotavení, počasí, odjeté tréninky nebo tvoje úpravy."
    : "Týdenní zátěž z kondice a cíle (max. +30 % proti běžnému týdnu). Forma pod −20 → týden o 12 % lehčí, pod −30 o 25 %. Kvalita 1× (zima) / 2× (sezóna) týdně, nikdy dva dny po sobě; když týden zaplní tvoje volby, dá se na kolový den. Ráno podle zotavení: žluté → kvalita na Z2 nebo zkrácení, červené → volno / Z1. Tvoje úpravy (přesun, délka, sport, vlastní jízda) mají přednost, zbytek týdne se dopočítá.";
  // odhad: kondice (CTL, 42 dní) a únava (ATL, 7 dní) za 7 dní, když odjedeš plán
  const sunday = addDay(r.date, 7 - dow(r.date));
  const endDay = dow(r.date) >= 6 ? addDay(sunday, 7) : sunday; // v so / ne výhled do konce příštího týdne
  const fut = (p.chart || []).filter((c) => c.planned && !c.today && c.date <= endDay);
  const todayLoad = (p.chart || []).find((c) => c.today)?.load ?? 0;
  let ctl7 = f.ctl, atl7 = f.atl;
  const plan7 = fut.reduce((tt, c) => tt + (c.load || 0), 0);
  if (ctl7 != null && atl7 != null) for (const ld of [todayLoad, ...fut.map((c) => c.load || 0)]) { ctl7 += (ld - ctl7) / 42; atl7 += (ld - atl7) / 7; }
  const lastDay = fut.length ? fut[fut.length - 1].date : null;
  const proj = ctl7 != null && lastDay ? `<p class="tproj">Když odjedeš plán do neděle (zátěž ${thou(plan7 + todayLoad)} od dneška): kondice <b>${num(f.ctl, 1)} → ${num(ctl7, 1)}</b> (${signed(ctl7 - f.ctl, 1)}), forma <b>${signed(ctl7 - atl7, 0)}</b>.</p>` : "";
  const v3 = co && co.version === 3;
  const stateCard = card("t-state", "Z čeho trenér vychází", "intervals.icu · Garmin", v3 ? why3(d, co, p, f) + `
    <div class="tstate">
      <div><span>Kondice (CTL)</span><b class="num">${num(f.ctl, 1)}</b><small class="${f.ramp != null && f.ramp < -1 ? "warn" : ""}">${f.ramp != null ? `${signed(f.ramp, 1)} za týden` : ""}</small></div>
      <div><span>Únava (ATL)</span><b class="num">${num(f.atl, 1)}</b><small>zátěž 7 dní ${thou(f.load7)}</small></div>
      <div><span>Forma (TSB)</span><b class="num">${signed(form, 1)}</b><small class="${form == null ? "" : form < -20 || form > 20 ? "warn" : "good"}">${esc(formZoneName(form))}</small></div>
      <div><span>Zotavení</span><b class="tst-word ${tone}">${rec.score != null ? `${num(rec.score)} %` : esc(({ green: "Dobré", yellow: "Částečné", red: "Nízké" })[rec.state] || rec.stateLabel)}</b></div></div>
    <div class="sl" style="margin-top:12px">Výhled kondice · 4 týdny</div><div id="tKond" class="loading sm">Načítám…</div>
    <details class="gcmp"><summary>Pravidla trenéra a zdroje</summary>${RULES3}</details>` : `<div class="twhy"><b>Jak je týden postavený</b><p>${whyTxt || why} Cíl zátěže ${p.weeklyTarget.lo}–${p.weeklyTarget.hi}, ${qn ? `${qn}× kvalita` : "bez kvality"}, ${p.days.filter((x) => x.name).length} tréninků.</p>${proj}${distTxt}</div>
    <div class="tstate">
      <div><span>Kondice (CTL)</span><b class="num">${num(f.ctl, 1)}</b><small class="${f.ramp != null && f.ramp < -1 ? "warn" : ""}">${f.ramp != null ? `${signed(f.ramp, 1)} za týden` : ""}</small></div>
      <div><span>Únava (ATL)</span><b class="num">${num(f.atl, 1)}</b><small>zátěž 7 dní ${thou(f.load7)}</small></div>
      <div><span>Forma (TSB)</span><b class="num">${signed(form, 1)}</b><small class="${form == null ? "" : form < -20 || form > 20 ? "warn" : "good"}">${esc(formZoneName(form))}</small></div>
      <div><span>Zotavení</span><b class="tst-word ${tone}">${rec.score != null ? `${num(rec.score)} %` : esc(({ green: "Dobré", yellow: "Částečné", red: "Nízké" })[rec.state] || rec.stateLabel)}</b></div></div>${(d.insights || []).length ? `<div class="insights">${d.insights.map((i) => verdict(i.tone, i.text)).join("")}</div>` : ""}
    <div class="sl" style="margin-top:12px">Výhled kondice · 4 týdny</div><div id="tKond" class="loading sm">Načítám…</div>
    <details class="gcmp"><summary>Pravidla trenéra</summary><p class="note">${rulesTxt}</p></details>`, 'data-tt="proc"');
  // --- chat (na mobilu schovaný – stejné umí tlačítko AI v hlavičce) ---
  const chatCard = card("t-chat", (ic("chat") + " Řekni trenérovi"), "AI · úpravy plánu", `<div class="tmsgs">${hist.length ? hist.slice(-6).map((m) => `<div class="msg ${m.role}"><p>${esc(m.text)}</p>${m.applied && m.applied.length ? `<small class="sub">${m.applied.map(esc).join(" · ")}</small>` : ""}</div>`).join("") : '<div class="empty">Napiš, co se mění – trenér upraví plán (např. „ve středu nestihnu, přesuň kvalitu na čtvrtek“).</div>'}</div>
    <div class="sugg">${["Ve středu nestihnu, přesuň kvalitu na čtvrtek", "Tento týden mám jen 4 hodiny", "Jsem unavený", "V sobotu jedu 4 h s kamarádem"].map((s) => `<button class="btn sm" data-ask="${esc(s)}">${esc(s)}</button>`).join("")}</div>
    <form class="chatform" id="askF"><textarea rows="1" placeholder="Napiš trenérovi…"></textarea><button class="btn pri" type="submit">➤</button></form>${hist.length ? '<button class="btn sm" id="askClr" style="margin-top:6px">Smazat rozhovor</button>' : ""}`, 'data-tt="chat"');
  // --- cíl, počasí, zátěž po týdnech, intenzita ---
  const cur2 = d.goals.find((g) => g.key === d.goal);
  const goalCard = card("t-goal", (ic("cil") + " Cíl tréninku"), "", `<div class="seg">${d.goals.map((g) => `<button class="${d.goal === g.key ? "on" : ""}" data-goal="${g.key}">${esc(g.label)}</button>`).join("")}</div><p class="gtext">${esc(cur2 ? cur2.text : "")}</p>${proj}<p class="note" id="goalMsg"></p>${coLine}<p class="note">${co ? 'Hlavní sport a další sporty nastavíš v <a href="#/nastaveni">Nastavení → Trenér</a>. Dny ani hodiny se nenastavují – trénink přetáhni, kam se ti hodí.' : 'Počet tréninků plán volí sám podle cíle a zátěže týdne. Teplotní hranice pro jízdu venku změníš v <a href="#/nastaveni">Nastavení</a>.'}</p><div class="btns"><button class="btn sm" id="coachOff">Vypnout trenéra</button><span class="note">jezdíš podle sebe bez plánu (třeba v zimě), trenér jen hlídá zátěž na udržení</span></div>`, 'data-tt="cil"');
  const weatherCard = card("c12 t-weather", (ic("pocasi") + " Počasí na trénink · 7 dní"), "Open-Meteo", weatherList(p.days.map((x) => ({ label: x.isToday ? "Dnes" : dayDm(x.date), w: x.weather })).filter((x) => x.w)) + `<p style="margin-top:10px"><a class="btn sm" href="#/pocasi">Počasí po hodinách →</a></p>`, 'id="pocasi" data-tt="pocasi"');
  const loadsCard = card("t-loads", (ic("kondice") + " Zátěž po týdnech"), "TSS / HRSS", weekLoadsHtml(d.weeks), 'data-tt="proc"');
  const intens = d.hasPower === false ? "" : card("t-int", "Průvodce intenzitou", "FTP", `<details><summary>Watty pro jednotlivé jednotky (FTP ${d.intensity.ftp} W)</summary><table class="t"><tr><th>Jednotka</th><th class="r">% FTP</th><th class="r">Watty</th></tr>${d.intensity.targets.map((x) => `<tr><td>${esc(x.name)}</td><td class="r">${x.pct[0]}–${x.pct[1]} %</td><td class="r">${x.w[0]}–${x.w[1]} W</td></tr>`).join("")}</table></details>`, 'data-tt="cil"');
  const helpCard = card("t-help", (ic("kniha") + " Jak s trenérem pracovat"), "nápověda", COACH_HELP, 'data-tt="cil"');
  const TABS = [["tyden", "Týden"], ["proc", "Stav"], ["pocasi", "Počasí"], ["cil", "Cíl"]];
  el.innerHTML = `<div class="head"><div><h1>Trenér</h1><div class="sub">cíl ${esc(d.goalLabel || "")}</div></div></div>
  <div class="ioseg ttabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" data-ttab="${k}" class="${tTab === k ? "on" : ""}" aria-selected="${tTab === k}">${l}</button>`).join("")}</div>
  <div class="grid tgrid">
    <div class="c7 col tcol">${todayCard}${weekCard}${coachCalendar(d, co, ccOpen, ccDetail)}${planCard}</div>
    <div class="c5 col tcol">${stateCard}${recentCard}${histCard}${chatCard}${goalCard}${loadsCard}${intens}${helpCard}</div>
    ${weatherCard}
  </div>${pendBar}`;
  el.querySelector("#coachOff")?.addEventListener("click", (e) => setCoachOn(el, false, e.currentTarget));
  // záložky (jen na mobilu – na počítači je vidět vše)
  const showTab = (k) => { tTab = k; try { localStorage.setItem("tTab", k); } catch {} el.querySelectorAll("[data-ttab]").forEach((b) => { b.classList.toggle("on", b.dataset.ttab === k); b.setAttribute("aria-selected", b.dataset.ttab === k); }); el.querySelectorAll("[data-tt]").forEach((c) => c.classList.toggle("tt-off", c.dataset.tt !== k)); };
  showTab(tTab);
  el.querySelectorAll("[data-ttab]").forEach((b) => b.addEventListener("click", () => { showTab(b.dataset.ttab); scrollTo(0, 0); fitCells(el); }));
  el.querySelector(".tmore")?.addEventListener("toggle", (e) => { tMoreOpen = e.currentTarget.open; });
  // proužek: výchozí poloha = tento týden
  { const sc = el.querySelector("#tStrip"), cw = sc?.querySelector('[data-wk="0"]'); if (sc && cw) requestAnimationFrame(() => { sc.scrollLeft = cw.offsetLeft - sc.offsetLeft; }); }
  el.querySelectorAll(".tday .td-row").forEach((row) => row.addEventListener("click", (e) => { if (e.target.closest("button, a, select, input")) return; const tr = row.closest(".tday"); if (!tr.querySelector(".tpeek")) return; const on = !tr.classList.contains("peek"); el.querySelectorAll(".tday.peek").forEach((x) => x.classList.remove("peek")); tr.classList.toggle("peek", on); }));
  el.querySelectorAll("[data-peek]").forEach((b) => b.addEventListener("click", () => { const row = el.querySelector(`.tday[data-day="${b.dataset.peek}"]`); if (!row) return; const on = !row.classList.contains("peek"); el.querySelectorAll(".tday.peek").forEach((x) => x.classList.remove("peek")); row.classList.toggle("peek", on); row.scrollIntoView({ behavior: "smooth", block: "center" }); }));
  bindHours(el);
  // 90 dní kondice (CTL), únavy (ATL) a formy + čárkovaně výhled podle plánu
  api("fitness").then((fd) => {
    const box = el.querySelector("#tKond"); if (!box) return;
    // jen výhled: od dneška 4 týdny dopředu, stejně daleko jako plán (historie je na stránce Kondice)
    const m = fd.metrics || [], pr = fd.projection || [];
    if (!m.length) { box.outerHTML = '<div class="empty">Kondici zatím nemám.</div>'; return; }
    const now = m[m.length - 1], pts = [now, ...pr];
    box.classList.remove("loading", "sm");
    box.innerHTML = lineChart({ x: pts.map((q) => q.date), xfmt: dm, height: 190, markIndex: 0, series: [
      { name: "Kondice (CTL)", values: pts.map((q) => q.ctl), color: "var(--z2)", width: 2.6, area: true },
      { name: "Únava (ATL)", values: pts.map((q) => q.atl), color: "var(--z7)", width: 1.6 },
      { name: "Forma (TSB)", values: pts.map((q) => q.form), color: "var(--fg)", width: 1.4, opacity: 0.55 },
    ] }) + `<p class="note">Výhled od dneška na ${Math.round(pr.length / 7)} týdnů, když odjedeš plán trenéra: kondice ${num(now.ctl, 1)} → <b>${num(pts[pts.length - 1].ctl, 1)}</b>. Historie je na stránce <a href="#/kondice">Kondice</a>.</p>`;
  }).catch(() => el.querySelector("#tKond")?.remove());
  const keepScroll = async () => { const y = scrollY; cache.clear(); await route(); requestAnimationFrame(() => scrollTo(0, y)); };
  const post = async (path, body, msgEl) => { try { await api(path, { method: "POST", body: JSON.stringify(body) }); await keepScroll(); } catch (e) { if (msgEl) msgEl.textContent = e.message; else alert(e.message); } };
  el.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => { tOpen = tOpen === b.dataset.open ? null : b.dataset.open; pageTrener(el).then(() => el.querySelector(`[data-day="${tOpen}"]`)?.scrollIntoView({ block: "nearest" })); }));
  el.querySelectorAll("[data-shift]").forEach((s) => s.addEventListener("change", () => { if (s.value) { tOpen = null; if (ccOpen === s.dataset.shift) ccOpen = s.value; post("plan/shift", { from: s.dataset.shift, to: s.value }); } }));
  el.querySelectorAll("[data-kindset]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.kindset, date = b.dataset.date;
    if (k === "rest") post("plan/sport", { dates: [date], sport: "rest" });
    else { const x = dayAt(date); (async () => { if (!x?.name) await api("plan/sport", { method: "POST", body: JSON.stringify({ dates: [date], sport: "ride" }) }); await post("plan/day", { date, type: k }); })(); }
  }));
  el.querySelectorAll(".tpanel .sw-sport button").forEach((b) => b.addEventListener("click", () => post("plan/sport", { dates: [b.parentElement.dataset.date], sport: b.dataset.sport })));
  el.querySelectorAll("[data-len]").forEach((b) => b.addEventListener("click", () => post("plan/len", { date: b.dataset.len, min: +b.dataset.v })));
  el.querySelectorAll("[data-indoor]").forEach((b) => b.addEventListener("click", () => post("plan/indoor", { date: b.dataset.indoor, indoor: b.dataset.v === "in" ? true : b.dataset.v === "out" ? false : null })));
  // kalendář: klik na kterýkoli budoucí den (4 týdny) otevře jeho úpravu pod týdnem; druhý klik zavře
  const ccRender = () => pageTrener(el).then(() => el.querySelector("#ccDet")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  el.querySelectorAll("[data-ccday]").forEach((b) => b.addEventListener("click", () => {
    ccOpen = ccOpen === b.dataset.ccday ? null : b.dataset.ccday;
    ccEdit = false;
    tOpen = null;
    ccRender();
  }));
  el.querySelector("[data-ccclose]")?.addEventListener("click", () => { ccOpen = null; ccEdit = false; pageTrener(el); });
  el.querySelector("[data-ccedit]")?.addEventListener("click", () => { ccEdit = true; ccRender(); });
  el.querySelector("[data-ccview]")?.addEventListener("click", () => { ccEdit = false; ccRender(); });
  el.querySelector(".cc-past")?.addEventListener("toggle", (e) => { ccPastOpen = e.currentTarget.open; });
  // historie verzí plánu: načíst až po rozbalení
  el.querySelector("#tHist")?.addEventListener("toggle", async (e) => {
    const box = e.currentTarget.querySelector(".th-list");
    if (!e.currentTarget.open || box.dataset.ok) return;
    try {
      const vs = await api("plan/versions");
      box.dataset.ok = "1";
      box.innerHTML = vs.length ? vs.map((v) => `<div class="th-v"><span class="sub">${esc(new Date(v.at).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }))}</span><b>${esc(v.reason)}</b>${v.changes.length ? `<ul>${v.changes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</div>`).join("") : `<p class="sub">Zatím žádná uložená verze – první se uloží při příštím přepočtu plánu.</p>`;
    } catch (err) { box.textContent = `Nepodařilo se načíst: ${err.message}`; }
  });
  el.querySelectorAll(".stepf").forEach((f2) => f2.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(f2);
    post("plan/steps", { date: f2.dataset.date, ...(fd.get("reps") ? { reps: +fd.get("reps") } : {}), work_s: Math.round(+fd.get("work") * 60), pct: +fd.get("pct") });
  }));
  el.querySelectorAll("[data-stepreset]").forEach((b) => b.addEventListener("click", () => post("plan/steps", { date: b.dataset.stepreset, reset: true })));
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
    const btn = e.currentTarget; // po await už currentTarget neplatí
    btn.disabled = true;
    const msg = el.querySelector("#applyMsg");
    msg.textContent = "Zapisuji do kalendáře a intervals.icu…";
    try { const res = await api(`proposal/${prop.id}/apply`, { method: "POST", body: JSON.stringify({ codes: prop.items.map((c) => c.code) }) }); msg.textContent = [...res.lines, res.verify].join(" · "); setTimeout(keepScroll, 1500); }
    catch (err) { msg.textContent = err.message; btn.disabled = false; }
  });
  el.querySelector("#resetMine")?.addEventListener("click", () => { if (confirm("Vrátit všechny tvoje úpravy plánu (přesuny, délky, sporty, vlastní jízdy)?")) post("plan/reset", {}); });
  el.querySelector("#newProp")?.addEventListener("click", () => post("plan/propose", {}));
  el.querySelectorAll("[data-undo]").forEach((b) => b.addEventListener("click", async () => { b.disabled = true; try { await api("constraint", { method: "DELETE", body: JSON.stringify({ date: b.dataset.undo, kind: b.dataset.kind }) }); keepScroll(); } catch (err) { fail(err, b); } }));
  el.querySelectorAll("[data-skip]").forEach((b) => b.addEventListener("click", async () => { b.disabled = true; try { await api("constraint", { method: "POST", body: JSON.stringify({ date: b.dataset.skip, kind: "nepojedu", note: "dashboard" }) }); await api("plan/propose", { method: "POST" }); keepScroll(); } catch (err) { fail(err, b); } }));
  el.querySelectorAll("[data-goal]").forEach((b) => b.addEventListener("click", async () => { if (b.classList.contains("on")) return; const gm = el.querySelector("#goalMsg"); gm.textContent = "Přepočítávám plán…"; try { await api("settings", { method: "POST", body: JSON.stringify({ goal: b.dataset.goal }) }); keepScroll(); } catch (err) { gm.textContent = `Nepovedlo se: ${err.message}`; } }));
  // AI trenér
  let asking = false;
  const ask = async (text) => {
    text = text.trim(); if (!text || asking) return;
    asking = true;
    el.querySelectorAll("#askF textarea, #askF button, [data-ask]").forEach((x) => (x.disabled = true));
    hist.push({ role: "user", text });
    const box = el.querySelector(".tmsgs"); box.insertAdjacentHTML("beforeend", `<div class="msg user"><p>${esc(text)}</p></div><div class="msg assistant"><span class="spin"></span></div>`);
    try {
      const res = await api("coach/ask", { method: "POST", body: JSON.stringify({ text }) });
      hist.push({ role: "assistant", text: res.reply, applied: res.applied });
    } catch (e) { hist.push({ role: "assistant", text: `Teď to nejde: ${e.message}` }); }
    try { localStorage.setItem(COACH_KEY, JSON.stringify(hist.slice(-20))); } catch {}
    asking = false;
    keepScroll();
  };
  // AI návrh týdne: AI složí týden, server ho zkontroluje a případně opraví, změny čekají na „Zapsat“
  el.querySelector("#aiWeek")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button"), t = e.target.querySelector("input").value.trim();
    btn.disabled = true; btn.innerHTML = "<span class=\"spin\"></span> AI skládá týden…";
    try {
      const res = await api("coach/ai-week", { method: "POST", body: JSON.stringify({ text: t }) });
      hist.push({ role: "user", text: `AI návrh týdne${t ? `: ${t}` : ""}` });
      hist.push({ role: "assistant", text: res.ok ? `${res.reply} (zátěž ${res.load}, cíl ${res.target.lo}–${res.target.hi}${res.model ? ` · navrhl ${String(res.model).replace(/^[a-z]+:/, "").split("/").pop()}` : ""}${res.attempts > 1 ? `, ${res.attempts}. pokus` : ""})` : res.reply, applied: [...(res.fixed || []).map((x) => `opraveno: ${x}`), ...(res.remaining || []).map((x) => `nejde: ${x}`)] });
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
const actRowHtml = (a) => `<a class="arow" href="#/aktivita/${a.id}"><span class="aico">${SPORT_ICON[a.sport] || ic("ostatni")}</span><span class="aname"><b>${esc(a.name || SPORT_NAME[a.sport])}</b><span class="sub">${dayDm(a.date)}${a.date.slice(0, 4) !== String(new Date().getFullYear()) ? a.date.slice(0, 4) : ""} · ${esc(SPORT_NAME[a.sport] || a.sport)}${a.company ? ` · ${ic("skupina")} ${esc(a.company === "skupina" ? "skupina" : a.company)}` : ""}${a.plan_name ? ` · plán ${a.icu_compliance ? `${num(a.icu_compliance)} %` : "✓"}` : a.is_quality ? " · kvalita" : ""}</span></span><span class="astats"><span class="am">${a.distance_m ? `<b>${num(a.distance_m / 1000, 1)}</b> km · ` : ""}<b>${hU(a.moving_s)[0]}</b> ${hU(a.moving_s)[1]}</span><span class="sub">${isBikeSport(a.sport) && (a.np || a.avg_power) ? `<b class="pw">${num(a.np || a.avg_power)} W</b> · ` : ""}${a.avg_hr ? `${num(a.avg_hr)} bpm · ` : ""}zátěž ${num(a.load)}</span></span></a>`;
let aktMonth = null; // vybraný měsíc v souhrnu „YYYY-MM“ (null = uplynulý měsíc)
/** sporty, které mají ve filtru a souhrnech jen skupinu „Ostatní“ (najdeš je vyhledáváním) */
const OTHER_SPORTS = ["skate", "padel", "strength", "mobility", "other"];
const SPORT_GROUP = (s) => (["ride", "mtb", "indoor"].includes(s) ? "kolo" : ["walk", "hike"].includes(s) ? "chuze" : OTHER_SPORTS.includes(s) ? "other" : s);
const GROUP_LOOK = { kolo: [ic("kolo"), "Kolo", "var(--z2)"], run: [ic("beh"), "Běh", "var(--acc)"], xc_ski: [ic("bezky"), "Běžky", "#4fa3d8"], chuze: [ic("turistika"), "Chůze a turistika", "var(--z4)"], other: [ic("ostatni"), "Ostatní", "var(--z1)"] };
const monthName = (m) => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
/** součty měsíce: celkem + po skupinách sportů */
/** filtr souhrnů měsíce a roku: "all" = všechny sporty, jinak skupina sportu (kolo, run, xc_ski…) */
let aktSum = "all";
const grpOf = (s) => (GROUP_LOOK[SPORT_GROUP(s)] ? SPORT_GROUP(s) : "other");
const grpName = (g) => (g === "all" ? "všechny sporty" : GROUP_LOOK[g][1].toLowerCase());
/** součty měsíce (jen vybraná skupina, "all" = vše) + rozpad po skupinách */
function monthTotals(mo, g = "all") {
  const t = { n: 0, s: 0, km: 0, up: 0, load: 0, groups: {} };
  for (const x of mo?.sports || []) {
    const gg = grpOf(x.sport);
    if (g !== "all" && gg !== g) continue;
    t.n += x.n; t.s += x.s; t.km += x.km; t.up += x.up; t.load += x.load;
    const q = (t.groups[gg] ||= { n: 0, s: 0, km: 0, up: 0 });
    q.n += x.n; q.s += x.s; q.km += x.km; q.up += x.up;
  }
  return t;
}
/** přepínač Vše / sporty nad souhrny (jen sporty, které v datech jsou) */
function sumChips(groups) {
  const order = Object.keys(GROUP_LOOK).filter((g) => groups.has(g));
  if (order.length < 2) return "";
  return `<div class="filters sumf" role="group" aria-label="Sport v souhrnu">${["all", ...order].map((g) => `<button type="button" class="${aktSum === g ? "on" : ""}" data-sum="${g}">${g === "all" ? "Vše" : `${GROUP_LOOK[g][0]} ${esc(GROUP_LOOK[g][1])}`}</button>`).join("")}</div>`;
}
const mDelta = (a, b, unit = "", dec = 0) => (b ? `<em class="${a >= b ? "up" : "down"}">${a >= b ? "▲" : "▼"} ${num(Math.abs(a - b), dec)}${unit}</em>` : "");
const selMonth = (md) => (aktMonth && md.months.some((m) => m.month === aktMonth) ? aktMonth : md.months[md.months.length - 2]?.month || md.today.slice(0, 7));
/** dlaždice souhrnu: hodnota včetně jednotky, popis, případně rozdíl proti minulému období */
const sumTile = (v, unit, label, d = "") => `<div><b>${v}${unit ? `<small> ${unit}</small>` : ""}</b><span>${label}</span>${d}</div>`;
function monthSummaryHtml(md) {
  const list = md.months;
  const cur = md.today.slice(0, 7);
  const sel = selMonth(md);
  const i = list.findIndex((m) => m.month === sel);
  const t = monthTotals(list[i], aktSum), p = monthTotals(list[i - 1], aktSum);
  const running = sel === cur;
  // dní měsíce (běžící měsíc jen do dneška) → průměr hodin týdně
  const days = running ? +md.today.slice(8, 10) : new Date(+sel.slice(0, 4), +sel.slice(5, 7), 0).getDate();
  const groups = Object.entries(t.groups).sort((a, b) => b[1].s - a[1].s);
  return `<div class="msum-nav"><button class="btn sm" data-mon="${list[i - 1]?.month || ""}" ${i > 0 ? "" : "disabled"} aria-label="předchozí měsíc">‹</button><label class="mpick" title="Vybrat měsíc a rok"><b>${monthName(sel)}${running ? " <small>(běží)</small>" : ""} <span class="caret">▾</span></b><select id="monPick" aria-label="Vybrat měsíc">${[...new Set(list.map((m) => m.month.slice(0, 4)))].reverse().map((y) => `<optgroup label="${y}">${list.filter((m) => m.month.startsWith(y)).reverse().map((m) => `<option value="${m.month}" ${m.month === sel ? "selected" : ""}>${MONTHS[+m.month.slice(5, 7) - 1]} ${y}</option>`).join("")}</optgroup>`).join("")}</select></label><button class="btn sm" data-mon="${list[i + 1]?.month || ""}" ${i < list.length - 1 ? "" : "disabled"} aria-label="další měsíc">›</button></div>
    ${t.n ? `<div class="mini-stats yr6 msum">${[
      sumTile(hmm(t.s), "h", "v pohybu", mDelta(t.s / 3600, p.s / 3600, " h", 1)),
      sumTile(thou(t.km), "km", "vzdálenost", mDelta(t.km, p.km, " km")),
      sumTile(thou(t.up), "m", "nastoupáno", mDelta(t.up, p.up, " m")),
      sumTile(thou(t.n), "", "aktivit", mDelta(t.n, p.n)),
      sumTile(thou(t.load), "", "zátěž (TSS)", mDelta(t.load, p.load)),
      sumTile(num(t.s / 3600 / (days / 7), 1), "h", "týdně (průměr)"),
    ].join("")}</div>
    ${aktSum === "all" && groups.length > 1 ? `<div class="sl" style="margin:14px 0 6px">Poměr sportů (podle času)</div>
    <div class="mratio">${groups.map(([g, q]) => `<i style="width:${((q.s / (t.s || 1)) * 100).toFixed(1)}%;background:${GROUP_LOOK[g][2]}" title="${esc(GROUP_LOOK[g][1])}"></i>`).join("")}</div>
    <div class="mrows">${groups.map(([g, q]) => `<button type="button" data-sum="${g}"><span class="mr-i">${GROUP_LOOK[g][0]}</span><span class="mr-n"><i style="background:${GROUP_LOOK[g][2]}"></i>${esc(GROUP_LOOK[g][1])}</span><span class="mr-v">${num((q.s / (t.s || 1)) * 100)} %</span><span class="mr-s">${hmm(q.s)} h${q.km >= 1 ? ` · ${thou(q.km)} km` : ""}${q.up >= 50 ? ` · ↑ ${thou(q.up)} m` : ""} · ${q.n}×</span></button>`).join("")}</div>` : ""}
    <p class="note">Šipky = rozdíl proti předchozímu měsíci${aktSum === "all" ? "" : ` (jen ${grpName(aktSum)})`}.</p>`
    : `<div class="empty">Za ${monthName(sel)} ${aktSum === "all" ? "žádná aktivita" : `nic (${grpName(aktSum)})`}.</div>`}`;
}
/** čísla měsíce pro AI (ze kterých má vycházet) */
function monthAiText(md) {
  const list = md.months, sel = selMonth(md);
  const i = list.findIndex((m) => m.month === sel);
  const f = (k) => { const t = monthTotals(list[k]); return `${monthName(list[k].month)}: ${t.n} aktivit, ${hmm(t.s)} h, kolo ${Math.round(monthTotals(list[k], "kolo").km)} km, celkem ${Math.round(t.km)} km, nastoupáno ${Math.round(t.up)} m, zátěž ${Math.round(t.load)}; ${Object.entries(t.groups).map(([g, q]) => `${GROUP_LOOK[g][1]} ${hmm(q.s)} h`).join(", ")}`; };
  return [`SOUHRN MĚSÍCE ${f(i)}`, i > 0 ? `PŘEDCHOZÍ MĚSÍC ${f(i - 1)}` : "", i >= 12 ? `STEJNÝ MĚSÍC LONI ${f(i - 12)}` : ""].filter(Boolean).join("\n");
}
function monthChartsHtml(md) {
  const l12 = md.months.slice(-12);
  const tot = l12.map((m) => monthTotals(m, aktSum));
  const order = Object.keys(GROUP_LOOK);
  const xf = (m) => MONTHS[+m.slice(5, 7) - 1].slice(0, 3);
  const kmCol = aktSum === "all" ? "var(--acc)" : GROUP_LOOK[aktSum][2];
  return `<div class="sl">Kilometry · ${grpName(aktSum)}</div>` + barChart({ x: l12.map((m) => m.month), xfmt: xf, bars: tot.map((t) => ({ v: Math.round(t.km), color: kmCol })), fmt: (v) => num(v) + " km", yfmt: (v) => num(v), height: 150, todayIndex: 11, tipFn: (i) => { const t = tot[i]; return `<b>${monthName(l12[i].month)}</b><div>${thou(t.km)} km · ↑ ${thou(t.up)} m · ${t.n} aktivit</div>`; } })
    + `<div class="sl" style="margin-top:12px">Hodiny · ${grpName(aktSum)}</div>` + barChart({ x: l12.map((m) => m.month), xfmt: xf, mode: "stack", bars: tot.map((t) => ({ parts: order.filter((g) => t.groups[g]).map((g) => ({ v: Math.round((t.groups[g].s / 3600) * 10) / 10, color: GROUP_LOOK[g][2] })) })), fmt: (v) => num(v, 1) + " h", yfmt: (v) => num(v) + " h", height: 150, todayIndex: 11, tipFn: (i) => { const t = tot[i]; return `<b>${monthName(l12[i].month)} · ${hmm(t.s)} h</b>${order.filter((g) => t.groups[g]).map((g) => `<div><span class="sw" style="background:${GROUP_LOOK[g][2]}"></span>${esc(GROUP_LOOK[g][1])} <b>${hmm(t.groups[g].s)} h</b></div>`).join("")}`; } })
    + `<div class="legend">${order.filter((g) => tot.some((t) => t.groups[g])).map((g) => `<span><i style="background:${GROUP_LOOK[g][2]}"></i>${esc(GROUP_LOOK[g][1])}</span>`).join("")}</div>`;
}
async function pageAktivity(el) {
  const [acts, ride, y, md] = await Promise.all([api("activities?days=" + (actRange === "365" ? "365" : "all")), api("ride"), api("year"), api("months").catch(() => null)]);
  const yk = y.yearKm;
  const groupOf = (a) => (isBikeSport(a.sport) ? "kolo" : OTHER_SPORTS.includes(a.sport) ? "other" : a.sport);
  const inRange = acts.filter((a) => actRange === "365" || actRange === "all" || a.date.startsWith(actRange));
  // sporty podle počtu aktivit (nejčastější první – filtr je jeden posuvný řádek)
  const cnt = {}; inRange.forEach((x) => { const g = groupOf(x); cnt[g] = (cnt[g] || 0) + 1; });
  const sports = Object.keys(cnt).sort((p, q) => cnt[q] - cnt[p]);
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
  const inSum = (r) => aktSum === "all" || grpOf(r.sport) === aktSum;
  const sumOf = (rows) => rows.reduce((t, r) => ({ n: t.n + r.n, s: t.s + (r.s || 0), km: t.km + (r.km || 0), up: t.up + (r.up || 0) }), { n: 0, s: 0, km: 0, up: 0 });
  // skupiny sportů, které v datech jsou (pro přepínač Vše / Kolo / Běh…)
  const sumGroups = new Set([...y.years.map((r) => grpOf(r.sport)), ...(md ? md.months.flatMap((m) => m.sports.map((x) => grpOf(x.sport))) : [])]);
  const doy = Math.round((Date.parse(y.date) - Date.parse(`${yk.year}-01-01`)) / 86400_000) + 1;
  /** souhrn roku: kolo má navíc roční cíl a jízdy nad 100 km, ostatní (i Vše) čas, km, převýšení a průměr týdně */
  const yearHtml = () => {
    const rows = y.bySport.filter(inSum), t = sumOf(rows);
    const past = years.filter((x) => x !== yk.year).map((yy) => {
      const pr = y.years.filter((r) => r.y === yy && inSum(r)), p = sumOf(pr);
      return pr.length ? `<details class="yr"><summary><b>${yy}</b><span>${hmm(p.s)} h · ${thou(p.km)} km · ${p.n} aktivit · ↑ ${thou(p.up)} m</span></summary><table class="t">${head5}${sportRows(pr)}</table></details>` : "";
    }).join("");
    const bike = aktSum === "kolo";
    const top = bike
      ? `<div class="sl">Najeto na kole od 1. 1.</div>
    <div class="bignum">${thou(yk.km)}<small> km${yk.goal ? ` z cíle ${thou(yk.goal)} km` : ""}</small></div>
    ${yk.goal ? `<div class="prog big"><i style="width:${pct}%"></i></div><div class="sub">podle plánu bys měl mít ${thou(yk.paceToday)} km · potřeba ${num(yk.perWeekNeeded)} km týdně</div>` : ""}
    <div class="mini-stats yr6">${[
      sumTile(thou(yk.rides), "", "jízd na kole"),
      sumTile(thou(yk.up), "m", "převýšení"),
      sumTile(thou(yk.over100 ?? 0), "", "jízd nad 100 km"),
      sumTile(num(yk.longest ?? 0), "km", "nejdelší jízda"),
      sumTile(num(yk.last4wPerWeek), "km", "týdně (průměr 4 týdnů)"),
      sumTile(thou(yk.projection), "km", "odhad za rok"),
    ].join("")}</div>`
      : `<div class="sl">${aktSum === "all" ? "Všechny sporty" : esc(GROUP_LOOK[aktSum][1])} od 1. 1.</div>
    <div class="bignum">${hmm(t.s)}<small> h v pohybu</small></div>
    <div class="mini-stats yr6">${[
      sumTile(thou(t.km), "km", "vzdálenost"),
      sumTile(thou(t.up), "m", "nastoupáno"),
      sumTile(thou(t.n), "", "aktivit"),
      sumTile(num(t.s / 3600 / (doy / 7), 1), "h", "týdně (průměr)"),
      sumTile(thou(t.n ? t.km / t.n : 0), "km", "na aktivitu"),
      sumTile(hmm(t.n ? t.s / t.n : 0), "h", "průměrná délka"),
    ].join("")}</div>`;
    return `${sumChips(sumGroups)}${top}
    ${rows.length > 1 || !bike ? `<div class="sl" style="margin:14px 0 4px">Podle sportu ${yk.year}</div><table class="t">${head5}${sportRows(rows)}</table>` : ""}
    ${past ? `<div class="yrs"><div class="sl" style="margin:14px 0 6px">Předchozí roky</div>${past}</div>` : ""}`;
  };
  const yearCard = card("ak-year", `${ic("kalendar")} ${yk.year} · souhrn roku`, "Garmin", `<div id="ysum">${yearHtml()}</div>`);
  const rangeBtns = [["365", "365 dní"], ["all", "Vše"], ...years.map((x) => [x, x])];
  el.innerHTML = `<div class="head"><div><h1>Aktivity</h1><div class="sub">${actRange === "365" ? "posledních 365 dní" : actRange === "all" ? "celá historie z Garminu" : `rok ${actRange}`} · výkon = NP (normalizovaný)</div></div></div>
  <div class="seg mob-only akseg">${[["list", "Seznam"], ["month", "Měsíc"], ["year", "Rok"], ["vol", "Objem"]].map(([k, l]) => `<button class="${aktView === k ? "on" : ""}" data-av="${k}">${l}</button>`).join("")}</div>
  <div class="grid aktgrid" data-view="${aktView}">
   <div class="c7 col ak-list">${card("", "", "", `<div class="afilt"><select id="arange">${rangeBtns.map(([k, l]) => `<option value="${k}" ${actRange === k ? "selected" : ""}>${l}</option>`).join("")}</select><input id="aq" type="search" placeholder="Hledat podle názvu…" value="${esc(actQuery)}"></div>
     <div class="filters">${["all", ...sports].map((s) => `<button class="${actFilter === s ? "on" : ""}" data-f="${s}">${s === "all" ? "Vše" : s === "kolo" ? (ic("kolo") + " Cyklistika") : `${SPORT_ICON[s] || ""} ${SPORT_NAME[s] || s}`}</button>`).join("")}</div><div class="alist" id="alist">${listHtml()}</div>`)}</div>
   <div class="c5 col">${md ? card("ak-month", (ic("kalendar") + " Souhrn měsíce"), "Garmin", `${sumChips(sumGroups)}<div id="msum">${monthSummaryHtml(md)}</div>`) : ""}${yearCard}
   ${card("ak-vol", "Týdenní objem na kole · 26 týdnů", "Garmin", `<div class="sl">Kilometry</div>` + barChart({ x: ride.weeks.map((w) => w.from), xfmt: dm, bars: ride.weeks.map((w) => ({ v: w.km, color: "var(--acc)" })), fmt: (v) => num(v) + " km", yfmt: (v) => num(v), height: 150, tipFn: (i) => { const w = ride.weeks[i]; return `<b>týden od ${dm(w.from)}</b><div>${num(w.km)} km · ${num(w.h, 1)} h · zátěž ${num(w.load)} · ${w.n} jízd</div>`; } }) + `<div class="sl" style="margin-top:12px">Hodiny</div>` + barChart({ x: ride.weeks.map((w) => w.from), xfmt: dm, bars: ride.weeks.map((w) => ({ v: w.h, color: "var(--z2)" })), fmt: (v) => num(v, 1) + " h", yfmt: (v) => num(v) + " h", height: 150, tipFn: (i) => { const w = ride.weeks[i]; return `<b>týden od ${dm(w.from)}</b><div>${num(w.h, 1)} h · ${num(w.km)} km · zátěž ${num(w.load)} · ${w.n} jízd</div>`; } }) + `<p class="note">Kilometry a hodiny na kole za týden; detail po najetí nebo dotyku.</p>`)}
   ${md ? card("ak-vol ak-mvol", "Měsíční objem · 12 měsíců", "Garmin", `<div id="mvol">${monthChartsHtml(md)}</div>`) : ""}
   </div></div>`;
  const bindMonth = () => {
    el.querySelectorAll("[data-mon]").forEach((b) => b.addEventListener("click", () => { if (!b.dataset.mon) return; aktMonth = b.dataset.mon; el.querySelector("#msum").innerHTML = monthSummaryHtml(md); bindMonth(); }));
    el.querySelector("#monPick")?.addEventListener("change", (e) => { aktMonth = e.target.value; el.querySelector("#msum").innerHTML = monthSummaryHtml(md); bindMonth(); });
    el.querySelector("#aiMonth")?.addEventListener("click", () => openAiPanel({ title: "Měsíc", extra: monthAiText(md), ask: `Zhodnoť můj tréninkový měsíc ${monthName(selMonth(md))}: objem a poměr sportů proti předchozímu měsíci, co bylo dobře, co chybělo a na co se zaměřit dál.` }));
  };
  if (md) bindMonth();
  // přepínač sportu v souhrnech: měsíc, rok i měsíční grafy najednou
  el.querySelector(".aktgrid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sum]");
    if (!b || b.dataset.sum === aktSum) return;
    aktSum = b.dataset.sum;
    el.querySelectorAll(".sumf [data-sum]").forEach((x) => x.classList.toggle("on", x.dataset.sum === aktSum));
    el.querySelector("#ysum").innerHTML = yearHtml();
    if (md) { el.querySelector("#msum").innerHTML = monthSummaryHtml(md); el.querySelector("#mvol").innerHTML = monthChartsHtml(md); bindMonth(); }
    hydrate(el);
  });
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
const FOOT = ["run", "walk", "hike", "xc_ski"];
/** tempo min/km (desetinné minuty) → „5:12“ */
const paceTxt = (m) => { if (m == null || !isFinite(m)) return DASH; const t = Math.round(m * 60); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
function streamPanels(s, sport) {
  const has = (a) => a && a.some((v) => v != null && v !== 0);
  const run = sport === "run", foot = FOOT.includes(sport);
  return [
    has(s.hr) ? { key: "hr", name: "Tep", unit: "bpm", values: s.hr, color: "var(--bad)" } : null,
    has(s.watts) ? { key: "w", name: "Výkon", unit: "W", values: s.watts, color: "var(--acc)", smooth: 3 } : null,
    has(s.speed) ? (foot
      // běh, chůze, turistika, běžky: tempo min/km, rychlejší nahoře; stání (pod 2 km/h) se nekreslí
      ? { key: "v", name: "Tempo", unit: "min/km", values: s.speed.map((v) => (v != null && v > 2 ? 60 / v : null)), color: "var(--z2)", smooth: 2, invert: true, fmt: paceTxt }
      : { key: "v", name: "Rychlost", unit: "km/h", values: s.speed, color: "var(--z2)", dec: 1, smooth: 2 }) : null,
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
    const sm = opts.fine ? Math.min(1, p.smooth || 0) : p.smooth;
    if (sm) vals = vals.map((_, i) => { let s2 = 0, k = 0; for (let j = Math.max(0, i - sm); j <= Math.min(n - 1, i + sm); j++) if (vals[j] != null) { s2 += vals[j]; k++; } return k ? s2 / k : null; });
    const ok = vals.filter((v) => v != null).sort((a, b) => a - b);
    // rozsah podle dat (2.–99,5. percentil), ať je stupnice jemná a výkyvy nedeformují osu; výkon od 0
    let mn = ok[Math.floor(ok.length * 0.02)] ?? ok[0], mx = Math.max(ok[Math.floor(ok.length * 0.995)] ?? ok[ok.length - 1], ok[ok.length - 1] * (p.key === "w" ? 0.8 : 1));
    if (p.key === "w") mn = 0;
    if (p.key === "p") { mn = Math.min(-3, mn); mx = Math.max(3, mx); }
    const pad = (mx - mn) * 0.08 || 1; mx += pad; if (p.key !== "w") mn = p.key === "v" || p.key === "c" ? Math.max(0, mn - pad) : mn - pad;
    vals = vals.map((v) => (v == null ? null : clamp(v, mn, mx)));
    const y0 = P.t + pi * (PH + GAP);
    const Y = p.invert ? (v) => y0 + ((v - mn) / (mx - mn)) * PH : (v) => y0 + (1 - (v - mn) / (mx - mn)) * PH;
    Ys.push({ Y, vals, p });
    const segs = runs(vals.map((v, i) => (xs[i] == null ? null : v)), (i) => X(xs[i]), Y);
    const d = segs.map((s2) => curvePath(s2)).join("");
    const gid = `${id}g${pi}`;
    defs += `<linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${p.color}" stop-opacity=".16"/><stop offset="1" stop-color="${p.color}" stop-opacity="0"/></linearGradient>`;
    const firstI = vals.findIndex((v) => v != null), lastI = n - 1 - [...vals].reverse().findIndex((v) => v != null);
    svg += `<text class="pl" x="${P.l}" y="${y0 - 2}">${p.name}${p.unit ? ` (${p.unit})` : ""}</text>`;
    for (const t of niceTicks(mn, mx, PH > 140 ? 6 : 4)) svg += `<line class="gl" x1="${P.l}" x2="${W - P.r}" y1="${Y(t)}" y2="${Y(t)}"/><text class="yl" x="${P.l - 6}" y="${Y(t) + 4}" text-anchor="end">${p.fmt ? p.fmt(t) : p.signed ? signed(t) : num(t)}</text>`;
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
  // krátký úsek (okruh do pár km): popisky s desetinou, jinak by se opakovaly „1 km, 1 km, 2 km“
  const xDec = useKm && xmax - xmin < 6 ? 1 : 0;
  for (const t of niceTicks(xmin, xmax, 6)) xl += `<text class="xl" x="${X(t)}" y="${H - 6}" text-anchor="middle">${num(t, xDec)}${useKm ? " km" : " min"}</text>`;
  const fmtT = (sec) => `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
  bindHover(id, W, (cx) => {
    const v = xmin + ((cx - P.l) / (W - P.l - P.r)) * (xmax - xmin);
    let best = 0, bd = Infinity;
    for (let i = 0; i < n; i++) if (xs[i] != null && Math.abs(xs[i] - v) < bd) { bd = Math.abs(xs[i] - v); best = i; }
    return best;
  }, (i) => X(xs[i]), (i) => (mapHover?.(i / Math.max(1, n - 1)), {
    html: `<b>${useKm ? num(xs[i], 1) + " km · " : ""}${fmtT(s.t[i])}</b>` + Ys.map(({ p, vals }) => { if (p.grade) { const g = p.grade[i]; return `<div><span class="sw" style="background:${g == null ? p.color : GRADE_CLS[gradeIdx(g)][2]}"></span>Sklon <b>${g == null ? DASH : signed(g, 1) + " %"}</b> · ${num(p.values[i])} m</div>`; } const zi = p.zf && vals[i] != null ? p.zf(vals[i]) : null; return `<div><span class="sw" style="background:${zi != null ? p.zc[zi] : p.color}"></span>${p.name} <b>${p.values[i] == null ? DASH : (p.fmt ? p.fmt(p.values[i]) : num(p.values[i], p.dec || 0)) + " " + p.unit}</b>${zi != null ? ` · Z${zi + 1}` : ""}</div>`; }).join(""),
    dots: Ys.filter(({ vals }) => vals[i] != null).map(({ Y, vals, p }) => ({ y: Y(vals[i]), c: p.grade ? (p.grade[i] == null ? p.color : GRADE_CLS[gradeIdx(p.grade[i])][2]) : p.zf ? p.zc[p.zf(vals[i])] : p.color })),
  }));
  const leg = "";
  return `<svg class="chart streams" id="${id}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${defs}</defs>${svg}<line class="cur" y1="${P.t}" y2="${H - P.b}"/><g class="dots"></g>${xl}</svg>${opts.noLegend ? "" : leg}`;
}

/** 1. vs. 2. polovina jízdy: tep, výkon, aerobní drift (decoupling), výkon na konci Z2 tepu. */
function halvesHtml(h, a) {
  const rows = [];
  if (h) {
    rows.push([(ic("tep") + " Tep"), `${num(h.hr[0])} bpm`, `${num(h.hr[1])} bpm`, signed(h.hr[1] - h.hr[0]) + " bpm"]);
    if (h.w) rows.push([(ic("ftp") + " Výkon"), `${num(h.w[0])} W`, `${num(h.w[1])} W`, signed(h.w[1] - h.w[0]) + " W"]);
    else if (h.spd && FOOT.includes(a.sport)) rows.push([(ic("interval") + " Tempo"), `${paceTxt(60 / h.spd[0])} /km`, `${paceTxt(60 / h.spd[1])} /km`, ""]);
    else if (h.spd) rows.push([(ic("rychlost") + " Rychlost"), `${num(h.spd[0], 1)} km/h`, `${num(h.spd[1], 1)} km/h`, signed(h.spd[1] - h.spd[0], 1)]);
    if (h.ef) rows.push([h.w ? (ic("pomer") + " Výkon / tep") : FOOT.includes(a.sport) ? (ic("pomer") + " Rychlost / tep") : (ic("pomer") + " Rychlost / tep"), num(h.ef[0], h.w ? 2 : 3), num(h.ef[1], h.w ? 2 : 3), h.ef[0] ? signed(((h.ef[1] - h.ef[0]) / h.ef[0]) * 100, 1) + " %" : ""]);
  }
  const table = rows.length ? `<table class="t halvest"><tr><th></th><th class="r">1. půlka</th><th class="r">2. půlka</th></tr>${rows.map((r) => `<tr><td><b>${r[0]}</b></td><td class="r">${r[1]}</td><td class="r">${r[2]}</td><td hidden class="r">${r[3]}</td></tr>`).join("")}</table>` : `<div class="empty">Na rozdělení na poloviny je aktivita krátká.</div>`;
  const dec = a.icuDecoupling != null ? a.icuDecoupling : h ? h.dec : null;
  const decTone = dec == null ? "" : Math.abs(dec) < 5 ? "good" : dec <= 8 ? "warn" : "bad";
  const tiles = [
    dec != null ? stat("Aerobní drift", signed(dec, 1), " %", `decoupling · ${a.icuDecoupling != null ? "intervals.icu" : "z průběhu"} · pod 5 % = dobrá vytrvalost`, decTone) : "",
    a.drift != null && (a.icuDecoupling == null || Math.abs(a.icuDecoupling - a.drift) > 0.05) ? stat("Drift ustálené části", num(a.drift, 1), " %", "Garmin průběh", Math.abs(a.drift) < 5 ? "good" : a.drift <= 8 ? "warn" : "bad") : "",
    a.z2Power ? stat("Výkon na konci Z2", num(a.z2Power.w), " W", `při ${a.z2Power.hr} bpm · ${num(a.z2Power.min)} min v Z2`, "") : "",
  ].join("");
  return `${tiles ? `<div class="stats halves">${tiles}</div>` : ""}${a.driftNote && dec != null ? `<p class="note"><b>${esc(a.driftNote)}</b></p>` : ""}${table}<p class="note">Aerobní drift (decoupling, Pw:HR) = o kolik % klesl výkon na jeden tep ve 2. polovině. Pod 5 % je aerobní základ dobrý, nad 8 % únava, horko nebo málo jídla. Výkon na konci Z2 = výkon, který tě v této aktivitě stál tep ${a.z2Power ? a.z2Power.hr : "na horní hranici Z2"} (výkon/tep v Z2 × hranice Z2) – roste-li v čase, zlepšuje se vytrvalost.</p>`;
}

/**
 * Další údaje aktivity z Garminu. Každá buňka: popisek, jedno hlavní číslo (průměr / součet) a pod ním
 * drobně rozsah nebo maximum – ať v jedné buňce nejsou tři čísla za lomítky.
 */
function extraHtml(a) {
  const x = a.extra || {};
  const run = a.sport === "run", foot = FOOT.includes(a.sport);
  const u = (v, unit) => `${v}<small> ${unit}</small>`;
  const rows = [
    // průměrné tempo a stoupání jsou nahoře v základních údajích → tady jen nejrychlejší tempo
    x.max_speed && foot ? [(ic("interval") + " Nejrychlejší tempo"), u(paceTxt(60 / x.max_speed), "/km"), ""] : null,
    // průměrná rychlost je nahoře → tady jen maximální
    x.max_speed && !foot ? [(ic("rychlost") + " Max. rychlost"), u(num(x.max_speed, 1), "km/h"), ""] : null,
    run && a.avgPower ? [(ic("ftp") + " Výkon"), u(num(a.avgPower), "W"), a.np ? `NP ${num(a.np)} W` : ""] : null,
    // VI = NP / průměrný výkon (jak nárazová byla jízda); intenzita = NP / FTP
    a.vi ? [(ic("graf") + " VI"), num(a.vi.value, 2), a.vi.text] : null,
    a.vi?.intensity != null ? [(ic("intenzita") + " Intenzita"), u(a.vi.intensity, "%"), "NP proti FTP"] : null,
    a.avgCad ? [run ? (ic("boty") + " Kadence") : (ic("kadence") + " Kadence"), u(num(x.run_cad || a.avgCad), run ? "kr/min" : "ot/min"), x.max_cad ? `max ${num(x.max_cad)} ${run ? "kr/min" : "ot/min"}` : ""] : null,
    x.strokes ? [run || foot ? (ic("boty") + " Kroků") : (ic("kadence") + " Otáček"), thou(x.strokes), "celkem"] : a.avgCad && a.moving && !run ? [(ic("kadence") + " Otáček"), thou((a.avgCad * a.moving) / 60), "celkem (odhad)"] : null,
    x.stride_m ? [(ic("delka") + " Délka kroku"), u(num(x.stride_m, 2), "m"), ""] : null,
    x.gct_ms ? [(ic("chodidlo") + " Kontakt se zemí"), u(num(x.gct_ms), "ms"), ""] : null,
    x.vosc_cm ? [(ic("oscilace") + " Vertikální oscilace"), u(num(x.vosc_cm, 1), "cm"), x.vratio ? `poměr ${num(x.vratio, 1)} %` : ""] : null,
    x.avg_resp ? [(ic("dech") + " Dech"), u(num(x.avg_resp), "/min"), `rozsah ${num(x.min_resp)}–${num(x.max_resp)}`] : null,
    a.calories && !a.usedTop?.has("calories") ? [(ic("zatez") + " Kalorie"), u(thou(a.calories), "kcal"), ""] : null,
    x.min_elev != null || x.max_elev != null ? [(ic("hory") + " Nejvýš"), u(num(x.max_elev), "m"), `nejníž ${num(x.min_elev)} m`] : null,
    x.bb_diff != null ? [(ic("energie") + " Body Battery"), u(signed(x.bb_diff), ""), "dopad aktivity"] : null,
    a.minTemp != null || a.maxTemp != null ? [(ic("teplota") + " Teplota"), `<em id="tAvg" class="tavg">…</em><small> °C</small>`, `${num(a.minTemp)}–${num(a.maxTemp)} °C`] : null,
    a.aerobicTe != null && !a.usedTop?.has("aerobic") ? [(ic("zotaveni") + " Aerobní efekt"), num(a.aerobicTe, 1), teWord(a.aerobicTe)] : null,
    x.ana_te != null ? [(ic("vybuch") + " Anaerobní efekt"), num(x.ana_te, 1), teWord(x.ana_te)] : null,
  ].filter(Boolean);
  // sudý počet buněk: lichý → pryč nejméně důležitý údaj
  if (rows.length % 2) { const i = rows.findIndex((r) => /Otáček|Kroků|Nejvýš/.test(r[0])); if (i >= 0) rows.splice(i, 1); }
  return rows.length ? `<div class="abasics xtra">${rows.map(([k, v, sub]) => `<div><span>${k}</span><b>${v}</b>${sub ? `<i>${esc(sub)}</i>` : ""}</div>`).join("")}</div>` : `<div class="empty">Další údaje nemám.</div>`;
}
// stupnice tréninkového efektu Garmin 0–5
const teWord = (v) => (v < 1 ? "bez přínosu" : v < 2 ? "malý přínos" : v < 3 ? "udržuje" : v < 4 ? "zlepšuje" : v < 5 ? "výrazně zlepšuje" : "přetížení");

let lapMode = "plan";
/** Výřez průběhu aktivity na úsek [od, do] v s (podle s.t); vzdálenost od začátku úseku. */
function sliceStreams(s, from, to) {
  if (!s?.t?.length) return null;
  const idx = []; s.t.forEach((v, i) => { if (v != null && v >= from - 1 && v <= to + 1) idx.push(i); });
  if (idx.length < 3) return null;
  const n = s.t.length, out = {};
  for (const [k, v] of Object.entries(s)) out[k] = Array.isArray(v) && v.length === n ? idx.map((i) => v[i]) : v;
  const t0 = out.t[0]; out.t = out.t.map((v) => (v == null ? null : v - t0));
  if (out.dist) { const d0 = out.dist.find((v) => v != null) ?? 0; out.dist = out.dist.map((v) => (v == null ? null : v - d0)); }
  out.halves = null; out.route = null;
  return out;
}
/** podřádek okruhu: údaje se nelámou uprostřed („5 m“ na dvou řádcích), oddělovač zůstane na konci řádku */
const subParts = (t) => { const p = String(t || "").split(" · ").filter(Boolean); return p.map((x, i) => `<span class="nw">${/^\d[\d ]* m$/.test(x) ? "↑ " : ""}${esc(x)}${i < p.length - 1 ? " ·" : ""}</span>`).join(" "); };
function lapsHtml(a, s) {
  const tbl = a.laps.show
    ? `<table class="t"><tr><th>Okruh</th><th class="r">Čas</th>${a.hasPower ? '<th class="r">Výkon</th>' : ""}<th class="r">Tep / max</th></tr>${a.laps.rows.map((r, i) => `<tr class="${r.iv ? "iv" : ""}${r.start_s != null && r.dur_s && a.hasStreams ? " lapclick" : ""}" ${r.start_s != null && r.dur_s && a.hasStreams ? `data-li="${i}" tabindex="0" role="button" aria-label="Průběh úseku ${esc(r.name)}"` : ""}><td><b>${esc(r.name)}</b><span class="s2">${subParts(r.sub)}</span></td><td class="r">${r.time}</td>${a.hasPower ? `<td class="r">${r.power}</td>` : ""}<td class="r">${r.hr}</td></tr>`).join("")}</table><p class="note">${esc(a.laps.note)}</p>`
    : `<div class="empty">${esc(a.laps.note || "Tréninkové okruhy nejsou – vyber okruhy po km.")}</div>`;
  const sp = s && s.splits ? s.splits : {};
  const modes = [["plan", "Tréninkové"], ...["1", "5", "10"].filter((k) => sp[k] && sp[k].length > 1).map((k) => [k, `po ${k} km`])];
  // tréninkové okruhy chybí (Garmin ani intervals.icu je nedaly) → rovnou po 10 km (jinak 5 / 1 km), ať to není prázdné
  const fallback = ["10", "5", "1"].find((k) => sp[k] && sp[k].length > 1);
  const mode = modes.some(([k]) => k === lapMode) && !(lapMode === "plan" && !a.laps.show) ? lapMode : a.laps.show ? "plan" : fallback || "plan";
  const run = FOOT.includes(a.sport);
  let body = tbl;
  if (mode !== "plan") {
    const rows = sp[mode];
    const best = Math.max(...rows.map((r) => r.kmh));
    const hasW = rows.some((r) => r.w), hasCad = rows.some((r) => r.cad);
    const pace = (kmh) => { const t = Math.round(3600 / kmh); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
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
    // kontrola pravosti souborů z CDN (SRI) – změněný soubor prohlížeč nespustí
    css.integrity = "sha384-c6Rcwz4e4CITMbu/NBmnNS8yN2sC3cUElMEMfP3vqqKFp7GOYaaBBCqmaWBjmkjb"; css.crossOrigin = "anonymous";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    js.integrity = "sha384-NElt3Op+9NBMCYaef5HxeJmU4Xeard/Lku8ek6hoPTvYkQPh3zLIrJP7KiRocsxO"; js.crossOrigin = "anonymous";
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
  map.attributionControl.setPrefix(false); // bez „Leaflet“ a vlajky – kratší štítek
  const layers = {};
  const dark = isDark();
  if (key) {
    // dlaždice @2x zobrazené jako 256 px: ostré i na retině, popisky běžné velikosti; letecká @2x nemá (404) → 256
    const mapy = (set, size = "256@2x") => L.tileLayer(`https://api.mapy.com/v1/maptiles/${set}/${size}/{z}/{x}/{y}?apikey=${encodeURIComponent(key)}`, { maxZoom: 19, tileSize: 256, attribution: '<a href="https://api.mapy.com/copyright" target="_blank" rel="noopener">© Seznam.cz a další</a>' });
    layers["Základní"] = mapy("basic");
    layers["Turistická"] = mapy("outdoor");
    layers["Letecká"] = mapy("aerial", "256");
  }
  layers["OpenStreetMap"] = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" });
  let saved = null;
  try { saved = localStorage.getItem("mapLayer4"); } catch {}
  let cur = layers[saved] ? saved : layers["Základní"] ? "Základní" : Object.keys(layers)[0];
  layers[cur].addTo(map);
  // přepínač podkladu: malé skleněné tlačítko → nabídka (místo velké ikony Leafletu)
  const LAYER_ICO = { "Základní": ic("mapa"), "Turistická": ic("turistika"), "Letecká": ic("satelit"), "OpenStreetMap": ic("svet") };
  const layCtl = L.control({ position: "topright" });
  layCtl.onAdd = () => {
    const w = L.DomUtil.create("div", "mapglass maplay");
    const render = () => { w.innerHTML = `<button type="button" class="ml-btn" title="Podklad mapy" aria-label="Podklad mapy">${LAYER_ICO[cur] || ic("mapa")}<span>${esc(cur)}</span></button><div class="ml-menu">${Object.keys(layers).map((n) => `<button type="button" data-ml="${esc(n)}" class="${n === cur ? "on" : ""}">${LAYER_ICO[n] || ic("mapa")} ${esc(n)}</button>`).join("")}</div>`; };
    render();
    L.DomEvent.disableClickPropagation(w); L.DomEvent.disableScrollPropagation(w);
    w.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.classList.contains("ml-btn")) { w.classList.toggle("open"); return; }
      const n = b.dataset.ml; if (!n || n === cur) { w.classList.remove("open"); return; }
      map.removeLayer(layers[cur]); cur = n; layers[cur].addTo(map);
      map.fire("baselayerchange", { name: n, layer: layers[n] });
      render(); w.classList.remove("open");
    });
    map.on("click", () => w.classList.remove("open"));
    return w;
  };
  layCtl.addTo(map);
  const first = cur;
  // logo Mapy.com (podmínka používání), jen když je vrstva Mapy.com zapnutá
  const logo = L.control({ position: "bottomleft" });
  logo.onAdd = () => { const d = L.DomUtil.create("div"); d.innerHTML = '<a href="https://mapy.com/" target="_blank" rel="noopener"><img src="https://api.mapy.com/img/api/logo.svg" alt="Mapy.com" style="height:30px;display:block"></a>'; return d; };
  const syncLogo = (name) => { if (name !== "OpenStreetMap") logo.addTo(map); else logo.remove(); };
  syncLogo(first);
  // noční mapa: ve tmavém režimu se světlý podklad (Mapy.com, OSM…) převrátí do tmavých barev; trasa zůstává
  const syncNight = (name) => box.classList.toggle("night", dark && name !== "Letecká");
  syncNight(first);
  map.on("baselayerchange", (e) => { try { localStorage.setItem("mapLayer4", e.name); } catch {} syncLogo(e.name); syncNight(e.name); });
  // ⤢ vycentrovat trasu (po přiblížení zpět na celou trasu, stejně jako po otevření)
  // malinko oddálené, vlevo víc místa → trasa nevede pod tlačítky (zoom, vycentrovat, zesvětlit)
  const fitAll = () => map.fitBounds(L.latLngBounds(route.map((p) => [p[0], p[1]])), { paddingTopLeft: [58, 24], paddingBottomRight: [24, 24] });
  const fitCtl = L.control({ position: "topleft" });
  fitCtl.onAdd = () => { const b = L.DomUtil.create("a", "leaflet-bar mapfit"); b.href = "#"; b.title = "Vycentrovat celou trasu"; b.setAttribute("role", "button"); b.innerHTML = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/></svg>'; L.DomEvent.on(b, "click", (e) => { L.DomEvent.preventDefault(e); L.DomEvent.stopPropagation(e); fitAll(); }); return b; };
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
  const top = a.basics.filter(([k]) => !/Splnění plánu/.test(k)).slice(0, 10);
  // sudý počet buněk (na mobilu 2 vedle sebe): lichý → doplnit důležitý údaj, který jinak je v „Dalších údajích“
  a.usedTop = new Set();
  if (top.length % 2) {
    const fill = [
      a.calories ? ["calories", (ic("zatez") + " Kalorie"), `${thou(a.calories)} kcal`] : null,
      a.aerobicTe != null ? ["aerobic", (ic("zotaveni") + " Aerobní efekt"), `${num(a.aerobicTe, 1)} · ${teWord(a.aerobicTe)}`] : null,
    ].find(Boolean);
    if (fill) { top.push([fill[1], fill[2]]); a.usedTop.add(fill[0]); }
  }
  // „Základ (nízko aerobní)“ → název tučně, skupina menším písmem pod ním (vejde se do buňky)
  // popisky ze serveru dostanou ikonu podle významu (doplňkové buňky už ikonu mají)
  const BASIC_IC = { "Čas v pohybu": "cas", "Vzdálenost": "trasa", "Převýšení": "hory", "Průměrná rychlost": "rychlost", "Průměrné tempo": "interval", "Hlavní přínos": "cil", "Zátěž": "zatez", "Splnění plánu": "odjeto", "Tep": "tep", "Výkon": "ftp" };
  const label = (k) => (k.includes("<") ? k : `${BASIC_IC[k] ? ic(BASIC_IC[k]) + " " : ""}${esc(k)}`);
  const cell = (k, v) => { const m = /^(.+?) \((.+)\)$/.exec(v); return `<div><span>${label(k)}</span><b>${esc(m ? m[1] : v)}</b>${m ? `<i>${esc(m[2])}</i>` : ""}</div>`; };
  const statsTop = top.map(([k, v]) => cell(k, v)).join("");
  // vybavení a „s kým“ jen u kola, běhu a běžek; vybavení jen odpovídajícího druhu (kolo / boty / lyže)
  const gk = { ride: "bike", mtb: "bike", indoor: "bike", run: "shoe", xc_ski: "ski" }[a.sport];
  if (a.gear) a.gear.list = a.gear.list.filter((g) => (gk === "bike" ? BIKE_KINDS.has(g.kind) : g.kind === gk) || g.kind === "other");
  const gearSel = a.gear && a.gear.list.length && gk
    // každé vybavení jen jednou (vybrané = to, které se počítá); „podle sportu“ jen když je zvolené ručně
    ? `<div class="gearsel">${(() => { const cur = a.gear.list.find((g) => g.id === a.gear.id); return cur ? gearIco(cur) : ic({ bike: "silnicni", shoe: "boty", ski: "lyze" }[gk] || "batoh"); })()} <select id="gearSel" title="vybavení (výchozí podle sportu, změníš tady)">${a.gear.list.map((g) => `<option value="${g.id}" ${a.gear.id === g.id ? "selected" : ""}>${esc(g.name)}</option>`).join("")}<option value="none" ${a.gear.id == null ? "selected" : ""}>bez vybavení</option>${a.gear.manual ? `<option value="auto">↺ výchozí podle sportu</option>` : ""}</select><span class="sub" id="gearMsg"></span></div>` : "";
  const endur = ["ride", "mtb", "run", "xc_ski"].includes(a.sport);
  const verb = a.sport === "run" ? ["Běžel", "běžel"] : ["Jel", "jel"];
  const compSel = endur ? `<div class="gearsel" title="S kým jsi ${esc(verb[1])}${a.company ? " – přetažená Z2 se nebere jako chyba" : ""}">${ic("skupina")} <select id="compSel" aria-label="S kým"><option value="">Sám</option><option value="skupina" ${a.company === "skupina" ? "selected" : ""}>Skupina</option>${a.company && a.company !== "skupina" ? `<option value="${esc(a.company)}" selected>${esc(a.company)}</option>` : ""}<option value="__new">S někým…</option></select><span class="sub" id="compMsg"></span></div>` : "";
  const rpeSel = (a.moving || 0) >= 1200 ? `<div class="gearsel" title="Jak těžký byl trénink (1–10) – trenér to použije u únavy a stupňů kvalit">${ic("intenzita")} <select id="rpeSel" aria-label="Náročnost 1–10"><option value="">Ohodnotit</option>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<option value="${n}" ${a.rpe === n ? "selected" : ""}>${n} · ${RPE_TXT[n]}</option>`).join("")}</select><span class="sub" id="rpeMsg"></span></div>` : "";
  el.innerHTML = `<div class="head"><div><a class="back" href="#/aktivity" data-back>← Zpět</a><h1>${SPORT_ICON[a.sport] || ic("ostatni")} ${esc(a.title)}</h1><div class="sub">${dayDm(a.date)}${a.date.slice(0, 4)} · start ${a.start}${a.unitType === "bez plánu" ? " · bez plánu" : ""}</div><div class="actsel">${gearSel}${compSel}${rpeSel}</div></div></div>
  <div class="verdict goal" id="actAi"><span class="ai-t">${ic("cil")} ${esc(a.goal)}</span>${a.compliance != null ? `<span class="pill ok">splnění ${a.compliance} %</span>` : ""}<small class="ai-m"></small></div>
  <div class="grid">
   ${card("c12", "", "", `<div class="abasics">${statsTop}</div>${a.basicsNote ? `<p class="note">${esc(a.basicsNote)}</p>` : ""}`)}
   ${a.hasStreams ? `<div class="c7 col o-map" id="mapCol">${card("", ic("mapa") + " Trasa", "", `<div id="mapmode"></div><div id="map" class="map loading sm">Načítám mapu…</div><div id="mapleg"></div>`, 'id="mapCard"')}</div>` : ""}
   <div class="${a.hasStreams ? "c5" : "c12"} col o-zones" id="zoneCol">
   ${a.hrZones ? card("", (ic("tep") + " Tep – čas v zónách"), "Garmin", zonesHtml(a.hrZones) + (a.hrZonesNote ? `<p class="note">${esc(a.hrZonesNote)}</p>` : "")) : ""}
   ${a.pwrZones ? card("", (ic("ftp") + " Výkon – čas v zónách"), "Garmin", zonesHtml(a.pwrZones) + (a.pwrZonesNote ? `<p class="note">${esc(a.pwrZonesNote)}</p>` : "")) : ""}
   </div>
   ${card("c12 o-streams", (ic("kondice") + " Průběh"), "", a.hasStreams ? `<button class="btn sm zoom" id="zoomBtn">⛶ Zvětšit</button><div id="streams" class="loading sm">Načítám průběh…</div><div id="streamsX"></div>` : `<div class="empty">Průběh nemám.</div>`)}
   ${a.laps.show || a.hasStreams ? card("c12 o-laps", (ic("zatez") + " Okruhy"), "", `<div id="laps">${lapsHtml(a, null)}</div>`) : ""}
   ${a.hasStreams && a.sport !== "strength" && a.sport !== "mobility" ? card("c7 o-halves", (ic("pomer") + " 1. vs. 2. polovina · vytrvalost"), "Garmin · intervals.icu", `<div id="halves" class="loading sm">Počítám…</div>`) : ""}
   ${card(a.hasStreams && a.sport !== "strength" && a.sport !== "mobility" ? "c5 o-extra" : "c12 o-extra", (ic("log") + " Další údaje"), "Garmin", extraHtml(a))}
  </div>`;
  el.querySelector("#aiAct")?.addEventListener("click", () => openAiPanel({ title: a.title, extra: `AKTIVITA ${a.date} ${a.title} (${SPORT_NAME[a.sport] || a.sport}): ${a.basics.map(([k, v]) => `${k} ${v}`).join(", ")}. Záměr: ${a.goal}`,
    ask: "Zhodnoť tuto aktivitu: jaký měla přínos pro kondici, jestli intenzita odpovídala záměru, jak se projeví na zotavení v dalších dnech a co by měl být další trénink." }));
  // AI zhodnocení (2–3 věty) místo opisu čísel; když AI nejede, zůstane text z kódu
  const loadAi = (force) => {
    const box = el.querySelector("#actAi"); if (!box) return;
    const m = box.querySelector(".ai-m");
    const slow = setTimeout(() => { if (box.isConnected) m.textContent = "AI píše zhodnocení…"; }, 1200);
    api(`activity/${a.id}/ai${force ? "?force=1" : ""}`).then((r) => {
      clearTimeout(slow);
      if (!box.isConnected) return;
      if (r && r.text) { box.querySelector(".ai-t").innerHTML = ic("ai") + " " + esc(r.text); m.innerHTML = `${r.model ? esc(String(r.model).replace(/^[a-z]+:/, "").replace(/^.*\//, "")) + " · " : ""}<button class="linkbtn" type="button" data-again>napsat znovu</button> · <button class="linkbtn" type="button" data-aioff title="Zpátky zapneš v Nastavení">skrýt AI</button>`;
        m.querySelector("[data-again]").addEventListener("click", () => { m.textContent = "AI píše…"; loadAi(true); });
        m.querySelector("[data-aioff]").addEventListener("click", async () => {
          if (!confirm("Skrýt AI hodnocení u všech aktivit?\n\nMísto něj bude krátké hodnocení z čísel. Zpátky ho zapneš v Nastavení.")) return;
          try { await api("settings", { method: "POST", body: JSON.stringify({ act_ai: false }) }); cache.clear(); box.querySelector(".ai-t").innerHTML = ic("cil") + " " + esc(a.goal); m.remove(); toast("AI hodnocení aktivit skryto"); } catch (e) { fail(e); }
        });
      }
      else m.remove();
    }).catch(() => { clearTimeout(slow); m.remove(); });
  };
  if (a.aiOn !== false) loadAi(false); else el.querySelector("#actAi .ai-m")?.remove();
  const rs = el.querySelector("#rpeSel");
  if (rs) rs.addEventListener("change", async () => {
    const msg = el.querySelector("#rpeMsg");
    msg.textContent = "Ukládám…";
    try { await api(`activity/${a.id}/rpe`, { method: "POST", body: JSON.stringify({ rpe: rs.value ? +rs.value : null }) }); cache.clear(); msg.textContent = "Uloženo"; toast(rs.value ? `Náročnost ${rs.value} uložena` : "Hodnocení smazáno"); }
    catch (e) { msg.textContent = `Nepovedlo se: ${e.message}`; fail(e); }
  });
  const cs = el.querySelector("#compSel");
  if (cs) cs.addEventListener("change", async () => {
    let v = cs.value;
    if (v === "__new") { v = (prompt(`S kým jsi ${verb[1]}?`) || "").trim(); if (!v) { cs.value = a.company || ""; return; } }
    const msg = el.querySelector("#compMsg");
    msg.textContent = "Ukládám…";
    try { await api(`activity/${a.id}/company`, { method: "POST", body: JSON.stringify({ company: v || null }) }); cache.clear(); route(); }
    catch (e) { msg.textContent = `Nepovedlo se: ${e.message}`; fail(e); }
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
      toast(msg.textContent);
    } catch (e) { msg.textContent = `Nepovedlo se: ${e.message}`; fail(e); }
  });
  const removeMap = () => { el.querySelector("#mapCol")?.remove(); const zc = el.querySelector("#zoneCol"); if (zc) { zc.className = "c12 col zgrid"; } };
  const bindLaps = (s) => {
    el.querySelectorAll("[data-lap]").forEach((b) => b.addEventListener("click", () => { lapMode = b.dataset.lap; el.querySelector("#laps").innerHTML = lapsHtml(a, s); bindLaps(s); }));
    // klik na okruh → průběh jen toho úseku (rychlost, výška, výkon, tep…)
    el.querySelectorAll("#laps tr[data-li]").forEach((tr) => { const open = async () => { const r = a.laps.rows[+tr.dataset.li]; tr.classList.add("busy"); const st = (await api(`activity/${id}/streams?from=${Math.floor(r.start_s)}&to=${Math.ceil(r.start_s + r.dur_s)}`).catch(() => null)) || s || (await api(`activity/${id}/streams`).catch(() => null)); tr.classList.remove("busy"); if (!st) return; const part = sliceStreams(st, r.start_s, r.start_s + r.dur_s); if (!part) return; openFullscreen(`${r.name} · ${r.time}${r.power ? ` · ${r.power}` : ""} · ${a.title}`, (w, h) => streamsChart(part, { sport: a.sport, W: w, H: h, only: STREAM_MAIN, fine: true })); }; tr.addEventListener("click", open); tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }); });
  };
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

// ---------- Energie (průběh dne) ----------
// Vlastní výpočet (src/core/energy.ts) po 2 min: křivka energie, pod ní lišta klidu
// (spánek a klidné chvíle, které dobíjejí) a stres. Bez výpočtu (starší dny) klíčové body Body Battery z Garminu a tep.
// barva podle úrovně: zelená ≥ 70, žlutá 50–69, oranžová 25–49, červená pod 25 (plynulé přechody v grafu)
const BB_STOPS = [[0, "#d63b47"], [25, "#ee7d24"], [50, "#e8b414"], [70, "#3fa85f"], [100, "#23955a"]];
function bbColor(v) {
  const x = clamp(v ?? 0, 0, 100);
  for (let i = 1; i < BB_STOPS.length; i++) {
    const [v1, c1] = BB_STOPS[i], [v0, c0] = BB_STOPS[i - 1];
    if (x <= v1) {
      const f = (x - v0) / (v1 - v0 || 1), h = (c) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16));
      const a = h(c0), b = h(c1);
      return "#" + a.map((q, k) => Math.round(q + (b[k] - q) * f).toString(16).padStart(2, "0")).join("");
    }
  }
  return BB_STOPS[BB_STOPS.length - 1][1];
}
/** barva stresu 0–100: klid zelenomodrá → nízký zelená → střední žlutá → vysoký červená */
function stressColor(v) { return bbColor(100 - clamp(v ?? 0, 0, 100) * 1.0); }
// baterie: obrys jako v iOS (tenký, zaoblený pól), uvnitř šrafovaná prázdná část a plná výplň v barvě křivky
// Body Battery podle aktuálních procent se slabou září; číslo přesně uprostřed celé baterie – na výplni tmavým odstínem
function batteryIcon(v, { showNum = true, max = null } = {}) {
  const W = 150, H = 66, VW = W + 12, VH = H + 4, id = uid("bat");
  const x0 = 7, y0 = 7, iw = W - 11, ih = H - 11; // vnitřek
  const fw = v == null ? 0 : Math.max(12, (iw * clamp(v, 0, 100)) / 100);
  const c = v == null ? "var(--muted)" : bbColor(v);
  const dark = v == null ? "var(--fg)" : "#" + [1, 3, 5].map((k) => Math.round(parseInt(c.slice(k, k + 2), 16) * 0.4).toString(16).padStart(2, "0")).join("");
  const cx = ((1.5 + W + 8) / 2).toFixed(1), cy = (1 + H / 2).toFixed(1);
  const num = (fill) => `<text x="${cx}" y="${cy}" class="bat-n" style="fill:${fill}">${v ?? "–"}&#8239;%</text>`;
  return `<svg class="battery" viewBox="0 0 ${VW} ${VH}" width="${VW}" height="${VH}" role="img" aria-label="Energie ${v ?? "–"} %"><defs>
<pattern id="${id}p" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" style="stroke:var(--line);stroke-width:2px"/></pattern>
<filter id="${id}f" x="-30%" y="-40%" width="160%" height="180%"><feGaussianBlur stdDeviation="6"/></filter>
<clipPath id="${id}c"><rect x="${x0}" y="${y0}" width="${fw}" height="${ih}" rx="12"/></clipPath></defs>
${fw ? `<rect x="${x0}" y="${y0 + 2}" width="${fw}" height="${ih - 4}" rx="12" style="fill:${c}" opacity=".22" filter="url(#${id}f)"/>` : ""}
<rect x="1.5" y="1.5" width="${W - 1}" height="${H - 1}" rx="17" style="fill:var(--card);stroke:var(--muted);stroke-opacity:.45;stroke-width:2px"/>
<rect x="${x0}" y="${y0}" width="${iw}" height="${ih}" rx="12" fill="url(#${id}p)"/>
${max != null && v != null && max > v ? `<rect x="${x0}" y="${y0}" width="${Math.max(12, (iw * clamp(max, 0, 100)) / 100)}" height="${ih}" rx="12" style="fill:${c}" opacity=".2"/>` : ""}
${fw ? `<rect x="${x0}" y="${y0}" width="${fw}" height="${ih}" rx="12" style="fill:${c}" opacity="${max != null ? 0.72 : 1}"/>` : ""}
<path d="M${W + 4} ${H / 2 - 8} a4 4 0 0 1 4 4 v10 a4 4 0 0 1 -4 4 z" style="fill:var(--muted);fill-opacity:.45"/>
${showNum ? `${num("var(--fg)")}<g clip-path="url(#${id}c)">${num(dark)}</g>` : ""}</svg>`;
}
function energyHtml(d, isToday, sum = {}) {
  const bbp = (d.bb || []).map(([t, v]) => ({ m: minOfDay(d, t), v })).filter((q) => q.m >= -1 && q.m <= 1441);
  const hrp = (d.hr || []).filter((q) => q[1] != null && q[1] > 0).map(([t, v]) => ({ m: minOfDay(d, t), v })).filter((q) => q.m >= 0 && q.m <= 1440);
  const last = bbp[bbp.length - 1] || null;
  const now = isToday ? (sum.latest ?? last?.v ?? null) : (last?.v ?? sum.min ?? null);
  const ago = last && isToday ? Math.round(minOfDay(d, Date.now()) - last.m) : null;
  const when = last ? (isToday ? `teď · ${clock(Math.max(0, Math.round(last.m)))}${ago != null && ago > 45 ? ` (před ${ago >= 90 ? `${Math.round(ago / 60)} h` : `${ago} min`})` : ""}` : `večer · ${clock(Math.max(0, Math.round(last.m)))}`) : "";
  const top = `<div class="en-top">${batteryIcon(now)}<div class="en-side"><span>Energie</span><small>${esc(when)}</small></div></div>`;
  if (bbp.length < 2 && hrp.length < 5) return top + `<div class="empty">Průběh dne zatím nemám – Garmin pošle data po synchronizaci hodinek.</div>`;
  return `<div class="en-wrap">${top}<div class="en-chart">` + sized((W) => energyChartW(d, bbp, hrp, isToday, W)) + `</div></div>`;
}
function energyChartW(d, bbp, hrp, isToday, W) {
  const st = (d.stressSeries || []).map(([t, v]) => ({ m: minOfDay(d, t), v })).filter((q) => q.m >= 0 && q.m <= 1440);
  const useStress = st.length >= 5;
  const H1 = 130, GAP = useStress ? 22 : 10, H2 = 58, AX = 20, P = { l: 4, r: 4, t: 32 };
  const H = P.t + H1 + GAP + H2 + AX;
  const X = (m) => P.l + (clamp(m, 0, 1440) / 1440) * (W - P.l - P.r);
  const Y1 = (v) => P.t + (1 - v / 100) * H1;
  const hv = hrp.map((q) => q.v), hlo = hv.length ? Math.max(30, Math.min(...hv) - 4) : 40, hhi = hv.length ? Math.max(...hv) + 4 : 120;
  const y2 = P.t + H1 + GAP, Y2 = (v) => y2 + (1 - (v - hlo) / (hhi - hlo || 1)) * H2;
  const id = uid("en");
  let g = "";
  // mřížka Body Battery 0 / 50 / 100 (čárkovaně, popisky vpravo uvnitř)
  for (const v of [50, 100]) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y1(v)}" y2="${Y1(v)}" class="gl" stroke-dasharray="2 4"/><text class="yl" x="${W - P.r - 2}" y="${Y1(v) - 3}" text-anchor="end">${v}</text>`;
  g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y1(0)}" y2="${Y1(0)}" class="gl"/>`;
  // spánek a aktivity přes oba grafy
  for (const sp of daySpans(d)) {
    const c = sp.kind === "sleep" ? "var(--srem)" : "var(--acc)";
    g += `<rect x="${X(sp.a)}" y="${P.t}" width="${Math.max(2, X(sp.b) - X(sp.a))}" height="${H1 + GAP + H2}" fill="${c}" opacity=".07" rx="4"/><rect x="${X(sp.a)}" y="${P.t - 8}" width="${Math.max(3, X(sp.b) - X(sp.a))}" height="3" rx="1.5" fill="${c}" opacity=".8"/>`;
  }
  // Body Battery: barva čáry i plochy podle úrovně (vodorovný přechod), plocha mizí dolů
  let bbSvg = "";
  if (bbp.length >= 2) {
    const pts = bbp.map((q) => ({ x: X(q.m), y: Y1(q.v) }));
    const stops = bbp.map((q) => `<stop offset="${(((X(q.m) - P.l) / (W - P.l - P.r)) * 100).toFixed(2)}%" stop-color="${bbColor(q.v)}"/>`).join("");
    const line = curvePath(pts);
    bbSvg = `<defs><linearGradient id="${id}c" gradientUnits="userSpaceOnUse" x1="${P.l}" x2="${W - P.r}" y1="0" y2="0">${stops}</linearGradient>
      <linearGradient id="${id}f" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <mask id="${id}m"><rect x="0" y="${P.t}" width="${W}" height="${H1}" fill="url(#${id}f)"/></mask></defs>
      <path d="${line}L${pts[pts.length - 1].x.toFixed(1)},${Y1(0)}L${pts[0].x.toFixed(1)},${Y1(0)}Z" fill="url(#${id}c)" mask="url(#${id}m)"/>
      <path d="${line}" fill="none" stroke="url(#${id}c)" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`;
    const hi = bbp.reduce((a, b) => (b.v > a.v ? b : a)), lst = bbp[bbp.length - 1];
    bbSvg += `<text x="${X(hi.m) + 9}" y="${Y1(hi.v) - 4}" text-anchor="start" class="bbl">${hi.v}</text>`;
    bbSvg += `<circle cx="${X(lst.m)}" cy="${Y1(lst.v)}" r="5" fill="${bbColor(lst.v)}" style="stroke:var(--card)" stroke-width="2"/>`;
  }
  // tep: tenká čára s přechodem modrá (klid) → červená (zátěž), průměr po 6 min
  let hrSvg = "";
  if (useStress) {
    // lišta klidu (spánek i klidné chvíle přes den dobíjejí)
    const by = P.t + H1 + 8;
    hrSvg += `<rect x="${P.l}" y="${by}" width="${W - P.l - P.r}" height="6" rx="3" fill="var(--ok)" opacity=".15"/>`;
    for (const [a, b] of d.restSpans || []) { const ma = minOfDay(d, a), mb = minOfDay(d, b); if (mb < 0 || ma > 1440) continue; hrSvg += `<rect x="${X(ma)}" y="${by}" width="${Math.max(3, X(mb) - X(ma))}" height="6" rx="3" fill="var(--ok)"/>`; }
    // stres 0–100: čára barvená podle úrovně (klid zelená → vysoký červená), průměr po 4 min
    const Ys = (v) => y2 + (1 - v / 100) * H2;
    const b4 = [];
    for (let m = 0; m < 1440; m += 4) { const xs = st.filter((q) => q.m >= m && q.m < m + 4); if (xs.length) b4.push({ m: m + 2, v: xs.reduce((t, q) => t + q.v, 0) / xs.length }); }
    const segs = []; b4.forEach((q, i) => { if (i === 0 || q.m - b4[i - 1].m > 20) segs.push([]); segs[segs.length - 1].push({ x: X(q.m), y: Ys(q.v) }); });
    const off = (v) => ((Ys(v) - y2) / H2).toFixed(3);
    hrSvg += `<defs><linearGradient id="${id}s" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${y2}" y2="${y2 + H2}"><stop offset="${off(100)}" stop-color="${stressColor(90)}"/><stop offset="${off(62)}" stop-color="${stressColor(62)}"/><stop offset="${off(38)}" stop-color="${stressColor(38)}"/><stop offset="${off(0)}" stop-color="${stressColor(10)}"/></linearGradient></defs>`;
    for (const v of [50, 100]) hrSvg += `<line x1="${P.l}" x2="${W - P.r}" y1="${Ys(v)}" y2="${Ys(v)}" class="gl" stroke-dasharray="2 4"/><text class="yl" x="${W - P.r - 2}" y="${Ys(v) - 3}" text-anchor="end">${v}</text>`;
    hrSvg += `<path d="${segs.filter((sg) => sg.length > 1).map((sg) => "M" + sg.map((p) => p.x.toFixed(1) + "," + p.y.toFixed(1)).join("L")).join("")}" fill="none" stroke="url(#${id}s)" stroke-width="1.5" stroke-linejoin="round"/>`;
  }
  if (hrp.length >= 5 && !useStress) {
    const b6 = [];
    for (let m = 0; m < 1440; m += 6) { const xs = hrp.filter((q) => q.m >= m && q.m < m + 6); if (xs.length) b6.push({ m: m + 3, v: xs.reduce((t, q) => t + q.v, 0) / xs.length, gap: false }); }
    b6.forEach((q, i) => { q.gap = i > 0 && q.m - b6[i - 1].m > 20; });
    const segs = []; b6.forEach((q, i) => { if (i === 0 || q.gap) segs.push([]); segs[segs.length - 1].push({ x: X(q.m), y: Y2(q.v) }); });
    // barva čáry podle zón tepu (ostré přechody na hranicích zón, stejné barvy jako u aktivit)
    const floors = d.hrFloors ? d.hrFloors.slice(1) : [135, 165, 184, 202];
    const off = (v) => clamp((Y2(v) - y2) / H2, 0, 1);
    let zs = "";
    for (let z = 4; z >= 0; z--) { const top = z === 4 ? hhi + 50 : floors[z] - 0.01, bot = z === 0 ? hlo - 50 : floors[z - 1]; zs += `<stop offset="${off(top).toFixed(4)}" style="stop-color:${HR_ZC[z]}"/><stop offset="${off(bot).toFixed(4)}" style="stop-color:${HR_ZC[z]}"/>`; }
    hrSvg = `<defs><linearGradient id="${id}h" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${y2}" y2="${y2 + H2}">${zs}</linearGradient></defs>
      <path d="${segs.filter((sg) => sg.length > 1).map((sg) => curvePath(sg)).join("")}" fill="none" stroke="url(#${id}h)" stroke-width="1.7" stroke-linejoin="round"/>`;
  }
  let ax = "";
  for (let h = 0; h <= 24; h += 6) ax += `<text class="xl" x="${X(h * 60)}" y="${H - 5}" text-anchor="${h === 0 ? "start" : h === 24 ? "end" : "middle"}">${h === 24 ? "24" : `${h}:00`}</text>`;
  const nowM = isToday ? minOfDay(d, Date.now()) : null;
  const nowL = nowM != null && nowM < 1440 ? `<line x1="${X(nowM)}" x2="${X(nowM)}" y1="${P.t}" y2="${y2 + H2}" stroke="var(--muted)" stroke-dasharray="2 4" opacity=".6"/>` : "";
  // bublina: čas, Body Battery (mezi body dopočtené) a tep
  const sAt = (m) => { if (!useStress) return null; let best = null, bd = 6; for (const q of st) { const dd = Math.abs(q.m - m); if (dd < bd) { bd = dd; best = q.v; } } return best; };
  const bbAt = (m) => { if (!bbp.length || m < bbp[0].m || m > bbp[bbp.length - 1].m) return null; for (let i = 1; i < bbp.length; i++) if (m <= bbp[i].m) { const a = bbp[i - 1], b = bbp[i]; return Math.round(a.v + ((b.v - a.v) * (m - a.m)) / (b.m - a.m || 1)); } return null; };
  let marks = "";
  for (const sp of daySpans(d)) {
    const a = Math.max(0, sp.a), b = Math.min(1440, sp.b);
    const ev = (d.bbEvents || []).find((e) => e.impact != null && Math.abs(minOfDay(d, e.start) - sp.a) < 30 && (sp.kind === "sleep" ? e.type === "SLEEP" : e.type !== "SLEEP"));
    // bez události z Garminu: rozdíl naměřených bodů, jen když leží blízko začátku i konce (do 60 min), jinak by šlo o odhad
    const near = (m, before) => bbp.filter((q) => (before ? q.m <= m + 10 && q.m >= m - 60 : q.m >= m - 10 && q.m <= m + 60)).sort((x, y) => Math.abs(x.m - m) - Math.abs(y.m - m))[0];
    const pa = near(a, true), pb = near(b, false);
    const va = bbAt(a), vb = bbAt(b);
    const ch = ev ? ev.impact : pa && pb && pa !== pb ? pb.v - pa.v : null;
    if (ch == null || !Math.round(ch)) continue;
    // číslo nad pruhem spánku / aktivity (mimo graf, nic nepřekrývá)
    const txt = `${ch > 0 ? "+" : "−"}${Math.abs(Math.round(ch))} %`, tw = txt.length * 7;
    const cx = clamp(X((a + b) / 2), P.l + tw / 2, W - P.r - tw / 2);
    marks += `<text class="bbmark ${ch > 0 ? "up" : "down"}" x="${cx.toFixed(1)}" y="${P.t - 14}" text-anchor="middle">${txt}</text>`;
  }
  const base = hrp.length ? hrp : bbp;
  bindHover(id, W, (cx) => { let best = 0, bd = Infinity; base.forEach((q, i) => { const dd = Math.abs(X(q.m) - cx); if (dd < bd) { bd = dd; best = i; } }); return best; }, (i) => X(base[i].m), (i) => {
    const m = base[i].m, bv = bbAt(m), hv2 = hrp.length ? base[i].v : null;
    return { html: `<b>${clock(Math.max(0, Math.round(m)))}</b>${bv != null ? `<div><span class="sw" style="background:${bbColor(bv)}"></span>Energie <b>${bv}</b></div>` : ""}${sAt(m) != null ? `<div><span class="sw" style="background:${stressColor(sAt(m))}"></span>stres <b>${sAt(m)}</b></div>` : ""}${hv2 != null ? `<div><span class="sw" style="background:${HR_ZC[hrZoneIdx(hv2, d.hrFloors ? d.hrFloors.slice(1) : [135, 165, 184, 202])]}"></span>tep <b>${hv2} bpm</b> · Z${hrZoneIdx(hv2, d.hrFloors ? d.hrFloors.slice(1) : [135, 165, 184, 202]) + 1}</div>` : ""}`,
      dots: [...(bv != null ? [{ y: Y1(bv), c: bbColor(bv) }] : []), ...(hv2 != null ? [{ y: Y2(hv2), c: HR_ZC[hrZoneIdx(hv2, d.hrFloors ? d.hrFloors.slice(1) : [135, 165, 184, 202])] }] : [])] };
  });
  return `<svg class="chart" id="${id}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${g}${bbSvg}${hrSvg}${nowL}${marks}${ax}<line class="cur" y1="${P.t}" y2="${y2 + H2}"/><g class="dots"></g></svg>`;
}

// ---------- Zotavení: rozcestník metrik ----------
async function pageZotaveni(el) {
  const d = await api("recovery" + (viewDate ? `?date=${viewDate}` : ""));
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
  const sem = rc ? `<div class="semhead ${stTone}"><span class="badge ${stTone}">${sdot(stTone)} ${esc(rc.stateLabel)}${rc.score != null ? ` · ${rc.score} %` : ""}</span><span>${esc(why.length ? why.join(", ") : "VST, klidový tep ani spánek nepřekročily hranice semaforu")}</span><span class="sub">ranní semafor${isToday ? "" : ` · ${dayDm(d.date)}`} · normy z ${rc.normDays} dní</span></div>` : "";
  el.innerHTML = `<div class="head"><div><h1>Zotavení</h1><div class="sub">Pravidelnost spánku (14 dní): ${esc(d.sleepReg.text)}</div></div>${dateNav(d.date, d.minDate, d.today, "znav")}</div><div class="grid">
   ${isToday ? `<div class="c12 ainote big" data-ainote="zotaveni"></div>` : ""}
   ${card("c12 semcard", "", "", sem + `<div class="mtiles six">${["vst", "tep", "spanek", "stres", "bb", "dech"].map(tile).join("")}</div><p class="note">Zotavení v % = VST a tep ve spánku proti tvým 60 nocím a délka spánku proti potřebě (pod 34 % semafor aspoň žlutý, pod 15 % červený).${rc && (rc.scoreDrags?.length || rc.scoreBoosts?.length) ? ` ${rc.scoreDrags?.length ? `Stahuje: ${esc(rc.scoreDrags.join(", "))}.` : ""} ${rc.scoreBoosts?.length ? `Zvedá: ${esc(rc.scoreBoosts.join(", "))}.` : ""}` : ""} Semafor = VST, klidový tep a spánek proti tvé normě (průměr 60 dní ± 1 směrodatná odchylka). Stres, Body Battery a dech jsou doplňkové.</p>`)}
   ${card("c12", `<a href="#/detail/spanek">${ic("spanek")} Spánek · noc na ${isToday ? "dnešek" : dayDm(d.date)} →</a>`, "výpočet", sleepBlock(d.sleep))}
  </div>`;
  bindDateNav(el, "znav", d.today, (v) => { viewDate = v; route(); });
}

// ---------- detail metriky: jedna šablona pro všechny (Přehled / Zotavení → detail) ----------
const hrsFmt = (v) => (v == null ? DASH : hmm(v * 3600));
const METRICS = {
  vst: { key: "hrv", name: "VST", ico: ic("vst"), full: "Variabilita srdečního tepu", unit: "ms", dec: 0, color: "var(--m-hrv)", lowGood: false, norm: "hrv",
    about: "Průměrná variabilita tepu během noci (Garmin). Vyšší = nervový systém je odpočatý. Hodnoť ji vždy proti své normě, ne proti jiným lidem. Trenér ji bere do ranního semaforu: VST pod normou ukazuje na únavu, nemoc, stres nebo alkohol." },
  tep: { key: "rhr", name: "Klidový tep", ico: ic("tep"), full: "Klidový tep", unit: "bpm", dec: 0, color: "var(--m-rhr)", lowGood: true, norm: "rhr",
    about: "Nejnižší ustálený tep dne (Garmin). Nižší = lepší. Zvýšení o několik tepů nad normu několik dní po sobě bývá první známka únavy nebo nemoci – trenér ho proto hlídá v ranním semaforu." },
  spanek: { key: "sleep_s", name: "Spánek", ico: ic("spanek"), full: "Spánek", unit: "h", dec: 1, color: "var(--m-sleep)", lowGood: false, norm: "sleep", hours: true,
    about: "Délka spánku a fáze z Garminu, skóre spánku 0–100. Trenér bere délku spánku do ranního semaforu (proti tvému průměru); fáze a skóre jsou doplňkové." },
  stres: { key: "stress", name: "Stres", ico: ic("stres"), full: "Stres", unit: "", dec: 0, color: "var(--m-stress)", lowGood: true, norm: "stress",
    about: "Garmin odhaduje stres z variability tepu během dne (0–100). Do 25 klid, 26–50 nízký, 51–75 střední, nad 75 vysoký. Jen doplňkový údaj – do semaforu nevstupuje." },
  bb: { key: "bb_max", name: "Energie", ico: ic("energie"), full: "Energie (ráno max.)", unit: "", dec: 0, color: "var(--m-bb)", lowGood: false, norm: "bb",
    about: "Garmin odhaduje „energii“ 0–100 z VST, stresu, spánku a aktivit. Ráno = kolik se nabilo přes noc, přes den klesá. Garmin přes API posílá jen několik bodů denně (po synchronizaci hodinek), proto je průběh dne hrubý. Do semaforu nevstupuje – ten bere přímo VST, tep a spánek." },
  dech: { key: "resp", name: "Dech", ico: ic("dech"), full: "Dech ve spánku", unit: "/min", dec: 1, color: "var(--m-resp)", lowGood: true, norm: "resp",
    about: "Průměrný počet nádechů za minutu během spánku (Garmin). U zdravého člověka je velmi stabilní; zvýšení o 1–2 dechy nad normu bývá spolu s vyšším tepem známka nemoci nebo přetížení. Garmin posílá průměr zaokrouhlený na celé dechy (12 může být i 11,6), proto se odchylka do půl dechu nepočítá. Doplňkový údaj – do semaforu nevstupuje." },
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
/**
 * Spánková banka: součet (spánek − tvůj obvyklý spánek) za posledních 7 nocí. Nad nulou = naspáno do zásoby,
 * pod nulou = spánkový dluh. Noc bez dat se nepočítá.
 */
function sleepBankCard(all, range) {
  // obvyklý spánek (medián 60 dní) platný v den noci – počítá server (src/core/sleepCalc.ts)
  const baseOf = (r) => r.sleep_base ?? 480;
  const bank = all.map((r, i) => {
    // 7 nocí, novější víc (váha 0,74^stáří: dnes 1, včera 0,74 … nejstarší 0,16)
    const w = all.slice(Math.max(0, i - 6), i + 1);
    if (w.filter((x) => x.sleep_s).length < 4) return null;
    return w.reduce((t, x, k) => t + (x.sleep_s ? (x.sleep_s / 60 - baseOf(x)) * Math.pow(0.74, w.length - 1 - k) : 0), 0) / 60;
  });
  const night = all.map((r) => (r.sleep_s ? (r.sleep_s / 60 - baseOf(r)) / 60 : null));
  const baseNow = baseOf(all[all.length - 1] || {});
  const k = all.length - Math.min(range, all.length);
  const xs = all.slice(k).map((r) => r.date), b = bank.slice(k), nv = night.slice(k);
  const now = [...b].reverse().find((v) => v != null);
  const hm = (h) => (h == null ? DASH : `${h < 0 ? "−" : "+"}${hmm(Math.abs(h) * 3600)}`);
  const tone = now == null ? "" : now >= -1 ? "good" : now >= -4 ? "warn" : "bad";
  const word = now == null ? "" : now >= 1 ? "naspáno do zásoby" : now >= -1 ? "vyrovnaná" : now >= -4 ? "mírný dluh" : "velký dluh";
  return card("c12", (ic("spanek") + " Spánková bilance · 7 nocí"), "výpočet", `<div class="stats tight">${stat("Bilance teď", hm(now), " h", word, tone)}${stat("Poslední noc", hm(nv[nv.length - 1]), " h", `proti obvyklým ${hmm(baseNow * 60)} h`, "")}</div>`
    + lineChart({ x: xs, xfmt: dm, height: 180, fmt: (v) => hm(v) + " h", yfmt: (v) => (v > 0 ? "+" : "") + num(v) + " h", avgLine: { v: 0, label: "vyrovnáno", color: "var(--muted)" }, include: [-2, 2], minSpan: 3,
        series: [{ name: "bilance 7 nocí", values: b, color: "var(--srem)", width: 2.4, area: true }, { name: "noc proti cíli", values: nv, color: "var(--slight)", width: 0.01, dots: true }] })
    + `<p class="note">Bilance = rozdíly „spánek − tvůj obvyklý spánek“ (medián 60 dní, teď ${hmm(baseNow * 60)} h) za posledních 7 nocí, novější noci víc (dnešní 100 %, včerejší 74 %, … nejstarší 16 %), tečky = jednotlivé noci. Pod nulou máš spánkový dluh – ten zvyšuje potřebu spánku na další noci. Cíl spánku změníš v Nastavení.</p>`);
}
let detRange = 30;
async function pageDetail(el, which) {
  const M = METRICS[which] || METRICS.vst;
  if (![30, 90, 365].includes(detRange)) detRange = 30;
  const q = [viewDate ? `date=${viewDate}` : "", detRange === 365 ? "hist=400" : ""].filter(Boolean).join("&");
  const [d, day] = await Promise.all([api("recovery" + (q ? `?${q}` : "")), which === "bb" || which === "tep" || which === "stres" ? api("day" + (viewDate ? `?date=${viewDate}` : "")).catch(() => null) : null]);
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
  // nahoře: dnešní (poslední) hodnota velkým písmem + normální rozsah
  const hero = M.hours
    ? card("c12", `Noc na ${last ? dayDm(last.date) : "dnešek"}`, "výpočet", sleepBlock(d.sleep))
    : which === "bb"
      ? card("c12 energy", `Energie a stres · ${day && day.date !== d.today ? dayDm(day.date) : "dnes"}`, day?.energySource === "garmin" ? "Garmin" : "výpočet", day ? `<div class="energy">${energyHtml(day, day.date === d.today, { latest: last?.date === d.today ? last.bb_latest ?? null : null })}</div>` + dayEnergyHtml(day) : `<div class="empty">Průběh dne nemám.</div>`)
      : dheroHtml(M, lastV, last, d.today, st, tone, nLo, nHi, okV, u);
  const main = M.hours
    ? barChart({ x: rows.map((r) => r.date), xfmt: dm, mode: "stack", height: 220, yfmt: (v) => num(v) + " h", refLine: last?.sleep_base ? last.sleep_base / 60 : null, band: { lo: rn.lo, hi: rn.hi, color: M.color },
        bars: rows.map((r) => ({ parts: [{ v: (r.deep || 0) / 3600, color: "var(--sdeep)" }, { v: (r.rem || 0) / 3600, color: "var(--srem)" }, { v: (r.light || (r.deep == null && r.sleep_s ? r.sleep_s : 0)) / 3600, color: "var(--slight)" }, { v: (r.awake || 0) / 3600, color: "var(--sawake)" }] })),
        tipFn: (i) => { const r = rows[i]; return `<b>${dayDm(r.date)}</b><div>spánek ${hmm(r.sleep_s)} h · skóre ${num(r.sleep_score)}</div><div>hluboký ${hmm(r.deep)} · REM ${hmm(r.rem)} · lehký ${hmm(r.light)} · bdění ${hmm(r.awake)}</div>`; } })
      + `<div class="legend"><span><i style="background:var(--sdeep)"></i>hluboký</span><span><i style="background:var(--srem)"></i>REM</span><span><i style="background:var(--slight)"></i>lehký</span><span><i style="background:var(--sawake)"></i>bdění</span><span><i style="background:color-mix(in srgb, ${M.color} 22%, transparent)"></i>normální rozsah (± 1 SD za 30 dní)</span><span class="sub">čárkovaně = tvůj obvyklý spánek (medián 60 dní)</span></div>`
    : which === "bb"
      ? barChart({ x: rows.map((r) => r.date), xfmt: dm, mode: "range", maxV: 100, height: 210,
          bars: rows.map((r) => ({ lo: r.bb_min, hi: r.bb_max, color: bbColor(r.bb_max ?? 0) })),
          tipFn: (i) => { const r = rows[i]; return `<b>${dayDm(r.date)}</b><div>ráno ${num(r.bb_max)} → minimum ${num(r.bb_min)}</div><div>nabito +${num(r.bb_charged)} · vybito −${num(r.bb_drained)}</div>${r.load ? `<div>zátěž ${num(r.load)}</div>` : ""}`; } })
        + `<div class="legend"><span><i style="background:${bbColor(85)}"></i>ráno ≥ 70</span><span><i style="background:${bbColor(60)}"></i>50–69</span><span><i style="background:${bbColor(35)}"></i>25–49</span><span><i style="background:${bbColor(10)}"></i>pod 25</span><span class="sub">sloupec = od minima dne po ranní maximum</span></div>`
      : lineChart({ x: rows.map((r) => r.date), xfmt: dm, height: 320, fmt: (v) => M.fmt(v) + u, bandSeries: { lo: rn.lo, hi: rn.hi, color: M.color, name: "normální rozsah (± 1 SD za 30 dní)" }, avgLine: avg != null ? { v: avg, label: `⌀ ${M.fmt(avg)}${u}`, color: M.color } : null, series: [{ name: M.name, values: vals, color: M.color, width: 2.4, points: true }], minSpan: M.key === "stress" ? 10 : M.key === "resp" ? 1.5 : 4 });
  let extra = "";
  if (M.hours) extra = sleepBankCard(all, detRange) + card("c12", "Skóre spánku", "výpočet × Garmin", lineChart({ x: rows.map((r) => r.date), xfmt: dm, height: 170, fmt: (v) => num(v), series: [{ name: "Garmin", values: rows.map((r) => r.sleep_score_g ?? null), color: "var(--z1)", width: 1.4 }, { name: "skóre", values: rows.map((r) => r.sleep_score), color: "var(--srem)", width: 2.2, points: true }], minSpan: 10 }) + `<p class="note">Skóre proti tvé potřebě spánku (cíl + spánkový dluh za 7 nocí), přísnější než Garmin. Pravidelnost (14 dní): ${esc(d.sleepReg.text)}</p>`);
  else if (M.key === "stress") extra = card("c12", "Stres ve spánku a maximum dne", "Garmin", lineChart({ x: rows.map((r) => r.date), xfmt: dm, height: 170, fmt: (v) => num(v), series: [{ name: "max dne", values: rows.map((r) => r.stress_max), color: "var(--z6)", width: 1.6 }, { name: "ve spánku", values: rows.map((r) => r.sleep_stress), color: "var(--z2)", width: 2 }] }));
  else if (M.key === "rhr" && d.recovery?.rhr?.yellowThr) extra = card("c12", "Hranice v ranním semaforu", "trenér", kv([["Žlutá od", num(d.recovery.rhr.yellowThr) + " bpm"], ["Červená od", num(d.recovery.rhr.redThr) + " bpm"], ["Norma (60 dní)", nrm ? `${num(nrm.mean)} ± ${num(nrm.sd, 1)} bpm` : DASH]]));
  else if (M.key === "hrv" && d.recovery?.hrv) extra = card("c12", "V ranním semaforu", "trenér", kv([["Dnešní hodnocení", esc(d.recovery.hrv.rating || "nemám")], ["Norma (60 dní)", esc(d.recovery.hrv.rangeText || DASH) + " ms"]]));
  const chips = Object.entries(METRICS).map(([k, x]) => `<a class="chipl ${k === which ? "on" : ""}" href="#/detail/${k}">${x.ico} ${esc(x.name)}</a>`).join("");
  el.innerHTML = `<div class="head"><div><a class="back" href="#/zotaveni" data-back>← Zpět</a><h1>${M.ico} ${esc(M.full)}</h1></div>
    <div class="seg">${[[30, "30 dní"], [90, "90 dní"], [365, "Rok"]].map(([k, l]) => `<button class="${detRange === k ? "on" : ""}" data-dr="${k}">${l}</button>`).join("")}</div></div>
  <nav class="chipnav">${chips}</nav>
  <div class="grid">
   ${hero}
   ${which === "stres" && day?.stress ? card("c12", `Stres během dne · ${day.date !== d.today ? dayDm(day.date) : "dnes"}`, "Garmin", dayStressHtml(day).replace(/^<div class="sl"[^>]*>[^<]*<\/div>/, "") + `<p class="note">Kolik času dne jsi strávil v klidu a v jednotlivých pásmech stresu (Garmin: klid 0–25, nízký 26–50, střední 51–75, vysoký 76–100).</p>`) : ""}
   ${card("c12", `${M.name} · ${detRange === 365 ? "rok (týdenní průměry)" : detRange === 90 ? "90 dní (průměry po 3 dnech)" : "30 dní"}`, "Garmin", main + (okV.length ? `<p class="note">za ${detRange === 365 ? "rok" : `${detRange} dní`} (po dnech): min ${M.fmt(Math.min(...okV))}${u} · max ${M.fmt(Math.max(...okV))}${u}</p>` : ""))}
   ${which === "tep" ? card("c12 hrday", `Tep během dne · ${day && day.date !== d.today ? dayDm(day.date) : "dnes"}`, "Garmin · po 2 min", day ? hrDayHtml(day, day.date === d.today) : `<div class="empty">Průběh dne nemám.</div>`) : ""}
   ${extra}
   ${card("c12", "Co to znamená", "", `<p>${esc(M.about)}</p>`)}
  </div>`;
  el.querySelectorAll("[data-dr]").forEach((b) => b.addEventListener("click", () => { detRange = +b.dataset.dr; pageDetail(el, which); }));
}

function powerCurveChart(pc) {
  if (!pc.curves.some((c) => c.points.some((p) => p.w))) return `<div class="empty">Křivku výkonu nemám.</div>`;
  return sized((W) => powerCurveChartW(pc, W));
}
function powerCurveChartW(pc, W) {
  const curves = pc.curves.filter((c) => c.points.some((p) => p.w)); // okno bez výkonu (jen běh, běžky) se vynechá
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
/** vysvětlivky zón formy (schované pod rozklik jako u ostatních grafů) */
const FORM_TEXT = {
  "Přechod": "Hodně odpočatý, ale kondice už klesá (typicky po delší pauze nebo dlouhém taperu). Krátce před závodem dobré, dlouhodobě ztrácíš.",
  "Čerstvý": "Odpočatý a připravený na výkon – ideální stav na závod nebo test (FTP, dlouhá jízda).",
  "Šedá zóna": "Neutrální – zátěž odpovídá kondici, ta ale moc neroste. Na udržení dobré, na zlepšení málo.",
  "Optimální": "Produktivní únava – kondice roste. Tady má být většina tréninkových týdnů.",
  "Vysoké riziko": "Únava výrazně nad kondicí – roste riziko přetížení, nemoci a zranění. Zařaď lehčí dny.",
};
function formLegendHtml() {
  return `<details class="info"><summary>ⓘ Vysvětlivky</summary><div class="fz-list">${FORM_BANDS.map((z) => `<div><i style="background:${z.color}"></i><div class="fz-h"><b>${esc(z.name)}</b> <span class="sub">${esc(z.text)}</span></div><p>${esc(FORM_TEXT[z.name] || "")}</p></div>`).join("")}</div><p class="note">Plná čára = forma (barva podle zóny), čárkovaně = výhled podle plánu na 7 dní. Forma (TSB) = kondice (CTL, průměrná denní zátěž 6 týdnů) − únava (ATL, průměr 7 dní). Záporná = jsi unavenější, než odpovídá kondici. Hranice zón jsou podle intervals.icu.</p></details>`;
}
const formZoneName = (f) => (f == null ? DASH : FORM_BANDS.find((z) => (z.lo == null || f >= z.lo) && (z.hi == null || f < z.hi))?.name || DASH);

/** Přehled zátěže: denní zátěž (TSS / HRSS z intervals.icu), barva = hlavní přínos aktivity podle Garminu. */
const LOAD_CAT = { low: ["#38c0d0", "Nízko aerobní"], high: ["#f08a24", "Vysoce aerobní"], ana: ["#8a5cf0", "Anaerobní"], unknown: ["#9a9690", "Neznámý"] };
function loadOverviewHtml(days) {
  if (!days || !days.some((d) => d.acts.length)) return `<div class="empty">Za 4 týdny žádná zátěž.</div>`;
  const order = ["low", "high", "ana", "unknown"];
  const bars = days.map((d) => ({ parts: order.flatMap((k) => d.acts.filter((a) => a.cat === k).map((a) => ({ v: a.load, color: LOAD_CAT[k][0] }))) }));
  const sum = Object.fromEntries(order.map((k) => [k, days.reduce((t, d) => t + d.acts.filter((a) => a.cat === k).reduce((s, a) => s + a.load, 0), 0)]));
  return barChart({ x: days.map((d) => d.date), xfmt: dm, mode: "stack", height: 190, bars, todayIndex: days.length - 1,
    tipFn: (i) => { const d = days[i]; return `<b>${dayDm(d.date)}</b>${d.acts.length ? d.acts.map((a) => `<div><span class="sw" style="background:${LOAD_CAT[a.cat][0]}"></span>${esc(a.name || SPORT_NAME[a.sport] || a.sport)} <b>${a.load}</b> · ${LOAD_CAT[a.cat][1].toLowerCase()}</div>`).join("") : "<div>bez zátěže</div>"}`; } })
    + `<div class="legend">${order.filter((k) => sum[k] > 0).map((k) => `<span><i style="background:${LOAD_CAT[k][0]}"></i>${LOAD_CAT[k][1]} · ${thou(sum[k])}</span>`).join("")}</div>
    <p class="note">Zátěž = TSS (s wattmetrem) nebo HRSS (z tepu; na trenažéru vyšší z obou) – u všech sportů stejná stupnice, 1 h na prahu = 100. Barva = hlavní přínos aktivity podle tréninkového efektu Garminu.</p>`;
}

/** VO2max: spojitá čára, mezi měřeními platí poslední hodnota (Garmin ji mění jen po vhodné aktivitě). */
function vo2Html(v) {
  if (!v.rows.length) return `<div class="empty">VO2max nemám.</div>`;
  const tile = (k, name, ico) => { const x = v[k]; return stat(`${ico} ${name}`, x ? num(x.v) : DASH, "", x ? `naposledy změřeno ${dm(x.date)}${x.date.slice(0, 4)}` : "zatím nemám", ""); };
  const today = localToday();
  // u každého sportu jen poslední souvislý úsek měření (mezera nad 60 dní ho přeruší) – jeden běh z léta by jinak
  // roztáhl okno i osu; sport bez měření za 60 dní je jen v dlaždici
  const GAP = 60;
  const rowsOf = (k) => v.rows.filter((r) => r.sport === k || r.sport === "both");
  const sinceOf = (k) => {
    const rs = rowsOf(k);
    if (!rs.length || rs[rs.length - 1].date < addDay(today, -GAP)) return null;
    let i = rs.length - 1;
    while (i > 0 && rs[i - 1].date >= addDay(rs[i].date, -GAP)) i--;
    return rs[i].date;
  };
  let since = { ride: sinceOf("ride"), run: sinceOf("run") };
  // nic čerstvého: celá historie obou sportů (jinak by graf byl prázdný)
  if (!since.ride && !since.run) since = { ride: rowsOf("ride")[0]?.date ?? null, run: rowsOf("run")[0]?.date ?? null };
  const sports = ["ride", "run"].filter((k) => since[k]);
  // okno od prvního měření zobrazených úseků (max. 6 měsíců, min. 30 dní) – ať graf není poloprázdný
  const firstIn = sports.map((k) => since[k]).sort()[0];
  const from = [[addDay(firstIn ?? today, -3), addDay(today, -180)].sort().reverse()[0], addDay(today, -30)].sort()[0];
  const dates = [];
  for (let d = from; d <= today; d = addDay(d, 1)) dates.push(d);
  // den může mít měření pro kolo i běh zvlášť (z FIT souborů)
  const pick = (d, k) => v.rows.find((r) => r.date === d && r.sport === k) || v.rows.find((r) => r.date === d && r.sport === "both");
  // přenesení poslední hodnoty dopředu zvlášť pro kolo a běh (start = poslední měření úseku před oknem)
  const carry = (k) => {
    let cur = [...rowsOf(k)].reverse().find((r) => r.date < from && r.date >= since[k])?.v ?? null;
    return dates.map((d) => { if (d < since[k]) return null; const r = pick(d, k); if (r) cur = r.v; return cur; });
  };
  const none = dates.map(() => null);
  const ride = sports.includes("ride") ? carry("ride") : none, run = sports.includes("run") ? carry("run") : none;
  const measured = (k) => dates.map((d) => (since[k] && d >= since[k] ? pick(d, k)?.v ?? null : null));
  const mRide = measured("ride"), mRun = measured("run");
  const series = [];
  if (ride.some((x) => x != null)) series.push({ name: "kolo", values: ride, color: "var(--z2)", width: 2.4 }, { name: "měření kolo", values: mRide, color: "var(--z2)", dots: true, width: 0.01, noLegend: true, noTip: true });
  if (run.some((x) => x != null)) series.push({ name: "běh", values: run, color: "var(--acc)", width: 2.4 }, { name: "měření běh", values: mRun, color: "var(--acc)", dots: true, width: 0.01, noLegend: true, noTip: true });
  return `<div class="stats tight">${tile("ride", "Kolo", ic("kolo"))}${tile("run", "Běh", ic("beh"))}</div>` +
    lineChart({ x: dates, xfmt: dm, fmt: (x) => num(x), height: 170, minSpan: 4, series }) +
    `<p class="note">Čára = platná hodnota, tečka = aktivita, po které Garmin VO2max spočítal. Kolo a běh má Garmin zvlášť – čtu je přímo z FIT souboru každé jízdy a běhu (u starších dní, kde soubor není, z intervals.icu). Graf ukazuje u každého sportu jen měření od poslední pauzy delší než 60 dní (sport bez měření za 60 dní je jen v dlaždici). Hodnoť trend.</p>`;
}

/** FTP: kde se bere, co se přepočítá a kdy udělat test. */
function ftpCard(d) {
  const fc = d.ftpCheck || { suggest: false, title: "", reasons: [] };
  return card("c12", (ic("ftp") + " FTP – zóny a test"), "intervals.icu", `<div id="ftp" class="ftpbox ${fc.suggest ? "warn" : "ok"}"><b>${fc.suggest ? ic("varovani") : ic("odjeto")} ${esc(fc.title)}</b>${fc.reasons.length ? `<ul>${fc.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}</div>
    ${kv([["FTP teď", `${num(d.ftp)} W${d.ftpSetAt ? ` · od ${dm(d.ftpSetAt)}${d.ftpSetAt.slice(0, 4)}` : ""}`], ["eFTP (odhad z jízd)", d.eftp ? `${d.eftp.w} W · ${dm(d.eftp.date)}` : DASH]])}
    <details class="gcmp"><summary>Jak to funguje (nový test, přepočet aktivit)</summary><p class="note">FTP se bere z intervals.icu (jednou denně). Nový test zadej v intervals.icu (Settings → Ride → FTP) nebo v Nastavení – nové číslo z intervals.icu má přednost i před ručně zadaným. Když po testu v Garminu uvidíš v intervals.icu pořád staré FTP, zadej ho tam ručně – aplikace ho do druhého dne převezme.</p>
    <p class="note">Co se po změně přepočítá: zóny výkonu, watty v plánu a intervaly (hned) a odhad zátěže aktivit, ke kterým Garmin ani intervals.icu TSS nedaly. <b>Staré aktivity se nepřepočítávají</b> – jejich zátěž (TSS) spočítal Garmin / intervals.icu s FTP platným v den jízdy, a tak je to správně (jinak by se zpětně změnila kondice). Data se ukládají v databázi aplikace, ne v souborech.</p>
    <p class="note">Test doporučím sám, když 20 min výkon nebo eFTP z jízd vyjde o 3–5 % nad FTP, eFTP je o 10 % pod ním, nebo je FTP beze změny déle než 8 týdnů v sezóně / 12 mimo ni. Test: 20 min naplno po rozjetí, FTP = 95 % průměru (nebo ramp test na trenažéru).</p></details>`);
}

let kondRange = "90";
async function pageKondice(el) {
  const d = await api(kondRange === "ytd" ? "fitness?range=ytd" : "fitness");
  const m = d.metrics;
  if (!m.length) { el.innerHTML = `<div class="head"><div><h1>Kondice</h1></div></div><div class="card"><div class="empty">Kondici zatím nemám – spočítá se, až se stáhnou aktivity (zadej klíče v Nastavení). První data bývají do hodiny.</div></div>`; return; }
  // Kondice: výhled jen 7 dní (4 týdny jsou na Trenérovi)
  const proj = (d.projection || []).slice(0, 7);
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
    ${stat((ic("kondice") + " Kondice (CTL)"), num(last.ctl, 1), "", `${(last.ramp ?? 0) > 0.5 ? ic("kondice") : (last.ramp ?? 0) < -0.5 ? ic("pokles") : ic("rovne")} ramp ${signed(last.ramp, 1)} / 7 dní`, "")}
    ${stat((ic("unava") + " Únava (ATL)"), num(last.atl, 1), "", "zátěž posledních ~7 dní", "")}
    ${stat(`${last.form == null ? ic("cil") : last.form < -30 ? ic("varovani") : last.form < -10 ? ic("sila") : last.form <= 5 ? ic("pomer") : last.form <= 20 ? ic("svezi") : ic("volno")} Forma (TSB)`, signed(last.form, 1), "", `kondice − únava · ${esc(formZoneName(last.form))}`, last.form == null ? "" : last.form < -25 ? "bad" : last.form < -10 ? "warn" : "good")}
    ${d.hasPower === false ? "" : stat((ic("ftp") + " FTP"), num(d.ftp), " W", d.ftpCheck?.suggest ? `<span class="warn">${ic("varovani")} ${esc(d.ftpCheck.title)}</span>` : d.eftp ? `eFTP ${d.eftp.w} W (intervals.icu)` : "test 20 min", d.ftpCheck?.suggest ? "warn" : "")}
  </div>
  <div class="grid">
   ${card("c12", `${ic("kondice")} Kondice a únava · ${kondRange === "ytd" ? "od 1. 1." : "90 dní"} + výhled 7 dní`, "intervals.icu", lineChart({ x, xfmt: dm, height: 250, markIndex: lastIdx, series: [
     { name: "Kondice (CTL)", values: pad(m.map((r) => r.ctl), proj.length), color: "var(--z2)", width: 2.6, area: true },
     { name: "Únava (ATL)", values: pad(m.map((r) => r.atl), proj.length), color: "var(--z7)", width: 1.8 },
     { name: "výhled CTL", values: ctlP, color: "var(--z2)", dash: true, noLegend: true },
     { name: "výhled ATL", values: atlP, color: "var(--z7)", dash: true, noLegend: true },
   ] }) + `<p class="note">Čárkovaně = výhled podle plánu. Výhled na 4 týdny je na stránce <a href="#/trener">Trenér</a>.</p>`)}
   ${card("c8", (ic("cil") + " Forma (TSB)"), "intervals.icu", lineChart({ x, xfmt: dm, height: 205, markIndex: lastIdx, include: [-35, 25], bands: FORM_BANDS, yticks: [-30, -10, 5, 20], yfmt: (v) => signed(v), bandsLegend: false, legend: false, series: [
     { name: "Forma", values: pad(m.map((r) => r.form), proj.length), color: "var(--fg)", width: 3, bandColors: true },
     { name: "výhled", values: formP, color: "var(--fg)", dash: true, opacity: 0.6 },
   ] }) + `<p class="note fnow">Dnes <b style="color:${FORM_BANDS.find((z) => z.name === formZoneName(last.form))?.color || "inherit"}" title="${esc(formZoneName(last.form))}">${signed(last.form, 1)}</b></p>${formLegendHtml()}`)}
   ${card("c4", ic("vo2") + " VO2max", "Garmin (FIT)", `<div id="vo2" class="loading sm">Načítám…</div>`)}
   ${card("c12", (ic("kalendar") + " Přehled zátěže · 4 týdny"), "intervals.icu", loadOverviewHtml(d.loadDays))}
   ${d.hasPower === false ? "" : card("c12", (ic("ftp") + " Křivka výkonu"), "intervals.icu", `<div id="pcurve" class="loading sm">Načítám křivku…</div><p class="note">Nejlepší průměrný výkon pro každou délku úsilí (1 s – 4 h). Najeď myší pro W a W/kg.</p>`)}
   ${d.hasPower === false ? "" : ftpCard(d)}
   ${card("c6", (ic("odjeto") + " Splnění plánu"), "plán vs. odtrénováno", `<div id="anComp" class="loading sm">Načítám…</div>`)}
   ${card("c6", (ic("intenzita") + " Rozložení intenzity · 80/20"), "tep v zónách", `<div id="anInt" class="loading sm">Načítám…</div>`)}
   ${card("c6", (ic("cil") + " Kondice k cíli"), "CTL", `<div id="anCtl" class="loading sm">Načítám…</div>`)}
   ${d.hasPower === false ? "" : card("c6", (ic("vitr") + " Efficiency Factor"), "NP / tep", `<div id="anEf" class="loading sm">Načítám…</div>`)}
   ${card("c12", (ic("presun") + " Monotónnost a strain"), "Foster", `<div id="anMon" class="loading sm">Načítám…</div>`)}
   <details class="card c12 yrfold" id="yrFold"><summary>${ic("kalendar")} Porovnání s jiným rokem</summary><div id="years" class="loading sm">Načítám…</div></details>
   ${d.warnings.length ? card("c12", (ic("varovani") + " Upozornění"), "", `<ul class="alerts">${d.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`) : ""}
  </div>`;
  el.querySelector("#yrFold")?.addEventListener("toggle", (e) => { if (e.target.open && !e.target.dataset.done) { e.target.dataset.done = "1"; fillYears(el); } });
  api("analytics").then((a) => fillAnalytics(el, a)).catch((e) => el.querySelectorAll("#anComp,#anInt,#anCtl,#anEf,#anMon").forEach((b) => { b.className = ""; b.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }));
  el.querySelectorAll("[data-kr]").forEach((b) => b.addEventListener("click", () => { if (kondRange === b.dataset.kr) return; kondRange = b.dataset.kr; pageKondice(el); }));
  api("vo2").then((v) => { const b = el.querySelector("#vo2"); if (b) { b.className = ""; b.innerHTML = vo2Html(v); } }).catch((e) => { const b = el.querySelector("#vo2"); if (b) b.innerHTML = `<div class="empty">${esc(e.message)}</div>`; });
  if (d.hasPower !== false) api("power-curve").then((pc) => { const b = el.querySelector("#pcurve"); if (b) { b.className = ""; b.innerHTML = powerCurveChart(pc); } }).catch((e) => { const b = el.querySelector("#pcurve"); if (b) b.innerHTML = `<div class="empty">${esc(e.message)}</div>`; });
}

let cmpYear = null;
/** Porovnání kondice s jiným rokem: CTL po dnech v roce (letos plně, srovnávaný rok slabší), tabulka od 1. 1. do stejného dne. */
function yearsHtml(d) {
  if (!d.cmp) return `<div class="empty">Starší rok v datech nemám.</div>`;
  const days = [];
  for (let t = Date.UTC(2024, 0, 1); t < Date.UTC(2025, 0, 1); t += 86400000) days.push(new Date(t).toISOString().slice(5, 10));
  const map = (rows, k) => { const m = new Map(rows.map((r) => [r.md, r[k]])); return days.map((x) => m.get(x) ?? null); };
  const ti = days.indexOf(d.today.slice(5));
  const curCtl = map(d.cur.rows, "ctl").map((v, i) => (i <= ti ? v : null));
  const a = d.cur, b = d.cmp;
  const row = (label, va, vb, unit = "", dec = 0) => `<tr><td>${label}</td><td class="r"><b>${va == null ? DASH : num(va, dec)}</b>${unit}</td><td class="r">${vb == null ? DASH : num(vb, dec)}${unit}</td><td class="r ${va != null && vb != null ? (va >= vb ? "up" : "down") : ""}">${va != null && vb != null ? signed(va - vb, dec) : ""}</td></tr>`;
  return `<div class="yrsel"><span class="sub">Letos proti</span>${d.years.map((y) => `<button class="${y === b.year ? "on" : ""}" data-cy="${y}">${y}</button>`).join("")}</div>`
    + lineChart({ x: days, xfmt: (m) => `${+m.slice(3)}.${+m.slice(0, 2)}.`, height: 220, markIndex: ti, step: 61, series: [
      { name: `Kondice ${b.year}`, values: map(b.rows, "ctl"), color: "var(--muted)", width: 2, dash: true },
      { name: `Kondice ${a.year}`, values: curCtl, color: "var(--z2)", width: 2.8, area: true },
    ] })
    + `<table class="t ycmp"><tr><th>Od 1. 1. do ${dm(d.today)}</th><th class="r">${a.year}</th><th class="r">${b.year}</th><th class="r">rozdíl</th></tr>
      ${row("Kondice (CTL) k dnešku", a.atDay?.ctl, b.atDay?.ctl, "", 1)}
      ${row("Nejvyšší CTL zatím", a.peak?.ctl, b.peak?.ctl, "", 1)}
      ${row("Forma k dnešku", a.atDay?.form, b.atDay?.form, "", 1)}
      ${row("Hodiny", a.ytd.h, b.ytd.h, " h")}
      ${row("Km na kole", a.ytd.bikeKm, b.ytd.bikeKm, " km")}
      ${row("Nastoupáno", a.ytd.up, b.ytd.up, " m")}
      ${row("Zátěž celkem", a.ytd.load, b.ytd.load)}
      ${row("Aktivit", a.ytd.n, b.ytd.n)}</table>`;
}
const yearsAiText = (d) => [d.cur, d.cmp].filter(Boolean).map((x) => `ROK ${x.year} (od 1. 1. do ${dm(d.today)}): CTL k tomuto dni ${num(x.atDay?.ctl, 1)}, forma ${num(x.atDay?.form, 1)}, nejvyšší CTL ${num(x.peak?.ctl, 1)} (${x.peak ? dm(x.peak.date) : "–"}), ${x.ytd.h} h, kolo ${x.ytd.bikeKm} km, nastoupáno ${x.ytd.up} m, zátěž ${x.ytd.load}, ${x.ytd.n} aktivit${x.year !== d.cur.year ? `; CTL ke konci roku ${num(x.rows.filter((r) => r.ctl != null).slice(-1)[0]?.ctl, 1)}` : ""}`).join("\n");
async function fillYears(el) {
  const box = el.querySelector("#years");
  if (!box) return;
  try {
    const d = await api("fitness-years" + (cmpYear ? `?y=${cmpYear}` : ""));
    box.className = ""; box.innerHTML = yearsHtml(d);
    box.querySelectorAll("[data-cy]").forEach((b) => b.addEventListener("click", () => { cmpYear = b.dataset.cy; box.className = "loading sm"; fillYears(el); }));
    box.querySelector("#aiYears")?.addEventListener("click", () => openAiPanel({ title: "Porovnání roků", extra: yearsAiText(d), ask: `Porovnej mou kondici letos (${d.cur.year}) a v roce ${d.cmp.year} ke stejnému dni: kde jsem na tom líp nebo hůř, proč (objem, zátěž) a co z toho plyne pro zbytek sezóny.` }));
  } catch (e) { box.className = ""; box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
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
  if (!cp) { el.querySelector("#anCtl")?.closest(".card")?.remove(); } else put("#anCtl", cp ? verdict(cp.tone, cp.text)
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
  const pre = (PART_PRESET[g.kind] || (BIKE_KINDS.has(g.kind) && g.kind !== "trainer" ? PART_PRESET.bike : [])).filter(([n]) => !ps.some((p) => p.name === n));
  return `<div class="gparts"><div class="sl">Díly a servis</div>${rows || `<p class="sub gp-empty">Zatím žádné díly – přidej je a hlídej km od servisu (upozornění se ukáže po otevření stránky).</p>`}
    <div class="gp-add">${pre.slice(0, 2).map(([n, a, i, r]) => `<button class="btn sm" data-preset='${esc(JSON.stringify({ name: n, action: a, interval_km: i, repeat_km: r }))}' data-gid="${g.id}">＋ ${esc(n)} ${thou(i)} km</button>`).join("")}<details class="addpart"><summary class="btn sm">＋ Jiný díl</summary>
    <form class="pform form-grid" data-gid="${g.id}"><label>Název<input name="name" placeholder="např. Řetěz" required></label><label>Tlačítko<input name="action" placeholder="Vyměněno"></label><label>Kontrola po (km)<input name="interval_km" type="number" min="0"></label><label>Pak každých (km)<input name="repeat_km" type="number" min="0"></label><label>Najeto už teď (km)<input name="start_km" type="number" min="0" value="0"></label><label>Počítat od data<input name="since" type="date"></label><div><button class="btn pri" type="submit">Přidat díl</button></div></form></details></div></div>`;
}
/** druh vybavení: ikona (SVG), barva, název */
/** druhy vybavení: [klíč ikony, název]; „bike“ = kolo bez bližšího určení (starší záznamy) */
const GEAR_KIND = { road: ["silnicni", "Silniční kolo"], mtb: ["horske", "Horské kolo"], gravel: ["gravel", "Gravel"], trainer: ["trenazerVyb", "Trenažér"], bike: ["silnicni", "Kolo (jiné)"], ski: ["lyze", "Lyže"], shoe: ["boty", "Boty"], other: ["batoh", "Jiné"] };
/** všechna kola – nabízí se u jízd (silnice, horské kolo, trenažér) */
const BIKE_KINDS = new Set(["road", "mtb", "gravel", "trainer", "bike"]);
/** ikona a barva vybavení; u starého „Kolo“ podle sportů, pro které je výchozí (jen MTB → horské) */
const gearLook = (g) => {
  const df = (g.default_for || "").split(",");
  const k = g.kind === "bike" && df.includes("mtb") && !df.includes("ride") ? "horske" : (GEAR_KIND[g.kind] || GEAR_KIND.other)[0];
  return { key: k, color: `var(${IC[k][0] || "--z1"})` };
};
const gearIco = (g) => ic(gearLook(g).key);
const GEAR_SPORTS = [["ride", "Silnice"], ["mtb", "Horské kolo"], ["indoor", "Trenažér"], ["run", "Běh"], ["xc_ski", "Běžky"], ["walk", "Chůze"], ["hike", "Turistika"]];
let gearShow = "active"; // active | retired
async function pageVybaveni(el) {
  const list = await api("gear");
  const form = (g = {}) => `<form class="gform" data-id="${g.id || ""}"><div class="form-grid">
    <label>Název<input name="name" value="${esc(g.name || "")}" placeholder="např. Silniční kolo" required></label>
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
      <div class="gc-h"><span class="gc-ico">${ic(look.key)}</span>
        <div class="gc-t"><b>${esc(g.name)}</b><span class="sub">${(GEAR_KIND[g.kind] || GEAR_KIND.other)[1]}${sports.length ? ` · výchozí pro ${esc(sports.join(", ").toLowerCase())}` : " · jen ručně"}${g.to_date ? ` · vyřazeno ${dm(g.to_date)}${g.to_date.slice(0, 4)}` : ""}</span></div>
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
      try { await api(f.dataset.id ? `gear/${f.dataset.id}` : "gear", { method: f.dataset.id ? "PUT" : "POST", body: JSON.stringify(body) }); close(); reload(); } catch (err) { fail(err); }
    });
    f.querySelector("[data-del]")?.addEventListener("click", async () => { if (!confirm("Smazat vybavení? Aktivity zůstanou.")) return; try { await api(`gear/${f.dataset.id}`, { method: "DELETE" }); close(); reload(); } catch (err) { fail(err); } });
  };
  el.querySelector("#gearAdd").addEventListener("click", () => openForm(null));
  el.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openForm(list.find((g) => String(g.id) === b.dataset.edit))));
  el.querySelectorAll("[data-gs]").forEach((b) => b.addEventListener("click", () => { gearShow = b.dataset.gs; pageVybaveni(el); }));
  el.querySelectorAll("[data-reset]").forEach((b) => b.addEventListener("click", async () => { if (!confirm(`Zapsat „${b.textContent.replace("✓ ", "")}“ k dnešku? Km dílu začnou od nuly.`)) return; b.disabled = true; try { await api(`gear/parts/${b.dataset.reset}/reset`, { method: "POST", body: "{}" }); reload(); } catch (err) { fail(err, b); } }));
  el.querySelectorAll("[data-pdel]").forEach((b) => b.addEventListener("click", async () => { if (!confirm("Smazat díl i s historií servisu?")) return; try { await api(`gear/parts/${b.dataset.pdel}`, { method: "DELETE" }); reload(); } catch (err) { fail(err); } }));
  el.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", async () => { b.disabled = true; try { await api(`gear/${b.dataset.gid}/parts`, { method: "POST", body: b.dataset.preset }); reload(); } catch (err) { fail(err, b); } }));
  el.querySelectorAll(".pform").forEach((f) => f.addEventListener("submit", async (e) => { e.preventDefault(); const fd = new FormData(f); try { await api(`gear/${f.dataset.gid}/parts`, { method: "POST", body: JSON.stringify(Object.fromEntries(fd)) }); reload(); } catch (err) { fail(err); } }));
}

/** Aktivity s jedním vybavením (klik na vybavení). */
async function pageGear(el, id) {
  const { gear: g, acts } = await api(`gear/${id}/activities`);
  const km = acts.reduce((t, a) => t + (a.distance_m || 0), 0) / 1000, s = acts.reduce((t, a) => t + (a.moving_s || 0), 0), up = acts.reduce((t, a) => t + (a.elev_gain || 0), 0);
  let month = "";
  const list = acts.map((a) => { const m = a.date.slice(0, 7); const head = m !== month ? `<div class="mhead">${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}</div>` : ""; month = m; return head + actRowHtml(a); }).join("");
  el.innerHTML = `<div class="head"><div><a class="back" href="#/vybaveni">← Vybavení</a><h1>${gearIco(g)} ${esc(g.name)}</h1><div class="sub">${acts.length} aktivit · ${thou(km)} km${g.start_km ? ` (+ ${thou(g.start_km)} km před evidencí)` : ""} · ${hmm(s)} h · ↑ ${thou(up)} m</div></div></div>
  <div class="grid">${card("c12", "", "", `<div class="alist">${list || '<div class="empty">S tímto vybavením zatím žádná aktivita.</div>'}</div>`)}</div>`;
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

/** „před 25 min“ / „před 3 h“ / „před 2 dny“ */
function ago(t) {
  const m = Math.round((Date.now() - new Date(t).getTime()) / 60000);
  if (m < 1) return "právě teď";
  if (m < 60) return `před ${m} min`;
  if (m < 48 * 60) return `před ${Math.round(m / 60)} h`;
  return `před ${Math.round(m / 1440)} dny`;
}
// přepínač filtru logu: jedna obsluha pro celý dokument (karta se vykresluje až po načtení stránky)
document.addEventListener("click", (e) => {
  const b = e.target.closest?.(".slog [data-f]");
  if (!b) return;
  const root = b.closest(".slog");
  root.querySelectorAll("[data-f]").forEach((x) => x.classList.toggle("on", x === b));
  let n = 0;
  root.querySelectorAll("tr[data-k]").forEach((r) => { const show = b.dataset.f === "all" || r.dataset.k === b.dataset.f; r.style.display = show ? "" : "none"; if (show) n++; });
  const em = root.querySelector(".slog-empty");
  if (em) em.style.display = n ? "none" : "";
});
/** Log synchronizace: hodinky → Garmin Connect, stažený spánek a aktivity, chyby. Filtr podle druhu. */
function syncLogHtml(logs) {
  const kind = (l) => (l.level !== "info" ? "err" : /^sync:/.test(l.msg) ? "sync" : "other");
  const rows = (logs || []).map((l) => ({ ...l, k: kind(l), txt: l.msg.replace(/^sync:\s*/, "") }));
  const tr = (l) => `<tr data-k="${l.k}"><td class="sub" style="white-space:nowrap">${new Date(l.at).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}</td><td>${l.k === "err" ? `<span class="${l.level === "error" ? "bad" : "warn"}">${ic("varovani")} ${esc(l.txt)}</span>` : esc(l.txt)}</td></tr>`;
  return `<div class="slog"><div class="seg sm" style="margin-bottom:8px">${[["all", "Vše"], ["sync", "Synchronizace"], ["err", "Chyby"]].map(([k, l], i) => `<button class="${i ? "" : "on"}" data-f="${k}">${l}</button>`).join("")}</div>
    ${rows.length ? `<div style="max-height:340px;overflow:auto"><table class="t">${rows.map(tr).join("")}</table></div>` : ""}<div class="empty slog-empty" style="${rows.length ? "display:none" : ""}">Žádné záznamy.</div>
    <p class="note">Aplikace se ptá Garminu každých 5 min. Do logu se zapíše jen novinka: hodinky poslaly data do Garmin Connect, stáhl se spánek nebo nová aktivita, případně chyba.</p></div>`;
}

/** Nastavení: záložky (Obecné · Trénink · AI · Připojení), každá skupina v kartě se svým „Uložit“ */
let nTab = (() => { try { return localStorage.getItem("nTab") || "obecne"; } catch { return "obecne"; } })();
const N_TABS = [["obecne", "Obecné"], ["trenink", "Trénink"], ["ai", "AI"], ["pripojeni", "Připojení"]];
/** pole formuláře: popis nahoře, nápověda pod polem */
// přepínač tlačítek nesmí být v <label> (klik na popisek by zmáčkl první tlačítko)
const nField = (label, input, hint = "") => { const t = /class="seg/.test(input) ? "div" : "label"; return `<${t} class="nf"><span class="nf-l">${label}</span><span class="nf-i">${input}</span>${hint ? `<small class="nf-h">${hint}</small>` : ""}</${t}>`; };
/** přepínač (checkbox) jako řádek: text vlevo, vypínač vpravo */
const nToggle = (name, on, label, hint = "") => `<label class="ntg"><span><b>${label}</b>${hint ? `<small>${hint}</small>` : ""}</span><input type="checkbox" name="${name}" ${on ? "checked" : ""} role="switch"></label>`;
const nSave = (txt = "Uložit") => `<div class="nsave"><button class="btn pri" type="submit">${txt}</button><span class="note fmsg" role="status"></span></div>`;
async function pageNastaveni(el) {
  const [s, st0, sec] = await Promise.all([api("settings"), api("status").catch(() => null), api("secrets").catch(() => [])]);
  const st = st0 || { state: {}, counts: {}, logs: [], source: "", llm: false, model: "" };
  const SEC_LABEL = { GARMIN_API_KEY: ["Garmin API klíč", "Garmin Connect → Nastavení → Personal API"], INTERVALS_API_KEY: ["intervals.icu API klíč", "intervals.icu → Settings → Developer Settings"], INTERVALS_ATHLETE_ID: ["intervals.icu ID sportovce", "např. i123456 (Settings → dole Developer Settings)"], MAPY_API_KEY: ["Mapy.com API klíč (mapové podklady)", "zdarma na developer.mapy.com → Můj účet → API klíč; omez ho na doménu, kde aplikace běží"], GEMINI_API_KEY: ["Google AI Studio klíč (AI Gemma)", "zdarma na aistudio.google.com → Get API key"], NVIDIA_API_KEY: ["NVIDIA nebo OpenRouter API klíč (AI Nemotron)", "build.nvidia.com → Get API Key (nvapi-…), nebo openrouter.ai → Keys (sk-or-…)"] };
  const v = (k) => esc(s[k] ?? "");
  const theme = document.documentElement.getAttribute("data-theme") || "auto";
  const tab = (k) => `data-nt="${k}"`;
  const bf = st.state.bf_act || {}, bw = st.state.bf_well || {};
  const when = (t) => `${new Date(t).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })} <small class="sub">(${ago(t)})</small>`;

  const lookCard = card("c6", (ic("vzhled") + " Vzhled"), "toto zařízení", `<div class="nf"><span class="nf-l">Režim</span><div class="seg nseg" id="thSeg">${[["auto", "Auto"], ["light", (ic("slunce") + " Světlý")], ["dark", (ic("noc") + " Tmavý")]].map(([k, l]) => `<button type="button" class="${theme === k ? "on" : ""}" data-theme="${k}">${l}</button>`).join("")}</div></div>
    <label class="ntg"><span><b>„%“ u čísla v kroužku</b><small>na Přehledu (71 %)</small></span><input type="checkbox" id="ringPct" ${ringPref().pct ? "checked" : ""} role="switch"></label>`, tab("obecne"));
  const wxCard = card("c6", (ic("pocasi") + " Počasí"), "Open-Meteo", `<form data-sf class="nform">
    <div class="nrow2 wide">${nField("Domov", `<input name="place_name" value="${v("place_name")}" required>`, "Přehled, plán a okna na trénink")}${nField("Druhé místo", `<input name="place2_name" value="${v("place2_name")}" placeholder="např. Špindlerův Mlýn">`, "hory, chata – přepínač na stránce Počasí")}</div>
    <div class="sl">Tvoje teploty na jízdu (teplota vzduchu)</div>
    <div class="nrow3">${nField("Jezdím od", `<input name="t_cold" type="number" min="-15" max="20" inputmode="numeric" value="${s.ride_temps?.cold ?? 3}"><i class="unit">°C</i>`)}${nField("Ideál", `<input name="t_ideal" type="number" min="0" max="30" inputmode="numeric" value="${s.ride_temps?.ideal ?? 18}"><i class="unit">°C</i>`)}${nField("Vedro nad", `<input name="t_hot" type="number" min="20" max="40" inputmode="numeric" value="${s.ride_temps?.hot ?? 30}"><i class="unit">°C</i>`)}</div>
    ${nSave()}</form>`, tab("obecne"));
  const goalCard = card("c6", ic("cil") + " Cíl a výkon", "", `<form data-sf class="nform">
    <div class="nrow2">${nField("FTP", `<input name="ftp" type="number" min="80" max="600" inputmode="numeric" value="${v("ftp")}"><i class="unit">W</i>`)}${nField("Roční cíl na kole", `<input name="year_km_goal" type="number" min="0" inputmode="numeric" value="${v("year_km_goal")}"><i class="unit">km</i>`)}</div>
    ${nField("Cíl tréninku", `<select name="goal">${[["zvyseni", "Zlepšit kondici"], ["udrzeni", "Udržet formu"], ["pokles", "Zima (mimo sezónu)"], ["zavod", "Závod"]].map(([k, l]) => `<option value="${k}" ${s.goal === k ? "selected" : ""}>${l}</option>`).join("")}</select>`, "stejný jako v Trenérovi, platí do změny")}
    ${nField("Název cíle / závodu", `<input name="goal_name" value="${v("goal_name")}" placeholder="nepovinné">`)}
    <div class="nrow2">${nField("Datum cíle", `<input name="goal_date" type="date" value="${v("goal_date")}">`)}${nField("Kondice k datu", `<input name="goal_ctl" type="number" min="10" max="150" inputmode="numeric" value="${v("goal_ctl")}" placeholder="návrh"><i class="unit">CTL</i>`)}</div>
    ${nSave()}</form>`, tab("trenink"));
  const planCard = card("c6", (ic("odeslat") + " Plán a kalendář"), "", `<form data-sf class="nform">
    ${nToggle("icu_sync", s.icu_sync, "Zápis plánu do intervals.icu", "tréninky se objeví v kalendáři a v hodinkách")}
    ${nSave()}</form>`, tab("trenink"));
  const aiCard = card("c6", "AI", "", `<form data-sf class="nform">
    ${nToggle("llm_enabled", s.llm_enabled, "AI pro volné otázky a chat", "tlačítko AI vpravo nahoře")}
    ${nToggle("act_ai", s.act_ai !== false, "AI hodnocení aktivit", "vypnuté = krátké hodnocení z čísel")}
    ${nToggle("ai_private", s.ai_private, "Bez zdravotních údajů", "AI dostane jen trénink – ne VST, spánek, tep, stres ani váhu")}
    ${nSave()}</form>`, tab("ai"));
  const secCard = card("c12", (ic("klic") + " API klíče"), "šifrovaně", `<form class="nform" id="secF" autocomplete="off"><div class="nrow2 wide">${sec.map((x) => nField(SEC_LABEL[x.key]?.[0] || x.key, `<input type="password" autocomplete="off" data-sec="${x.key}" placeholder="${x.source ? `nastaveno (${x.source === "dashboard" ? "zde" : "ze souboru"}) ${x.hint}` : "nenastaveno"}">`, SEC_LABEL[x.key]?.[1] || "")).join("")}</div>
    <div class="nsave"><button class="btn pri" type="submit">Uložit vyplněné</button><button class="btn" type="button" id="secTest">Otestovat připojení</button><span class="note" id="secMsg" role="status"></span></div>
    <p class="note">Klíč se uloží zašifrovaný v databázi a má přednost před souborem .dev.vars. Prázdné pole = beze změny.</p></form>
    <form data-sf class="nform nsep"><div class="nrow2">${nField("Garmin klíč vytvořen", `<input name="garmin_key_created" type="date" value="${v("garmin_key_created")}">`, "upozorním před vypršením")}</div>${nSave()}</form>`, tab("pripojeni"));
  const syncCard = st0 ? card("c6", ic("sync") + " Synchronizace", st.source, kv([
    ["Data z Garminu", st.state.last_sync_ok ? when(st.state.last_sync_ok) : DASH],
    ["Hodinky → Garmin", st.state.watch_data_until ? when(st.state.watch_data_until) : `<span class="sub">zatím nezaznamenáno</span>`],
    ["Aktivity", `${st.counts.acts} (od ${st.counts.a_from ? dm(st.counts.a_from) + st.counts.a_from.slice(0, 4) : DASH})`],
    ["Dny / noci", `${st.counts.days} / ${st.counts.nights}`],
    ["Historie", `aktivity ${bf.done ? "hotovo" : `${bf.count ?? 0}…`} · wellness ${bw.done ? "hotovo" : bw.cursor ?? DASH}`],
    ["Naplánováno", st.counts.planned],
    ["AI", st.llm ? esc(st.model) : "nedostupné"],
  ]), tab("pripojeni")) + card("c6", (ic("log") + " Log synchronizace"), "Cloudflare", syncLogHtml(st.logs), tab("pripojeni")) : "";
  const acc = (await accountCard(el)).replace("<section ", `<section ${tab("obecne")} `);

  el.innerHTML = `<div class="head"><div><h1>Nastavení</h1><div class="sub">verze ${esc(document.documentElement.dataset.ver || "–")}</div></div></div>
  <div class="ioseg ntabs" role="tablist">${N_TABS.map(([k, l]) => `<button type="button" role="tab" data-ntab="${k}" class="${nTab === k ? "on" : ""}" aria-selected="${nTab === k}">${l}</button>`).join("")}</div>
  <div class="grid nset">
   ${lookCard}${wxCard}${acc}
   ${goalCard}${planCard}
   ${card("c12", (ic("kompas") + " Trenér"), "hlavní sport a další sporty", `<div id="coachProf" class="loading sm">Načítám profil…</div>`, tab("trenink"))}
   ${card("c6", (ic("tep") + " Zóny tepu"), s.hr_zones ? s.hr_zones.source : "", s.hr_zones ? kv([...s.hr_zones.floors.map((x, i) => [`Z${i + 1} od`, x + " bpm"]), ["Max", s.hr_zones.max + " bpm"], ["LTHR", (s.hr_zones.lthr ?? DASH) + " bpm"], ["Klidový", (s.hr_zones.rest ?? DASH) + " bpm"]]) : '<div class="empty">Nemám.</div>', tab("trenink"))}
   ${card("c6", (ic("kondice") + " FTP a zóny v čase"), "od kdy platí", `<div id="zoneHist" class="loading sm">Načítám…</div>`, tab("trenink"))}
   ${aiCard}
   ${card("c6", (ic("model") + " AI model"), "", `<div id="aiModels" class="loading sm">Načítám modely…</div>`, tab("ai"))}
   ${secCard}${syncCard}
   <div class="c12 nout" ${tab("obecne")}><a class="btn" href="/logout">Odhlásit se</a></div>
  </div>`;
  const showTab = (k) => {
    nTab = k; try { localStorage.setItem("nTab", k); } catch {}
    el.querySelectorAll("[data-ntab]").forEach((b) => { b.classList.toggle("on", b.dataset.ntab === k); b.setAttribute("aria-selected", b.dataset.ntab === k); });
    el.querySelectorAll(".nset > [data-nt]").forEach((c) => c.classList.toggle("nt-off", c.dataset.nt !== k));
  };
  showTab(N_TABS.some(([k]) => k === nTab) ? nTab : "obecne");
  el.querySelectorAll("[data-ntab]").forEach((b) => b.addEventListener("click", () => { showTab(b.dataset.ntab); scrollTo(0, 0); }));
  // uložení skupiny: posílají se jen pole z jejího formuláře
  el.querySelectorAll("form[data-sf]").forEach((form) => form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form), has = (k) => form.elements[k] != null, body = {};
    // volitelné údaje: prázdné = smazat (null); povinné (cíl, domov): prázdné se neposílá → zůstane uložená hodnota
    for (const k of ["ftp", "year_km_goal", "goal_ctl"]) if (has(k)) body[k] = fd.get(k) ? Number(fd.get(k)) : null;
    for (const k of ["goal_name", "goal_date", "garmin_key_created", "place2_name"]) if (has(k)) body[k] = String(fd.get(k) ?? "").trim() || null;
    for (const k of ["goal", "place_name"]) if (has(k) && String(fd.get(k) ?? "").trim()) body[k] = String(fd.get(k)).trim();
    for (const k of ["llm_enabled", "act_ai", "ai_private", "icu_sync"]) if (has(k)) body[k] = fd.get(k) === "on";
    if (has("t_cold")) {
      const numOr = (k, d) => { const x = String(fd.get(k) ?? "").trim(); return x !== "" && isFinite(+x) ? +x : d; };
      body.ride_temps = { cold: numOr("t_cold", s.ride_temps?.cold ?? 3), hot: numOr("t_hot", s.ride_temps?.hot ?? 30), ideal: numOr("t_ideal", s.ride_temps?.ideal ?? 18) };
    }
    const msg = form.querySelector(".fmsg"), btn = form.querySelector("[type=submit]");
    btn.disabled = true; msg.textContent = "Ukládám…";
    try {
      const r = await api("settings", { method: "POST", body: JSON.stringify(body) });
      cache.clear();
      msg.textContent = r.proposal ? `✓ Uloženo. Cíl změněn – ${r.proposal.count} změn v plánu čeká na potvrzení v Trenérovi.` : "✓ Uloženo";
    } catch (err) { msg.textContent = `Nepovedlo se: ${err.message}`; }
    btn.disabled = false;
  }));
  coachProfileForm(el.querySelector("#coachProf"));
  zoneHistoryCard(el.querySelector("#zoneHist"));
  // AI model: výběr a test
  api("llm-models").then((m) => {
    const box = el.querySelector("#aiModels"); if (!box) return;
    box.classList.remove("loading", "sm");
    const opt = (val, l) => `<option value="${esc(val)}" ${s.llm_model === val ? "selected" : ""}>${esc(l)}</option>`;
    // OpenRouter: u modelu poznámka zdarma / placený (placený jen s kreditem na klíči)
    const grp = (p, name, ids) => ids.length ? `<optgroup label="${name}">${ids.map((id) => opt(`${p}:${id}`, m.openrouter && p === "nvidia" ? (id.endsWith(":free") ? `${id.replace(":free", "")} · zdarma` : `${id} · placený (potřebuje kredit)`) : id)).join("")}</optgroup>` : "";
    box.innerHTML = `${nField("Model", `<select id="llmSel">${opt("auto", "Automaticky (nejlepší dostupný)")}${grp("google", "Google AI Studio · Gemma", m.google)}${grp("nvidia", m.openrouter ? "OpenRouter · Nemotron" : "NVIDIA · Nemotron", m.nvidia)}${grp("workers", "Cloudflare Workers AI", m.workers)}</select>`, `Teď se zkouší v pořadí: ${m.chain.map(esc).join(" → ") || "nic – zadej klíč v Připojení"}`)}
      <div class="nsave"><button class="btn pri" id="llmSave">Uložit model</button><button class="btn" id="llmTest">Vyzkoušet</button><span class="note" id="llmMsg" role="status"></span></div><div id="llmRes" class="llmres"></div>
      <p class="note">${!m.keys.google && !m.keys.nvidia ? "Zatím běží jen Workers AI (Mistral). Pro chytřejší AI s lepší češtinou zadej v Připojení klíč Google AI Studio (Gemma) nebo NVIDIA (Nemotron) – oba jsou zdarma. " : ""}Když vybraný model neodpoví, zkusí se další v pořadí. Čísla v odpovědích se dál kontrolují proti datům. Pozor: Google na bezplatném tarifu může dotazy použít ke zlepšování svých modelů – posílají se čísla tréninku a zdraví, ne jméno ani klíče.</p>`;
    box.querySelector("#llmSave").addEventListener("click", async () => { const msg = box.querySelector("#llmMsg"); try { await api("settings", { method: "POST", body: JSON.stringify({ llm_model: box.querySelector("#llmSel").value }) }); cache.clear(); msg.textContent = "✓ Uloženo"; } catch (e) { msg.textContent = e.message; } });
    box.querySelector("#llmTest").addEventListener("click", async (e) => { const b = e.currentTarget, msg = box.querySelector("#llmMsg"), out = box.querySelector("#llmRes"); b.disabled = true; msg.textContent = "Ptám se všech modelů…"; out.innerHTML = ""; try { const r = await api("llm-test", { method: "POST", body: JSON.stringify({ model: box.querySelector("#llmSel").value }) }); msg.textContent = ""; out.innerHTML = r.rows.map((x) => `<div class="llmrow ${x.ok ? "good" : "bad"}"><b>${x.ok ? "✓" : "✗"} ${esc(x.model)}</b><small>${(x.ms / 1000).toFixed(1)} s</small><span>${esc(x.ok ? `„${x.answer}“` : x.error || "prázdná odpověď")}</span>${x.hint ? `<em>${esc(x.hint)}</em>` : ""}</div>`).join(""); } catch (err) { msg.textContent = err.message; } b.disabled = false; });
  }).catch(() => { const box = el.querySelector("#aiModels"); if (box) box.innerHTML = '<div class="empty">Seznam modelů se nepodařilo načíst.</div>'; });
  el.querySelectorAll("[data-theme]").forEach((b) => b.addEventListener("click", () => { setTheme(b.dataset.theme); el.querySelectorAll("[data-theme]").forEach((x) => x.classList.toggle("on", x === b)); }));
  el.querySelector("#ringPct")?.addEventListener("change", (e) => { try { localStorage.setItem("ringPct", e.target.checked ? "1" : "0"); } catch {} toast("Uloženo – uvidíš na Přehledu"); });
  el.querySelector("#secF")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = el.querySelector("#secMsg");
    let n = 0;
    try {
      for (const inp of el.querySelectorAll("[data-sec]")) if (inp.value.trim()) { await api("secrets", { method: "POST", body: JSON.stringify({ key: inp.dataset.sec, value: inp.value.trim() }) }); inp.value = ""; n++; }
      msg.textContent = n ? `Uloženo (${n}). Otestuj připojení.` : "Nic k uložení.";
    } catch (err) { msg.textContent = `${n ? `Uloženo ${n}, další klíč ` : ""}nepovedlo se uložit: ${err.message}`; }
    cache.clear();
  });
  el.querySelector("#secTest")?.addEventListener("click", async () => { const msg = el.querySelector("#secMsg"); msg.textContent = "Zkouším…"; try { const r = await api("secrets/test", { method: "POST" }); msg.textContent = `Garmin: ${r.garmin} · intervals.icu: ${r.intervals}`; } catch (e) { msg.textContent = e.message; } });
}

// ---------- Nastavení: trenér (hlavní sport, další sporty) ----------
/** Historie FTP a zón: starší aktivity se vyhodnocují podle hodnot platných v den aktivity. */
async function zoneHistoryCard(box) {
  if (!box) return;
  const rows = await api("zones/history").catch(() => null);
  box.classList.remove("loading");
  if (!rows || !rows.length) { box.innerHTML = '<div class="empty">Zatím jen dnešní hodnoty – historie se doplní při další synchronizaci.</div>'; return; }
  const src = { icu: "intervals.icu (jízdy)", settings: "nastavení / synchronizace" };
  const yr = (d) => `${dm(d)}${d.slice(0, 4)}`;
  box.innerHTML = `<table class="t"><tr><th>Platí od</th><th class="r">FTP</th><th class="r">LTHR</th><th>Zdroj</th></tr>${rows.slice().reverse().map((r, i, a) => `<tr><td>${i === a.length - 1 ? "začátek historie" : yr(r.date)}</td><td class="r">${r.ftp != null ? r.ftp + " W" : DASH}</td><td class="r">${r.lthr != null ? r.lthr + " bpm" : DASH}</td><td>${src[r.source] || esc(r.source || "")}</td></tr>`).join("")}</table>
  <p class="note">Starší aktivity se vyhodnocují podle FTP a zón platných v den aktivity (barvy zón v grafu, výkon v Z2, EF, odhad zátěže bez intervals.icu), ne podle dnešních. Pomlčka = beze změny proti předchozímu řádku. Před prvním záznamem platí nejstarší známé FTP.</p>`;
}

async function coachProfileForm(box) {
  if (!box) return;
  let d;
  try { d = await api("coach/profile"); } catch (e) { box.classList.remove("loading", "sm"); box.innerHTML = `<div class="empty">Nastavení trenéra se nepodařilo načíst: ${esc(e.message)}</div>`; return; }
  box.classList.remove("loading", "sm");
  const OTHER = { ride: [["run", (ic("beh") + " Občas běhám")], ["xc_ski", (ic("bezky") + " Běžky (je sníh)")]], run: [["ride", (ic("kolo") + " Občas jezdím na kole")], ["xc_ski", (ic("bezky") + " Běžky (je sníh)")]] };
  const verOf = (x) => (x.v3 ? 3 : x.v2 ? 2 : 1);
  const draw = (p, ver, msg = "") => {
    box.innerHTML = `<div class="nform">
      <div class="nrow2">${nField("Hlavní sport", `<div class="seg nseg" id="cpPrim">${[["ride", (ic("kolo") + " Kolo")], ["run", (ic("beh") + " Běh")]].map(([k, l]) => `<button type="button" class="${p.primary === k ? "on" : ""}" data-prim="${k}">${l}</button>`).join("")}</div>`)}
      ${nField("Úroveň", `<div class="seg nseg" id="cpLevel">${[["beginner", "Začátečník"], ["intermediate", "Středně"], ["advanced", "Pokročilý"]].map(([k, l]) => `<button type="button" class="${(p.level || "intermediate") === k ? "on" : ""}" data-level="${k}">${l}</button>`).join("")}</div>`, "po pauze 7+ dní začne trenér zlehka; plné kvality začátečníkovi po 3 týdnech, středně pokročilému po 2, pokročilému po 1")}</div>
      <div>${OTHER[p.primary].map(([k, l]) => `<label class="ntg"><span><b>${l}</b><small>${k === "xc_ski" ? "jeden vytrvalostní den týdně – vypni, až sníh zmizí" : "nejvýš jeden vytrvalostní den týdně"}</small></span><input type="checkbox" data-sp="${k}" ${p.sports[k].enabled ? "checked" : ""} role="switch"></label>`).join("")}
      ${p.primary === "ride" ? `<label class="ntg"><span><b>Běh i s intervaly</b><small>jinak jen lehce</small></span><input type="checkbox" id="cpRunQ" ${p.sports.run.quality ? "checked" : ""} role="switch"></label>` : ""}</div>
      <div class="nsave"><button class="btn pri" id="cpSave">Uložit</button><span class="note" id="cpMsg" role="status">${esc(msg)}</span></div>
      <p class="note">Zátěž týdne počítá trenér z tvé kondice a posledních 4 týdnů, délky jízd z toho, co poslední měsíc jezdíš; dny ani hodiny se nenastavují. Rok narození (lehčí týden po 2 zátěžových od 40 let) je v <a href="#/profil">Profilu</a>, cíl v Trenérovi.</p></div>`;
    const read = () => {
      const q = JSON.parse(JSON.stringify(p));
      box.querySelectorAll("[data-sp]").forEach((i) => { q.sports[i.dataset.sp].enabled = i.checked; });
      const rq = box.querySelector("#cpRunQ"); if (rq) q.sports.run.quality = rq.checked;
      q.level = box.querySelector("#cpLevel .on")?.dataset.level || "intermediate";
      return q;
    };
    box.querySelectorAll("#cpLevel button").forEach((b) => b.addEventListener("click", () => { box.querySelectorAll("#cpLevel button").forEach((x) => x.classList.toggle("on", x === b)); }));
    box.querySelectorAll("#cpPrim button").forEach((b) => b.addEventListener("click", () => { const q = read(); q.primary = b.dataset.prim; draw(q, ver); }));
    box.querySelector("#cpSave").addEventListener("click", async () => {
      const m = box.querySelector("#cpMsg"), btn = box.querySelector("#cpSave");
      btn.disabled = true; m.textContent = "Ukládám a skládám plán…";
      try {
        const r = await api("coach/profile", { method: "POST", body: JSON.stringify({ profile: read() }) });
        cache.clear();
        draw(r.profile, verOf(r), r.proposal && r.proposal.changes ? `Uloženo. ${r.proposal.changes} změn v plánu čeká na potvrzení v Trenérovi.` : "Uloženo.");
      } catch (e) { m.textContent = `Nepovedlo se: ${e.message}`; btn.disabled = false; }
    });
  };
  draw(d.profile, verOf(d));
}

// ---------- kalendář ----------
let calMonth = null; // "YYYY-MM"
let calShow = "sleep"; // co ukázat v buňce kromě aktivit: sleep | steps | bb
/** barva sportu v kalendáři (proužek u aktivity) */
const SPORT_COLOR = { ride: "var(--z2)", mtb: "var(--z3)", indoor: "var(--z1)", run: "var(--acc)", xc_ski: "#4fa3d8", walk: "var(--z4)", hike: "var(--z4)", skate: "var(--z7)", padel: "var(--z6)", strength: "var(--z6)", mobility: "var(--srem)", other: "var(--z1)" };
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
    if (calShow === "sleep" && w.sleep_score != null) { const t = w.sleep_score >= 80 ? "good" : w.sleep_score >= 60 ? "warn" : "bad"; return `<span class="cm ${t}" title="skóre spánku"><i>${ic("noc")}</i>${w.sleep_score}</span>`; }
    if (calShow === "steps" && w.steps != null) return `<span class="cm ${w.steps >= d.stepsGoal ? "good" : ""}" title="kroky"><i>${ic("kroky")}</i>${num(w.steps / 1000, 1)}k</span>`;
    if (calShow === "bb" && w.bb_max != null) return `<span class="cm" style="color:${bbColor(w.bb_max)}" title="Energie – maximum dne"><i>${ic("energie")}</i>${w.bb_max}</span>`;
    return "";
  };
  // zátěž dne → podbarvení buňky (čím víc, tím sytější)
  const dayLoad = (x) => (aBy.get(x) || []).reduce((t, a) => t + (a.load || 0), 0);
  const heat = (l) => (l <= 0 ? 0 : clamp(l / 160, 0.12, 1));
  const cell = (x) => {
    const acts = aBy.get(x) || [], w = wBy.get(x), p = pBy.get(x), l = dayLoad(x);
    const inStatus = d.status && d.status.kind !== "active" && (!d.status.from || x >= d.status.from) && (!d.status.until || x <= d.status.until);
    const we = dow(x) >= 6;
    const planned = !acts.length && p && x >= d.today ? `<div class="cp ${p.kind === "quality" ? "q" : ""}" title="${esc(p.name)}"><span>${p.kind === "quality" ? ic("kvalita") : "○"}</span>${/^Trenažér – /.test(p.name) ? ic("domov") + " " : ""}${esc(p.name.replace(/^Trenažér – /, ""))}</div>` : "";
    const missed = !acts.length && p && x < d.today && p.status === "missed" ? `<div class="cp miss">✕ vynecháno</div>` : "";
    return `<div class="cday ${x === d.today ? "today" : ""} ${x > d.today ? "fut" : ""} ${inStatus ? "st" : ""} ${we ? "we" : ""}" style="--heat:${heat(l).toFixed(2)}"><div class="cd-h"><b>${+x.slice(8, 10)}</b>${metric(w)}</div>
      <div class="cacts">${acts.map((a) => `<a class="ca" href="#/aktivita/${a.id}" title="${esc(a.name || "")}" style="--sc:${SPORT_COLOR[a.sport] || "var(--z1)"}"><span class="ca-i">${SPORT_ICON[a.sport] || ic("ostatni")}</span><span class="ca-t">${a.km ? `${num(a.km, a.km < 20 ? 1 : 0)} km` : `${a.min} min`}</span></a>`).join("")}</div>
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
  <div class="ctiles">${tile(ic("ostatni"), d.acts.length, "aktivit")}${tile(ic("trasa"), thou(km), "km")}${tile(ic("cas"), hmm(mins * 60), "hodin")}${tile(ic("zatez"), thou(load), "zátěž")}${tile(ic("noc"), ss.length ? num(ss.reduce((a, b) => a + b, 0) / ss.length) : DASH, "spánek ⌀ skóre")}${tile(ic("kroky"), `${stepsOk}`, `dní ${num(d.stepsGoal / 1000)}k+ kroků`)}</div>
  <div class="seg sm calseg">${[["sleep", (ic("noc") + " Spánek")], ["steps", (ic("kroky") + " Kroky")], ["bb", (ic("energie") + " Energie")]].map(([k, l]) => `<button class="${calShow === k ? "on" : ""}" data-cs="${k}">${l}</button>`).join("")}</div>
  <section class="card cal"><div class="cgrid">${DAYS.map((x) => `<div class="cdow">${x}</div>`).join("")}<div class="cdow">Týden</div>${grid}</div>
  <div class="legend"><span>${ic("kvalita")} plánovaná kvalita · ○ plánovaný trénink</span><span>${calShow === "sleep" ? "skóre spánku: zelená ≥ 80, žlutá 60–79" : calShow === "steps" ? `zelená = aspoň ${thou(d.stepsGoal)} kroků` : "Body Battery ráno: zelená ≥ 75"}</span></div></section>`;
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
 * Chat (stránka Chat i panel AI na každé stránce). opts.page = {title, text} – data, která jsou vidět na stránce,
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
    box.innerHTML = hist.length || pending ? hist.map((m) => `<div class="msg ${m.role}">${m.role === "assistant" ? md(m.content) : `<p>${esc(m.content)}</p>`}${m.warn ? `<small class="sub">${ic("varovani")} odpověď obsahuje číslo, které v tvých datech není – ber s rezervou</small>` : ""}${m.model ? `<small class="cmodel">odpověděl ${esc(String(m.model).replace(/^(google|nvidia|workers):(nvidia\/|@cf\/[^/]+\/)?/, ""))}</small>` : ""}</div>`).join("") + (pending ? `<div class="msg assistant"><span class="spin"></span></div>` : "") : `<div class="empty">${page ? `Ptej se na to, co vidíš na stránce „${esc(page.title || "")}“.` : "Zeptej se na trénink, plán, spánek nebo cokoli dalšího."}</div>`;
    box.scrollTop = box.scrollHeight;
    sg.style.display = hist.length ? "none" : "";
  };
  let sending = false;
  const send = async (text) => {
    text = text.trim();
    if (!text || sending) return;
    sending = true;
    hist.push({ role: "user", content: text });
    saveChat(hist, key); draw(true); inp.value = ""; inp.style.height = "auto";
    try {
      const r = await api("chat", { method: "POST", body: JSON.stringify({ messages: hist.map(({ role, content }) => ({ role, content })), page }) });
      hist.push({ role: "assistant", content: r.answer, warn: !r.checked, model: r.model });
      use(r.ai);
      if (r.action) cache.clear();
    } catch (e) { hist.push({ role: "assistant", content: `Teď to nejde: ${e.message}` }); }
    sending = false;
    saveChat(hist, key); draw();
  };
  draw();
  root.querySelector(".chatform").addEventListener("submit", (e) => { e.preventDefault(); send(inp.value); });
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(inp.value); } });
  inp.addEventListener("input", () => { inp.style.height = "auto"; inp.style.height = Math.min(120, inp.scrollHeight) + "px"; });
  sg.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => send(b.textContent)));
  return { clear: () => { hist = []; saveChat(hist, key); draw(); }, focus: () => inp.focus(), ask: (q) => send(q) };
}
/** Panel s AI nad aktuální stránkou (data stránky jdou jako kontext). */
function openAiPanel(opts = {}) {
  if (opts instanceof Event) opts = {};
  const main = document.getElementById("main");
  const title = (opts.title || main.querySelector("h1")?.textContent || "Stránka").trim();
  // extra = připravená data k otázce (souhrn měsíce, porovnání roků…), pak text stránky
  const text = ((opts.extra ? opts.extra + "\n---\n" : "") + (main.innerText || "")).replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").slice(0, 3500);
  const ov = document.createElement("div");
  ov.className = "modal aip";
  ov.innerHTML = `<div class="modal-in"><div class="ch"><h2>${ic("ai")} Zeptej se · ${esc(title)}</h2><button class="btn sm" data-clr title="smazat konverzaci">${ic("smazat")}</button><button class="btn sm" data-x>✕</button></div><div class="aibox chat"></div></div>`;
  document.body.appendChild(ov);
  const ui = chatUi(ov.querySelector(".aibox"), { key: "chatPage:" + location.hash.split("/")[1], page: { title, hash: location.hash, text }, sugg: ["Co z těch čísel vyplývá?", "Je něco, čeho bych se měl bát?", "Co mám dnes dělat?"] });
  // klik na spodní lištu (mobil) nebo změna stránky chat zavře
  const tb = document.getElementById("tabbar");
  const onTab = () => close();
  const close = () => { ov.remove(); window.removeEventListener("hashchange", close); tb?.removeEventListener("click", onTab, true); };
  window.addEventListener("hashchange", close);
  tb?.addEventListener("click", onTab, true);
  ov.querySelector("[data-x]").onclick = close;
  ov.querySelector("[data-clr]").onclick = () => ui.clear();
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  if (opts.ask) ui.ask(opts.ask); else setTimeout(() => ui.focus(), 50);
}
const NO_AI_PAGES = /^#\/(nastaveni|profil|vybaveni|gear)\b/;
/** tlačítko AI do hlavičky stránky (vpravo nahoře) a synchronizace */
function addAiButton(el) {
  const head = el.querySelector(".head");
  if (!head || head.querySelector(".hbtns")) return;
  const wrap = document.createElement("div");
  wrap.className = "hbtns";
  // ⟳ ruční synchronizace (hodinky → Garmin → sem) a po ní překreslení stránky
  if (!location.hash.startsWith("#/join") && !location.hash.startsWith("#/login")) {
    const sb = document.createElement("button");
    sb.className = "aibtn syncbtn";
    sb.title = "Synchronizovat teď (nové aktivity, spánek, HRV)";
    sb.setAttribute("aria-label", "Synchronizovat");
    sb.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3.5V8h4.5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20.5V16h-4.5"/></svg>`;
    sb.addEventListener("click", () => syncNow(sb));
    wrap.appendChild(sb);
  }
  // AI jen tam, kde má smysl ptát se na data (ne v Nastavení, Profilu a Vybavení)
  if (!NO_AI_PAGES.test(location.hash)) {
    const b = document.createElement("button");
    b.className = "aibtn";
    b.title = "Zeptat se AI na tuto stránku";
    b.setAttribute("aria-label", "Zeptat se AI");
    b.innerHTML = ic("ai");
    b.addEventListener("click", openAiPanel);
    wrap.appendChild(b);
  }
  if (innerWidth <= 760) head.insertBefore(wrap, head.children[1] || null); // mobil: hned za nadpis (vpravo nahoře)
  else head.appendChild(wrap); // PC: za přepínači, zarovnané s nimi
}
let syncBusy = false;
async function syncNow(btn) {
  if (syncBusy) return;
  syncBusy = true;
  btn.classList.add("busy"); btn.disabled = true;
  try {
    const r = await api("sync-now", { method: "POST", body: "{}" });
    cache.clear();
    const n = r.newActivities?.length || 0;
    toast(r.skipped ? "Synchronizováno před chvílí – obnovuji stránku." : r.errors?.length ? `Synchronizace s chybou: ${r.errors[0]}` : n ? `Synchronizováno · nové aktivity: ${n}` : "Synchronizováno · data jsou aktuální");
    await route();
  } catch (e) { fail(e); }
  finally { syncBusy = false; btn.classList.remove("busy"); btn.disabled = false; }
}

// ---------- účty: přihlášení, registrace z pozvánky ----------
/** smazat uložené konverzace (chat, trenér, panely AI) – při odhlášení a změně účtu */
function clearChats() { try { for (const k of Object.keys(localStorage)) if (k === CHAT_KEY || k === COACH_KEY || k.startsWith("chatPage:")) localStorage.removeItem(k); } catch {} }
document.addEventListener("click", (e) => { if (e.target.closest('a[href="/logout"]')) { clearChats(); try { localStorage.removeItem("chatOwner"); } catch {} } });
// po startu: patří uložené konverzace jinému účtu (přihlášení jiným účtem nebo odkazem)? → smazat
api("me").then((m) => { try { const o = localStorage.getItem("chatOwner"); if (o != null && o !== String(m.uid)) clearChats(); localStorage.setItem("chatOwner", String(m.uid)); } catch {} }).catch(() => {});
async function postAuth(path, body) {
  clearChats();
  const r = await fetch("/auth/" + path, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
function loginPage(el) {
  el.innerHTML = `<div class="authbox card"><div class="auth-ico"><img src="apple-touch-icon.png" alt=""></div><h1 class="brand-name">kadence</h1><p class="sub">Přihlas se – zařízení si přihlášení pamatuje rok.</p>
    <form id="loginF" class="authf"><label>Jméno<input name="username" autocomplete="username" autocapitalize="none" required></label><label>Heslo<input name="password" type="password" autocomplete="current-password" required></label><button class="btn pri" type="submit">Přihlásit</button><p class="note" id="loginMsg"></p></form>
    <p class="note">Účet ti založí vlastník pozvánkou. Zapomenuté heslo: vlastník ti pošle jednorázový přihlašovací odkaz.</p></div>`;
  el.querySelector("#loginF").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target), msg = el.querySelector("#loginMsg");
    msg.textContent = "Přihlašuji…";
    try { await postAuth("login", { username: fd.get("username"), password: fd.get("password") }); cache.clear(); location.hash = "#/prehled"; route(); if (!(await onboardAsk())) alertsAsk(); }
    catch (err) { msg.textContent = err.message; }
  });
}
function joinPage(el, token) {
  el.innerHTML = `<div class="authbox card"><div class="auth-ico"><img src="apple-touch-icon.png" alt=""></div><h1>Vítej v Kadenci</h1><p class="sub">Založ si účet. Tvoje data uvidíš jen ty.</p>
    <form id="joinF" class="authf"><label>Jak ti mám říkat<input name="name" placeholder="např. Honza" required></label><label>Přihlašovací jméno<input name="username" autocapitalize="none" placeholder="honza" required pattern="[a-z0-9._-]{3,30}"></label><label>Heslo (aspoň 6 znaků)<input name="password" type="password" autocomplete="new-password" minlength="6" required></label><button class="btn pri" type="submit">Založit účet</button><p class="note" id="joinMsg"></p></form>
    <p class="note">Po založení tě provedu připojením Garminu a intervals.icu – pak se začnou stahovat tvoje data.</p></div>`;
  el.querySelector("#joinF").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target), msg = el.querySelector("#joinMsg");
    msg.textContent = "Zakládám účet…";
    try { await postAuth("join", { token, name: fd.get("name"), username: String(fd.get("username")).toLowerCase(), password: fd.get("password") }); cache.clear(); location.hash = "#/prehled"; route(); onboardAsk(); }
    catch (err) { msg.textContent = err.message; }
  });
}

/** Nastavení → účet (jméno a heslo) a pro vlastníka správa uživatelů. */
async function accountCard(el) {
  const me = await api("me").catch(() => null);
  if (!me) return "";
  // při prohlížení cizího účtu jeho heslo a uživatele měnit nejde
  if (me.viewing) return card("c12", (ic("profil") + " Účet"), "prohlížíš", `<p>Prohlížíš účet <b>${esc(me.name || me.username || `#${me.uid}`)}</b>. Heslo, API klíče a uživatele tady měnit nejde.</p><div class="btns"><button class="btn pri" data-viewas="0">Zpět na můj účet</button></div>`);
  const users = me.role === "owner" ? await api("users").catch(() => []) : [];
  const box = `<form class="form-grid" id="acF"><label>Přihlašovací jméno<input id="acUser" value="${esc(me.username || "")}" autocapitalize="none"></label>${me.hasPassword ? `<label>Současné heslo<input id="acOld" type="password" autocomplete="current-password"></label>` : ""}<label>${me.hasPassword ? "Nové heslo" : "Heslo"}<input id="acPass" type="password" autocomplete="new-password"></label></form>
    <div class="btns"><button class="btn pri" id="acSave">${me.hasPassword ? "Změnit heslo" : "Nastavit jméno a heslo"}</button><span class="note" id="acMsg"></span></div>
    <div class="btns"><button class="btn sm" id="acOut">Odhlásit ostatní zařízení</button><span class="note">Přihlášení na jiných zařízeních přestane platit, tady zůstaneš přihlášený. Změna hesla to udělá taky.</span></div>`;
  const ulist = me.role === "owner" ? `<div class="sl" style="margin:16px 0 6px">Uživatelé (${users.filter((u) => u.active).length} / 10)</div>
    <table class="t"><tr><th>Jméno</th><th>Přihlášení</th><th class="r"></th></tr>${users.map((u) => `<tr><td><b>${esc(u.name || (u.role === "owner" ? "ty" : "–"))}</b>${u.role === "owner" ? ' <span class="sub">vlastník</span>' : ""}</td><td>${esc(u.username || "–")}</td><td class="r">${u.role === "owner" ? "" : `<span class="ubtns">${u.active ? `<button class="btn sm" data-viewas="${u.id}" title="Prohlédnout data tohoto účtu (kontrola, testování)">Otevřít</button>` : ""}<button class="btn sm" data-uact="${u.id}" data-on="${u.active ? 0 : 1}">${u.active ? "Vypnout" : "Zapnout"}</button></span>`}</td></tr>`).join("")}</table>
    <div class="btns"><button class="btn pri" id="invBtn">＋ Pozvat (odkaz)</button></div><div id="invOut"></div>
    <p class="note">Každý má svá data ve vlastních tabulkách a vlastní Garmin klíč; vidí jen svoje. Do 4 dalších lidí se jejich data stahují každých 5 minut jako tvoje, při víc lidech se střídají (free plán Cloudflare).</p>` : "";
  setTimeout(() => {
    el.querySelector("#acF")?.addEventListener("submit", (e) => { e.preventDefault(); el.querySelector("#acSave")?.click(); });
    el.querySelector("#acSave")?.addEventListener("click", async () => {
      const msg = el.querySelector("#acMsg");
      try { await api("me/password", { method: "POST", body: JSON.stringify({ username: el.querySelector("#acUser").value, password: el.querySelector("#acPass").value, old: el.querySelector("#acOld")?.value }) }); msg.textContent = "✓ Uloženo. Ostatní zařízení jsou odhlášená."; el.querySelector("#acPass").value = ""; }
      catch (e) { msg.textContent = e.message; }
    });
    el.querySelector("#acOut")?.addEventListener("click", async () => {
      if (!confirm("Odhlásit všechna ostatní zařízení?")) return;
      try { await api("me/logout-all", { method: "POST" }); toast("Ostatní zařízení jsou odhlášená"); } catch (e) { fail(e); }
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
  return card("c12", (ic("profil") + " Účet"), me.role === "owner" ? "vlastník" : "", box + ulist);
}

// ---------- router ----------
function setTheme(t) {
  try { t === "auto" ? localStorage.removeItem("theme") : localStorage.setItem("theme", t); } catch {}
  if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t);
}
try { const t = localStorage.getItem("theme"); if (t) document.documentElement.setAttribute("data-theme", t); } catch {}
function menu(active) {
  const link = ([k, l]) => `<a href="#/${k}" class="${k === active ? "on" : ""}"><span class="ico">${icon(k)}</span><span>${l}</span></a>`;
  document.getElementById("menu").innerHTML = MAIN.map(link).join("") + `<div class="msep">Další</div>` + MORE.map(link).join("");
  // mobil: Zotavení jen ve „Více“ (proklik i přes kroužek zotavení a dlaždice na Přehledu) → 5 větších ikon v liště
  const TAB = MAIN.filter(([k]) => k !== "zotaveni"), SHEET = [...MAIN.filter(([k]) => k === "zotaveni"), ...MORE];
  const moreOn = SHEET.some(([k]) => k === active);
  document.getElementById("tabbar").innerHTML = TAB.map(link).join("") + `<button class="${moreOn ? "on" : ""}" id="moreBtn"><span class="ico">${icon("vice")}</span><span>Více</span></button>`;
  // „Více“ na mobilu: mřížka dlaždic (ikona v kolečku + krátký název); světlý / tmavý režim je v Nastavení
  const tile = ([k, l]) => `<a href="#/${k}" class="sh-t ${k === active ? "on" : ""}"><span class="ico">${icon(k)}</span><span>${SHORT[k] || l}</span></a>`;
  document.getElementById("sheet").innerHTML = `<div class="sheet-in" role="menu" aria-label="Další stránky">${SHEET.map(tile).join("")}</div>`;
  document.getElementById("moreBtn").addEventListener("click", (e) => { e.stopPropagation(); document.getElementById("sheet").classList.toggle("on"); });
}
document.addEventListener("click", (e) => { const sh = document.getElementById("sheet"); if (sh.classList.contains("on") && !e.target.closest(".sheet-in")) sh.classList.remove("on"); });

// ---------- Počasí (proklik z Přehledu): posuvná tabulka po hodinách (jako detail ve Windy) + grafy dne ----------
let wxDay = 0;
/** barva buňky srážek (mm/h) a větru (km/h) – jako ve Windy: čím víc, tím sytější */
const rainBg = (mm) => (!mm || mm < 0.1 ? "" : `background:color-mix(in srgb, #3b82f6 ${Math.round(clamp(18 + mm * 22, 18, 85))}%, transparent)`);
const windBg = (k) => (k == null || k < 15 ? "" : `background:color-mix(in srgb, ${k >= 50 ? "#dc2626" : k >= 35 ? "#f59e0b" : "#84cc16"} ${Math.round(clamp(15 + (k - 15) * 1.4, 15, 60))}%, transparent)`);
const tempCol = (t) => (t == null ? "" : `color:${t <= 0 ? "#2563eb" : t < 8 ? "#0891b2" : t < 18 ? "var(--fg)" : t < 26 ? "#ea580c" : "#dc2626"}`);
let wxKeepLeft = null, wxLoc = "home", wxModel = (() => { try { return localStorage.getItem("wxModel") || "best"; } catch { return "best"; } })();
async function pagePocasi(el, keep = false) {
  if (!keep) { wxLoc = "home"; wxDay = 0; } // při otevření vždy domov a dnes, hory jen přepnutím
  const d = await api(`weather-hours?model=${wxModel}&loc=${wxLoc}`);
  const days = [0, 1, 2].map((k) => addDay(d.today, k));
  const dname = (k) => (k === 0 ? "Dnes" : k === 1 ? "Zítra" : DAYS[(new Date(days[k] + "T12:00").getDay() + 6) % 7]);
  const sunOf = (date) => (d.sun || []).find((x) => x.date === date) || null;
  const hourMin = (s) => (s ? +s.slice(0, 2) * 60 + +s.slice(3, 5) : null);
  const isNight = (h) => { const s = sunOf(h.time.slice(0, 10)), m = +h.time.slice(11, 13) * 60 + 30; return s && s.rise && s.set ? m < hourMin(s.rise) || m > hourMin(s.set) : m < 7 * 60 || m >= 18 * 60; };
  const has = d.lat != null && d.lon != null;
  const lat = has ? d.lat.toFixed(3) : null, lon = has ? d.lon.toFixed(3) : null;
  const upd = d.updatedAt ? new Date(d.updatedAt) : null;
  const updTxt = upd ? `${upd.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" })} ${upd.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}` : DASH;
  const nowKey = `${d.today}T${String(d.nowHour).padStart(2, "0")}:00`;
  // posuvná tabulka: všechny hodiny 3 dnů, předěl a název dne nad první hodinou dne
  // dnes od teď, další dny jen přes den (6–21 h) – noc je pro trénink zbytečná
  const DAY_FROM = 6, DAY_TO = 21;
  const hrs = d.hours.filter((h) => h.time >= `${d.today}T${String(Math.max(0, d.nowHour - 1)).padStart(2, "0")}:00` && (h.time.startsWith(d.today) || (+h.time.slice(11, 13) >= DAY_FROM && +h.time.slice(11, 13) <= DAY_TO)));
  const col = (h, i) => {
    const first = i === 0 || hrs[i - 1].time.slice(0, 10) !== h.time.slice(0, 10);
    return `<div class="wxc${h.time === nowKey ? " now" : ""}${first ? " dstart" : ""}" data-day="${h.time.slice(0, 10)}" data-h="${h.time.slice(11, 13)}">
      <span class="wxd">${first ? (h.time.slice(0, 10) === d.today ? "Dnes" : `${DAYS[(new Date(h.time.slice(0, 10) + "T12:00").getDay() + 6) % 7]} ${dm(h.time.slice(0, 10))}`) : ""}</span>
      <span class="wxh">${h.time.slice(11, 13)}</span>
      <i>${wIcon(h.code, h.precip_prob, isNight(h))}</i>
      <b style="${tempCol(h.temp)}">${num(h.temp)}°</b>
      <small class="wxf">${num(h.feels)}°</small>
      <span class="wxr" style="${rainBg(h.precip)}">${h.precip >= 0.05 ? num(h.precip, 1) : ""}</span>
      <span class="wxp">${h.precip_prob != null && h.precip_prob >= 10 ? `${num(h.precip_prob)} %` : ""}</span>
      <span class="wxw" style="${windBg(h.wind)}">${num(h.wind)}</span>
      <span class="wxg" style="${windBg(h.gust)}">${num(h.gust)}</span></div>`;
  };
  const table = `<div class="wxt"><div class="wxlab"><span class="wxd"></span><span class="wxh">h</span><i></i><b>°C</b><small class="wxf">pocit.</small><span class="wxr">mm</span><span class="wxp">déšť</span><span class="wxw">vítr</span><span class="wxg">nárazy</span></div><div class="wxs" id="wxScroll">${hrs.map(col).join("")}</div></div>`;
  const draw = () => {
    const day = days[wxDay];
    const hs = d.hours.filter((h) => h.time.startsWith(day));
    const t = hs.map((h) => h.temp), fe = hs.map((h) => h.feels);
    const ok = t.filter((v) => v != null);
    const rain = hs.reduce((a, h) => a + (h.precip || 0), 0), gust = Math.max(0, ...hs.map((h) => h.gust || 0));
    const nowI = wxDay === 0 ? hs.findIndex((h) => +h.time.slice(11, 13) === d.nowHour) : -1;
    const s = sunOf(day);
    const x = hs.map((h) => h.time.slice(11, 13) + ":00");
    el.querySelector("#wxBody").innerHTML = hs.length ? `
      <div class="wx-sum"><div><b>${num(Math.max(...ok))}°<small> / ${num(Math.min(...ok))}°</small></b><span>max / min</span></div><div><b>${num(rain, 1)}<small> mm</small></b><span>srážky za den</span></div><div><b>${num(gust)}<small> km/h</small></b><span>nárazy větru</span></div>
      <div class="wx-sun"><img src="wx/sunrise.svg" alt=""><b>${s?.rise || DASH}</b><span>východ</span></div><div class="wx-sun"><img src="wx/sunset.svg" alt=""><b>${s?.set || DASH}</b><span>západ</span></div><div><b>${s?.rise && s?.set ? hmm((hourMin(s.set) - hourMin(s.rise)) * 60) : DASH}<small> h</small></b><span>světla</span></div></div>
      <div class="sl" style="margin-top:12px">Teplota</div>
      ${lineChart({ x, height: 160, markIndex: nowI >= 0 ? nowI : null, fmt: (v) => num(v) + " °C", series: [{ name: "Teplota", values: t, color: "var(--acc)", width: 2.6, area: true }, { name: "Pocitově", values: fe, color: "var(--z2)", width: 1.8, dash: true }] })}
      <div class="sl" style="margin-top:10px">Srážky (mm za hodinu)</div>
      ${barChart({ x: hs.map((h) => h.time.slice(11, 13)), height: 120, todayIndex: nowI >= 0 ? nowI : null, fmt: (v) => num(v, 1) + " mm", yfmt: (v) => num(v, 1), bars: hs.map((h) => ({ v: h.precip ?? 0, color: "#3b82f6" })), tipFn: (i) => { const h = hs[i]; return `<b>${h.time.slice(11, 16)}</b><div>srážky ${num(h.precip, 1)} mm · šance ${num(h.precip_prob)} %</div><div>vítr ${num(h.wind)} km/h · nárazy ${num(h.gust)} km/h</div><div>${num(h.temp)} °C · pocitově ${num(h.feels)} °C</div>`; } })}
      <div class="sl" style="margin-top:10px">Vítr</div>
      ${lineChart({ x, height: 110, fmt: (v) => num(v) + " km/h", zero: true, series: [{ name: "Vítr", values: hs.map((h) => h.wind), color: "var(--muted)", width: 2 }, { name: "Nárazy", values: hs.map((h) => h.gust), color: "var(--z6)", width: 1.6, dash: true }] })}`
      : `<div class="empty">Předpověď na tento den nemám.</div>`;
    el.querySelectorAll("[data-wd]").forEach((b) => b.classList.toggle("on", +b.dataset.wd === wxDay));
  };
  const modelName = d.model === "aladin" ? "ALADIN (ČHMÚ, 1 km)" : "Open-Meteo (mix modelů)";
  el.innerHTML = `<div class="head"><div><a class="back" href="#/prehled" data-back>← Zpět</a><h1>Počasí</h1><div class="sub">${esc(d.place || "")} · ${modelName} · aktualizováno ${updTxt}</div></div></div>
  <div class="wxbar">
    ${(d.places || []).length > 1 ? `<div class="ioseg ico wxloc" role="tablist" aria-label="Místo">${d.places.map((p) => `<button class="${d.loc === p.key ? "on" : ""}" data-wloc="${p.key}" role="tab" aria-selected="${d.loc === p.key}" title="${esc(p.name)}">${ic(p.key === "home" ? "domov" : "hory")}</button>`).join("")}</div>` : ""}
    <div class="ioseg ico" role="tablist" aria-label="Předpověď">${[["best", ic("svet"), "Mix modelů – Open-Meteo vybere nejlepší model (ICON, ECMWF, GFS…), víc dní"], ["aladin", ic("presne"), "ALADIN 1 km – model ČHMÚ, nejpřesnější pro Česko, ~2,5 dne"]].map(([k, i, t]) => `<button class="${d.model === k ? "on" : ""}" data-wmod="${k}" role="tab" aria-selected="${d.model === k}" title="${t}" aria-label="${t}">${i}</button>`).join("")}</div>
    <div class="ioseg days">${[0, 1, 2].map((k) => `<button data-wd="${k}">${dname(k)}</button>`).join("")}</div>
  </div>
  <div class="grid">
    ${card("c12 wxcard", (ic("cas") + " Po hodinách"), `aktualizováno ${updTxt}`, table + `<p class="note">Srážky v mm za hodinu (modře, čím víc, tím sytější), šance na déšť, vítr a nárazy v km/h (zeleně od 15, oranžově od 35, červeně od 50). Posuň do strany pro další hodiny a dny (další dny jen 6–21 h). Přepínače nahoře: místo (druhé nastavíš v Nastavení → Obecné → Počasí), ${ic("svet")} mix modelů (Open-Meteo vybere nejlepší model, víc dní), ${ic("presne")} ALADIN 1 km (model ČHMÚ, nejpřesnější pro Česko, ~2,5 dne).</p>`)}
    ${card("c12", (ic("kondice") + " Průběh dne"), "Open-Meteo", `<div id="wxBody"></div>`)}
    ${card("c12", (ic("odkaz") + " Další"), "", `<div class="wx-links">${has ? `<a class="btn sm" href="https://www.windy.com/${lat}/${lon}?${lat},${lon},9" target="_blank" rel="noopener">Windy ${ic("odkaz")}</a><a class="btn sm" href="https://www.ventusky.com/?p=${lat};${lon};9&l=rain-3h" target="_blank" rel="noopener">Ventusky ${ic("odkaz")}</a>` : ""}<a class="btn sm" href="#/trener" data-topocasi>Trenér → okna na trénink</a></div>`)}
  </div>`;
  el.querySelectorAll("[data-wloc]").forEach((b) => b.addEventListener("click", () => { if (wxLoc === b.dataset.wloc) return; wxLoc = b.dataset.wloc; wxKeepLeft = el.querySelector("#wxScroll")?.scrollLeft ?? null; pagePocasi(el, true).catch((e) => toast(e.message)); }));
  el.querySelectorAll("[data-wmod]").forEach((b) => b.addEventListener("click", () => { if (wxModel === b.dataset.wmod) return; wxModel = b.dataset.wmod; try { localStorage.setItem("wxModel", wxModel); } catch {} wxKeepLeft = el.querySelector("#wxScroll")?.scrollLeft ?? null; pagePocasi(el, true).catch((e) => toast(e.message)); }));
  const scrollDay = (smooth) => {
    const sc = el.querySelector("#wxScroll");
    if (!sc) return;
    const c0 = wxDay === 0 ? null : sc.querySelector(`.wxc[data-day="${days[wxDay]}"][data-h="08"]`) || sc.querySelector(`.wxc[data-day="${days[wxDay]}"]`);
    const left = c0 ? c0.offsetLeft : 0;
    if (smooth) sc.scrollTo({ left, behavior: "smooth" }); else sc.scrollLeft = left;
  };
  el.querySelectorAll("[data-wd]").forEach((b) => b.addEventListener("click", () => { wxDay = +b.dataset.wd; draw(); scrollDay(true); }));
  draw();
  // po přepnutí modelu / místa zůstane tabulka posunutá tam, kde byla
  requestAnimationFrame(() => { const sc = el.querySelector("#wxScroll"); if (keep && wxKeepLeft != null && sc) sc.scrollLeft = wxKeepLeft; else scrollDay(false); wxKeepLeft = null; });
}

// ---------- Profil sportovce (src/report/profile.ts) ----------
async function pageProfil(el) {
  const [p, body] = await Promise.all([api("profile"), api("body").catch(() => [])]);
  const wRows = body.filter((r) => r.weight_kg != null), faRows = body.filter((r) => r.fitness_age != null);
  const dash = "–";
  const w = (x, u = "") => (x == null ? dash : `${num(x)}${u}`);
  const date = (d) => (d ? ` <span class="sub">${dm(d)}</span>` : "");
  const zoneTable = (rows, colors, unit) => rows ? `<table class="t pz">${rows.map((z, i) => `<tr><td><span class="sw" style="background:${colors[i] || "var(--muted)"}"></span>${esc(z.name)}</td><td class="r num">${z.lo}${z.hi != null ? `–${z.hi}` : "+"} ${unit}</td></tr>`).join("")}</table>` : `<div class="empty">Zatím nemám.</div>`;
  const bests = [["5 s", p.best.s5], ["1 min", p.best.m1], ["5 min", p.best.m5], ["20 min", p.best.m20]];
  el.innerHTML = `<div class="head"><div><h1>Profil</h1><div class="sub">Co o tobě aplikace ví – z Garminu, nastavení a výpočtů</div></div></div>
  <div class="grid">
   ${card("c6", (ic("profil") + " O mně"), "", `<form id="pfForm" class="form-grid">
      <label>Jméno<input name="name" value="${esc(p.name || "")}" maxlength="40" required></label>
      <label>Rok narození<input name="birthYear" type="number" min="1920" max="2015" inputmode="numeric" value="${p.birthYear || ""}" placeholder="např. 1980"></label>
    </form>
    <div class="btns"><button class="btn pri" id="pfSave">Uložit</button><span class="note" id="pfMsg"></span></div>
    ${kv([
      ["Věk", p.age != null ? `${p.age} let` : dash],
      ["Lehčí týden", `po ${p.blockWeeks} zátěžových${p.age != null && p.age >= 40 ? " (od 40 let)" : ""}`],
      ["Váha", p.weight ? `${num(p.weight.kg, 1)} kg${date(p.weight.date)}` : `${dash} <span class="sub">zapiš v Garminu</span>`],
      ["Cíl", `${esc(p.goal.label)}${p.goal.date ? ` · ${dm(p.goal.date)}${p.goal.date.slice(0, 4)}` : ""}`],
    ])}`)}
   ${p.hasPower === false ? "" : card("c6", (ic("ftp") + " Výkon na kole"), "", kv([
      ["FTP", p.ftp ? `${p.ftp} W${p.wkg ? ` · <b>${num(p.wkg, 2)} W/kg</b>` : ""}` : `${dash} <span class="sub">nastav v Nastavení</span>`],
      ["eFTP", p.eftp ? `${p.eftp.w} W${date(p.eftp.date)}` : dash],
      ...bests.map(([l, b]) => [`Nejlepší ${l}`, b ? `${b.w} W${b.wkg ? ` · ${num(b.wkg, 2)} W/kg` : ""}${date(b.date)}` : dash]),
    ]) + `<p class="note">Nejlepší výkony za 90 dní. Křivka výkonu je na stránce <a href="#/kondice">Kondice</a>.</p>`)}
   ${card("c4", (ic("tep") + " Tep"), p.hr.source || "", kv([["Maximální", w(p.hr.max, " bpm")], ["Na prahu (LTHR)", w(p.hr.lthr, " bpm")], ["Klidový (7 dní)", w(p.hr.rest, " bpm")]]))}
   ${card("c4", ic("vo2") + " VO2max", "Garmin", kv([["Kolo", p.vo2.ride ? `${p.vo2.ride.v}${date(p.vo2.ride.date)}` : dash], ["Běh", p.vo2.run ? `${p.vo2.run.v}${date(p.vo2.run.date)}` : dash], ["Garmin (celkově)", p.vo2.garmin ? `${num(p.vo2.garmin.v)}${date(p.vo2.garmin.date)}` : dash]]))}
   ${card("c4", (ic("kondice") + " Kondice dnes"), "", p.fitness ? kv([["Kondice (CTL)", num(p.fitness.ctl, 1)], ["Únava (ATL)", num(p.fitness.atl, 1)], ["Forma (TSB)", signed(p.fitness.form, 1)]]) : `<div class="empty">Zatím nemám.</div>`)}
   ${p.hasPower === false ? "" : card("c4", (ic("ftp") + " Zóny výkonu"), p.ftp ? `z FTP ${p.ftp} W` : "", zoneTable(p.powerZones, PWR_ZC, "W"))}
   ${card("c4", (ic("kolo") + " Zóny tepu · kolo"), p.hr.source || "", zoneTable(p.hrBike, HR_ZC, "bpm"))}
   ${card("c4", (ic("beh") + " Zóny tepu · běh"), p.hr.lthr ? `z LTHR ${p.hr.lthr} bpm` : "", zoneTable(p.hrRun, HR_ZC, "bpm") + `<p class="note">Běh má zóny posunuté proti kolu (podle prahového tepu) – tep při běhu bývá vyšší.</p>`)}
   ${wRows.length > 1 ? card("c6", ic("vaha") + " Váha", "Garmin", lineChart({ x: wRows.map((r) => r.date), xfmt: dm, fmt: (v) => num(v, 1) + " kg", series: [{ name: "váha", values: wRows.map((r) => r.weight_kg), color: "var(--acc)", dots: true, area: true }], minSpan: 2 })) : ""}
   ${faRows.length ? card("c6", (ic("fitage") + " Fitness age"), "Garmin", `<div class="bignum">${num(faRows[faRows.length - 1].fitness_age, 1)}<small> let</small></div>` + (faRows.length > 1 ? lineChart({ x: faRows.map((r) => r.date), xfmt: dm, fmt: (v) => num(v, 1), series: [{ name: "fitness age", values: faRows.map((r) => r.fitness_age), color: "var(--z3)", dots: true }], minSpan: 2 }) : "")) : ""}
   ${card("c12", (ic("kompas") + " Trenér"), "", p.coach ? `<ul class="plain">${p.coach.summary.map((s) => `<li>${esc(s)}</li>`).join("")}</ul><p class="note">Sporty změníš v <a href="#/nastaveni">Nastavení → Trenér</a>, FTP a zóny v <a href="#/nastaveni">Nastavení</a>.</p>` : `<div class="empty">Profil trenéra se vytvoří při prvním plánu.</div>`)}
  </div>`;
  el.querySelector("#pfSave").addEventListener("click", async (ev) => {
    const btn = ev.currentTarget, msg = el.querySelector("#pfMsg"), f = el.querySelector("#pfForm");
    const name = f.name.value.trim(), by = f.birthYear.value.trim();
    btn.disabled = true; msg.textContent = "Ukládám…";
    try {
      if (name !== (p.name || "")) await api("settings", { method: "POST", body: JSON.stringify({ first_name: name }) });
      if ((by ? +by : null) !== (p.birthYear || null)) await api("coach/profile", { method: "POST", body: JSON.stringify({ profile: { birthYear: by ? +by : null } }) });
      cache.clear(); toast("Uloženo"); await route();
    } catch (e) { msg.textContent = `Nepovedlo se: ${e.message}`; btn.disabled = false; }
  });
}

const ROUTES = { profil: pageProfil, pocasi: pagePocasi, kalendar: pageKalendar, prehled: pagePrehled, trener: pageTrener, aktivity: pageAktivity, kolo: pageAktivity, zotaveni: pageZotaveni, kondice: pageKondice, vybaveni: pageVybaveni, chuze: pageChuze, nastaveni: pageNastaveni };

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
/** Číslo a jednotka („198,5 bpm“) ani tisíce („12 485“) se nesmí rozdělit na dva řádky → nezlomitelná mezera. */
const GLUE_UNIT = /(\d) (?=(?:km\/h|km|kcal|kJ|bpm|ms|min|kg|cm|mm|m|W\/kg|W|h|s|g|l|%|°C|°|ot\/min|kr\/min|\/km)(?![\p{L}\d]))/gu;
const GLUE_THOU = /(\d) (?=\d{3}(?!\d))/g;
function glueUnits(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const v = n.nodeValue;
    if (v.length < 3 || !/\d /.test(v)) continue;
    const g = v.replace(GLUE_THOU, "$1 ").replace(GLUE_UNIT, "$1 ");
    if (g !== v) n.nodeValue = g;
  }
}
let foldQ = false;
new MutationObserver(() => { if (foldQ) return; foldQ = true; requestAnimationFrame(() => { foldQ = false; const m = document.getElementById("main"); if (m) { foldNotes(m); glueUnits(m); } }); }).observe(document.getElementById("main"), { childList: true, subtree: true });

/** AI shrnutí na stránce (Přehled, Trenér, Zotavení) – načte se dodatečně, bez AI se blok skryje */
/** Doplněk v buňce („max 190 bpm“, „vysoce aerobní“): když se nevejde celý, zkusí se bez jednotky („max 190“)
 *  nebo zkratka („vys. aerobní“, „aerobní“), jinak se skryje. Buňka se nerozšiřuje. */
const UNIT_RE = /\s*(bpm|W|m|°C|kr\/min|ot\/min|km\/h|ms|cm|kcal|min|h|%|\/km)$/;
const CELL_ABBR = { "vysoce aerobní": ["vys. aerobní", "aerobní"], "nízko aerobní": ["níz. aerobní", "aerobní"] };
function fitCells(root) {
  root.querySelectorAll(".abasics > div > i").forEach((i) => {
    if (!i.dataset.full) i.dataset.full = i.textContent;
    i.hidden = false; i.textContent = i.dataset.full;
    if (i.scrollWidth <= i.clientWidth + 1) return;
    const short = i.dataset.full.replace(UNIT_RE, "");
    if (short !== i.dataset.full) { i.textContent = short; if (i.scrollWidth <= i.clientWidth + 1) return; }
    for (const abbr of CELL_ABBR[i.dataset.full] || []) { i.textContent = abbr; if (i.scrollWidth <= i.clientWidth + 1) return; }
    i.hidden = true;
  });
}
let fitT = null;
addEventListener("resize", () => { clearTimeout(fitT); fitT = setTimeout(() => fitCells(document), 150); });
/** Sbalený štítek „AI shrnutí“ v hlavičce: když by přetekl z karty (dlouhý nadpis), zůstane jen robot. */
function fitAiChip(box) {
  const head = box.parentElement, sp = box.querySelector(".an-show span");
  if (!head || !sp) return;
  sp.hidden = false;
  const card = head.closest(".card") || head;
  requestAnimationFrame(() => { if (head.scrollWidth > head.clientWidth + 1 || box.getBoundingClientRect().right > card.getBoundingClientRect().right - 4) sp.hidden = true; });
}
addEventListener("resize", () => document.querySelectorAll(".ainote.folded").forEach(fitAiChip));
function loadAiNotes(root) {
  root.querySelectorAll("[data-ainote]").forEach((box) => {
    const page = box.dataset.ainote, hk = `aiNoteHide:${page}`;
    let hidden = false; try { hidden = localStorage.getItem(hk) === "1"; } catch {}
    let last = null; // poslední úspěšný text – při chybě „napsat znovu“ zůstane
    const draw = (r, msg) => {
      // Přehled: sbalený štítek vpravo vedle stavu, rozbalené shrnutí přes celou šířku pod ním
      const head = page === "prehled" ? box.closest(".card")?.querySelector(".dn-head") : null;
      if (head) { if (hidden) { if (box.parentElement !== head) head.appendChild(box); } else if (box.parentElement === head) head.after(box); }
      if (hidden) { box.className = box.className.replace(" busy", "") + (box.classList.contains("folded") ? "" : " folded"); box.innerHTML = `<button type="button" class="linkbtn an-show" title="Zobrazit AI shrnutí" aria-label="Zobrazit AI shrnutí">${ic("ai")} <span>AI shrnutí</span></button>`; fitAiChip(box); box.querySelector("button").onclick = () => { hidden = false; try { localStorage.removeItem(hk); } catch {} box.classList.remove("folded"); if (last) draw(last); else load(false); }; return; }
      if (!r) { box.innerHTML = `<span class="an-t">${ic("ai")} ${msg || "píšu shrnutí…"}</span>`; return; }
      box.innerHTML = `<span class="an-t">${ic("ai")} ${esc(r.text)}</span><small class="an-m">${r.model ? esc(String(r.model).replace(/^[a-z]+:/, "").split("/").pop()) + " · " : ""}<button type="button" class="linkbtn" data-re>napsat znovu</button> · <button type="button" class="linkbtn" data-hide>skrýt</button>${msg ? ` · ${esc(msg)}` : ""}</small>`;
      box.querySelector("[data-re]").onclick = () => load(true);
      box.querySelector("[data-hide]").onclick = () => { hidden = true; try { localStorage.setItem(hk, "1"); } catch {} draw(last); };
    };
    const load = (force) => {
      if (last) draw(last, "píšu znovu…"); else draw(null);
      api(`ai-note?page=${page}${force ? "&force=1" : ""}`).then((r) => {
        if (r && r.text) { last = r; draw(r); }
        else if (last) draw(last, "AI teď neodpověděla, zkus to později");
        else box.remove();
      }).catch(() => { if (last) draw(last, "AI teď neodpověděla"); else box.remove(); });
    };
    if (hidden) draw(null); // sbalené: nic nenačítat, dokud si to neotevřeš
    else load(false);
  });
}
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
  if (page === "trener" && tFocus) { requestAnimationFrame(() => applyTFocus(el)); fitCells(el); loadAiNotes(el); return; }
  loadAiNotes(el);
  requestAnimationFrame(() => fitCells(el));
  const back = scrollMem.get(location.hash);
  if (back && (page === "aktivity" || page === "kolo" || (page === "vybaveni" && arg) || page === "kalendar")) requestAnimationFrame(() => scrollTo(0, back));
  else scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
// aplikace z plochy (iPhone) si pamatuje adresu z doby přidání → po spuštění vždy Přehled
const standalone = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
try { if (standalone && !sessionStorage.getItem("started")) { sessionStorage.setItem("started", "1"); if (!location.hash.startsWith("#/aktivita/")) history.replaceState(null, "", "#/prehled"); } } catch {}
document.documentElement.classList.toggle("standalone", standalone);

// ---------- hodnocení náročnosti (RPE 1–10, src/core/rpe.ts) ----------
const RPE_TXT = { 1: "velmi lehce", 2: "lehce", 3: "lehce", 4: "středně", 5: "středně", 6: "trochu těžce", 7: "těžce", 8: "těžce", 9: "velmi těžce", 10: "maximum" };
/** Bublina po otevření stránky: poslední neohodnocená aktivita (za 3 dny). „Později“ platí do zavření karty. */
async function rpeAsk() {
  if (document.querySelector(".rpeb")) return;
  const r = await api("rpe").catch(() => null);
  const a = r && r.ask;
  if (!a) return;
  try { if (sessionStorage.getItem("rpeLater") === a.id) return; } catch {}
  const b = document.createElement("div");
  b.className = "rpeb";
  b.setAttribute("role", "dialog");
  b.setAttribute("aria-label", "Hodnocení tréninku");
  b.innerHTML = `<div class="rpeb-h"><b>Jak těžký byl trénink?</b><button class="btn sm" data-later aria-label="Později">✕</button></div>
    <div class="sub">${SPORT_ICON[a.sport] || ic("ostatni")} ${esc(a.name || SPORT_NAME[a.sport] || a.sport)} · ${dayDm(a.date)} · ${a.min} min</div>
    <div class="rpeb-s">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<button type="button" data-rpe="${n}" title="${n} – ${RPE_TXT[n]}">${n}</button>`).join("")}</div>
    <div class="rpeb-l"><span>lehce</span><span>středně</span><span>maximum</span></div>
    <div class="rpeb-f"><button type="button" class="btn sm" data-rpe="0">Neptat se</button><span class="sub">Trenér to použije u únavy a stupňů kvalit.</span></div>`;
  document.body.appendChild(b);
  requestAnimationFrame(() => b.classList.add("on"));
  const close = () => { b.classList.remove("on"); setTimeout(() => b.remove(), 250); };
  b.querySelector("[data-later]").addEventListener("click", () => { try { sessionStorage.setItem("rpeLater", a.id); } catch {} close(); });
  b.querySelectorAll("[data-rpe]").forEach((x) => x.addEventListener("click", async () => {
    const n = +x.dataset.rpe;
    b.querySelectorAll("button").forEach((y) => (y.disabled = true));
    try {
      await api(`activity/${a.id}/rpe`, { method: "POST", body: JSON.stringify({ rpe: n }) });
      cache.clear();
      toast(n ? `Uloženo: ${n} – ${RPE_TXT[n]}` : "Dobře, na tenhle trénink se už nezeptám");
      close();
      setTimeout(rpeAsk, 400); // další neohodnocená aktivita
    } catch (e) { fail(e); b.querySelectorAll("button").forEach((y) => (y.disabled = false)); }
  }));
}
// ---------- průvodce připojením (po registraci: Garmin klíč, pak intervals.icu) ----------
const obLink = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text} ${ic("odkaz")}</a>`;
const OB_STEPS = {
  garminHow: () => `<h2>1 · Garmin klíč</h2><p class="sub">Kadence čte tvoje data (aktivity, spánek, VST, tep) přes oficiální Garmin Personal API. Klíč si vytvoříš sám, bez žádosti a schvalování.</p>
    <ol class="ob-steps"><li>Otevři ${obLink("https://connect.garmin.com/", "Garmin Connect")} na webu (v prohlížeči, ne v aplikaci) a přihlas se.</li>
    <li>Otevři <b>Nastavení</b> (Settings) a dole v seznamu vyber <b>Personal API Key</b>.</li>
    <li><b>Create Key</b>, platnost zvol <b>1 rok</b> a potvrď.</li>
    <li>Klíč <b>hned zkopíruj</b> – Garmin ho ukáže jen jednou. (Ztracený klíč smažeš a vytvoříš nový.)</li></ol>
    <div class="btns"><button class="btn pri" data-ob="garminKey">Mám klíč – vložit</button><button class="btn link" data-ob-later>Později</button></div>`,
  garminKey: () => `<h2>Vlož Garmin klíč</h2><form class="authf" data-obf="garmin"><label>Garmin API klíč<input name="k" type="password" autocomplete="off" required></label>
    <button class="btn pri" type="submit">Uložit a vyzkoušet</button><p class="note" data-obmsg role="status"></p></form>
    <p class="note">Klíč se uloží zašifrovaný. Změníš ho kdykoli v Nastavení → Připojení. Měsíc před vypršením tě upozorním.</p>
    <div class="btns"><button class="btn link" data-ob="garminHow">← Návod</button></div>`,
  icuHow: () => `<h2>2 · intervals.icu (doporučeno)</h2><p class="sub">Přes intervals.icu jde plán trenéra do kalendáře a do hodinek a odtud se berou okruhy jízd, kondice a splnění tréninku. Je zdarma.</p>
    <ol class="ob-steps"><li>Založ si účet na ${obLink("https://intervals.icu/", "intervals.icu")}.</li>
    <li>V <b>Settings</b> připoj <b>Garmin Connect</b> a zapni nahrávání plánovaných tréninků do Garminu – tréninky od trenéra pak dorazí do hodinek.</li>
    <li>Tamtéž zapni <b>Use laps for intervals</b>, ať se okruhy z hodinek načtou.</li>
    <li>Úplně dole v Settings je <b>Developer Settings</b>: tam najdeš <b>Athlete ID</b> (např. i123456) a <b>API Key</b>.</li></ol>
    <div class="btns"><button class="btn pri" data-ob="icuKey">Mám účet – vložit klíč</button><button class="btn link" data-ob-skip>Teď ne</button></div>`,
  icuKey: () => `<h2>Vlož intervals.icu</h2><form class="authf" data-obf="icu"><label>Athlete ID<input name="id" autocapitalize="none" autocomplete="off" placeholder="i123456" required pattern="[iI]?[0-9]{1,10}"></label><label>API Key<input name="k" type="password" autocomplete="off" required></label>
    <label class="ob-tg"><input type="checkbox" name="sync" checked> Zapisovat plán trenéra do intervals.icu (a tím do hodinek)</label>
    <button class="btn pri" type="submit">Uložit a vyzkoušet</button><p class="note" data-obmsg role="status"></p></form>
    <div class="btns"><button class="btn link" data-ob="icuHow">← Návod</button></div>`,
  done: () => `<h2>Hotovo</h2><p class="sub">Data se začnou stahovat během pár minut, historie postupně na pozadí. Klíče změníš v Nastavení → Připojení.</p><div class="btns"><button class="btn pri" data-ob-close>Pokračovat</button></div>`,
};
/** Uloží klíč z průvodce a otestuje připojení; vrací text výsledku testu (Garmin nebo intervals.icu). */
async function obSave(kind, fd) {
  const put = (key, value) => api("secrets", { method: "POST", body: JSON.stringify({ key, value }) });
  if (kind === "garmin") {
    await put("GARMIN_API_KEY", String(fd.get("k")).trim());
    await api("settings", { method: "POST", body: JSON.stringify({ garmin_key_created: localToday() }) });
  } else {
    const id = String(fd.get("id")).trim().toLowerCase();
    await put("INTERVALS_ATHLETE_ID", id.startsWith("i") ? id : "i" + id);
    await put("INTERVALS_API_KEY", String(fd.get("k")).trim());
  }
  const t = await api("secrets/test", { method: "POST" });
  const res = kind === "garmin" ? t.garmin : t.intervals;
  // nefunkční klíč nenechat uložený (prázdná hodnota = smazat), jinak by se průvodce už neukázal
  if (!/^připojeno/.test(res)) for (const k of kind === "garmin" ? ["GARMIN_API_KEY"] : ["INTERVALS_API_KEY", "INTERVALS_ATHLETE_ID"]) await put(k, "").catch(() => {});
  return res;
}
/** Průvodce se ukáže, dokud chybí Garmin klíč (a intervals.icu, dokud ho nepřeskočíš). „Později“ = znovu při dalším otevření. Vrací true, když se ukázal. */
async function onboardAsk() {
  if (document.querySelector(".obmodal")) return true;
  const sec = await api("secrets").catch(() => null);
  if (!Array.isArray(sec)) return false;
  const has = (k) => !!sec.find((x) => x.key === k)?.source;
  let icuSkip = false, later = false;
  try { icuSkip = localStorage.getItem("obIcuSkip") === "1"; later = sessionStorage.getItem("obLater") === "1"; } catch {}
  const needGarmin = !has("GARMIN_API_KEY"), needIcu = !has("INTERVALS_API_KEY") || !has("INTERVALS_ATHLETE_ID");
  if (later || (!needGarmin && (!needIcu || icuSkip))) return false;
  const ov = document.createElement("div");
  ov.className = "modal obmodal";
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-label", "Připojení dat");
  const close = () => { ov.remove(); cache.clear(); alertsAsk(); };
  const show = (step) => {
    ov.innerHTML = `<div class="modal-in ob">${OB_STEPS[step]()}</div>`;
    ov.querySelectorAll("[data-ob]").forEach((b) => b.addEventListener("click", () => show(b.dataset.ob)));
    ov.querySelector("[data-ob-later]")?.addEventListener("click", () => { try { sessionStorage.setItem("obLater", "1"); } catch {} close(); });
    ov.querySelector("[data-ob-skip]")?.addEventListener("click", () => { try { localStorage.setItem("obIcuSkip", "1"); } catch {} close(); });
    ov.querySelector("[data-ob-close]")?.addEventListener("click", close);
    ov.querySelector("form[data-obf]")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target, kind = f.dataset.obf, msg = f.querySelector("[data-obmsg]"), btn = f.querySelector("[type=submit]");
      btn.disabled = true; msg.textContent = "Ukládám a zkouším připojení…";
      try {
        const res = await obSave(kind, new FormData(f));
        if (!/^připojeno/.test(res)) { msg.textContent = `Připojení nejde (${res}). Zkontroluj klíč a vlož ho znovu.`; btn.disabled = false; return; }
        if (kind === "icu") await api("settings", { method: "POST", body: JSON.stringify({ icu_sync: new FormData(f).get("sync") === "on" }) });
        cache.clear();
        show(kind === "garmin" && needIcu && !icuSkip ? "icuHow" : "done");
      } catch (err) { msg.textContent = `Nepovedlo se: ${err.message}`; btn.disabled = false; }
    });
    ov.querySelector("form input")?.focus();
  };
  show(needGarmin ? "garminHow" : "icuHow");
  document.body.appendChild(ov);
  return true;
}
// ---------- upozornění (servis, Garmin klíč, zdraví a zátěž – src/api/alerts.ts) ----------
/** Bublina po otevření stránky; „Rozumím“ = stejné upozornění se už neukáže. Po zavření se zeptá na RPE. */
async function alertsAsk() {
  if (document.querySelector(".alertb")) return;
  const list = await api("alerts").catch(() => null);
  if (!list || !list.length) return rpeAsk();
  const b = document.createElement("div");
  b.className = "rpeb alertb";
  b.setAttribute("role", "dialog");
  b.setAttribute("aria-label", "Upozornění");
  const item = (a) => `<div class="alb-i" data-key="${esc(a.key)}"><span class="alb-ico">${ic(a.icon)}</span><div><b>${esc(a.title)}</b><div class="sub">${esc(a.text)}</div>${a.href ? `<a href="${esc(a.href)}" data-go>Otevřít →</a>` : ""}</div><button type="button" class="btn sm" data-ok>Rozumím</button></div>`;
  b.innerHTML = `<div class="rpeb-h"><b>Upozornění (${list.length})</b><button class="btn sm" data-later aria-label="Později">✕</button></div>${list.map(item).join("")}`;
  document.body.appendChild(b);
  requestAnimationFrame(() => b.classList.add("on"));
  const close = () => { b.classList.remove("on"); setTimeout(() => { b.remove(); rpeAsk(); }, 250); };
  b.querySelector("[data-later]").addEventListener("click", close);
  b.querySelectorAll("[data-go]").forEach((x) => x.addEventListener("click", close));
  b.querySelectorAll("[data-ok]").forEach((x) => x.addEventListener("click", async () => {
    const row = x.closest(".alb-i");
    x.disabled = true;
    try {
      await api("alerts/seen", { method: "POST", body: JSON.stringify({ key: row.dataset.key }) });
      cache.delete("alerts");
      row.remove();
      if (!b.querySelector(".alb-i")) close();
    } catch (e) { fail(e); x.disabled = false; }
  }));
}
/** Vlastník: přepnout na prohlížení jiného účtu (0 = zpět na svůj). Cookie nastaví server jen vlastníkovi. */
async function viewAs(uid) {
  const r = await fetch("/view-as", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uid }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `chyba ${r.status}`);
  cache.clear(); clearChats();
  location.hash = "#/prehled";
  location.reload();
}
document.addEventListener("click", (e) => { const b = e.target.closest?.("[data-viewas]"); if (!b) return; b.disabled = true; viewAs(+b.dataset.viewas).catch((err) => fail(err, b)); });
/** lišta nahoře, když vlastník prohlíží cizí účet */
async function viewBar() {
  const me = await api("me").catch(() => null);
  if (!me || !me.viewing) return false;
  const bar = document.createElement("div");
  bar.className = "viewbar"; bar.setAttribute("role", "status");
  bar.innerHTML = `<span>Prohlížíš účet <b>${esc(me.name || me.username || `#${me.uid}`)}</b></span><button class="btn sm" data-viewas="0">Zpět na můj</button>`;
  document.body.prepend(bar);
  document.documentElement.classList.add("viewing");
  return true;
}
route();
// upozornění a hodnocení náročnosti jen na vlastním účtu (ne při prohlížení cizího)
viewBar().then(async (v) => { if (!v && !(await onboardAsk())) alertsAsk(); });
