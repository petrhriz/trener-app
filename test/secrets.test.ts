// Další účty: vlastní klíče k datům (Garmin, intervals.icu), AI a mapy od vlastníka.
import { describe, expect, it } from "vitest";
import { applySecrets, decryptSecret, encryptSecret, invalidateSecrets } from "../src/lib/secrets";
import { sessionCookie, sessionInfo } from "../src/api/session";
import { forgetUser } from "../src/lib/tenant";

const fakeDb = (rows: { key: string; value: string }[]) => ({ prepare: () => ({ all: async () => ({ results: rows }) }) }) as unknown as D1Database;

describe("klíče pro další účty", () => {
  it("AI a mapy od vlastníka, Garmin vlastní; vlastník beze změny", async () => {
    invalidateSecrets();
    const base: any = { ADMIN_TOKEN: "t".repeat(32) };
    const enc = (v: string) => encryptSecret(base, v);
    base.DB = fakeDb([{ key: "GEMINI_API_KEY", value: await enc("owner-gemini") }, { key: "NVIDIA_API_KEY", value: await enc("owner-nv") }, { key: "GARMIN_API_KEY", value: await enc("owner-garmin") }]);
    await applySecrets(base);
    expect(base.GEMINI_API_KEY).toBe("owner-gemini");
    expect(base.GARMIN_API_KEY).toBe("owner-garmin");
    const user: any = { ADMIN_TOKEN: base.ADMIN_TOKEN, __uid: 5, __base: base, DB: fakeDb([{ key: "GARMIN_API_KEY", value: await enc("user-garmin") }]) };
    await applySecrets(user);
    expect(user.GARMIN_API_KEY).toBe("user-garmin");
    expect(user.GEMINI_API_KEY).toBe("owner-gemini");
    expect(user.NVIDIA_API_KEY).toBe("owner-nv");
    expect(user.INTERVALS_API_KEY).toBeUndefined();
  });
});

describe("oddělené klíče (SECRETS_KEY, SESSION_SECRET)", () => {
  it("hodnota zašifrovaná ADMIN_TOKENem se přečte a přešifruje novým klíčem", async () => {
    invalidateSecrets();
    const old: any = { ADMIN_TOKEN: "a".repeat(32) };
    const stored = await encryptSecret(old, "garmin-key");
    const updates: unknown[][] = [];
    const db = { prepare: (sql: string) => ({ all: async () => ({ results: [{ key: "GARMIN_API_KEY", value: stored }] }), bind: (...a: unknown[]) => ({ run: async () => { updates.push([sql, ...a]); } }) }) } as unknown as D1Database;
    const env: any = { ADMIN_TOKEN: old.ADMIN_TOKEN, SECRETS_KEY: "s".repeat(32), DB: db };
    await applySecrets(env);
    expect(env.GARMIN_API_KEY).toBe("garmin-key");
    expect(updates.length).toBe(1);
    // přešifrovaná hodnota jde přečíst jen novým klíčem
    const fresh = updates[0]![1] as string;
    expect(await decryptSecret({ SECRETS_KEY: env.SECRETS_KEY } as any, fresh)).toBe("garmin-key");
  });
});

describe("přihlášení: verze a klíče", () => {
  const users = new Map<number, number>([[1, 0]]);
  const env = (extra: Record<string, string> = {}): any => ({ ADMIN_TOKEN: "a".repeat(32), ...extra, DB: { prepare: () => ({ bind: (id: number) => ({ first: async () => ({ id, name: null, username: "x", role: "owner", active: 1, schema_ver: 0, sess_ver: users.get(id) ?? 0 }) }) }) } });
  it("cookie podepsaná ADMIN_TOKENem platí i po přidání SESSION_SECRET; po změně verze neplatí", async () => {
    forgetUser(1);
    const c1 = (await sessionCookie(env(), 1)).split(";")[0]!;
    expect((await sessionInfo(env({ SESSION_SECRET: "n".repeat(32) }), c1))?.uid).toBe(1);
    const c2 = (await sessionCookie(env({ SESSION_SECRET: "n".repeat(32) }), 1)).split(";")[0]!;
    expect(await sessionInfo(env(), c2)).toBeNull(); // bez nového klíče nejde ověřit
    users.set(1, 1);
    forgetUser(1);
    expect(await sessionInfo(env({ SESSION_SECRET: "n".repeat(32) }), c1)).toBeNull();
    expect(await sessionInfo(env({ SESSION_SECRET: "n".repeat(32) }), c2)).toBeNull();
    forgetUser(1);
    expect((await sessionInfo(env({ SESSION_SECRET: "n".repeat(32) }), (await sessionCookie(env({ SESSION_SECRET: "n".repeat(32) }), 1)).split(";")[0]!))?.uid).toBe(1);
  });
});
