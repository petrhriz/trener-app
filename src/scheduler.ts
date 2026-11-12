// Interní plánovač (cron). Čas v Europe/Prague – letní/zimní čas řeší Intl.
// Upozornění (servis, Garmin klíč, synchronizace) se neposílají – ukáže je stránka po otevření (src/api/alerts.ts).
import type { Env } from "./env";
import { logEvent, once, run } from "./lib/db";
import { localNow, mondayOf } from "./lib/time";
import { weekly } from "./report/build";
import { loadCtx } from "./report/context";
import { syncTick } from "./sync/sync";
import { retryIcuDeletes } from "./plan/proposals";

export async function runScheduler(env: Env, at = new Date()): Promise<string[]> {
  const log: string[] = [];
  const rep = await syncTick(env);
  log.push(...rep.steps);
  // dříve nesmazané události v intervals.icu (výpadek) – zkusit znovu
  const del = await retryIcuDeletes(env).catch(() => 0);
  if (del) log.push(`intervals.icu: dosmazáno ${del}`);
  const now = localNow(at, env.TZ_NAME);
  const T = now.date;
  const job = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      log.push(`${name}: ${(e as Error).message}`);
      await logEvent(env.DB, "error", `${name}: ${(e as Error).message}`);
    }
  };

  // stavy jednotek: minulé dny done / missed (vynechaná se nedohání)
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

  // neděle večer: týdenní souhrn se uloží (historie týdnů na stránce)
  if (now.dow === 7 && now.hh >= 20) {
    await job("týden", async () => {
      const mon = mondayOf(T);
      if (!(await once(env.DB, `tyden:${mon}`))) return;
      const w = await weekly(await loadCtx(env, at), mon);
      await run(env.DB, "INSERT INTO weekly_reviews (week_from, data, created_at) VALUES (?, ?, ?) ON CONFLICT(week_from) DO UPDATE SET data = excluded.data", mon, JSON.stringify(w), new Date().toISOString());
      log.push("týden uložen");
    });
  }
  return log;
}
