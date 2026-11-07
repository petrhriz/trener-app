import type { Env } from "../env";
import { GarminClient, type GarminActivity } from "../datasource/garmin";
import { HttpError } from "../lib/http";
import { escapeHtml, sendMessage } from "../telegram/api";

/**
 * Fáze 0: funguje Garmin Personal API z Cloudflare?
 * Vrací jen technické údaje (status, velikost, názvy polí) a 5 posledních aktivit (datum, typ, název, km, čas).
 * Žádné tokeny, žádné zdravotní hodnoty.
 */

interface Probe {
  name: string;
  path: string;
  status: number | "error";
  bytes?: number;
  contentType?: string;
  keys?: string[];
  note?: string;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function keysOf(v: unknown): string[] | undefined {
  const o = Array.isArray(v) ? v[0] : v;
  if (o && typeof o === "object") return Object.keys(o as object).slice(0, 60);
  return undefined;
}

async function probe(env: Env, token: string, name: string, path: string, parse = true): Promise<Probe> {
  try {
    const res = await fetch(`https://personal.connectapi.garmin.com${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const ct = res.headers.get("content-type") ?? "";
    const buf = await res.arrayBuffer();
    const p: Probe = { name, path: path.split("?")[0]!, status: res.status, bytes: buf.byteLength, contentType: ct };
    if (res.ok && parse && ct.includes("json") && buf.byteLength < 60_000) {
      try {
        p.keys = keysOf(JSON.parse(new TextDecoder().decode(buf)));
      } catch {
        p.note = "nejde parsovat jako JSON";
      }
    } else if (res.ok && buf.byteLength >= 60_000) {
      p.note = "velká odpověď, pole nečtena (CPU limit)";
    }
    return p;
  } catch (e) {
    return { name, path: path.split("?")[0]!, status: "error", note: (e as Error).message };
  }
}

export async function runPhase0(env: Env, opts: { probes: boolean; telegram: boolean }) {
  const out: Record<string, unknown> = { at: new Date().toISOString(), source: "garmin" };
  const garmin = new GarminClient(env);

  // 1) token
  let token: string;
  try {
    token = await garmin.getToken(true);
    out.token = "získán";
  } catch (e) {
    out.token = "selhal";
    out.tokenError = e instanceof HttpError ? `HTTP ${e.status}` : (e as Error).message;
    out.verdict = "Garmin API z Cloudflare NEFUNGUJE (token). Přepni na plán B (intervals.icu).";
    if (opts.telegram) await safeTg(env, `⚠️ Fáze 0: Garmin token selhal (${escapeHtml(String(out.tokenError))}).`);
    return out;
  }

  // 2) posledních 5 aktivit
  let acts: GarminActivity[] = [];
  try {
    acts = await garmin.activities(0, 5);
    out.activities = acts.map((a) => ({
      id: a.activityId,
      start: a.startTimeLocal,
      type: a.activityType?.typeKey,
      name: a.activityName,
      km: a.distance != null ? Math.round(a.distance / 10) / 100 : null,
      min: a.duration != null ? Math.round(a.duration / 60) : null,
    }));
    out.activityFields = keysOf(acts);
  } catch (e) {
    out.activitiesError = e instanceof HttpError ? `HTTP ${e.status}` : (e as Error).message;
  }

  // 3) průzkum dalších endpointů (pro docs/garmin-endpoints.md)
  if (opts.probes) {
    const today = new Date();
    const d2 = new Date(today.getTime() - 2 * 86400_000);
    const s = ymd(d2);
    const e = ymd(today);
    const id = acts[0]?.activityId;
    const list: [string, string, boolean?][] = [
      ["dailysummaries", `/usersummary-service/v2/dailysummaries?startDate=${s}&endDate=${e}`],
      ["sleep", `/sleep-service/sleep/dailySleepSummariesByDate?startDate=${s}&endDate=${e}`],
      ["hrv", `/hrv-service/hrv/daily/${s}/${e}`],
      ["weight", `/weight-service/weight/range/${s}/${e}`],
      ["fitnessage", `/fitnessage-service/fitnessage/v2/${e}`],
      ["hrZones", `/biometric-service/heartRateZones/v2`],
    ];
    if (id) {
      list.push(
        ["activity", `/activity-service/activity/${id}`],
        ["splits", `/activity-service/activity/${id}/splits`],
        ["typedsplits", `/activity-service/activity/${id}/typedsplits`],
        ["hrTimeInZones", `/activity-service/activity/${id}/hrTimeInZones`],
        ["powerTimeInZones", `/activity-service/activity/${id}/powerTimeInZones`],
        ["details", `/activity-service/activity/${id}/details?maxChartSize=10&maxPolylineSize=0`],
        ["fit", `/download-service/files/activity/${id}`, false],
      );
    }
    const probes: Probe[] = [];
    for (const [n, p, parse] of list) probes.push(await probe(env, token, n, p, parse ?? true));
    out.probes = probes;
  }

  const ok = Array.isArray(out.activities) && (out.activities as unknown[]).length > 0;
  out.verdict = ok
    ? "Garmin API z Cloudflare FUNGUJE."
    : "Token OK, ale aktivity se nenačetly – viz activitiesError.";

  if (opts.telegram) {
    const lines = ok
      ? (out.activities as { start?: string; type?: string; name?: string; km: number | null; min: number | null }[]).map(
          (a) =>
            `• ${escapeHtml((a.start ?? "").slice(0, 16).replace("T", " "))} · ${escapeHtml(a.type ?? "?")} · ${escapeHtml(
              a.name ?? "",
            )} · ${a.km != null ? String(a.km).replace(".", ",") + " km" : "–"} · ${a.min ?? "–"} min`,
        )
      : [];
    await safeTg(
      env,
      `${ok ? "✅" : "⚠️"} <b>Fáze 0: ${escapeHtml(String(out.verdict))}</b>\n${lines.join("\n")}`,
    );
  }
  return out;
}

async function safeTg(env: Env, html: string) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    await sendMessage(env, html);
  } catch (e) {
    console.log("telegram send failed:", (e as Error).message);
  }
}
