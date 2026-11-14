// Název aktivity: Garmin pojmenuje jízdu podle naplánovaného tréninku „Hostomice - Z2 vytrvalost“, bez plánu
// „Hostomice Silniční cyklistika“. Aplikace drží jednotný tvar „místo + druh“ – název tréninku je u aktivity zvlášť
// (plán, splnění). Mění se jen název, který opravdu vznikl ze spárovaného tréninku; vlastní názvy zůstávají.

/** druh aktivity tak, jak ho do názvu píše Garmin Connect (česky) */
export const GARMIN_SPORT_WORD: Record<string, string> = {
  ride: "Silniční cyklistika",
  mtb: "Horská cyklistika",
  indoor: "Cyklistika v interiéru",
  run: "Běh",
  xc_ski: "Běh na lyžích",
  walk: "Chůze",
  hike: "Turistika",
  skate: "Bruslení",
  padel: "Padel",
  strength: "Silový trénink",
  mobility: "Mobilita",
  other: "Aktivita",
};

const SEP = " - ";

/**
 * „Hostomice - Z2 vytrvalost“ + plán „Z2 vytrvalost“ → „Hostomice Silniční cyklistika“.
 * Zbytek za pomlčkou musí být začátkem názvu plánu (Garmin ho někdy zkrátí: „Hostomice - Z2 “). Jinak beze změny.
 */
export function garminLikeName(name: string | null, sport: string, planName: string | null): string | null {
  if (!name || !planName) return name;
  const i = name.indexOf(SEP);
  if (i <= 0) return name;
  const rest = name.slice(i + SEP.length).trim();
  if (!planName.startsWith(rest)) return name;
  return `${name.slice(0, i)} ${GARMIN_SPORT_WORD[sport] ?? GARMIN_SPORT_WORD.other}`;
}

/** Totéž pravidlo jako garminLikeName v SQL – spouští se po každém uložení aktivit (Garmin název při synchronizaci přepíše). */
export const PLAN_NAME_SQL = (() => {
  const plan = "json_extract(icu_event, '$.name')";
  const sep = "instr(name, ' - ')";
  const rest = `trim(substr(name, ${sep} + 3))`;
  const word = `CASE sport ${Object.entries(GARMIN_SPORT_WORD).map(([k, v]) => `WHEN '${k}' THEN '${v}'`).join(" ")} ELSE '${GARMIN_SPORT_WORD.other}' END`;
  const renamed = `substr(name, 1, ${sep} - 1) || ' ' || ${word}`;
  return `UPDATE activities SET name = ${renamed} WHERE ${plan} IS NOT NULL AND ${sep} > 1 AND substr(${plan}, 1, length(${rest})) = ${rest} AND name != ${renamed}`;
})();
