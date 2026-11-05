import type { StyleTokens } from "../types";

export const minimal: StyleTokens = {
  name: "minimal",
  slots: {
    A: { family: "Inter", weight: 600, sizeU: 112, uppercase: false, trackingEm: -0.02, color: "#FFFFFF" },
    B: { family: "Inter", weight: 300, sizeU: 64, uppercase: false, trackingEm: 0.01, color: "rgba(255, 255, 255, 0.9)" },
    C: { family: "Inter", weight: 500, sizeU: 44, uppercase: true, trackingEm: 0.18, color: "#8AB4FF" },
  },
  recipe: {
    lines: [
      { enter: { ease: "soft", distance: 80 } },
      { enter: { ease: "soft", distance: 60 } },
      { enter: { ease: "outCubic", distance: 96 } },
    ],
    settle: { overshoot: 0.02 },
  },
  durationMultiplier: 1,
  emphasis: { pop: false, accentColor: "#8AB4FF", underline: true, glowPulse: false },
  effects: { scrim: true, shadow: true, depthLayer: false, glow: false, glitch: false, grain: false },
};
