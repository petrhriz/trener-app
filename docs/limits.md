# Limity free plánů a jak se do nich vejdeme

Ověřeno v dokumentaci Cloudflare 7. 11. 2026:
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/) ·
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/) ·
[D1 vynucování limitů od 1. 9. 2026](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/) ·
[KV limits](https://developers.cloudflare.com/kv/platform/limits/) ·
[Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) ·
[Modely jen pro placený plán](https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/)

| Služba | Free limit | Naše spotřeba (odhad) | Rezerva |
|---|---|---|---|
| Workers – požadavky | 100 000 / den | cron 96 + Telegram ~50 + dashboard ~300 | > 99 % |
| Workers – CPU | **10 ms** na požadavek i na cron (čekání na síť se nepočítá) | sync dávka: parsování 1 odpovědi do ~100 KB + pár INSERTů | hlídat: viz pravidla níže |
| Workers – fetch (externí) | **50** na spuštění | sync dávka max. 6 volání Garminu + Telegram + Open-Meteo | ~40 |
| Workers – podpožadavky na CF služby | 1 000 na spuštění | D1/KV pár desítek | velká |
| Cron Triggers | 5 na účet, max. 15 min wall time | **1** (`*/15 * * * *`) | 4 volné |
| D1 – dotazy | **50** na spuštění | dávkové zápisy přes `db.batch()` | hlídat |
| D1 – rows read | 5 000 000 / den | dashboard + výpočty z `daily_metrics` (stovky řádků) | > 99 % |
| D1 – rows written | 100 000 / den | backfill celé historie: jednotky tisíc řádků celkem; denně desítky | > 95 % |
| D1 – velikost | 500 MB / DB, 5 GB / účet | roky dat < 50 MB (bez FIT a streamů) | > 90 % |
| KV – zápisy | **1 000 / den** | Garmin token 1–2×/den, deduplikace zpráv ~10/den | > 98 % |
| KV – čtení | 100 000 / den | ~200 / den | > 99 % |
| Workers AI | 10 000 neuronů / den | 3–4 hotové zprávy + otázky, krátký kontext | ověřit podle modelu ve fázi 6 |
| Open-Meteo | zdarma pro nekomerční použití, bez klíče (~10 000 volání / den) | 1–4 volání / den (cache v D1) | > 99 % |
| Telegram Bot API | ~30 zpráv/s | jednotky denně | – |

## Pravidla, která z toho plynou (v kódu)

1. **Sync po dávkách s kurzorem v D1** (`sync_state`). Jedno spuštění cronu stáhne nejvýš ~5 stránek / rozsahů
   a skončí. Backfill celé historie tak běží přes desítky spuštění (při 15 min intervalu řádově hodiny), což nevadí.
2. **Žádné parsování velkých odpovědí.** Garmin vrací max. ~256 KB, aktivity stránkujeme po 20. Detail aktivity
   (`/details`) jen s malým `maxChartSize`. FIT soubory ve Workeru neparsujeme.
3. **Výpočty inkrementálně**: CTL/ATL a normy se počítají jen od prvního změněného dne a ukládají do `daily_metrics`.
4. **D1 zápisy vždy přes `batch()`** (1 round-trip, pod limitem 50 dotazů).
5. **KV jen na token a krátkodobé zámky** (TTL), ne na data. Deduplikace zpráv primárně v D1 (`sent_messages`).
6. **LLM jen na hotové zprávy** s předpočítaným JSON (< 2 KB vstupu). Když dojde denní limit (chyba 4006), použije se šablona.
7. Workers AI: modely Kimi K2.x a GLM-5.2 na free plánu nejsou (403). Výběr modelu pro češtinu ověříme ve fázi 6.
