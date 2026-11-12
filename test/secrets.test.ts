// Další účty: vlastní klíče k datům (Garmin, intervals.icu), AI a mapy od vlastníka.
import { describe, expect, it } from "vitest";
import { applySecrets, encryptSecret, invalidateSecrets } from "../src/lib/secrets";

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
