// Návrhy změn Z1…: uložení, výběr podle „ano / ano Z1, Z3 / ne Z2“, zápis do D1 a zrcadlo do intervals.icu.
import type { Env } from "../env";
import { IntervalsClient } from "../datasource/intervals";
import type { Change, Payload } from "../core/plan";
import { ICU_TYPE } from "../core/workout";
import { all, first, getState, lit, logEvent, logged, run, setState } from "../lib/db";
import { HttpError } from "../lib/http";
import { dayDm } from "../lib/format";
import { getSettings } from "../lib/settings";

export async function saveProposal(env: Env, source: string, changes: Change[]): Promise<number> {
  await run(env.DB, "UPDATE proposals SET status = 'superseded' WHERE status = 'open'");
  if (!changes.length) return 0;
  const r = await env.DB.prepare("INSERT INTO proposals (created_at, source, items, status) VALUES (?, ?, ?, 'open') RETURNING id")
    .bind(new Date().toISOString(), source, JSON.stringify(changes))
    .first<{ id: number }>();
  return r?.id ?? 0;
}

/** starší návrhy měly kódy Z1, Z2 (pletly se se zónami) → zobrazovat jako #1, #2 */
const codes = (items: Change[]): Change[] => items.map((c) => ({ ...c, code: c.code.replace(/^Z(?=[0-9]+$)/, "#") }));

export async function openProposal(env: Env): Promise<{ id: number; items: Change[] } | null> {
  const r = await first<{ id: number; items: string }>(env.DB, "SELECT id, items FROM proposals WHERE status = 'open' ORDER BY id DESC LIMIT 1");
  return r ? { id: r.id, items: codes(JSON.parse(r.items) as Change[]) } : null;
}

export async function getProposal(env: Env, id: number) {
  const r = await first<{ id: number; items: string; status: string }>(env.DB, "SELECT id, items, status FROM proposals WHERE id = ?", id);
  return r ? { id: r.id, items: codes(JSON.parse(r.items) as Change[]), status: r.status } : null;
}

function eventBody(p: Payload, id: number) {
  return {
    category: "WORKOUT",
    start_date_local: `${p.date}T00:00:00`,
    type: (p.sport ?? "ride") === "ride" ? (p.indoor ? "VirtualRide" : "Ride") : ICU_TYPE[p.sport!] ?? "Run",
    name: p.name,
    description: p.steps_text,
    indoor: !!p.indoor,
    moving_time: p.duration_min * 60,
    external_id: `trener-${id}`,
  };
}

export interface ApplyResult {
  lines: string[];
  verify: string;
}

/** zabrat otevřený návrh pro zápis (atomicky); false = už ho zapisuje / zapsal někdo jiný */
export async function claimProposal(env: Env, id: number): Promise<boolean> {
  const r = await env.DB.prepare("UPDATE proposals SET status = 'applying' WHERE id = ? AND status = 'open'").bind(id).run();
  return (r.meta.changes ?? 0) === 1;
}
/** po zápisu: zbylé změny zůstanou otevřené, jinak hotovo */
export async function finishProposal(env: Env, id: number, rest: Change[] | null): Promise<void> {
  if (rest == null) await env.DB.prepare("UPDATE proposals SET status = 'open' WHERE id = ? AND status = 'applying'").bind(id).run();
  else if (rest.length) await env.DB.prepare("UPDATE proposals SET status = 'open', items = ? WHERE id = ?").bind(JSON.stringify(rest), id).run();
  else await env.DB.prepare("UPDATE proposals SET status = 'applied', items = '[]' WHERE id = ?").bind(id).run();
}

// ---- mazání událostí v intervals.icu: chyba se nezahazuje, nesmazané se zkouší znovu ----
const DEL_QUEUE = "icu_delete_queue";
/** smaže událost; true = smazáno (nebo už neexistuje – 404), false = nepovedlo se (zařadí do fronty) */
async function deleteIcuEvent(env: Env, icu: IntervalsClient, id: string): Promise<boolean> {
  try {
    await icu.deleteEvent(id);
    return true;
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return true;
    const q = (await getState<string[]>(env.DB, DEL_QUEUE)) ?? [];
    if (!q.includes(id)) await setState(env.DB, DEL_QUEUE, [...q, id].slice(-200));
    await logEvent(env.DB, "warn", `intervals.icu: událost ${id} se nepodařilo smazat (${(e as Error).message.slice(0, 80)}) – zkusím znovu`);
    return false;
  }
}
/** zopakovat dříve nesmazané události (volá se před zápisem a z plánovače) */
export async function retryIcuDeletes(env: Env): Promise<number> {
  const q = (await getState<string[]>(env.DB, DEL_QUEUE)) ?? [];
  if (!q.length) return 0;
  const icu = new IntervalsClient(env);
  if (!icu.configured) return 0;
  const left: string[] = [];
  for (const id of q) {
    try { await icu.deleteEvent(id); } catch (e) { if (!(e instanceof HttpError && e.status === 404)) left.push(id); }
  }
  await setState(env.DB, DEL_QUEUE, left);
  return q.length - left.length;
}

/**
 * Vypnutí trenéra: smaže naplánované tréninky po dni `after` (dnešek a odjeté zůstanou) i v intervals.icu
 * a zavře otevřený návrh změn. Nesmazané události v intervals.icu se zkusí znovu (fronta).
 */
export async function clearFuturePlan(env: Env, after: string): Promise<number> {
  const rows = await all<{ id: number; icu_event_id: string | null }>(env.DB, "SELECT id, icu_event_id FROM planned_workouts WHERE date > ? AND status = 'planned'", after);
  const icu = new IntervalsClient(env);
  for (const r of rows) if (r.icu_event_id && icu.configured) await deleteIcuEvent(env, icu, r.icu_event_id);
  await run(env.DB, "DELETE FROM planned_workouts WHERE date > ? AND status = 'planned'", after);
  await run(env.DB, "UPDATE proposals SET status = 'superseded' WHERE status = 'open'");
  return rows.length;
}

/** Zápis vybraných změn (7.2). Před zápisem znovu načte dotčené dny, po zápisu ověří zpětným čtením. */
export async function applyChanges(env: Env, items: Change[]): Promise<ApplyResult> {
  const s = await getSettings(env.DB);
  const icu = new IntervalsClient(env);
  const sync = s.icu_sync && icu.configured;
  const now = new Date().toISOString();
  const lines: string[] = [];
  const touched = new Set<string>();
  const notDeleted: string[] = [];
  if (sync) await retryIcuDeletes(env).catch(logged(env.DB, "intervals.icu: dosmazání selhalo", 0));

  for (const c of items) {
    try {
      if (c.action === "smazat" && c.targetId) {
        const row = await first<{ icu_event_id: string | null; date: string }>(env.DB, "SELECT icu_event_id, date FROM planned_workouts WHERE id = ?", c.targetId);
        await run(env.DB, "UPDATE planned_workouts SET status = 'skipped', updated_at = ? WHERE id = ?", now, c.targetId);
        const ok = !(sync && row?.icu_event_id) || (await deleteIcuEvent(env, icu, row.icu_event_id));
        if (row) touched.add(row.date);
        if (!ok && row) notDeleted.push(dayDm(row.date));
        lines.push(ok ? `${c.code} smazáno: ${c.name}` : `${c.code} smazáno z plánu, v intervals.icu se to zatím nepovedlo (zkusím znovu): ${c.name}`);
        continue;
      }
      const p = c.payload;
      if (!p) continue;
      let id = c.targetId ?? null;
      if (!id) {
        // existuje už ve stejný den podobná jednotka? → upravit místo nové (7.2 bod 2)
        const same = await first<{ id: number }>(env.DB, "SELECT id FROM planned_workouts WHERE date = ? AND status = 'planned' AND kind != 'rest' ORDER BY id DESC LIMIT 1", p.date);
        id = same?.id ?? null;
      }
      const prev = id ? await first<{ date: string; icu_event_id: string | null }>(env.DB, "SELECT date, icu_event_id FROM planned_workouts WHERE id = ?", id) : null;
      if (id) {
        await run(
          env.DB,
          "UPDATE planned_workouts SET date=?, kind=?, quality_type=?, name=?, indoor=?, duration_min=?, steps_json=?, steps_text=?, target_load=?, reason=?, moved_from=?, sport=?, goal=?, status='planned', updated_at=? WHERE id=?",
          p.date, p.kind, p.quality_type, p.name, p.indoor, p.duration_min, p.steps_json, p.steps_text, p.target_load, p.reason, p.moved_from ?? null, p.sport ?? "ride", p.goal ?? s.goal, now, id,
        );
      } else {
        const r = await env.DB.prepare(
          "INSERT INTO planned_workouts (date, kind, quality_type, name, indoor, duration_min, steps_json, steps_text, target_load, reason, status, moved_from, sport, goal, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?, 'planned', ?, ?, ?, ?, ?) RETURNING id",
        )
          .bind(p.date, p.kind, p.quality_type, p.name, p.indoor, p.duration_min, p.steps_json, p.steps_text, p.target_load, p.reason, p.moved_from ?? null, p.sport ?? "ride", p.goal ?? s.goal, now, now)
          .first<{ id: number }>();
        id = r!.id;
      }
      if (prev) touched.add(prev.date);
      touched.add(p.date);
      if (sync) {
        const body = eventBody(p, id);
        let evId = prev?.icu_event_id ?? null;
        if (evId) await icu.updateEvent(evId, body).catch(async () => (evId = String((await icu.createEvent(body)).id)));
        else evId = String((await icu.createEvent(body)).id);
        await run(env.DB, "UPDATE planned_workouts SET icu_event_id = ? WHERE id = ?", evId, id);
      }
      lines.push(`${c.code} ${c.action === "nová" ? "zapsáno" : c.action === "přesunout" ? "přesunuto" : "upraveno"}: ${dayDm(p.date)} ${p.name}`);
    } catch (e) {
      lines.push(`${c.code} se nepodařilo zapsat (${(e as Error).message.slice(0, 80)})`);
      await logEvent(env.DB, "error", `apply ${c.code}: ${(e as Error).message}`);
    }
  }

  // ověření zpětným čtením (7.2 bod 5)
  let verify = "Zapsáno do plánu.";
  if (touched.size) {
    const dates = [...touched].sort();
    const rows = await all<{ id: number; date: string; name: string; icu_event_id: string | null }>(
      env.DB,
      `SELECT id, date, name, icu_event_id FROM planned_workouts WHERE status = 'planned' AND date IN (${dates.map(lit).join(",")})`,
    );
    const perDay = new Map<string, number>();
    for (const r of rows) perDay.set(r.date, (perDay.get(r.date) ?? 0) + 1);
    const dup = [...perDay.entries()].filter(([, n]) => n > 1).map(([d]) => dayDm(d));
    verify = dup.length ? `Pozor: ve dnech ${dup.join(", ")} je víc jednotek, zkontroluj plán.` : "Ověřeno: každá jednotka je v plánu jen jednou a ve správný den.";
    if (sync) {
      try {
        const evs = await icu.events(dates[0]!, dates[dates.length - 1]!);
        const ours = evs.filter((e) => String(e.external_id ?? "").startsWith("trener-") && e.category === "WORKOUT");
        const bad: string[] = [];
        for (const r of rows) {
          const matching = ours.filter((e) => String(e.id) === r.icu_event_id);
          if (matching.length !== 1 || String(matching[0]!.start_date_local).slice(0, 10) !== r.date) bad.push(dayDm(r.date));
        }
        const dupIcu = new Map<string, number>();
        for (const e of ours) dupIcu.set(String(e.start_date_local).slice(0, 10), (dupIcu.get(String(e.start_date_local).slice(0, 10)) ?? 0) + 1);
        const dupDays = [...dupIcu.entries()].filter(([, n]) => n > 1).map(([d]) => dayDm(d));
        verify += bad.length || dupDays.length
          ? ` Pozor: intervals.icu nesedí pro ${[...new Set([...bad, ...dupDays])].join(", ")}.`
          : " V intervals.icu ověřeno zpětným čtením.";
      } catch (e) {
        verify += ` intervals.icu se nepodařilo ověřit (${(e as Error).message.slice(0, 60)}).`;
      }
    }
  }
  if (notDeleted.length) verify += ` Pozor: v intervals.icu zatím zůstalo ke smazání: ${notDeleted.join(", ")} – zkusím to znovu automaticky.`;
  return { lines, verify };
}

/** Zrušení omezení (např. omylem „Dnes nepojedu“): smaže záznam v D1 i poznámku v intervals.icu. kind null = všechna omezení dne. */
export async function removeConstraint(env: Env, date: string, kind: string | null): Promise<number> {
  const rows = await all<{ id: number; icu_event_id: string | null; created_at: string | null }>(
    env.DB,
    kind ? "SELECT id, icu_event_id, created_at FROM constraints WHERE date = ? AND kind = ?" : "SELECT id, icu_event_id, created_at FROM constraints WHERE date = ? AND kind NOT IN ('sport', 'typ')",
    ...(kind ? [date, kind] : [date]),
  );
  const icu = new IntervalsClient(env);
  for (const r of rows) {
    // nesmazanou poznámku si fronta pamatuje, i když řádek v D1 zmizí
    if (r.icu_event_id && icu.configured) await deleteIcuEvent(env, icu, r.icu_event_id);
    await run(env.DB, "DELETE FROM constraints WHERE id = ?", r.id);
  }
  // jednotka, kterou kvůli omezení smazal potvrzený návrh, se vrátí do plánu (i do intervals.icu → Garmin)
  const since = rows.map((r) => r.created_at).filter(Boolean).sort()[0];
  if (since) {
    const back = await all<any>(env.DB, "SELECT * FROM planned_workouts WHERE date = ? AND status = 'skipped' AND updated_at >= ?", date, since);
    const s = await getSettings(env.DB);
    for (const p of back) {
      let evId: string | null = null;
      if (s.icu_sync && icu.configured) {
        // nevyjde-li to, zapíše se při dalším návrhu – ale do logu, ať je vidět, že kalendář nesedí
        try { evId = String((await icu.createEvent(eventBody(p, p.id))).id); } catch (e) { await logEvent(env.DB, "warn", `intervals.icu: trénink ${p.date} se nezapsal (${(e as Error).message})`); }
      }
      await run(env.DB, "UPDATE planned_workouts SET status = 'planned', icu_event_id = ?, updated_at = ? WHERE id = ?", evId, new Date().toISOString(), p.id);
    }
  }
  return rows.length;
}

/** Omezení (7.4) – zapisuje se hned, bez potvrzení; volitelně i jako NOTE do intervals.icu. */
export async function addConstraint(env: Env, date: string, kind: string, note: string | null): Promise<void> {
  if (kind === "typ") {
    // druh jednotky (z2 | quality) zvolený uživatelem; „auto“ = zrušit volbu
    await run(env.DB, "DELETE FROM constraints WHERE date = ? AND kind = 'typ'", date);
    if (note === "z2" || note === "quality") await run(env.DB, "INSERT INTO constraints (date, kind, note, created_at) VALUES (?, 'typ', ?, ?)", date, note, new Date().toISOString());
    return;
  }
  if (kind === "sport") {
    // náhrada sportu: platí poslední volba pro den; „kolo“ = zrušit náhradu
    await run(env.DB, "DELETE FROM constraints WHERE date = ? AND kind = 'sport'", date);
    if (note && note !== "ride") await run(env.DB, "INSERT INTO constraints (date, kind, note, created_at) VALUES (?, 'sport', ?, ?)", date, note, new Date().toISOString());
    else await run(env.DB, "INSERT INTO constraints (date, kind, note, created_at) VALUES (?, 'sport', 'ride', ?)", date, new Date().toISOString());
    return;
  }
  if (kind === "delka") {
    // délka tréninku zadaná uživatelem (min); prázdná / 0 = zrušit
    await run(env.DB, "DELETE FROM constraints WHERE date = ? AND kind = 'delka'", date);
    if (note && Number(note) >= 20) await run(env.DB, "INSERT INTO constraints (date, kind, note, created_at) VALUES (?, 'delka', ?, ?)", date, String(Math.round(Number(note))), new Date().toISOString());
    return;
  }
  if (kind === "jizda") {
    // vlastní jízda: platí poslední zadání pro den (JSON {min, km, with}); jízda se zapíše do kalendáře přes návrh změn
    await run(env.DB, "DELETE FROM constraints WHERE date = ? AND kind = 'jizda'", date);
    if (note) await run(env.DB, "INSERT INTO constraints (date, kind, note, created_at) VALUES (?, 'jizda', ?, ?)", date, note, new Date().toISOString());
    return;
  }
  if (kind === "trenazer") {
    // kde pojedeš: 1 = trenažér, 0 = venku, prázdné = rozhodne trenér
    await run(env.DB, "DELETE FROM constraints WHERE date = ? AND kind = 'trenazer'", date);
    if (note === "1" || note === "0") await run(env.DB, "INSERT INTO constraints (date, kind, note, created_at) VALUES (?, 'trenazer', ?, ?)", date, note, new Date().toISOString());
    return;
  }
  if (kind === "kroky") {
    // tvoje úprava kvality (JSON {reps, work_s, pct}); platí poslední zadání pro den
    await run(env.DB, "DELETE FROM constraints WHERE date = ? AND kind = 'kroky'", date);
    if (note) await run(env.DB, "INSERT INTO constraints (date, kind, note, created_at) VALUES (?, 'kroky', ?, ?)", date, note, new Date().toISOString());
    return;
  }
  const exists = await first(env.DB, "SELECT 1 AS x FROM constraints WHERE date = ? AND kind = ?", date, kind);
  if (exists) return;
  let evId: string | null = null;
  const s = await getSettings(env.DB);
  const icu = new IntervalsClient(env);
  if (s.icu_sync && icu.configured) {
    const names: Record<string, string> = { nemuzu: "Nemuzu", bezky: "Bezky", nemoc: "Nemoc", dovolena: "Dovolena", nepojedu: "Nepojedu" };
    try {
      const ev = await icu.createEvent({ category: "NOTE", start_date_local: `${date}T00:00:00`, name: names[kind] ?? kind, description: note ?? "" });
      evId = String(ev.id);
    } catch {
      /* poznámka v D1 stačí */
    }
  }
  await run(env.DB, "INSERT INTO constraints (date, kind, note, icu_event_id, created_at) VALUES (?, ?, ?, ?, ?)", date, kind, note, evId, new Date().toISOString());
}
