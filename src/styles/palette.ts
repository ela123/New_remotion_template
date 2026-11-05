import type { Palette, SlotTypography, StyleTokens } from "../types";

const BACKGROUND = "#111111";
const MIN_CONTRAST = 4.5;

export type Rgb = [number, number, number];

export function parseColor(color: string): Rgb | null {
  const hex = color.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [0, 1, 2].map((i) => parseInt(hex.charAt(i).repeat(2), 16)) as Rgb;
  }
  if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) {
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color.trim());
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return 1;
  const la = luminance(ca);
  const lb = luminance(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function darken(color: string, amount: number): string {
  const rgb = parseColor(color) ?? [255, 255, 255];
  const k = 1 - Math.min(1, Math.max(0, amount));
  const [r, g, b] = rgb.map((c) => Math.round(c * k));
  return `rgb(${r}, ${g}, ${b})`;
}

export function saturation(color: string): number {
  const rgb = parseColor(color);
  if (!rgb) return 0;
  const max = Math.max(...rgb);
  return max === 0 ? 0 : (max - Math.min(...rgb)) / max;
}

function sameColor(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function applyPalette(style: StyleTokens, palette: Palette | null): StyleTokens {
  if (!palette || contrastRatio(palette.accent, BACKGROUND) < MIN_CONTRAST) return style;
  const previous = style.emphasis.accentColor;
  const recolor = (slot: SlotTypography): SlotTypography =>
    sameColor(slot.color, previous) ? { ...slot, color: palette.accent } : slot;
  const slots = { A: recolor(style.slots.A), B: recolor(style.slots.B), C: recolor(style.slots.C) };
  return { ...style, slots, emphasis: { ...style.emphasis, accentColor: palette.accent } };
}
