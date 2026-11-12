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
| Ladění před závodem | 2 týdny: 70 % a 45 % běžného týdne (`TAPER_SHARE`), počet tréninků a kvalita zůstávají, den závodu rezervovaný | Bosquet a kol. 2007, metaanalýza 27 studií: 2 týdny, objem −41 až −60 % postupně, intenzita a frekvence beze změny – [PubMed 17762369](https://pubmed.ncbi.nlm.nih.gov/17762369/), [Fast Talk Labs: How to nail your next taper](https://www.fasttalklabs.com/physiology/how-to-nail-your-next-taper) |
| Strop přidávání | +30 % (aspoň +40) proti obvyklým 4 týdnům, pak +15 % za týden | **vlastní volba** (konzervativní nad rámec ramp rate) |
| Zimní délky (Zima, Udržet) | Z2 75 min, dlouhá 2 h, kvalita 1 h | tvoje zadání (schéma trenéra) |
| Kostra: kvalita ne den po kvalitě ani po dlouhém | – | princip tvrdý–lehký, mezi tvrdými tréninky ~48 h (u VO2max i 72 h) – [Roadman: recovery between hard sessions](https://roadmancycling.com/blog/recovery-between-hard-sessions-cycling); studie jsou slabší, jde o shodu trenérů |
| Kostra: nejvýš 3 dny tréninku za sebou | 3 | **vlastní volba** (z v2), zdroj konkrétní číslo nedává |
| Stupně náročnosti kvalit | zvládnuto čistě → +1, nezvládnuto → −1, jinak stejný; Udržet a Zima po splnění nepřidávají | princip Progression Levels v TrainerRoad (posun jen po splnění předepsaného tréninku) – [TrainerRoad fórum: Progression Levels](https://www.trainerroad.com/forum/t/progression-levels-and-failed-incomplete-rides/63269); hodnocení z okruhů (výkon proti pásmu, nárůst tepu) z v2 |
| Únava (VST pod normou, forma pod −20) | VST: 7denní průměr pod průměr − 1 SD (stejně jako stránka) | normální rozsah ± 1 SD jako v aplikaci; procenta ubrání z v2 – **ověřit zdroj** |
| Rozdělení intenzity (graf zón za 28 dní) | lehce = Z1–Z2, středně = Z3, intenzivně = Z4+; cíl ~80 % lehce | tříbodový model Seilera (prahy LT1/LT2), 80/20 – Seiler & Kjerland 2006, Seiler 2010 (IJSPP); přehled [Fast Talk Labs: The science behind polarized training](https://fasttalklabs.com/articles/the-science-behind-polarized-training) |
