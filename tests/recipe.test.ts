import { describe, expect, it } from "vitest";
import { getStyle, STYLES } from "../src/styles";
import { DEFAULT_RECIPE, mergeRecipe, resolveRecipe } from "../src/template/recipe";
import type { SlotTypography, StyleName, StyleTokens } from "../src/types";

describe("DEFAULT_RECIPE", () => {
  it("matches SPEC 10.2", () => {
    const [a, b, c] = DEFAULT_RECIPE.lines;
    expect(a.enter).toEqual({ from: "top", distance: 140, ease: "outExpo", frames: 14, delay: 0, fade: true });
    expect(b.enter).toEqual({ from: "top", distance: 100, ease: "outExpo", frames: 14, delay: 5, fade: true });
    expect(c.enter).toEqual({ from: "left", distance: 160, ease: "outCubic", frames: 16, delay: 10, fade: true });
    expect([a.font, b.font, c.font]).toEqual(["A", "B", "C"]);
    expect(DEFAULT_RECIPE.lines.map((l) => l.exit)).toEqual([
      { to: "top", ease: "inCubic", frames: 10, delay: 2 },
      { to: "top", ease: "inCubic", frames: 10, delay: 2 },
      { to: "left", ease: "inCubic", frames: 10, delay: 2 },
    ]);
    expect(DEFAULT_RECIPE.lines.every((l) => l.motionBlur)).toBe(true);
    expect(DEFAULT_RECIPE.anticipationFrames).toBe(3);
    expect(DEFAULT_RECIPE.exitOrder).toBe("reverse");
    expect(DEFAULT_RECIPE.settle).toEqual({ overshoot: 0.03, frames: 6 });
  });
});

describe("mergeRecipe", () => {
  it("merges field by field and lines by index", () => {
    const merged = mergeRecipe(DEFAULT_RECIPE, { lines: [{}, { enter: { delay: 7 } }], settle: { frames: 9 } });
    expect(merged.lines[0]).toEqual(DEFAULT_RECIPE.lines[0]);
    expect(merged.lines[1].enter).toEqual({ ...DEFAULT_RECIPE.lines[1].enter, delay: 7 });
    expect(merged.lines[2]).toEqual(DEFAULT_RECIPE.lines[2]);
    expect(merged.settle).toEqual({ overshoot: 0.03, frames: 9 });
  });

  it("applies overrides in order and ignores undefined", () => {
    const merged = mergeRecipe(
      DEFAULT_RECIPE,
      { exitOrder: "forward", lines: [{ enter: { distance: "offscreen" } }] },
      { exitOrder: undefined, lines: [{ motionBlur: false }] },
    );
    expect(merged.exitOrder).toBe("forward");
    expect(merged.lines[0].enter.distance).toBe("offscreen");
    expect(merged.lines[0].motionBlur).toBe(false);
  });

  it("does not mutate the base", () => {
    const snapshot = structuredClone(DEFAULT_RECIPE);
    mergeRecipe(DEFAULT_RECIPE, { lines: [{ enter: { frames: 99 } }], settle: { overshoot: 1 } });
    expect(DEFAULT_RECIPE).toEqual(snapshot);
  });
});

describe("resolveRecipe", () => {
  it("style beats default", () => {
    const resolved = resolveRecipe(STYLES.bold);
    expect(resolved.lines[0].enter.ease).toBe("outBack");
    expect(resolved.lines[1].enter.ease).toBe("outExpo");
    expect(resolved.settle.overshoot).toBe(0.07);
  });

  it("override beats style", () => {
    const resolved = resolveRecipe(STYLES.bold, { lines: [{ enter: { ease: "pop" } }], settle: { overshoot: 0.05 } });
    expect(resolved.lines[0].enter.ease).toBe("pop");
    expect(resolved.settle.overshoot).toBe(0.05);
  });

  it("applies the duration multiplier and keeps 30 fps units", () => {
    const resolved = resolveRecipe(STYLES.cinematic);
    expect(resolved.lines.map((l) => l.enter.frames)).toEqual([20, 20, 22]);
    expect(resolved.lines.map((l) => l.enter.delay)).toEqual([0, 7, 14]);
    expect(resolved.lines.map((l) => l.exit.frames)).toEqual([14, 14, 14]);
    expect(resolved.lines.map((l) => l.exit.delay)).toEqual([3, 3, 3]);
    expect(resolved.anticipationFrames).toBe(3);
    expect(resolved.settle.frames).toBe(6);
  });

  it("multiplies override frames too", () => {
    const resolved = resolveRecipe(STYLES.neon, { lines: [{ enter: { frames: 20 } }] });
    expect(resolved.lines[0].enter.frames).toBe(17);
    expect(resolved.lines[1].enter.frames).toBe(12);
  });

  it("attaches style and slot typography", () => {
    const resolved = resolveRecipe(STYLES.minimal);
    expect(resolved.style).toBe(STYLES.minimal);
    expect(resolved.slotTypography).toEqual(STYLES.minimal.slots);
  });
});

const slot = (
  family: SlotTypography["family"],
  weight: number,
  sizeU: number,
  uppercase: boolean,
  trackingEm: number,
  color: string,
): SlotTypography => ({ family, weight, sizeU, uppercase, trackingEm, color });

const WHITE_90 = "rgba(255, 255, 255, 0.9)";

const EXPECTED: Record<StyleName, Omit<StyleTokens, "recipe" | "name">> = {
  minimal: {
    slots: {
      A: slot("Inter", 600, 112, false, -0.02, "#FFFFFF"),
      B: slot("Inter", 300, 64, false, 0.01, WHITE_90),
      C: slot("Inter", 500, 44, true, 0.18, "#8AB4FF"),
    },
    durationMultiplier: 1,
    emphasis: { pop: false, accentColor: "#8AB4FF", underline: true, glowPulse: false },
    effects: { scrim: true, shadow: true, depthLayer: false, glow: false, glitch: false, grain: false },
  },
  neon: {
    slots: {
      A: slot("Space Grotesk", 700, 120, true, 0, "#00E5FF"),
      B: slot("Space Grotesk", 500, 64, false, 0, "#FFFFFF"),
      C: slot("JetBrains Mono", 500, 40, true, 0.12, "#FF2BD6"),
    },
    durationMultiplier: 0.85,
    emphasis: { pop: true, accentColor: "#00E5FF", underline: false, glowPulse: true },
    effects: { scrim: false, shadow: true, depthLayer: false, glow: true, glitch: true, grain: false },
  },
  bold: {
    slots: {
      A: slot("Anton", 400, 150, true, 0, "#FFD60A"),
      B: slot("Montserrat", 800, 72, true, 0, "#FFFFFF"),
      C: slot("Poppins", 600, 46, false, 0, WHITE_90),
    },
    durationMultiplier: 1,
    emphasis: { pop: true, accentColor: "#FFD60A", underline: false, glowPulse: false },
    effects: { scrim: false, shadow: true, depthLayer: true, glow: false, glitch: false, grain: false },
  },
  cinematic: {
    slots: {
      A: slot("Playfair Display", 700, 112, false, 0, "#F5E6C8"),
      B: slot("Montserrat", 300, 56, true, 0.3, "rgba(255, 255, 255, 0.85)"),
      C: slot("Montserrat", 300, 36, true, 0.4, "#D4AF37"),
    },
    durationMultiplier: 1.4,
    emphasis: { pop: false, accentColor: "#D4AF37", underline: true, glowPulse: false },
    effects: { scrim: true, shadow: true, depthLayer: false, glow: false, glitch: false, grain: true },
  },
};

describe("style tokens", () => {
  it.each(Object.keys(EXPECTED) as StyleName[])("%s matches the SPEC 12 table", (name) => {
    const { recipe: _recipe, name: styleName, ...tokens } = STYLES[name];
    expect(styleName).toBe(name);
    expect(tokens).toEqual(EXPECTED[name]);
  });

  it("carries per-style recipe overrides", () => {
    const eases = (name: StyleName) => resolveRecipe(STYLES[name]).lines.map((l) => l.enter.ease);
    expect(eases("minimal")).toEqual(["soft", "soft", "outCubic"]);
    expect(eases("neon")).toEqual(["snappy", "snappy", "outExpo"]);
    expect(eases("bold")).toEqual(["outBack", "outExpo", "outCubic"]);
    expect(eases("cinematic")).toEqual(["soft", "soft", "outCubic"]);
    expect(resolveRecipe(STYLES.minimal).settle.overshoot).toBe(0.02);
    expect(resolveRecipe(STYLES.neon).settle.overshoot).toBe(0.03);
    expect(resolveRecipe(STYLES.cinematic).settle.overshoot).toBe(0.015);
  });
});

describe("getStyle", () => {
  it("returns known styles without a warning", () => {
    expect(getStyle("neon")).toEqual({ style: STYLES.neon, warning: null });
  });

  it("falls back to bold with a warning", () => {
    const { style, warning } = getStyle("vaporwave");
    expect(style).toBe(STYLES.bold);
    expect(warning).toContain("vaporwave");
    expect(getStyle("toString").style).toBe(STYLES.bold);
  });
});
