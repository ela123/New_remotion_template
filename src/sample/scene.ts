import { random } from "remotion";

export type SampleProps = {
  width: number;
  height: number;
  fps: number;
  durationInSeconds: number;
};

export const DEFAULT_SAMPLE: SampleProps = { width: 1920, height: 1080, fps: 30, durationInSeconds: 14 };

export type Orb = {
  x: number;
  y: number;
  radius: number;
  depth: number;
  hue: number;
  opacity: number;
  phase: number;
};

const ORB_COUNT = 34;
const HUES = [32, 40, 24, 340, 195, 265] as const;

export function makeOrbs(seed: string): Orb[] {
  return Array.from({ length: ORB_COUNT }, (_, i) => {
    const r = (key: string) => random(`${seed}-${key}-${i}`);
    const depth = 0.25 + 0.75 * r("depth");
    return {
      x: r("x"),
      y: 0.15 + 0.85 * r("y"),
      radius: 0.02 + 0.09 * depth * r("radius") + 0.015,
      depth,
      hue: HUES[Math.floor(r("hue") * HUES.length)] ?? 32,
      opacity: 0.14 + 0.34 * r("opacity"),
      phase: r("phase") * Math.PI * 2,
    };
  });
}

export function orbPosition(orb: Orb, t: number): { x: number; y: number } {
  const drift = 0.018 + 0.05 * orb.depth;
  return {
    x: orb.x - drift * t + 0.012 * Math.sin(t * 0.35 + orb.phase),
    y: orb.y - 0.006 * t * orb.depth + 0.01 * Math.cos(t * 0.27 + orb.phase),
  };
}

export const wrap = (value: number, min: number, max: number): number => {
  const span = max - min;
  return ((((value - min) % span) + span) % span) + min;
};

export function isSampleProps(value: unknown): value is SampleProps {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return ["width", "height", "fps", "durationInSeconds"].every(
    (key) => typeof v[key] === "number" && Number.isFinite(v[key]) && (v[key] as number) > 0,
  );
}

export function fadeOpacity(frame: number, fps: number, durationInFrames: number): number {
  const last = Math.max(1, durationInFrames - 1);
  const fadeIn = Math.min(fps * 0.6, last / 3);
  const fadeOut = Math.min(fps * 0.8, last / 3);
  const rise = Math.min(1, Math.max(0, frame / fadeIn));
  const fall = Math.min(1, Math.max(0, (last - frame) / fadeOut));
  return Math.min(rise, fall);
}
