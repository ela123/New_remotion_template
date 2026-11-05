import { describe, expect, it } from "vitest";
import { directionalBlur } from "../src/motion/blur";
import { curveProgress, springValue } from "../src/motion/curve";
import { driftScale } from "../src/motion/drift";
import { EASINGS } from "../src/motion/easing";
import { isSpringName, SPRINGS } from "../src/motion/springs";
import { exitOrderIndex, scaleFrames } from "../src/motion/stagger";
import { EMPHASIS, emphasisStart, emphasisState, popOriginX } from "../src/motion/emphasis";
import {
  curveOvershoots,
  enterOpacity,
  glitchIntensity,
  glitchWindow,
  linePose,
  settleAmount,
  settleBump,
  travelDistance,
} from "../src/motion/pose";
import { STYLES } from "../src/styles";
import { resolveRecipe } from "../src/template/recipe";
import type { EaseName, SpringName } from "../src/types";

const easeNames = Object.keys(EASINGS) as EaseName[];
const springNames = Object.keys(SPRINGS) as SpringName[];

describe("easing", () => {
  it.each(easeNames)("%s starts at 0 and ends at 1", (name) => {
    expect(EASINGS[name](0)).toBeCloseTo(0, 6);
    expect(EASINGS[name](1)).toBeCloseTo(1, 6);
  });

  it.each(easeNames.filter((n) => n !== "outBack"))("%s is monotonic within 0..1", (name) => {
    let previous = 0;
    for (let i = 1; i <= 100; i++) {
      const value = EASINGS[name](i / 100);
      expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(value).toBeLessThanOrEqual(1 + 1e-9);
      previous = value;
    }
  });

  it("outBack overshoots past 1", () => {
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => EASINGS.outBack(i / 100)));
    expect(peak).toBeGreaterThan(1.01);
  });

  it("is not linear", () => {
    expect(EASINGS.outExpo(0.5)).toBeGreaterThan(0.8);
    expect(EASINGS.inCubic(0.5)).toBeLessThan(0.3);
  });

  it("recognises spring names", () => {
    expect(isSpringName("pop")).toBe(true);
    expect(isSpringName("outExpo")).toBe(false);
  });
});

describe("curveProgress", () => {
  it.each(springNames)("spring %s reaches 1 by the given frames", (name) => {
    expect(curveProgress(name, 0, 20, 30)).toBeCloseTo(0, 6);
    expect(curveProgress(name, 20, 20, 30)).toBeCloseTo(1, 2);
    expect(curveProgress(name, 40, 20, 30)).toBeCloseTo(1, 2);
  });

  it.each(springNames)("spring %s lands exactly on 1 at the last frame", (name) => {
    expect(curveProgress(name, 20, 20, 30)).toBe(1);
    expect(Math.abs(curveProgress(name, 19, 20, 30) - 1)).toBeLessThan(0.2);
  });

  it.each(easeNames)("bezier %s clamps outside the range", (name) => {
    expect(curveProgress(name, -5, 14, 30)).toBe(0);
    expect(curveProgress(name, 14, 14, 30)).toBeCloseTo(1, 6);
    expect(curveProgress(name, 30, 14, 30)).toBeCloseTo(1, 6);
  });

  it("handles zero-length curves", () => {
    expect(curveProgress("outExpo", 0, 0, 30)).toBe(1);
    expect(curveProgress("soft", -1, 0, 30)).toBe(0);
  });

  it("springValue settles at 1", () => {
    expect(springValue("pop", 0, 30)).toBeCloseTo(0, 6);
    expect(springValue("pop", 120, 30)).toBeCloseTo(1, 3);
  });
});

describe("stagger", () => {
  it.each([
    [24, 11],
    [30, 14],
    [60, 28],
  ])("scaleFrames(14) at %i fps = %i", (fps, expected) => {
    expect(scaleFrames(14, fps)).toBe(expected);
  });

  it("scaleFrames handles fractional fps", () => {
    expect(scaleFrames(10, 29.97)).toBe(10);
    expect(scaleFrames(10, 59.94)).toBe(20);
  });

  it("exitOrderIndex covers every order", () => {
    expect([0, 1, 2].map((i) => exitOrderIndex(i, 3, "reverse"))).toEqual([2, 1, 0]);
    expect([0, 1, 2].map((i) => exitOrderIndex(i, 3, "forward"))).toEqual([0, 1, 2]);
    expect([0, 1, 2].map((i) => exitOrderIndex(i, 3, "together"))).toEqual([0, 0, 0]);
    expect([0, 1].map((i) => exitOrderIndex(i, 2, "reverse"))).toEqual([1, 0]);
  });
});

describe("directionalBlur", () => {
  it("is exactly zero at rest", () => {
    expect(directionalBlur({ x: 10, y: 10 }, { x: 10, y: 10 })).toEqual({ x: 0, y: 0 });
  });

  it("blurs only the moving axis", () => {
    const vertical = directionalBlur({ x: 0, y: 0 }, { x: 0, y: 20 });
    expect(vertical.x).toBe(0);
    expect(vertical.y).toBeGreaterThan(0);
    const horizontal = directionalBlur({ x: 0, y: 0 }, { x: -20, y: 0.1 });
    expect(horizontal.y).toBe(0);
    expect(horizontal.x).toBeGreaterThan(0);
  });

  it("clamps to the maximum and respects the threshold", () => {
    const opts = { k: 1, maxBlurPx: 5, thresholdPxPerFrame: 2 };
    expect(directionalBlur({ x: 0, y: 0 }, { x: 100, y: 1.9 }, opts)).toEqual({ x: 5, y: 0 });
  });
});

describe("driftScale", () => {
  it("returns exactly 1 when disabled", () => {
    expect(driftScale("line-0", 42, 30, false)).toBe(1);
  });

  it("is deterministic and within ±0.003", () => {
    for (let frame = 0; frame < 300; frame += 7) {
      const value = driftScale("cue-1-A", frame, 30, true);
      expect(value).toBe(driftScale("cue-1-A", frame, 30, true));
      expect(Math.abs(value - 1)).toBeLessThanOrEqual(0.003);
    }
  });

  it("varies by seed", () => {
    const a = Array.from({ length: 10 }, (_, f) => driftScale("a", f * 13, 30, true));
    const b = Array.from({ length: 10 }, (_, f) => driftScale("b", f * 13, 30, true));
    expect(a).not.toEqual(b);
  });
});

describe("pose", () => {
  const recipe = resolveRecipe(STYLES.bold);
  const lineB = recipe.lines[1];
  const schedule = { enterStart: 10, enterFrames: 14, settleFrames: 6, exitStart: 60, exitFrames: 10, fadeOnlyExit: false };
  const input = { schedule, recipe: lineB, settle: recipe.settle, enterDistance: 100, exitDistance: 100, fps: 30 };

  it("settleBump is zero at both ends and peaks at 1", () => {
    expect(settleBump(0)).toBe(0);
    expect(settleBump(1)).toBe(0);
    const peak = Math.max(...Array.from({ length: 1001 }, (_, i) => settleBump(i / 1000)));
    expect(peak).toBeCloseTo(1, 3);
    expect(settleBump(0.01)).toBeLessThan(0.01);
    expect(settleBump(0.99)).toBeLessThan(0.001);
  });

  it("is hidden before the entrance and exactly at rest after the settle", () => {
    expect(linePose(9, input).opacity).toBe(0);
    const rest = linePose(10 + 14 + 6, input);
    expect(rest).toMatchObject({ x: 0, y: 0, scale: 1, opacity: 1, resting: true });
  });

  it("overshoots past rest along the entry direction without kinks", () => {
    const ys = Array.from({ length: 21 }, (_, i) => linePose(10 + i, input).y);
    expect(Math.max(...ys)).toBeGreaterThan(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(recipe.settle.overshoot * 100 + 1e-9);
    const v = ys.slice(1).map((y, i) => y - (ys[i] ?? 0));
    const accel = v.slice(1).map((x, i) => Math.abs(x - (v[i] ?? 0)));
    expect(Math.max(...accel.slice(6))).toBeLessThan(3);
  });

  it("skips the settle stage for curves that overshoot on their own", () => {
    expect(curveOvershoots("outBack")).toBe(true);
    expect(curveOvershoots("outExpo")).toBe(false);
    expect(settleAmount(14, 14, 6, 0)).toBe(0);
    expect(settleAmount(14, 14, 6, 0.05)).toBeGreaterThan(0);
  });

  it("fades in with an ease-out and leaves instantly visible lines alone", () => {
    expect(enterOpacity(-1, 14, true)).toBe(0);
    expect(enterOpacity(0, 14, false)).toBe(1);
    expect(enterOpacity(2, 14, true)).toBeGreaterThan(2 / (14 * 0.55));
    expect(enterOpacity(14, 14, true)).toBe(1);
  });

  it("exits toward the exit direction while fading out", () => {
    const mid = linePose(65, input);
    expect(mid.y).toBeLessThan(0);
    expect(mid.opacity).toBeCloseTo(0.5, 5);
    expect(linePose(70, input).opacity).toBe(0);
  });

  it("measures offscreen travel from the placed box", () => {
    const box = { x: 100, y: 800, width: 400, height: 80 };
    expect(travelDistance(140, "top", box, { width: 1920, height: 1080 }, 2)).toBe(280);
    expect(travelDistance("offscreen", "top", box, { width: 1920, height: 1080 }, 1)).toBe(920);
    expect(travelDistance("offscreen", "right", box, { width: 1920, height: 1080 }, 1)).toBe(1860);
    expect(travelDistance("offscreen", "none", box, { width: 1920, height: 1080 }, 1)).toBe(0);
  });

  it("places the glitch inside the entrance and decays it to zero", () => {
    const window = glitchWindow(12, 3);
    expect(window.start + window.frames).toBeLessThanOrEqual(12);
    const values = Array.from({ length: 20 }, (_, f) => glitchIntensity(f, window));
    expect(values.filter((v) => v > 0)).toHaveLength(3);
    expect(values[window.start]).toBe(1);
    expect(values.slice(12).every((v) => v === 0)).toBe(true);
    expect(glitchWindow(2, 3).frames).toBe(2);
  });
});

describe("emphasis", () => {
  it("is neutral before the word starts", () => {
    expect(emphasisState(-1, 30, true)).toEqual({ scale: 1, colorMix: 0, underline: 0, glow: 1 });
  });

  it("pops to about 1.10 and returns to rest", () => {
    const scales = Array.from({ length: 90 }, (_, t) => emphasisState(t, 30, true).scale);
    expect(Math.max(...scales)).toBeGreaterThan(1.08);
    expect(Math.max(...scales)).toBeLessThan(1.14);
    expect(scales[89]).toBeCloseTo(1, 2);
    expect(emphasisState(5, 30, false).scale).toBe(1);
  });

  it("lands exactly on rest once the pop has died down", () => {
    for (const fps of [24, 29.97, 30, 60]) {
      const settled = emphasisState(Math.round(fps * 2), fps, true);
      expect(settled.scale).toBe(1);
      expect(settled.glow).toBe(1);
    }
  });

  it("sweeps the underline after the pop starts and completes it", () => {
    expect(emphasisState(EMPHASIS.underlineDelay30, 30, true).underline).toBe(0);
    expect(emphasisState(EMPHASIS.underlineDelay30 + EMPHASIS.underlineFrames30, 30, true).underline).toBeCloseTo(1, 6);
    expect(emphasisState(EMPHASIS.colorFrames30, 30, true).colorMix).toBeCloseTo(1, 6);
  });

  it("anticipates the spoken word by two frames at 30 fps", () => {
    expect(emphasisStart(30, 30)).toBe(28);
    expect(emphasisStart(60, 60)).toBe(56);
  });

  it("grows edge words away from their neighbours when centred", () => {
    expect(popOriginX(0, 1, "center")).toBe(50);
    expect(popOriginX(0, 3, "center")).toBe(100);
    expect(popOriginX(1, 3, "center")).toBe(50);
    expect(popOriginX(2, 3, "center")).toBe(0);
  });

  it("keeps the aligned edge fixed", () => {
    expect(popOriginX(0, 3, "left")).toBe(0);
    expect(popOriginX(2, 3, "left")).toBe(0);
    expect(popOriginX(2, 3, "right")).toBe(100);
    expect(popOriginX(0, 3, "right")).toBe(100);
    expect(popOriginX(0, 1, "right")).toBe(100);
  });
});
