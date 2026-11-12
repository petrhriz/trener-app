# AGENTS.md – návod pro AI asistenty i lidi, kteří upravují kód

Tento soubor čtou automaticky Claude Code, GitHub Copilot, Cursor, Gemini CLI, Codex, Aider a další.
Platí pro každého, kdo projekt mění. Je česky, stejně jako celá aplikace.

## Co to je

**Kadence** – osobní AI trenér cyklistiky a zdraví. Běží zdarma na **Cloudflare Workers** (TypeScript + Hono), data má v **D1**
(SQLite) a **KV**. Data bere z Garmin Personal API a intervals.icu, počasí z Open-Meteo a všechno ukazuje
webový dashboard (`public/`). Rozhodnutí (zotavení, forma, plán, workouty) dělá **kód**, ne AI. AI model jen
odpovídá na volné otázky nad hotovými čísly (`src/llm/`).

## Struktura

| Složka | Co tam je | Pravidlo |
|---|---|---|
| `src/index.ts` | vstup Workeru: cron, `/api`, `/auth`, `/admin` | |
| `src/datasource/` | Garmin a intervals.icu → normalizované záznamy (`normalize.ts`, `types.ts`) | nic nad touto vrstvou nezná pole Garminu |
| `src/sync/sync.ts` | synchronizace po malých dávkách | **free plán: 10 ms CPU, 50 fetchů, 50 D1 dotazů na spuštění** |
| `src/core/` | trenérské jádro – čisté funkce bez I/O | vše testované v `test/` |
| `src/core/coach/` | Trenér (cíl týdne, kostra, délky, knihovna tréninků, vyhodnocení kvalit) | popis a zdroje v `docs/trener/` |
| `src/report/` | skládá data pro zprávy a dashboard | |
| `src/api/` | JSON pro dashboard (`routes.ts`, `coach.ts`, …) | |
| `src/llm/` | AI: `providers.ts` (Gemma / Nemotron / Workers AI), `llm.ts` (kontrola čísel) | číslo, které není v datech → bez AI textu |
| `public/` | dashboard: `index.html`, `app.js` (jeden soubor, bez buildu), `app.css` | čistý JS, žádný framework |
| `migrations/` | SQL migrace D1 | nová migrace = nový soubor `00NN_*.sql` **a** zápis do `src/lib/tenant.ts` |
| `docs/` | architektura, limity, popis a zdroje trenéra (`docs/trener/`) | |
| `scripts/` | pomocné skripty (nasazení, backfill, raw data) | čtou `.dev.vars` |

`public/app.js` a `app.css` se v prohlížeči drží natrvalo podle otisku obsahu v adrese (`scripts/stamp.mjs`, `public/_headers`).
Po úpravě při lokálním vývoji spusť `node scripts/stamp.mjs` (nebo obnov stránku bez mezipaměti).

## Příkazy

```bash
npm install          # jednou
npm run typecheck    # TypeScript bez buildu
npm test             # vitest – musí projít před každým commitem
npm run dev          # lokální Worker (potřebuje .dev.vars)
npm run deploy       # číslo verze a otisky souborů + migrace D1 + nasazení (označené verzí)
```

Kontrola syntaxe dashboardu: `node --check public/app.js`.

## Pravidla pro změny

1. **Texty pro uživatele česky**, tykání, desetinná čárka, mezera před jednotkou (`183 W`, `7,5 h`).
2. **Žádné klíče v kódu ani v gitu.** Lokálně jen `.dev.vars` (je v `.gitignore`), na Cloudflare `wrangler secret`
   nebo zašifrovaně v D1 přes Nastavení v dashboardu (`src/lib/secrets.ts`). Nikdy nelogovat tokeny ani zdravotní data.
3. **Limity free plánu**: v cronu dělej jen malý kus práce a ulož kurzor (viz `syncTick`). Žádné velké knihovny
   ve Workeru (FIT soubory se čtou ručně v `src/datasource/fitScan.ts`, ne přes SDK).
4. **Rozhoduje kód.** Nová logika trenéra patří do `src/core/` jako čistá funkce + test v `test/`.
5. **Dashboard** je jeden `public/app.js`. Stránka = funkce `pageXxx(el)`, data z `api("...")`.
   Barvy a styly přes CSS proměnné v `app.css` (světlý i tmavý režim). Grafy: `lineChart`, `barChart`, `spark`.
6. **Víc uživatelů**: vlastník má tabulky bez předpony, ostatní `u<id>_…` (`src/lib/tenant.ts` přepisuje SQL).
   Nové tabulky přidej do `TENANT_TABLES`, nové migrace do `TENANT_MIGRATIONS`.
7. Před commitem `npm run typecheck && npm test`.
8. **Nepoužívaný kód se maže hned** (funkce, styly, trasy API, staré dokumenty) – nenechávat „pro jistotu“, historie je v gitu.

## Verze

Aktualizace se **nepojmenovávají popisem změn, jen číslem verze**: `1.0.0`, `1.0.1`, `1.0.2`…

- Číslo je v `package.json` (`version`). Každá aktualizace = poslední číslo o 1 výš (`1.0.1` → `1.0.2`).
- Na `1.1.0` / `2.0.0` se přechází **jen když to řekne vlastník**.
- Zpráva commitu je jen číslo verze (`1.0.2`), k němu git tag `v1.0.2`. Jedna aktualizace = jeden commit.
- `npm run deploy` zapíše číslo do stránky (Nastavení ho ukazuje) a označí jím verzi na Cloudflare.
- Co se změnilo, se píše do odpovědi vlastníkovi, ne do názvu commitu.

## Jak ověřit změnu bez přístupu ke Cloudflare

- `npm test` a `npm run typecheck` fungují bez jakýchkoli klíčů.
- Dashboard jde otevřít jen s přihlášením (jméno a heslo, nebo `npm run admin -- login-link`), lokálně přes `npm run dev` s vlastním `.dev.vars`.
- Upozornění pro uživatele patří do `src/api/alerts.ts` (bublina po otevření stránky), žádné jiné kanály.

## Nasazení

- Ručně: `npm run deploy` (potřebuje `npx wrangler login` a `.dev.vars`).
- Automaticky z GitHubu: workflow `.github/workflows/deploy.yml` (spustí se ručně v záložce Actions nebo po pushi
  do `main`). Potřebuje v repozitáři *Settings → Secrets and variables → Actions*:
  `CLOUDFLARE_API_TOKEN` (šablona „Edit Cloudflare Workers“ + oprávnění D1 Edit) a `CLOUDFLARE_ACCOUNT_ID`.
