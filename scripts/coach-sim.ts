// Spuštění: npx vite-node scripts/coach-sim.ts <výstup.json>
// Simulace Trenéra v3: modelový sportovec každý den odjede přesně plán, kondice se přepočítá, trenér plánuje znovu.
// Logika je ve sdílené scripts/coach-sim-lib.ts (používá ji i test/coach/sim.test.ts).
import { writeFileSync } from "node:fs";
import { SCENARIOS, simText, simulate } from "./coach-sim-lib";

const out = SCENARIOS.map(simulate);
writeFileSync(process.argv[2]!, JSON.stringify(out));
for (const s of out) console.log(simText(s));
