import type { StyleTokens } from "../types";

export const cinematic: StyleTokens = {
  name: "cinematic",
  slots: {
    A: { family: "Playfair Display", weight: 700, sizeU: 112, uppercase: false, trackingEm: 0, color: "#F5E6C8" },
    B: { family: "Montserrat", weight: 300, sizeU: 56, uppercase: true, trackingEm: 0.3, color: "rgba(255, 255, 255, 0.85)" },
    C: { family: "Montserrat", weight: 300, sizeU: 36, uppercase: true, trackingEm: 0.4, color: "#D4AF37" },
  },
  recipe: {
    lines: [
      { enter: { ease: "soft", distance: 48, scaleFrom: 1.04 } },
      { enter: { ease: "soft", distance: 36 } },
      { enter: { ease: "outCubic", distance: 64 } },
    ],
    settle: { overshoot: 0.015 },
  },
  durationMultiplier: 1.4,
  emphasis: { pop: false, accentColor: "#D4AF37", underline: true, glowPulse: false },
  effects: { scrim: true, shadow: true, depthLayer: false, glow: false, glitch: false, grain: true },
};
