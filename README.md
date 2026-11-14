# Kadence – osobní trenér cyklistiky a zdraví

Běží zdarma na Cloudflare Workers. Data bere z **Garmin Personal API** (lapy jízd a VO2max z intervals.icu),
počasí z **Open-Meteo**, všechno ukazuje **webový dashboard** (funguje i jako aplikace na ploše telefonu).
Rozhodnutí (zotavení, forma, plán, workouty, výživa) dělá kód podle pravidel v [`docs/trener/`](docs/trener/).
AI model (Gemma z Google AI Studia, Nemotron od NVIDIE, záloha Workers AI) jen odpovídá v chatu a píše krátká
shrnutí nad předpočítanými čísly – bez něj vše funguje.

- Dashboard: `https://<worker>.<účet>.workers.dev` (přihlášení jménem a heslem)
- Provoz: **0 Kč** (Workers Free, D1, KV, Workers AI free, Open-Meteo)

## Co dělá

| Stránka | Co ukáže |
|---|---|
| Přehled | ranní semafor (VST, klidový tep, spánek), zotavení, energie, dnešní trénink, počasí a okno na jízdu |
| Trenér | plán týdne podle cíle a kondice, úpravy dnů (přesun, délka, sport, volno), vlastní jízda, FIT soubor, AI trenér |
| Aktivity | rozbor jízdy: splnění cíle, zóny, okruhy, drift, mapa |
| Zotavení, Kondice, Tělo | spánek, VST, tep, stres, CTL / ATL / forma, VO2max, váha |
| Vybavení | km na kolech, lyžích a botách, servis dílů |
| Síla a mobilita | zápis a plnění týdenního minima |

**Upozornění** se ukážou jako bublina po otevření stránky: servis dílu (řetěz, vosk…), končící Garmin klíč,
🔴 stav zotavení, 3 dny zvýšený klidový tep, forma pod −25, ramp rate nad +5, poměr zátěže 7/28 nad 1,3,
selhání synchronizace. „Rozumím“ = stejné upozornění se už neukáže.

**Přizpůsobivost:** plán se nikdy nedohání. Vynechaný trénink se nepřesouvá, plán se přepočítá.
Špatné počasí → kvalita na trenažér, Z2 přesun nebo trenažér.

## Příkazy na PC

| Příkaz | Co dělá |
|---|---|
| `npm run deploy` | migrace D1 + nasazení Workeru |
| `npm run test` | unit testy trenérského jádra |
| `npm run sync:backfill` | zrychlené stažení celé historie (jinak to udělá cron po dávkách) |
| `npm run compare` | srovnání zátěže a CTL/ATL s intervals.icu |
| `npm run export` | export celé databáze do `exports/trener-export.sql` |
| `npm run wipe -- --yes` | smazání všech dat (D1, token, události aplikace v intervals.icu) |
| `npm run secrets:check` | které klíče jsou v `.dev.vars` vyplněné (hodnoty nikdy) |
| `npm run secrets:push` | nahraje klíče z `.dev.vars` na Cloudflare |
| `npm run admin -- login-link` | jednorázový přihlašovací odkaz (15 min) – první přihlášení nebo zapomenuté heslo; další uživatel `login-link?uid=2` |
| `npm run admin -- scheduler` | ručně spustí plánovač (synchronizace a přepočty) |

## Nasazení od nuly

1. Nainstaluj Node.js LTS a Git, pak v této složce `npm install`.
2. `npx wrangler login` (prohlížeč, přihlášení do Cloudflare, Allow).
3. `npx wrangler kv namespace create KV` a `npx wrangler d1 create trener-db` → id vlož do `wrangler.jsonc`,
   tam uprav i `PUBLIC_URL` (adresa Workeru) a `LAT` / `LON` (výchozí místo pro počasí).
4. Zkopíruj `.dev.vars.example` na `.dev.vars` a vyplň `GARMIN_API_KEY`, `INTERVALS_API_KEY`,
   `INTERVALS_ATHLETE_ID`, `WORKER_URL`.
5. `npm run secrets:push` (vygeneruje `ADMIN_TOKEN`, `SESSION_SECRET` a `SECRETS_KEY` a nahraje klíče).
6. `npm run deploy`, pak `npm run sync:backfill`.
7. `npm run admin -- login-link` → otevři odkaz → v Nastavení → Účet si nastav přihlašovací jméno a heslo.

## Přihlášení do dashboardu

Jménem a heslem (Nastavení → Účet). Prohlížeč dostane podepsanou HttpOnly cookie na rok (Odhlásit v Nastavení);
bez přihlášení `/api` vrací 403. Na nové zařízení se prostě přihlásíš jménem a heslem. Zapomenuté heslo:
`npm run admin -- login-link` dá jednorázový odkaz (platí 15 min), pak si heslo změníš v Nastavení.
Další lidi pozveš v Nastavení → Účet → „Pozvat“ (odkaz platí 7 dní a jednou).

## Cloudflare Access (volitelně, navíc)

Worker umí i Cloudflare Access JWT. Nastavení vyžaduje kliknutí v prohlížeči:

1. https://one.dash.cloudflare.com → Zero Trust (free plán, tým si pojmenuj).
2. **Access → Applications → Add an application → Self-hosted**:
   - Application domain: `<worker>.<účet>.workers.dev` (cesta prázdná)
   - Policy: **Allow**, Include → Emails → tvůj e-mail
3. Druhá aplikace pro admin (musí jít bez přihlášení, chrání ho vlastní tajný token):
   - Domain: `<worker>.<účet>.workers.dev`, path `admin/*` → Policy **Bypass**, Include → Everyone
4. V detailu první aplikace zkopíruj **Application Audience (AUD) Tag** → `ACCESS_AUD` ve `wrangler.jsonc`,
   `ACCESS_TEAM_DOMAIN` = `<tým>.cloudflareaccess.com`. Pak `npm run deploy`.

Worker navíc ověřuje podpis Access JWT – bez něj `/api` vrací 403.

## Workouty do Garminu

- **Přes intervals.icu:** po potvrzení se jednotky zapíšou do kalendáře intervals.icu
  (`external_id` = `trener-<id>`). Když je v intervals.icu zapnuté nahrávání plánovaných workoutů do Garmin Connect
  (`icu_garmin_upload_workouts`), hodinky / cyklopočítač si je stáhne při synchronizaci.
- **Bez intervals.icu:** Trenér → den → „📥 FIT soubor“ – soubor nahraj kabelem do `Garmin/NewFiles`.

## Tajné klíče

Nikdy v kódu ani v gitu. Lokálně jen `.dev.vars` (v `.gitignore`), na Cloudflare přes `wrangler secret`
nebo zašifrovaně v D1 přes Nastavení v dashboardu. Logy neobsahují tokeny ani zdravotní hodnoty.

## Obnova Garmin klíče

Klíč platí 1 rok; 30 dní před koncem se na stránce ukáže upozornění. Postup: Garmin Connect → Nastavení →
Personal API → vytvořit klíč → vlož ho v dashboardu (Nastavení → Připojení) a uprav „Garmin klíč vytvořen“.

## Úpravy bez Claude Code (GitHub)

Projekt je připravený tak, aby ho šlo upravovat odkudkoli a jakýmkoli AI asistentem:

- **[`AGENTS.md`](AGENTS.md)** – návod pro AI asistenty (Copilot, Cursor, Gemini CLI, Codex, Aider…) i lidi:
  struktura, pravidla, limity free plánu, jak testovat. Většina nástrojů ho načte sama.
- **GitHub v prohlížeči**: tečka `.` na stránce repozitáře otevře editor (github.dev), nebo *Code → Codespaces*
  pro plné prostředí s Node.js (`npm install && npm test`).
- **Kontrola**: každý push spustí *Actions → CI* (typy, testy, syntaxe dashboardu) – bez klíčů.
- **Nasazení z GitHubu**: *Actions → Deploy → Run workflow*. Jednou nastav v *Settings → Secrets and variables →
  Actions* secrets `CLOUDFLARE_API_TOKEN` (dash.cloudflare.com → My Profile → API Tokens → šablona „Edit Cloudflare
  Workers“, přidej oprávnění D1 Edit) a `CLOUDFLARE_ACCOUNT_ID`. Proměnná `AUTO_DEPLOY=true` = nasazení po každém
  pushi do `main`.
- Klíče (Garmin, intervals.icu, AI) v repozitáři **nejsou** – jsou jen na Cloudflare a v lokálním `.dev.vars`.

## Dokumentace

[`docs/architecture.md`](docs/architecture.md) · [`docs/limits.md`](docs/limits.md) ·
[`docs/garmin-endpoints.md`](docs/garmin-endpoints.md) · [`docs/trener/`](docs/trener/) ·
[`docs/data-zdroje.md`](docs/data-zdroje.md) (co se přebírá hotové a co se počítá)
