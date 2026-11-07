// Stavba workoutu a lapy (7.3), názvy (7.2), syntaxe intervals.icu. Žádné rampy, každý krok má rozsah wattů.
import { minHm } from "../lib/format";
import { TARGET_PCT, pctRange } from "./zones";

export interface Step {
  dur_s: number;
  lo?: number; // W
  hi?: number; // W
  hr?: string; // MTB: 'Z2 HR'
  lap?: boolean; // krok končí stiskem lapu
}

export type BlockKind = "warmup" | "work" | "pause" | "main" | "cooldown";

export interface Block {
  label: string;
  kind: BlockKind;
  reps?: number;
  steps: Step[];
}

export interface Workout {
  blocks: Block[];
}

export function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[–—]/g, "-").replace(/×/g, "x");
}

export function durIcu(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  let out = "";
  if (h) out += `${h}h`;
  if (m) out += `${m}m`;
  if (s) out += `${s}s`;
  return out || "0s";
}

/** Text kroků pro intervals.icu (pole description), bez diakritiky. */
export function renderIcu(w: Workout): string {
  return w.blocks
    .map((b) => {
      const head = stripDiacritics(b.label) + (b.reps && b.reps > 1 ? ` ${b.reps}x` : "");
      const lines = b.steps.map((s) => {
        const tgt = s.hr ? s.hr : `${s.lo}-${s.hi}w`;
        return `- ${durIcu(s.dur_s)} ${tgt}${s.lap ? " press lap" : ""}`;
      });
      return [head, ...lines].join("\n");
    })
    .join("\n\n");
}

/** Kontrola 7.3 bod 9. Vrací seznam chyb (prázdný = OK). */
export function validate(w: Workout): string[] {
  const err: string[] = [];
  const blocks = w.blocks;
  if (!blocks.length) return ["prázdný workout"];
  const lastBlock = blocks[blocks.length - 1]!;
  const lastStep = lastBlock.steps[lastBlock.steps.length - 1];
  if (!lastStep?.lap || (lastBlock.reps ?? 1) > 1) err.push("poslední krok nekončí press lap");
  const firstWork = blocks.findIndex((b) => b.kind === "work");
  if (firstWork > 0) {
    const before = blocks[firstWork - 1]!;
    if (!before.steps[before.steps.length - 1]?.lap) err.push("krok před prvním intervalem nekončí press lap");
  }
  for (const b of blocks) {
    if ((b.reps ?? 1) > 1 && b.steps.some((s) => s.lap)) err.push(`lap uvnitř opakování (${b.label})`);
    for (const s of b.steps) if (!s.hr && (s.lo == null || s.hi == null || s.lo > s.hi)) err.push(`krok bez rozsahu wattů (${b.label})`);
  }
  if (/ramp/i.test(renderIcu(w))) err.push("ramp");
  return err;
}

export function totalSeconds(w: Workout): number {
  return w.blocks.reduce((t, b) => t + (b.reps ?? 1) * b.steps.reduce((s, x) => s + x.dur_s, 0), 0);
}

const mins = (s: number) => (s % 60 === 0 ? `${s / 60} min` : s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min`);
const rng = (s: Step) => (s.hr ? s.hr.replace(" HR", "") : `${s.lo}–${s.hi} W`);

/** Lidsky čitelné kroky do reportu/zprávy (📋 Průběh). */
export function humanSteps(w: Workout): string[] {
  return w.blocks.map((b) => {
    const s0 = b.steps[0]!;
    const lap = b.steps[b.steps.length - 1]?.lap ? " → lap" : "";
    if ((b.reps ?? 1) > 1) {
      const [work, rest] = b.steps;
      return `${b.reps}× ${mins(work!.dur_s)} ${rng(work!)}${rest ? ` / ${mins(rest.dur_s)} ${rng(rest)}` : ""}`;
    }
    switch (b.kind) {
      case "warmup":
        return `Rozjetí ${s0.lap ? "~" : ""}${mins(s0.dur_s)} ${rng(s0)}${lap}`;
      case "cooldown":
        return `${b.label === "Vyjeti" ? "Vyjetí" : "Z2 a dojezd"} ${s0.lap ? "domů " : ""}${rng(s0)}${lap}`;
      case "pause":
        return `Pauza ${mins(s0.dur_s)} ${rng(s0)}${lap}`;
      case "main":
        return `Z2 ${minHm(s0.dur_s / 60)} ${rng(s0)}${lap}`;
      default:
        return `${b.label} ${mins(s0.dur_s)} ${rng(s0)}${lap}`;
    }
  });
}

// ---------- stavitelé ----------

export interface Ctx {
  ftp: number;
  mtb?: boolean;
}

/** Z2 jízda: rozjetí 5 min na čas, Z2 na čas, vyjetí do lapu (7.3 bod 5). */
export function z2Workout(c: Ctx, totalMin: number): Workout {
  const z2min = Math.max(10, totalMin - 10);
  if (c.mtb) {
    return {
      blocks: [
        { label: "Rozjeti", kind: "warmup", steps: [{ dur_s: 300, hr: "Z1 HR" }] },
        { label: "Z2", kind: "main", steps: [{ dur_s: z2min * 60, hr: "Z2 HR" }] },
        { label: "Vyjeti", kind: "cooldown", steps: [{ dur_s: 300, hr: "Z1 HR", lap: true }] },
      ],
    };
  }
  const [wl, wh] = pctRange(c.ftp, TARGET_PCT.warmupZ2);
  const [zl, zh] = pctRange(c.ftp, TARGET_PCT.z2);
  const [rl, rh] = pctRange(c.ftp, TARGET_PCT.recovery);
  return {
    blocks: [
      { label: "Rozjeti", kind: "warmup", steps: [{ dur_s: 300, lo: wl, hi: wh }] },
      { label: "Z2", kind: "main", steps: [{ dur_s: z2min * 60, lo: zl, hi: zh }] },
      { label: "Vyjeti", kind: "cooldown", steps: [{ dur_s: 300, lo: rl, hi: rh, lap: true }] },
    ],
  };
}

/** Lehká jízda Z1 (🔴 / regenerace) – max. 45 min. */
export function z1Workout(c: Ctx, totalMin: number): Workout {
  const [rl, rh] = pctRange(c.ftp, TARGET_PCT.recovery);
  return {
    blocks: [{ label: "Z1", kind: "cooldown", steps: [{ dur_s: Math.min(45, totalMin) * 60, lo: rl, hi: rh, lap: true }] }],
  };
}

export interface IntervalSet {
  label: string; // 'Prah', 'Serie 1', 'Sweet spot 1'
  reps: number;
  work_s: number;
  rest_s: number; // 0 = bez pauzy v bloku (jednorázový blok)
  lo: number;
  hi: number;
}

export interface IntervalSpec {
  warmupMin: number;
  sets: IntervalSet[];
  pauseBetweenS: number; // delší pauza mezi bloky (končí lapem)
  cooldownMin: number; // Z2 a dojezd (jeden krok do lapu)
}

export function intervalWorkout(c: Ctx, spec: IntervalSpec): Workout {
  const [wl, wh] = pctRange(c.ftp, TARGET_PCT.warmupPre);
  const [rl, rh] = pctRange(c.ftp, TARGET_PCT.recovery);
  const [zl, zh] = pctRange(c.ftp, TARGET_PCT.z2);
  const blocks: Block[] = [{ label: "Rozjeti", kind: "warmup", steps: [{ dur_s: spec.warmupMin * 60, lo: wl, hi: wh, lap: true }] }];
  spec.sets.forEach((s, i) => {
    const steps: Step[] = [{ dur_s: s.work_s, lo: s.lo, hi: s.hi }];
    if (s.reps > 1 && s.rest_s > 0) steps.push({ dur_s: s.rest_s, lo: rl, hi: rh });
    blocks.push({ label: s.label, kind: "work", reps: s.reps > 1 ? s.reps : undefined, steps });
    if (i < spec.sets.length - 1)
      blocks.push({ label: "Pauza", kind: "pause", steps: [{ dur_s: spec.pauseBetweenS, lo: rl, hi: rh, lap: true }] });
  });
  blocks.push({ label: "Z2 a dojezd", kind: "cooldown", steps: [{ dur_s: spec.cooldownMin * 60, lo: zl, hi: zh, lap: true }] });
  return { blocks };
}

/** Název jednotky podle 7.2 (bez délky, bez „Venku“, trenažér s předponou). */
export function workoutName(base: string, indoor: boolean): string {
  return indoor ? `Trenažér – ${base}` : base;
}
