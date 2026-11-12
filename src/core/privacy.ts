// Soukromí pro AI:s nastavením `ai_private` AI nedostane zdravotní údaje – VST, klidový tep, spánek,
// stres, Body Battery, dech, váhu ani z nich odvozené zotavení. Tréninková čísla (zátěž, kondice, aktivity, plán) zůstávají.

/** Klíče se zdravotními údaji (i vnořené, i s příponou: hrv_ms, spanek_skore, klidovy_tep_hodnoceni…). */
const HEALTH_KEY = /^(hrv|vst|klidov|rhr|spanek|spánek|sleep|stres|stress|body_battery|bb_|dopad_body|zdravi|semafor|zotaven|recovery|duvody|vaha|váha|weight|dech|resp|spo2|energie|pripravenost)/i;

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
