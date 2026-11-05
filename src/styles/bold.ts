import type { StyleTokens } from "../types";

export const bold: StyleTokens = {
  name: "bold",
  slots: {
    A: { family: "Anton", weight: 400, sizeU: 150, uppercase: true, trackingEm: 0, color: "#FFD60A" },
    B: { family: "Montserrat", weight: 800, sizeU: 72, uppercase: true, trackingEm: 0, color: "#FFFFFF" },
    C: { family: "Poppins", weight: 600, sizeU: 46, uppercase: false, trackingEm: 0, color: "rgba(255, 255, 255, 0.9)" },
  },
  recipe: {
    lines: [{ enter: { ease: "outBack" } }],
    settle: { overshoot: 0.07 },
  },
  durationMultiplier: 1,
  emphasis: { pop: true, accentColor: "#FFD60A", underline: false, glowPulse: false },
  effects: { scrim: false, shadow: true, depthLayer: true, glow: false, glitch: false, grain: false },
};
