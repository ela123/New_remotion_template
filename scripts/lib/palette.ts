export type Rgb = { r: number; g: number; b: number };

export type ExtractedPalette = {
  dominant: string;
  accent: string;
  dark: string;
  light: string;
};

type Bin = { count: number; r: number; g: number; b: number };

const BITS = 4;
const MIN_SHARE = 0.01;

function quantize(pixels: Uint8Array): Bin[] {
  const shift = 8 - BITS;
  const bins = new Map<number, Bin>();
  for (let i = 0; i + 2 < pixels.length; i += 3) {
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    const key = ((r >> shift) << (2 * BITS)) | ((g >> shift) << BITS) | (b >> shift);
    const bin = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bin.count += 1;
    bin.r += r;
    bin.g += g;
    bin.b += b;
    bins.set(key, bin);
  }
  return [...bins.values()].sort((a, b) => b.count - a.count);
}

function average(bin: Bin): Rgb {
  return {
    r: Math.round(bin.r / bin.count),
    g: Math.round(bin.g / bin.count),
    b: Math.round(bin.b / bin.count),
  };
}

function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function vividness({ r, g, b }: Rgb): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : ((max - min) / max) * (max / 255);
}

function pick(colors: Rgb[], score: (c: Rgb) => number): Rgb {
  let best = colors[0] ?? { r: 128, g: 128, b: 128 };
  for (const color of colors) if (score(color) > score(best)) best = color;
  return best;
}

function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

export function extractPalette(pixels: Uint8Array): ExtractedPalette {
  const bins = quantize(pixels);
  const total = pixels.length / 3;
  const frequent = bins.filter((bin) => bin.count / total >= MIN_SHARE).map(average);
  const candidates = frequent.length > 0 ? frequent : bins.slice(0, 1).map(average);
  const dominant = candidates[0] ?? { r: 128, g: 128, b: 128 };

  return {
    dominant: toHex(dominant),
    accent: toHex(pick(candidates, vividness)),
    dark: toHex(pick(candidates, (c) => -luminance(c))),
    light: toHex(pick(candidates, luminance)),
  };
}
