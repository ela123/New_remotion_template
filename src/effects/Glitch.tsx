import type React from "react";
import { random } from "remotion";
import type { Quality } from "../types";

export const GLITCH_FRAMES_30 = 3;

const SPLIT = [
  { color: "#FF1F5A", sign: -1 },
  { color: "#00F0FF", sign: 1 },
] as const;

export function glitchJitter(seed: string, unit: number, intensity: number): number {
  return (random(`${seed}-jitter`) - 0.5) * 14 * unit * intensity;
}

function band(seed: string): string {
  const top = random(`${seed}-top`) * 55;
  const height = 22 + random(`${seed}-h`) * 40;
  return `inset(${top.toFixed(1)}% 0 ${Math.max(0, 100 - top - height).toFixed(1)}% 0)`;
}

export const Glitch: React.FC<{ seed: string; unit: number; intensity: number; quality: Quality; children: React.ReactNode }> = ({
  seed,
  unit,
  intensity,
  quality,
  children,
}) => {
  if (quality === "preview") return null;
  return (
    <>
      {SPLIT.map(({ color, sign }) => {
        const key = `${seed}-${color}`;
        const dx = sign * (4 + random(`${key}-x`) * 8) * unit * intensity;
        return (
          <div
            key={color}
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              color,
              transform: `translate(${dx}px, 0)`,
              clipPath: random(`${key}-full`) < 0.5 ? undefined : band(key),
              mixBlendMode: "screen",
              opacity: 0.9,
              textShadow: "none",
            }}
          >
            {children}
          </div>
        );
      })}
    </>
  );
};
