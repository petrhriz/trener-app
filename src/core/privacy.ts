// Soukromí pro AI: s nastavením `ai_private` AI nedostane zdravotní údaje – VST, klidový tep, spánek,
// stres, Body Battery, dech, váhu ani z nich odvozené zotavení. Tréninková čísla (zátěž, kondice, aktivity, plán) zůstávají.

/** Klíče se zdravotními údaji (i vnořené, i s příponou: hrv_ms, spanek_skore, klidovy_tep_hodnoceni…). */
// dnesni_rozhodnuti: důvod rozhodnutí obsahuje zdravotní údaje („VST pod normou“, „spánek pod 5 h“)
const HEALTH_KEY = /^(hrv|vst|klidov|rhr|spanek|spánek|sleep|stres|stress|body_battery|bb_|dopad_body|zdravi|semafor|zotaven|recovery|duvody|vaha|váha|weight|dech|resp|spo2|energie|pripravenost|dnesni_rozhodnuti)/i;

/** Kopie kontextu bez zdravotních údajů (rekurzivně přes objekty i pole). */
export function stripHealth<T>(v: T): T {
  if (Array.isArray(v)) return v.map((x) => stripHealth(x)) as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (!HEALTH_KEY.test(k)) out[k] = stripHealth(x);
    return out as T;
  }
  return v;
}

/** Stránky dashboardu (adresa #/…) bez zdravotních údajů – jen jejich obsah smí AI dostat při zapnutém soukromí. */
const TRAINING_PAGES = /^#\/(trener|kondice|aktivity|kolo|aktivita|pocasi|vybaveni|sila)(\/|$)/i;
export const pageAllowedPrivate = (hash: string): boolean => TRAINING_PAGES.test(String(hash ?? "").trim());

/** AI shrnutí stránek, které jsou celé o zdraví – se soukromím se nepíšou vůbec. */
const HEALTH_NOTES = new Set(["zotaveni"]);
/** Kontext pro AI shrnutí stránky: se soukromím bez zdravotních údajů; null = shrnutí se nepíše. */
export function noteContext<T extends Record<string, unknown>>(context: T, page: string, priv: boolean): T | null {
  if (!priv) return context;
  return HEALTH_NOTES.has(page) ? null : stripHealth(context);
}
