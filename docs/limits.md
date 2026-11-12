# Limity free plánů a jak se do nich vejdeme

Podle dokumentace Cloudflare:
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/) ·
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/) ·
[D1 vynucování limitů od 1. 9. 2026](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/) ·
[KV limits](https://developers.cloudflare.com/kv/platform/limits/) ·
[Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) ·
[Modely jen pro placený plán](https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/)

| Služba | Free limit | Naše spotřeba (odhad) | Rezerva |
|---|---|---|---|
| Workers – požadavky | 100 000 / den | cron 1 440 + dashboard ~300 | > 99 % |
| Workers – CPU | **10 ms** na požadavek i na cron (čekání na síť se nepočítá) | sync dávka: parsování 1 odpovědi do ~100 KB + pár INSERTů | hlídat: viz pravidla níže |
| Workers – fetch (externí) | **50** na spuštění | sync dávka max. 6 volání Garminu + Open-Meteo | ~40 |
| Workers – podpožadavky na CF služby | 1 000 na spuštění | D1/KV pár desítek | velká |
| Cron Triggers | 5 na účet, max. 15 min wall time | **1** (`* * * * *`) | 4 volné |
| D1 – dotazy | **50** na spuštění | dávkové zápisy přes `db.batch()` | hlídat |
| D1 – rows read | 5 000 000 / den | dashboard + výpočty z `daily_metrics` (stovky řádků) | > 99 % |
| D1 – rows written | 100 000 / den | backfill celé historie: jednotky tisíc řádků celkem; denně desítky | > 95 % |
| D1 – velikost | 500 MB / DB, 5 GB / účet | roky dat < 50 MB (bez FIT a streamů) | > 90 % |
| KV – zápisy | **1 000 / den** | Garmin token 1–2×/den, snímky Body Battery jen při změně hodnoty (max. 288/den, typicky ~100), cache dne/průběhů desítky | > 60 % |
| KV – čtení | 100 000 / den | ~200 / den | > 99 % |
| Workers AI | 10 000 neuronů / den | shrnutí na stránkách + chat, krátký kontext | denní počítadlo v aplikaci |
| Open-Meteo | zdarma pro nekomerční použití, bez klíče (~10 000 volání / den) | 1–4 volání / den (cache v D1) | > 99 % |

## Naměřeno po nasazení

| Volání | CPU (wrangler tail) |
|---|---|
| jednoduchý požadavek | 0–5 ms |
| sync dávka (cron) | 27–61 ms |
| plán / připravenost / rozbor | 26–68 ms |

Lokálně (Node, stejná data) trvá výpočet plánu **1 ms** za tepla a 12,6 ms při prvním volání – většinu CPU ve
Workeru tvoří studený start (kompilace kódu v novém isolatu) a převod výsledků z D1, ne trenérské výpočty.
Cloudflare tyto požadavky zatím nezahazuje (výsledek „ok“), ale **10 ms je překračováno**. Riziko: při
přísnějším vynucování by některé spuštění skončilo chybou 1102. Zmírnění v kódu: každá úloha je idempotentní
a zopakuje se při dalším cronu. Kdyby se chyby objevily, další krok je
zmenšit kontext (jen potřebné sloupce, laps jen pro rozbor), případně Workers Paid (5 USD/měsíc) – to by ale
porušilo cíl 0 Kč, takže jen po tvém rozhodnutí.

D1 po stažení celé historie: necelý 1 MB (stovky aktivit a dní wellness za několik let).

## Pravidla, která z toho plynou (v kódu)

1. **Sync po dávkách s kurzorem v D1** (`sync_state`). Jedno spuštění cronu stáhne nejvýš ~5 stránek / rozsahů
   a skončí. Backfill celé historie tak běží přes desítky spuštění (řádově hodiny), což nevadí.
2. **Žádné parsování velkých odpovědí.** Garmin vrací max. ~256 KB, aktivity stránkujeme po 20. Detail aktivity
   (`/details`) jen s malým `maxChartSize`. FIT soubory ve Workeru neparsujeme.
3. **Výpočty inkrementálně**: CTL/ATL a normy se počítají jen od prvního změněného dne a ukládají do `daily_metrics`.
4. **D1 zápisy vždy přes `batch()`** (1 round-trip, pod limitem 50 dotazů).
5. **KV jen na token, cache a krátkodobé zámky** (TTL), ne na data. Jednorázové úlohy hlídá D1 (`sent_messages`).
6. **LLM jen nad předpočítaným JSON** (krátký vstup). Když dojde denní limit (chyba 4006), stránka funguje bez AI.
7. Workers AI: modely Kimi K2.x a GLM-5.2 na free plánu nejsou (403).
