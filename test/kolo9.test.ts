// 9. kolo: FTP a zóny s datem platnosti.
import { describe, expect, it } from "vitest";
import { type HrZones, type ZoneHistRow, ftpChanges, zonesAt, zonesChanged } from "../src/core/zones";
import { efficiency } from "../src/core/analytics";

const hzA: HrZones = { floors: [55, 135, 165, 184, 202], max: 204, lthr: 196, rest: 55 };
const hzB: HrZones = { floors: [55, 130, 160, 180, 198], max: 204, lthr: 190, rest: 55 };
const today = { ftp: 298, hr: hzA };

describe("zóny s datem platnosti", () => {
  const hist: ZoneHistRow[] = [
    { date: "2025-09-04", ftp: 250, hr: null },
    { date: "2026-03-01", ftp: null, hr: hzB },
    { date: "2026-09-26", ftp: 298, hr: null },
  ];
  it("hodnota platná v den aktivity; FTP a tep se hledají každý zvlášť", () => {
    expect(zonesAt(hist, "2026-08-10", today)).toEqual({ ftp: 250, hr: hzB });
    expect(zonesAt(hist, "2026-09-26", today).ftp).toBe(298);
    expect(zonesAt(hist, "2025-12-01", today)).toEqual({ ftp: 250, hr: hzB }); // tep před prvním záznamem = nejstarší známý
  });
  it("před historií nejstarší známá hodnota, bez historie dnešní nastavení", () => {
    expect(zonesAt(hist, "2020-05-01", today).ftp).toBe(250);
    expect(zonesAt([], "2020-05-01", today)).toEqual(today);
  });
  it("body FTP z jízd → jen změny; ±2 W není další změna, ale upraví číslo", () => {
    const pts = [["2025-09-04", 250], ["2025-10-01", 250], ["2026-09-26", 297], ["2026-09-27", 298], ["2026-10-02", 298], ["2025-09-10", 251]].map(([date, ftp]) => ({ date: date as string, ftp: ftp as number }));
    expect(ftpChanges(pts)).toEqual([{ date: "2025-09-04", ftp: 250 }, { date: "2026-09-26", ftp: 298 }]);
  });
  it("nový řádek jen při skutečné změně (klidový tep změnu zón nedělá)", () => {
    expect(zonesChanged([], "2026-11-12", today)).toEqual({ ftp: true, hr: true });
    const h: ZoneHistRow[] = [{ date: "2026-09-26", ftp: 298, hr: hzA }];
    expect(zonesChanged(h, "2026-11-12", { ftp: 298, hr: { ...hzA, rest: 50 } })).toEqual({ ftp: false, hr: false });
    expect(zonesChanged(h, "2026-11-12", { ftp: 305, hr: hzA })).toEqual({ ftp: true, hr: false });
  });
  it("EF: lehká jízda se pozná podle FTP platného v den jízdy", () => {
    // NP 200: při FTP 250 je IF 0,8 (není lehká), při dnešním 298 by vyšlo 0,67 (lehká)
    const act = (date: string) => ({ id: date, date, sport: "ride", moving_s: 3600, np: 200, avg_power: 190, avg_hr: 140, if_garmin: null, name: null });
    const acts = [act("2026-05-01"), act("2026-05-08"), act("2026-10-01"), act("2026-10-08")] as any;
    expect(efficiency(acts, 298).points.length).toBe(4);
    expect(efficiency(acts, (d) => zonesAt([{ date: "2025-09-04", ftp: 250, hr: null }, { date: "2026-09-26", ftp: 298, hr: null }], d, today).ftp).points.length).toBe(2);
  });
});

import { EDIT_LIMITS, applyStepEdit, buildWorkout, editableBlock, readStepEdit } from "../src/core/coach/library";
import { constraintNoteOk, fixedFromConstraints } from "../src/core/coach/common";

describe("editor tréninku: úprava kvality", () => {
  const ftp = 250;
  const key = () => buildWorkout({ sport: "ride", family: "thr", level: 2, wid: null, minutes: 75, indoor: false, zones: { ftp, hr: null } } as any);
  const idx = (b: ReturnType<typeof key>) => editableBlock(b.workout);
  const series = (b: ReturnType<typeof key>, i = idx(b)) => b.workout.blocks[i]!;
  it("kvalita z knihovny má sérii, kterou jde upravit", () => {
    expect(series(key())).toBeTruthy();
  });
  it("méně opakování a kratší úsek → kratší trénink, menší zátěž, cíl okruhů sedí", () => {
    const b = key(), s = series(b);
    const e = applyStepEdit(b, { reps: Math.max(1, (s.reps ?? 2) - 1), work_s: s.steps[0]!.dur_s - 60 }, ftp);
    expect(e.load).toBeLessThan(b.load);
    expect(e.minutes).toBeLessThan(b.minutes);
    expect(e.tizMin).toBeLessThan(b.tizMin);
    expect(e.name).toMatch(/\(upraveno\)$/);
    expect(e.plan?.reps).toBe(Math.max(1, (s.reps ?? 2) - 1));
    expect(e.plan?.work_s).toBe(s.steps[0]!.dur_s - 60);
  });
  it("intenzita +5 % zvedne watty pracovního úseku, pauzy ne", () => {
    const b = key(), s = series(b);
    const e = applyStepEdit(b, { pct: 5 }, ftp);
    const s2 = series(e);
    expect(s2.steps[0]!.lo!).toBeGreaterThan(s.steps[0]!.lo!);
    if (s.steps[1]) expect(s2.steps[1]!.lo).toBe(s.steps[1]!.lo);
    expect(e.load).toBeGreaterThan(b.load);
  });
  it("pojistka: pracovní čas série nejvýš +50 % (ubere opakování)", () => {
    const b = key(), s = series(b);
    const lim = (s.reps ?? 1) * s.steps[0]!.dur_s * EDIT_LIMITS.growth;
    for (const ed of [{ reps: 12, work_s: s.steps[0]!.dur_s * 2 }, { reps: 1, work_s: 1800 }]) {
      const s2 = series(applyStepEdit(b, ed, ftp), idx(b));
      expect((s2.reps ?? 1) * s2.steps[0]!.dur_s).toBeLessThanOrEqual(lim);
    }
  });
  it("uložená úprava: kontrola rozsahu a převod na omezení dne", () => {
    expect(readStepEdit('{"reps":4,"work_s":480,"pct":0}')).toEqual({ reps: 4, work_s: 480, pct: 0 });
    expect(readStepEdit('{"reps":20}')).toBeNull();
    expect(readStepEdit('{"pct":15}')).toBeNull();
    expect(readStepEdit("nesmysl")).toBeNull();
    expect(constraintNoteOk("kroky", '{"reps":3}')).toBe(true);
    expect(constraintNoteOk("kroky", '{"work_s":5}')).toBe(false);
    const f = fixedFromConstraints([{ date: "2026-11-18", kind: "kroky", note: '{"reps":3,"work_s":600}' }, { date: "2026-11-18", kind: "typ", note: "quality" }]);
    expect(f.get("2026-11-18")).toEqual({ type: "quality", edit: { reps: 3, work_s: 600 } });
  });
});

describe("editor tréninku: souvislé tempo", () => {
  it("jeden pracovní úsek: délka a intenzita jdou změnit, opakování zůstává 1", () => {
    const w = { blocks: [{ label: "Rozjeti", kind: "warmup", steps: [{ dur_s: 1200, lo: 150, hi: 180 }] }, { label: "Tempo", kind: "work", steps: [{ dur_s: 1800, lo: 205, hi: 220 }] }, { label: "Vyjeti", kind: "cooldown", steps: [{ dur_s: 600, lo: 120, hi: 140 }] }] } as any;
    const b = { workout: w, name: "30 min tempo", minutes: 60, tizMin: 30, load: 70, qualityType: null, targetText: null, family: "tempo", level: 1, wid: null, plan: null } as any;
    expect(editableBlock(w)).toBe(1);
    const e = applyStepEdit(b, { reps: 3, work_s: 1500, pct: -5 }, 250);
    expect(e.workout.blocks[1]!.reps ?? 1).toBe(1);
    expect(e.workout.blocks[1]!.steps[0]).toMatchObject({ dur_s: 1500, lo: 195, hi: 210 });
    expect(e.minutes).toBe(55);
    expect(e.tizMin).toBe(25);
  });
});

import { pageAllowedPrivate, stripHealth } from "../src/core/privacy";

describe("soukromí pro AI", () => {
  it("zdravotní údaje pryč (i vnořené a v polích), trénink zůstává", () => {
    const ctx = { dnes: "2026-11-12", ftp_w: 298, vst_ms: 52, semafor: "🟢", zotaveni: { stav: "ok", hrv_ms: 50 }, kondice: { ctl: 41, forma: 22 }, zdravi_30_dni: [{ den: "1. 11.", spanek_h: 7.5, klidovy_tep: 50 }], posledni_aktivity: [{ nazev: "Z2", zatez: 60, dopad_body_battery: -12 }] };
    expect(stripHealth(ctx)).toEqual({ dnes: "2026-11-12", ftp_w: 298, kondice: { ctl: 41, forma: 22 }, posledni_aktivity: [{ nazev: "Z2", zatez: 60 }] });
  });
  it("obsah stránky jen u tréninkových stránek", () => {
    expect(pageAllowedPrivate("#/trener")).toBe(true);
    expect(pageAllowedPrivate("#/aktivita/123")).toBe(true);
    expect(pageAllowedPrivate("#/zotaveni")).toBe(false);
    expect(pageAllowedPrivate("#/")).toBe(false);
    expect(pageAllowedPrivate("#/trenerx")).toBe(false);
  });
});
