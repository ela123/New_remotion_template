import { describe, expect, it } from "vitest";
import {
  extrusionCss,
  extrusionDepth,
  glowCss,
  glowStrength,
  joinShadows,
  shadowCss,
  withAlpha,
} from "../src/effects/shadows";

describe("extrusion", () => {
  it("scales its depth with the font size and points down-right", () => {
    const big = extrusionDepth(150);
    const small = extrusionDepth(50);
    expect(big.y).toBeGreaterThan(big.x);
    expect(big.x).toBeGreaterThan(0);
    expect(Math.hypot(big.x, big.y)).toBeCloseTo(3 * Math.hypot(small.x, small.y), 6);
  });

  it("stacks hard, unblurred steps in a darker tone of the text colour", () => {
    const css = extrusionCss("#FFD60A", 150, "final");
    const steps = css.split("), ");
    expect(steps.length).toBe(7);
    expect(css).not.toMatch(/blur/);
    expect(css).toContain("0 rgb(66, 56, 3)");
    expect(extrusionCss("#FFD60A", 150, "preview").split(", rgb").length).toBe(1);
  });

  it("caps the number of steps at large sizes", () => {
    expect(extrusionCss("#FFFFFF", 2000, "final").split("), ").length).toBe(14);
  });
});

describe("shadowCss", () => {
  it("is a single soft shadow in preview and a three-layer stack in final", () => {
    expect(shadowCss(1, "preview")).toBe("0px 2px 12px rgba(0, 0, 0, 0.45)");
    expect(shadowCss(1, "final").split("rgba").length - 1).toBe(3);
  });

  it("sits below an extrusion when lifted", () => {
    expect(shadowCss(1, "preview", { x: 2, y: 6 })).toBe("2px 8px 12px rgba(0, 0, 0, 0.45)");
  });
});

describe("glow", () => {
  it("only glows saturated colours", () => {
    expect(glowStrength("#FFFFFF")).toBe(0);
    expect(glowStrength("rgba(255, 255, 255, 0.9)")).toBe(0);
    expect(glowStrength("#00E5FF")).toBe(1);
    expect(glowCss("#FFFFFF", 1, "final")).toBeNull();
  });

  it("scales the halo with intensity", () => {
    expect(glowCss("#00E5FF", 1, "preview", 2)).toBe("0 0 8px rgba(0, 229, 255, 0.9)");
    expect(glowCss("#00E5FF", 1, "final")?.split("rgba").length).toBe(4);
  });

  it("joins only the present shadows", () => {
    expect(joinShadows(null, "a", undefined, "b")).toBe("a, b");
    expect(joinShadows(null)).toBeUndefined();
    expect(withAlpha("#102030", 0.5)).toBe("rgba(16, 32, 48, 0.5)");
  });
});
