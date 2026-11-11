# Převzatý obsah

## Knihovna tréninků

Soubor `src/core/coach/workouts.data.ts` obsahuje hlavní části strukturovaných tréninků převzaté a přepsané
z projektu **Domestique** (https://github.com/platypus45/domestique), Copyright 2026 Domestique contributors,
licence Apache License 2.0 (http://www.apache.org/licenses/LICENSE-2.0).

Změny proti originálu: z každého tréninku je vzata jen hlavní část (bez rozjetí a dojezdu), převedena z formátu
ZWO do vlastního úsporného zápisu, tréninky jsou vybrány a přejmenovány skriptem
`scripts/build-workout-library.mjs`. Postup plánování (stálá kostra týdne, denní úpravy, přesun zmeškaného
tréninku, výběr z knihovny s důrazem na pestrost) vychází z téhož projektu, kód je napsaný znovu.
