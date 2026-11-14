# Provoz: zálohy, obnova, hlídání

## Zálohy databáze

- **D1 Time Travel** (Cloudflare, zdarma): databázi jde vrátit do libovolné minuty za posledních **30 dní**.
  Není potřeba nic zapínat.
- **Ruční export** (vlastní kopie, mimo Cloudflare): `npm run export` → `exports/trener-export.sql`.
  Soubor obsahuje zdravotní data všech uživatelů – necommitovat, neposílat, uložit šifrovaně.

## Obnova databáze

```bash
# 1. zjistit bookmark pro čas těsně před chybou (UTC nebo s časovou zónou)
npx wrangler d1 time-travel info trener-db --timestamp=2026-11-14T15:00:00+01:00
# 2. obnovit (přepíše celou databázi, včetně ostatních uživatelů!)
npx wrangler d1 time-travel restore trener-db --bookmark=<bookmark z kroku 1>
```

Obnova vrací **celou** databázi (všechny uživatele). Když se pokazila data jen jednoho uživatele, je lepší
`npm run export` z obnovené kopie a ruční oprava jen jeho tabulek (`u<id>_…`).

## Vrácení verze aplikace

```bash
npx wrangler deployments list      # poslední nasazení
npx wrangler rollback              # zpět na předchozí verzi Workeru
```

Rollback vrací jen kód, ne databázi ani migrace. Migrace jsou jen přidávací (nové sloupce a tabulky), takže
starší kód s novější databází funguje.

## Tajné klíče (wrangler secret)

| Klíč | K čemu | Změna znamená |
|---|---|---|
| `ADMIN_TOKEN` | skripty a `/admin/*` | jen nový token ve skriptech (`.dev.vars`) |
| `SESSION_SECRET` | podpis přihlášení | **odhlášení všech** |
| `SECRETS_KEY` | šifrování klíčů zadaných v Nastavení | **klíče z Nastavení přestanou jít přečíst** – každý je musí zadat znovu |

`ADMIN_TOKEN` jde vyměnit bez následků, až se starší hodnoty přešifrují novým `SECRETS_KEY` (stane se samo při
prvním čtení po nasazení) a staré přihlášení vyprší nebo se obnoví. Klíč, který nejde dešifrovat, se zapíše do logu
(Nastavení → Log).

## Hlídání

- `GET /health` – veřejné, bez podrobností: `{"ok":true,"db":"ok","sync":"ok"}`. 503 = databáze nejde,
  `"sync":"stale"` = synchronizace vlastníka neproběhla přes 6 h (stojí cron nebo Garmin). Hodí se pro
  bezplatný UptimeRobot.
- Chyby a varování (i dříve tiché – nestažené okruhy, nezapsaný trénink do intervals.icu, neuložená historie
  plánu) jsou v Nastavení → Log.
