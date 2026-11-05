import { darken, parseColor, saturation } from "../styles/palette";
import type { Quality } from "../types";

export const SHADOW_REACH_U = 48;
const EXTRUSION = { depthEm: 0.045, maxSteps: 14, darken: 0.74, dx: 0.34, dy: 1 } as const;

const px = (v: number): string => `${Math.round(v * 100) / 100}px`;

export function withAlpha(color: string, alpha: number): string {
  const rgb = parseColor(color) ?? [255, 255, 255];
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.round(alpha * 1000) / 1000})`;
}

export function extrusionDepth(fontSize: number): { x: number; y: number } {
  const depth = fontSize * EXTRUSION.depthEm;
  const norm = Math.hypot(EXTRUSION.dx, EXTRUSION.dy);
  return { x: (depth * EXTRUSION.dx) / norm, y: (depth * EXTRUSION.dy) / norm };
}

export function extrusionCss(color: string, fontSize: number, quality: Quality): string {
  const { x, y } = extrusionDepth(fontSize);
  const tone = darken(color, EXTRUSION.darken);
  const steps = quality === "preview" ? 1 : Math.max(1, Math.min(EXTRUSION.maxSteps, Math.ceil(Math.hypot(x, y))));
  return Array.from({ length: steps }, (_, i) => {
    const f = (i + 1) / steps;
    return `${px(x * f)} ${px(y * f)} 0 ${tone}`;
  }).join(", ");
}

export function shadowCss(unit: number, quality: Quality, lift: { x: number; y: number } = { x: 0, y: 0 }): string {
  const at = (x: number, y: number, blur: number, alpha: number): string =>
    `${px(lift.x + x * unit)} ${px(lift.y + y * unit)} ${px(blur * unit)} rgba(0, 0, 0, ${alpha})`;
  if (quality === "preview") return at(0, 2, 12, 0.45);
  return [at(0, 1, 1.5, 0.32), at(0, 3, 10, 0.34), at(0, 8, 30, 0.2)].join(", ");
}

export function glowStrength(color: string): number {
  const s = saturation(color);
  return s < 0.35 ? 0 : Math.min(1, s);
}

export function glowCss(color: string, unit: number, quality: Quality, intensity = 1): string | null {
  const k = glowStrength(color) * intensity;
  if (k <= 0) return null;
  const core = `0 0 ${px(4 * unit * k)} ${withAlpha(color, 0.9)}`;
  if (quality === "preview") return core;
  return [core, `0 0 ${px(14 * unit * k)} ${withAlpha(color, 0.55)}`, `0 0 ${px(36 * unit * k)} ${withAlpha(color, 0.3)}`].join(", ");
}

export function joinShadows(...shadows: (string | null | undefined)[]): string | undefined {
  const present = shadows.filter((s): s is string => Boolean(s));
  return present.length > 0 ? present.join(", ") : undefined;
}
