// Lokální test víc uživatelů (wrangler dev --local): pozvánka, registrace, přihlášení, oddělení dat.
import { readDevVars } from "./devvars.mjs";
const { vars } = readDevVars();
const B = "http://127.0.0.1:8790";
const adm = { Authorization: `Bearer ${vars.ADMIN_TOKEN}`, "content-type": "application/json" };
const j = async (r) => { const t = await r.text(); try { return [r.status, JSON.parse(t), r.headers.get("set-cookie")]; } catch { return [r.status, t.slice(0, 200), r.headers.get("set-cookie")]; } };
const ok = (c, m) => console.log(c ? "✅" : "❌", m);

// vlastník: nastaví heslo a vytvoří pozvánku
let [s, x] = await j(await fetch(`${B}/api/me/password`, { method: "POST", headers: adm, body: JSON.stringify({ username: "petr", password: "tajne123" }) }));
ok(s === 200, `vlastník heslo ${s} ${JSON.stringify(x)}`);
[s, x] = await j(await fetch(`${B}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "petr", password: "spatne" }) }));
ok(s === 401, `špatné heslo → ${s}`);
let ck;
[s, x, ck] = await j(await fetch(`${B}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "petr", password: "tajne123" }) }));
ok(s === 200 && /Max-Age=31536000/.test(ck ?? ""), `login vlastník ${s}, cookie 1 rok: ${/Max-Age=31536000/.test(ck ?? "")}`);
const ownerCookie = ck.split(";")[0];
// vlastník si zapíše omezení (data vlastníka)
await fetch(`${B}/api/constraint`, { method: "POST", headers: { cookie: ownerCookie, "content-type": "application/json" }, body: JSON.stringify({ date: "2030-01-01", kind: "hokej", note: "vlastník" }) });
[s, x] = await j(await fetch(`${B}/api/users/invite`, { method: "POST", headers: { cookie: ownerCookie } }));
ok(s === 200 && x.url, `pozvánka ${x.url}`);
const token = x.url.split("/join/")[1];
// host se registruje
[s, x, ck] = await j(await fetch(`${B}/auth/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, name: "Honza Test", username: "honza", password: "heslo123" }) }));
ok(s === 200 && ck, `registrace ${s} ${JSON.stringify(x)}`);
const guest = ck.split(";")[0];
[s, x] = await j(await fetch(`${B}/auth/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, name: "X", username: "xx1", password: "heslo123" }) }));
ok(s === 400, `pozvánka podruhé → ${s}`);
[s, x] = await j(await fetch(`${B}/api/me`, { headers: { cookie: guest } }));
ok(s === 200 && x.uid === 2 && x.role === "user", `me host: ${JSON.stringify(x)}`);
[s, x] = await j(await fetch(`${B}/api/settings`, { headers: { cookie: guest } }));
ok(s === 200 && x.first_name === "Honza", `nastavení hosta: jméno ${x.first_name}`);
// host zapíše svoje omezení a nevidí vlastníkova
await fetch(`${B}/api/constraint`, { method: "POST", headers: { cookie: guest, "content-type": "application/json" }, body: JSON.stringify({ date: "2030-01-02", kind: "nemuzu", note: "host" }) });
[s, x] = await j(await fetch(`${B}/api/calendar?month=2030-01`, { headers: { cookie: guest } }));
ok(s === 200, `kalendář hosta ${s}`);
[s, x] = await j(await fetch(`${B}/api/users`, { headers: { cookie: guest } }));
ok(s === 403, `host nesmí seznam uživatelů → ${s}`);
[s, x] = await j(await fetch(`${B}/api/secrets`, { headers: { cookie: guest } }));
ok(s === 200 && Array.isArray(x) && !x.some((k) => k.key.startsWith("MAPY") || k.key.startsWith("TOMTOM")), `host vidí jen své klíče: ${Array.isArray(x) ? x.map((k) => k.key + ":" + (k.source ?? "-")).join(",") : JSON.stringify(x)}`);
for (const path of ["overview", "recovery", "coach", "fitness", "activities?days=30", "calendar", "gear", "status"]) {
  [s, x] = await j(await fetch(`${B}/api/${path}`, { headers: { cookie: guest } }));
  ok(s === 200, `host /${path} → ${s}${s !== 200 ? " " + JSON.stringify(x).slice(0, 160) : ""}`);
}
// oddělení: přímo v DB přes admin endpoint ctx (vlastník) a x-uid 2
const c1 = await (await fetch(`${B}/api/coach`, { headers: { cookie: ownerCookie } })).json();
const c2 = await (await fetch(`${B}/api/coach`, { headers: { cookie: guest } })).json();
ok(!JSON.stringify(c2.constraints ?? []).includes("vlastník") && !JSON.stringify(c1.constraints ?? []).includes("host"), `omezení oddělená (vlastník ${JSON.stringify(c1.constraints?.length)}, host ${JSON.stringify(c2.constraints?.length)})`);
// vypnutý účet
await fetch(`${B}/api/users/2/active`, { method: "POST", headers: { cookie: ownerCookie, "content-type": "application/json" }, body: JSON.stringify({ active: false }) });
await new Promise((r) => setTimeout(r, 200));
[s, x] = await j(await fetch(`${B}/api/me`, { headers: { cookie: guest } }));
console.log("ℹ️ vypnutý host /me →", s, "(cache uživatele až 60 s)");
await fetch(`${B}/api/users/2/active`, { method: "POST", headers: { cookie: ownerCookie, "content-type": "application/json" }, body: JSON.stringify({ active: true }) });
// bez přihlášení
[s, x] = await j(await fetch(`${B}/api/overview`));
ok(s === 403, `bez přihlášení → ${s}`);
