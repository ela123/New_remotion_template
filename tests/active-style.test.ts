import { describe, expect, it } from "vitest";
import { STYLES } from "../src/styles";
import { resolveActiveStyle, resolveEffects } from "../src/template/active-style";
import { MAX_LISTED_WARNINGS, studioWarnings } from "../src/template/studio-warnings";
import { referenceUnit } from "../src/template/units";
import type { IntroConfig } from "../src/types";

type EffectSettings = Pick<IntroConfig, "effects" | "motionBlur" | "drift">;

const settings = (effects: Partial<IntroConfig["effects"]> = {}, drift = false): EffectSettings => ({
  effects: { scrim: true, shadow: true, depthLayer: "auto", glow: "auto", glitch: "auto", grain: "auto", ...effects },
  motionBlur: { enabled: true },
  drift,
});

describe("referenceUnit", () => {
  it.each([
    [1920, 1080, 1],
    [3840, 2160, 2],
    [1280, 720, 2 / 3],
    [1080, 1920, 1],
    [2160, 3840, 2],
    [1080, 1080, 1],
  ])("%ix%i -> %d", (width, height, unit) => {
    expect(referenceUnit(width, height)).toBeCloseTo(unit, 9);
  });

  it("matches the old width / 1920 scale for every 16:9 frame", () => {
    for (const height of [360, 720, 1080, 1440, 2160]) expect(referenceUnit((height * 16) / 9, height)).toBeCloseTo(((height * 16) / 9) / 1920, 9);
  });
});

describe("resolveEffects", () => {
  it("follows the style defaults for auto flags", () => {
    expect(resolveEffects(STYLES.bold, "final", settings())).toEqual({
      scrim: true, shadow: true, depthLayer: true, glow: false, glitch: false, grain: false, motionBlur: true, drift: false,
    });
    expect(resolveEffects(STYLES.neon, "final", settings())).toMatchObject({ glow: true, glitch: true, depthLayer: false });
    expect(resolveEffects(STYLES.cinematic, "final", settings())).toMatchObject({ grain: true, glitch: false });
  });

  it("drops motion blur, glitch, grain and drift in preview", () => {
    for (const style of Object.values(STYLES)) {
      expect(resolveEffects(style, "preview", settings({}, true))).toMatchObject({ motionBlur: false, glitch: false, grain: false, drift: false });
    }
  });

  it("keeps glitch and grain to their own style even when forced on", () => {
    const forced = settings({ glitch: true, grain: true });
    expect(resolveEffects(STYLES.bold, "final", forced)).toMatchObject({ glitch: false, grain: false });
    expect(resolveEffects(STYLES.neon, "final", forced)).toMatchObject({ glitch: true, grain: false });
  });

  it("lets explicit flags override the style", () => {
    expect(resolveEffects(STYLES.bold, "final", settings({ depthLayer: false, glow: true }))).toMatchObject({ depthLayer: false, glow: true });
  });
});

describe("resolveActiveStyle", () => {
  it("falls back to bold with a warning and applies config recipe overrides", () => {
    const active = resolveActiveStyle({ style: "comic" as IntroConfig["style"], palette: { enabled: false }, recipe: { anticipationFrames: 5 } });
    expect(active.style.name).toBe("bold");
    expect(active.warning).toContain("comic");
    expect(active.recipe.anticipationFrames).toBe(5);
  });
});

describe("studioWarnings", () => {
  it("is hidden while rendering and when there is nothing to show", () => {
    expect(studioWarnings(["x"], { isRendering: true })).toBeNull();
    expect(studioWarnings([], { isRendering: false })).toBeNull();
  });

  it("lists the first warnings and counts the rest", () => {
    const warnings = Array.from({ length: MAX_LISTED_WARNINGS + 2 }, (_, i) => `w${i}`);
    expect(studioWarnings(warnings, { isRendering: false })).toEqual({
      count: MAX_LISTED_WARNINGS + 2,
      listed: warnings.slice(0, MAX_LISTED_WARNINGS),
      hidden: 2,
    });
    expect(studioWarnings(["only"], { isRendering: false })).toEqual({ count: 1, listed: ["only"], hidden: 0 });
  });
});
