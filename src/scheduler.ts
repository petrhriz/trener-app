// Interní plánovač (jeden cron */15). Čas v Europe/Prague – letní/zimní čas řeší Intl.
import type { Env } from "./env";
import { all, getState, logEvent, once, run, setState, wasSent } from "./lib/db";
import { dm } from "./lib/format";
import { getSettings } from "./lib/settings";
import { addDays, daysBetween, hm, localNow, mondayOf } from "./lib/time";
import { activityReport, weekly } from "./report/build";
import { loadCtx, parseAct } from "./report/context";
import { syncTick } from "./sync/sync";
import { cmdRano, cmdTyden, cmdZitra, send } from "./telegram/bot";
import { activityMessage } from "./telegram/render";
import { serviceAlerts } from "./api/gear";
import { retryIcuDeletes } from "./plan/proposals";

export async function runScheduler(env: Env, at = new Date()): Promise<string[]> {
  const log: string[] = [];
  const rep = await syncTick(env);
  log.push(...rep.steps);
  // dříve nesmazané události v intervals.icu (výpadek) – zkusit znovu
  const del = await retryIcuDeletes(env).catch(() => 0);
  if (del) log.push(`intervals.icu: dosmazáno ${del}`);
  if (!env.TELEGRAM_CHAT_ID) return log;
  const now = localNow(at, env.TZ_NAME);
  const T = now.date;
  const s = await getSettings(env.DB);
  /** zpráva jednou: zabere klíč, při chybě ho uvolní, ať to další běh v okně zkusí znovu (nejvýš 3×) */
  const claim = async (key: string, fn: () => Promise<void>): Promise<boolean> => {
    if (!(await once(env.DB, key))) return false;
    try {
      await fn();
      return true;
    } catch (e) {
      const n = ((await getState<number>(env.DB, `tries:${key}`)) ?? 0) + 1;
      if (n < 3) {
        await run(env.DB, "DELETE FROM sent_messages WHERE key = ?", key);
        await setState(env.DB, `tries:${key}`, n);
      }
      throw e;
    }
  };
  const job = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      log.push(`${name}: ${(e as Error).message}`);
      await logEvent(env.DB, "error", `${name}: ${(e as Error).message}`);
    }
  };

  // stavy jednotek: minulé dny done / missed (vynechaná se nedohání, 6.1a)
  await job("stavy", async () => {
    await run(
      env.DB,
      `UPDATE planned_workouts SET status = CASE WHEN EXISTS (SELECT 1 FROM activities a WHERE a.date = planned_workouts.date AND a.sport IN ('ride','mtb','indoor','run','xc_ski','walk','hike') AND a.moving_s >= 1200) THEN 'done' ELSE 'missed' END, updated_at = ?
       WHERE status = 'planned' AND kind != 'rest' AND (date < ? OR (date = ? AND EXISTS (SELECT 1 FROM activities a WHERE a.date = planned_workouts.date AND a.sport IN ('ride','mtb','indoor','run','xc_ski','walk','hike') AND a.moving_s >= 1200)))`,
      new Date().toISOString(),
      T,
      T,
    );
  });

  // ranní připravenost: jakmile je dnešní spánek a HRV (5:30–11:00), jinak v 11:00 s „nemám“
  const mFrom = hm(s.morning_from);
  const mTo = hm(s.morning_to);
  if (now.minutes >= mFrom && now.minutes <= mTo + 14 && !(await wasSent(env.DB, `rano:${T}`))) {
    await job("ráno", async () => {
      const w = await all<{ hrv: number | null; sleep_s: number | null }>(env.DB, "SELECT hrv, sleep_s FROM wellness WHERE date = ?", T);
      const ready = w[0]?.hrv != null && w[0]?.sleep_s != null;
      if (ready || now.minutes >= mTo) {
        if (await claim(`rano:${T}`, () => cmdRano(env))) log.push("ráno odesláno");
      }
    });
  }

  // rozbor nových aktivit (do 30 min po synchronizaci; čeká na lapy z intervals.icu)
  await job("aktivity", async () => {
    const since = (await getState<string>(env.DB, "analysis_since")) ?? new Date().toISOString();
    const rows = await all<any>(env.DB, "SELECT * FROM activities WHERE analyzed_sent = 0 AND seen_at >= ? AND date >= ? ORDER BY start_local", since, addDays(T, -2));
    if (!rows.length) return;
    const ctx = await loadCtx(env, at);
    for (const r of rows) {
      // počkat na doplnění z intervals.icu (lapy, spárovaný workout), nejdéle 30 min
      const age = Date.now() - Date.parse(r.seen_at);
      if (r.enrich_state !== 1 && age < 30 * 60_000) continue;
      const a = ctx.acts.find((x) => x.id === r.id) ?? parseAct(r);
      try {
        const ok = await claim(`akt:${r.id}`, async () => {
          await send(env, activityMessage(activityReport(ctx, a), env.PUBLIC_URL));
          await run(env.DB, "UPDATE activities SET analyzed_sent = 1 WHERE id = ?", r.id);
        });
        if (ok) log.push(`rozbor ${r.id}`);
        else await run(env.DB, "UPDATE activities SET analyzed_sent = 1 WHERE id = ?", r.id); // už odeslané nebo vzdané – nezkoušet každý běh
      } catch (e) {
        log.push(`rozbor ${r.id}: ${(e as Error).message}`);
      }
    }
  });

  // večer: zítřek + návrh změn
  const ev = hm(s.evening_time);
  if (now.minutes >= ev && now.minutes < ev + 120) {
    await job("večer", async () => {
      if (await claim(`vecer:${T}`, () => cmdZitra(env))) log.push("zítřek odeslán");
    });
  }

  // neděle večer: týdenní review + plán na další týden
  const wt = hm(s.weekly_time);
  if (now.dow === s.weekly_dow && now.minutes >= wt && now.minutes < wt + 120) {
    await job("týden", async () => {
      const mon = mondayOf(T);
      const ok = await claim(`tyden:${mon}`, async () => {
        const ctx = await loadCtx(env, at);
        const w = await weekly(ctx, mon);
        await run(env.DB, "INSERT INTO weekly_reviews (week_from, data, created_at) VALUES (?, ?, ?) ON CONFLICT(week_from) DO UPDATE SET data = excluded.data", mon, JSON.stringify(w), new Date().toISOString());
        await cmdTyden(env);
      });
      if (ok) log.push("týden odeslán");
    });
  }

  // servis vybavení (řetěz, vosk…): jednou za hodinu, mezi 7 a 21 h
  if (now.hh >= 7 && now.hh <= 21 && !(await wasSent(env.DB, `servis:${T}:${now.hh}`)) && (await once(env.DB, `servis:${T}:${now.hh}`))) {
    await job("servis", async () => {
      for (const m of await serviceAlerts(env.DB)) {
        try {
          await send(env, m.text);
          await m.commit();
          log.push("servis upozornění");
        } catch (e) {
          log.push(`servis: ${(e as Error).message}`); // notified_km zůstává → příští hodinu znovu
        }
      }
    });
  }

  // upozornění mimo ranní zprávu: selhání synchronizace, končící Garmin klíč
  await job("upozornění", async () => {
    if (rep.errors.some((x) => x.startsWith("aktivity"))) {
      const last = await getState<string>(env.DB, "last_sync_ok");
      if (last && Date.now() - Date.parse(last) > 6 * 3600_000)
        await claim(`sync-fail:${T}`, () => send(env, `⚠️ Synchronizace s Garminem selhává od ${dm(last.slice(0, 10))} (${rep.errors[0]}). Zkusím to znovu automaticky.`).then(() => undefined));
    }
    if (s.garmin_key_created) {
      const expires = addDays(s.garmin_key_created, 365);
      const left = daysBetween(T, expires);
      if (left <= 30 && left >= 0)
        await claim(`garmin-key:${mondayOf(T)}`, async () => { await send(
          env,
          `⚠️ Garmin Personal API klíč končí za ${left} dní (${dm(expires)}).\nNový: Garmin Connect → Nastavení → Personal API → vytvořit klíč → vlož do .dev.vars jako GARMIN_API_KEY= → na PC <code>npm run secrets:push</code> → pak /garminklic ${T}.`,
        ); });
    }
  });
  return log;
}
