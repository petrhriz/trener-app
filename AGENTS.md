# AGENTS.md – návod pro AI asistenty i lidi, kteří upravují kód

Tento soubor čtou automaticky Claude Code, GitHub Copilot, Cursor, Gemini CLI, Codex, Aider a další.
Platí pro každého, kdo projekt mění. Je česky, stejně jako celá aplikace.

## Co to je

Osobní AI trenér cyklistiky a zdraví. Běží zdarma na **Cloudflare Workers** (TypeScript + Hono), data má v **D1**
(SQLite) a **KV**. Data bere z Garmin Personal API a intervals.icu, počasí z Open-Meteo, mluví přes Telegram bota
a webový dashboard (`public/`). Rozhodnutí (zotavení, forma, plán, workouty) dělá **kód**, ne AI. AI model jen
odpovídá na volné otázky nad hotovými čísly (`src/llm/`).

## Struktura

| Složka | Co tam je | Pravidlo |
|---|---|---|
| `src/index.ts` | vstup Workeru: cron, `/api`, `/telegram`, `/admin` | |
| `src/datasource/` | Garmin a intervals.icu → normalizované záznamy (`normalize.ts`, `types.ts`) | nic nad touto vrstvou nezná pole Garminu |
| `src/sync/sync.ts` | synchronizace po malých dávkách | **free plán: 10 ms CPU, 50 fetchů, 50 D1 dotazů na spuštění** |
| `src/core/` | trenérské jádro – čisté funkce bez I/O | vše testované v `test/` |
| `src/core/coach/` | Trenér (cíl týdne, kostra, délky, knihovna tréninků, vyhodnocení kvalit) | popis a zdroje v `docs/trener/` |
| `src/report/` | skládá data pro zprávy a dashboard | |
| `src/api/` | JSON pro dashboard (`routes.ts`, `coach.ts`, …) | |
| `src/llm/` | AI: `providers.ts` (Gemma / Nemotron / Workers AI), `llm.ts` (kontrola čísel) | číslo, které není v datech → šablona |
| `src/telegram/` | bot, příkazy, šablony zpráv | šablona funguje i bez AI |
| `public/` | dashboard: `index.html`, `app.js` (jeden soubor, bez buildu), `app.css` | čistý JS, žádný framework |
| `migrations/` | SQL migrace D1 | nová migrace = nový soubor `00NN_*.sql` **a** zápis do `src/lib/tenant.ts` |
| `docs/` | architektura, limity, pravidla trenéra (`docs/coach-rules/`) | |
| `scripts/` | pomocné skripty (nasazení, backfill, raw data) | čtou `.dev.vars` |

## Příkazy

```bash
npm install          # jednou
npm run typecheck    # TypeScript bez buildu
npm test             # vitest – musí projít před každým commitem
npm run dev          # lokální Worker (potřebuje .dev.vars)
npm run deploy       # verze souborů + migrace D1 + nasazení + webhook Telegramu
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
7. Malé, čitelné commity. Před commitem `npm run typecheck && npm test`.

## Jak ověřit změnu bez přístupu ke Cloudflare

- `npm test` a `npm run typecheck` fungují bez jakýchkoli klíčů.
- Dashboard jde otevřít jen s přihlášením (odkaz z Telegramu), lokálně přes `npm run dev` s vlastním `.dev.vars`.

## Nasazení

- Ručně: `npm run deploy` (potřebuje `npx wrangler login` a `.dev.vars`).
- Automaticky z GitHubu: workflow `.github/workflows/deploy.yml` (spustí se ručně v záložce Actions nebo po pushi
  do `main`). Potřebuje v repozitáři *Settings → Secrets and variables → Actions*:
  `CLOUDFLARE_API_TOKEN` (šablona „Edit Cloudflare Workers“ + oprávnění D1 Edit) a `CLOUDFLARE_ACCOUNT_ID`.
