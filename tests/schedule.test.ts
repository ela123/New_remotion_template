import { describe, expect, it } from "vitest";
import { bold } from "../src/styles/bold";
import { DEFAULT_RECIPE } from "../src/template/recipe";
import { scheduleCues } from "../src/template/schedule";
import type { AnnotatedCue, AnnotatedLine, ResolvedRecipe } from "../src/types";

const recipe: ResolvedRecipe = { ...DEFAULT_RECIPE, style: bold, slotTypography: bold.slots };

const line = (text: string): AnnotatedLine => ({
  text,
  words: text.split(" ").map((w) => ({ text: w, startMs: 0, endMs: 0 })),
});

const cue = (id: number, startMs: number, endMs: number, lines: string[]): AnnotatedCue => ({
  id,
  startMs,
  endMs,
  lines: lines.map(line),
});

const THREE = ["Hello", "this is", "the third line"];

const only = (cues: AnnotatedCue[], fps = 30) => {
  const result = scheduleCues(cues, recipe, fps);
  const first = result.schedules[0];
  if (!first) throw new Error("no schedule");
  return { ...result, first };
};

describe("scheduleCues", () => {
  it("starts the entrance anticipationFrames before the cue start", () => {
    const { first } = only([cue(1, 1000, 3000, THREE)]);
    expect(first.startFrame).toBe(30);
    expect(first.entranceStart).toBe(27);
  });

  it("clamps the entrance at frame 0", () => {
    const { first } = only([cue(1, 50, 3000, THREE)]);
    expect(first.entranceStart).toBe(0);
    expect(first.lines[0]?.enterStart).toBe(0);
  });

  it("normalises per-slot delays to the first used slot", () => {
    expect(only([cue(1, 1000, 3000, THREE)]).first.lines.map((l) => l.enterStart)).toEqual([27, 32, 37]);
    expect(only([cue(1, 1000, 3000, ["two words", "and more"])]).first.lines.map((l) => [l.slot, l.enterStart])).toEqual([
      ["B", 27],
      ["C", 32],
    ]);
    expect(only([cue(1, 1000, 3000, ["Hey", "and more"])]).first.lines.map((l) => [l.slot, l.enterStart])).toEqual([
      ["A", 27],
      ["C", 37],
    ]);
    expect(only([cue(1, 1000, 3000, ["just one line"])]).first.lines.map((l) => [l.slot, l.enterStart])).toEqual([["B", 27]]);
  });

  it("exits in reverse order with the recipe stagger", () => {
    const { first } = only([cue(1, 1000, 3000, THREE)]);
    expect(first.lines.map((l) => l.exitStart)).toEqual([94, 92, 90]);
    expect(first.lines.every((l) => l.exitFrames === 10 && !l.fadeOnlyExit)).toBe(true);
    expect(first.exitEnd).toBe(104);
  });

  it("shortens the exit so it finishes by the next entrance", () => {
    const { schedules } = scheduleCues([cue(1, 0, 2000, THREE), cue(2, 2300, 4000, THREE)], recipe, 30);
    const [a, b] = schedules;
    if (!a || !b) throw new Error("missing schedules");
    expect(b.entranceStart).toBe(66);
    expect(a.exitEnd).toBeLessThanOrEqual(66);
    for (const l of a.lines) {
      expect(l.fadeOnlyExit).toBe(false);
      expect(l.exitFrames).toBeGreaterThanOrEqual(4);
      expect(l.exitStart).toBeGreaterThanOrEqual(60);
    }
  });

  it("falls back to a 4-frame fade when even 4 frames do not fit", () => {
    const { schedules } = scheduleCues([cue(1, 0, 2000, THREE), cue(2, 2100, 4000, THREE)], recipe, 30);
    const a = schedules[0];
    expect(a?.lines.every((l) => l.fadeOnlyExit && l.exitFrames === 4)).toBe(true);
    expect(schedules[1]?.entranceStart).toBe(60);
  });

  it("extends a short cue to the minimum display time and warns", () => {
    const { first, warnings } = only([cue(1, 0, 300, ["Hi"]), cue(2, 5000, 6000, ["Later"])]);
    expect(first.endFrame).toBe(24);
    expect(warnings).toEqual([expect.objectContaining({ code: "min-display-extended", cueId: 1 })]);
  });

  it("never extends a short cue into the next entrance", () => {
    const { schedules, warnings } = scheduleCues([cue(1, 1000, 1200, ["Hi"]), cue(2, 1700, 3000, ["Next"])], recipe, 30);
    const [a, b] = schedules;
    if (!a || !b) throw new Error("missing schedules");
    expect(a.endFrame).toBeGreaterThan(36);
    expect(a.exitEnd).toBeLessThanOrEqual(b.entranceStart);
    expect(a.lines.every((l) => !l.fadeOnlyExit)).toBe(true);
    expect(warnings[0]?.code).toBe("min-display-extended");
  });

  it.each([
    [24, { start: 24, entrance: 22, delays: [22, 26, 30], enter: [11, 11, 13], exit: 8, stagger: 2 }],
    [60, { start: 60, entrance: 54, delays: [54, 64, 74], enter: [28, 28, 32], exit: 20, stagger: 4 }],
  ])("scales 30 fps recipe values to %i fps", (fps, expected) => {
    const { first } = only([cue(1, 1000, 3000, THREE)], fps);
    expect(first.startFrame).toBe(expected.start);
    expect(first.entranceStart).toBe(expected.entrance);
    expect(first.lines.map((l) => l.enterStart)).toEqual(expected.delays);
    expect(first.lines.map((l) => l.enterFrames)).toEqual(expected.enter);
    expect(first.lines.map((l) => l.exitFrames)).toEqual([expected.exit, expected.exit, expected.exit]);
    const c = first.lines[2]?.exitStart ?? 0;
    expect(first.lines.map((l) => l.exitStart - c)).toEqual([2 * expected.stagger, expected.stagger, 0]);
  });

  it("returns nothing for no cues", () => {
    expect(scheduleCues([], recipe, 30)).toEqual({ schedules: [], warnings: [] });
  });

  it("skips cues with no visible lines and keeps the hand-off to the next real cue", () => {
    const empty: AnnotatedCue = { id: 2, startMs: 2100, endMs: 2500, lines: [{ text: "  ", words: [] }] };
    const { schedules } = scheduleCues([cue(1, 0, 2000, THREE), empty, cue(3, 5000, 6000, THREE)], recipe, 30);
    expect(schedules.map((s) => s.cueId)).toEqual([1, 3]);
    expect(schedules[0]?.lines.every((l) => !l.fadeOnlyExit)).toBe(true);
  });

  it("handles a line with text but no word timings", () => {
    const bare: AnnotatedCue = { id: 1, startMs: 1000, endMs: 3000, lines: [{ text: "no words", words: [] }] };
    expect(only([bare]).first.lines.map((l) => l.slot)).toEqual(["B"]);
  });

  it("fades out an overlapped cue from the next entrance without delaying it", () => {
    const { schedules } = scheduleCues([cue(1, 0, 3000, THREE), cue(2, 2000, 4000, THREE)], recipe, 30);
    const [a, b] = schedules;
    if (!a || !b) throw new Error("missing schedules");
    expect(b.entranceStart).toBe(57);
    expect(a.lines.every((l) => l.fadeOnlyExit && l.exitStart === 57 && l.exitFrames === 4)).toBe(true);
    expect(a.exitEnd).toBe(61);
  });

  it("repairs a cue whose end is before its start", () => {
    const { first, warnings } = only([cue(1, 2000, 1500, ["Backwards cue"])]);
    expect(first.endFrame).toBeGreaterThan(first.startFrame);
    expect(warnings[0]?.code).toBe("min-display-extended");
  });

  it("orders unsorted cues by start time", () => {
    const { schedules } = scheduleCues([cue(2, 4000, 5000, THREE), cue(1, 1000, 2000, THREE)], recipe, 30);
    expect(schedules.map((s) => s.cueId)).toEqual([1, 2]);
  });

  it.each([24, 25, 29.97, 30, 59.94, 60])("produces whole, ordered frames at %s fps", (fps) => {
    const { schedules } = scheduleCues(
      [cue(1, 0, 1000, THREE), cue(2, 1100, 1300, ["Hi"]), cue(3, 1500, 4000, ["two words", "and more"])],
      recipe,
      fps,
    );
    for (const [i, s] of schedules.entries()) {
      const values = [s.startFrame, s.endFrame, s.entranceStart, s.exitEnd, ...s.lines.flatMap((l) => [l.enterStart, l.enterFrames, l.exitStart, l.exitFrames])];
      expect(values.every(Number.isInteger)).toBe(true);
      expect(s.entranceStart).toBeGreaterThanOrEqual(0);
      const next = schedules[i + 1];
      if (next) expect(s.lines.every((l) => l.fadeOnlyExit || l.exitStart + l.exitFrames <= next.entranceStart)).toBe(true);
    }
  });
});
