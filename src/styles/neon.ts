import type { StyleTokens } from "../types";

export const neon: StyleTokens = {
  name: "neon",
  slots: {
    A: { family: "Space Grotesk", weight: 700, sizeU: 120, uppercase: true, trackingEm: 0, color: "#00E5FF" },
    B: { family: "Space Grotesk", weight: 500, sizeU: 64, uppercase: false, trackingEm: 0, color: "#FFFFFF" },
    C: { family: "JetBrains Mono", weight: 500, sizeU: 40, uppercase: true, trackingEm: 0.12, color: "#FF2BD6" },
  },
  recipe: {
    lines: [{ enter: { ease: "snappy" } }, { enter: { ease: "snappy" } }, { enter: { ease: "outExpo" } }],
  },
  durationMultiplier: 0.85,
  emphasis: { pop: true, accentColor: "#00E5FF", underline: false, glowPulse: true },
  effects: { scrim: false, shadow: true, depthLayer: false, glow: true, glitch: true, grain: false },
};
