// Trenér v3 – všechno, co závisí na sportu: zátěž za hodinu, stropy délek a slova v popisu tréninku.
// Den v plánu má cíl ZÁTĚŽE; délka se z ní dopočítá podle sportu – změna kola na běh tak drží zátěž.
import type { PlanSport } from "../../datasource/types";
import type { Block, Workout } from "../workout";

export type Role = "rest" | "easy" | "endurance" | "key" | "long";

/** Zátěž za hodinu podle druhu dne: Z2 = sazba sportu (z tvé historie), kvalita ~1,35×, regenerace ~0,7×. */
export const ROLE_INTENSITY: Record<Role, number> = { rest: 0, easy: 0.7, endurance: 1, long: 1, key: 1.35 };

export interface Caps {
  min: number;
  max: number;
}

/**
 * Stropy délky dne (min). Zima (listopad–únor): krátké jízdy, dlouhá do 2 h, kvalita na trenažéru do 1 h.
 * Sezóna: dlouhá nejvýš o 15 % delší než tvoje nejdelší za 4 týdny (aspoň 2 h). Běh podle připravenosti
 * (1,5× nejdelšího běhu, 30–90 min), běžky a chůze rozumně.
 */
export function capsFor(o: { sport: PlanSport; role: Role; winter: boolean; longest: number; typical: number; runLongest: number }): Caps {
  const { sport, role } = o;
  if (role === "rest") return { min: 0, max: 0 };
  if (sport === "run") {
    const top = Math.max(30, Math.min(90, Math.round((o.runLongest || 30) * 1.5)));
    return role === "easy" ? { min: 20, max: Math.min(40, top) } : role === "long" ? { min: 40, max: top } : { min: 30, max: Math.min(top, 60) };
  }
  if (sport === "walk") return { min: 30, max: role === "long" ? 180 : 120 };
  if (sport === "xc_ski") return { min: 45, max: role === "long" ? 180 : 120 };
  if (role === "easy") return { min: 30, max: 45 };
  if (role === "key") return { min: 45, max: o.winter ? 60 : 90 };
  if (role === "long") return o.winter ? { min: 75, max: 120 } : { min: 90, max: Math.min(300, Math.max(120, Math.round(o.longest * 1.15))) };
  return o.winter ? { min: 45, max: 75 } : { min: 45, max: Math.max(90, Math.round(o.typical * 1.2)) };
}

const round = (sport: PlanSport, m: number) => (sport === "run" ? Math.round(m / 5) * 5 : Math.round(m / 15) * 15);

/** Délka dne ze zátěže: zátěž / (sazba × intenzita druhu), zaokrouhleno (běh na 5, jinak na 15 min), ve stropech. */
export function minutesFor(load: number, rate: number, role: Role, sport: PlanSport, caps: Caps): number {
  if (role === "rest" || load <= 0) return 0;
  const raw = (load / (rate * ROLE_INTENSITY[role])) * 60;
  return Math.max(caps.min, Math.min(caps.max, round(sport, raw)));
}

/** Zátěž dne z délky (odhad pro dny bez konkrétního tréninku – orientační týdny). */
export const loadFor = (minutes: number, rate: number, role: Role) => Math.round((minutes / 60) * rate * ROLE_INTENSITY[role]);

// ---------- slova podle sportu ----------

interface Vocab {
  warmup: string;
  cooldown: string;
  /** závěr do lapu po intervalech */
  finish: string;
  /** „domů“ u závěru do lapu – jen kde dává smysl */
  home: string;
  /** podstatné jméno pro jednotku („jízda“, „běh“) */
  unit: string;
}

export const VOCAB: Record<PlanSport, Vocab> = {
  ride: { warmup: "Rozjetí", cooldown: "Vyjetí", finish: "Z2 a dojezd", home: "domů ", unit: "jízda" },
  run: { warmup: "Rozklus", cooldown: "Výklus", finish: "Z2 a výklus", home: "", unit: "běh" },
  xc_ski: { warmup: "Rozjetí", cooldown: "Dojetí", finish: "Z2 a dojetí", home: "", unit: "běžky" },
  walk: { warmup: "Rozchození", cooldown: "Vychození", finish: "Z2 a cesta domů", home: "", unit: "chůze" },
};

/** Popisky bloků podle sportu (jdou i do intervals.icu a do hodinek). Struktura tréninku se nemění. */
export function relabel(w: Workout, sport: PlanSport): Workout {
  const v = VOCAB[sport];
  const lab = (b: Block): string => {
    if (b.kind === "warmup") return v.warmup;
    if (b.kind === "cooldown") return b.label === "Vyjeti" || b.label === "Vyjetí" ? v.cooldown : v.finish;
    return b.label;
  };
  return { blocks: w.blocks.map((b) => ({ ...b, label: lab(b) })) };
}

/** Název jednotky bez slov jiného sportu („Z2 dlouhá jízda“ u běhu → „Běh – Z2 dlouhá“). */
export function nameFor(name: string, sport: PlanSport): string {
  if (sport === "ride") return name;
  return name.replace(/\s*jízda\b/gi, "").replace(/^Trenažér\s*–\s*/i, "").trim();
}

const mins = (s: number) => (s % 60 === 0 ? `${s / 60} min` : s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min`);
const minHm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, "0")} h` : `${Math.round(m)} min`);
const rng = (s: Block["steps"][number]) => (s.hrLo && s.hrHi ? (s.hrLo <= 70 ? `do ${s.hrHi} bpm` : `${s.hrLo}–${s.hrHi} bpm`) : s.hr ? s.hr.replace(" HR", "") : `${s.lo}–${s.hi} W`);

/** Kroky tréninku pro člověka – slovy daného sportu. */
export function stepsText(w: Workout, sport: PlanSport): string[] {
  const v = VOCAB[sport];
  return w.blocks.map((b) => {
    const s0 = b.steps[0]!;
    const lap = b.steps[b.steps.length - 1]?.lap ? " → lap" : "";
    if ((b.reps ?? 1) > 1) return `${b.reps}× ${b.steps.map((s) => `${mins(s.dur_s)} ${rng(s)}`).join(" / ")}`;
    switch (b.kind) {
      case "warmup":
        return `${v.warmup} ${s0.lap ? "~" : ""}${mins(s0.dur_s)} ${rng(s0)}${lap}`;
      case "cooldown":
        return b.label === v.cooldown ? `${v.cooldown} ${rng(s0)}${lap}` : `${v.finish} ${s0.lap ? v.home : ""}${rng(s0)}${lap}`;
      case "pause":
        return `Pauza ${mins(s0.dur_s)} ${rng(s0)}${lap}`;
      case "main":
        return `${b.label} ${minHm(s0.dur_s / 60)} ${rng(s0)}${lap}`;
      default:
        return `${b.label} ${mins(s0.dur_s)} ${rng(s0)}${lap}`;
    }
  });
}
