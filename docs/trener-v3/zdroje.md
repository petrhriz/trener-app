# Trenér v3 – odkud jsou pravidla

Každé tréninkové pravidlo v `src/core/coach3/` má zdroj. Kde zdroj konkrétní číslo nedává, je to výslovně
označené jako vlastní volba.

| Pravidlo | Hodnota v kódu | Zdroj |
|---|---|---|
| Kondice / únava / forma | CTL 42 dní, ATL 7 dní, forma = CTL − ATL | model Banister / Coggan, stejný vzorec jako intervals.icu (ověřeno `scripts/compare-kondice.mjs`) |
| Růst kondice – Základ, Rozvoj | +3 za týden, nad kondicí 45 +4 (`rampUp`) | TrainingPeaks: bezpečně 3–6, do kondice 45 nízké riziko do 3, 4–6 střední – [Why Ramp Rate Is an Important Training Metric](https://www.trainingpeaks.com/learn/articles/why-ramp-rate-is-an-important-training-metric/); Friel 5–8 – [The CTL Ramp Rate](https://www.goodreads.com/author_blog_posts/8386404-the-ctl-ramp-rate). Bereme spodní, bezpečnou hranu. |
| Lehčí týden | každý 4. týden (3:1), 55 % běžného (`RECOVERY_SHARE`) | Friel 3:1; o 40–50 % méně objemu – [Roadman: rest week guide](https://roadmancycling.com/blog/cycling-rest-week-guide), [Roadman: recovery week](https://roadmancycling.com/glossary/recovery-week) |
| Zima – zimní základ | vrchol sezóny (6 měsíců) − 42,5 % (`WINTER_DROP`) | pokles 30–40 % od vrcholu – [TrainRight: CTL](https://trainright.com/what-is-chronic-training-load-ctl-and-how-to-use-it-to-improve-performance/); uživatel chce 35–50 % (jeho zimy 2021–2025: −64 až −88 %) → střed |
| Zima – rychlost poklesu | 15 % zbývajícího rozdílu za týden, nejvýš 5 bodů | **vlastní volba**; zdroje dávají jen „2–4 týdny volněji hned po sezóně“ – [Roadman: transition phase](https://roadmancycling.com/answers/transition-off-season-phase) |
| Ladění před závodem | −2 za týden, posledních 14 dní | převzato z v2 – **ověřit zdroj** (etapa 5) |
| Strop přidávání | +30 % (aspoň +40) proti obvyklým 4 týdnům, pak +15 % za týden | **vlastní volba** (konzervativní nad rámec ramp rate) |
| Zimní délky (Zima, Udržet) | Z2 75 min, dlouhá 2 h, kvalita 1 h | tvoje zadání (schéma trenéra) |
| Kostra: max 3 dny za sebou, kvalita ne po kvalitě ani po dlouhém | – | převzato z v2 – **ověřit zdroj** (etapa 5) |
| Únava (VST pod normou, forma pod −20) | VST: 7denní průměr pod průměr − 1 SD (stejně jako stránka) | normální rozsah ± 1 SD jako v aplikaci; procenta ubrání z v2 – **ověřit zdroj** |
