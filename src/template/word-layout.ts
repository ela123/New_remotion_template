import { measureText } from "@remotion/layout-utils";
import { fontFamilyCss } from "../styles/fonts";
import type {
  ChunkData,
  EntranceType,
  FontFamily,
  StyleTokens,
  WordData,
  WordRole,
} from "../types";

export type PlacedWord = {
  text: string;
  start: number; // in seconds
  end: number;   // in seconds
  role: WordRole;
  effect: string;
  color: string;
  fontFamily: FontFamily;
  fontWeight: number;
  fontStyle: "normal" | "italic";
  fontSize: number;
  trackingEm: number;
  uppercase: boolean;
  opacity: number;
  entrance: EntranceType;
  width: number;
  height: number;
  spaceWidth: number;
  x: number;
  y: number;
  lineIndex: number;
  wordIndexInLine: number;
  globalIndex: number;
};

export type PlacedLine = {
  words: PlacedWord[];
  width: number;
  height: number;
  y: number;
  lineIndex: number;
};

export type ChunkLayout = {
  chunk: ChunkData;
  startFrame: number;
  endFrame: number;
  lines: PlacedLine[];
  bounds: { x: number; y: number; width: number; height: number };
  scale: number;
};

const HERO_ENTRANCES: EntranceType[] = ["scale-pop", "letter-stagger", "rotate-in", "mask-reveal"];
const ACCENT_ENTRANCES: EntranceType[] = ["slide-up", "blur-in", "tracking-collapse", "mask-reveal"];
const NORMAL_ENTRANCES: EntranceType[] = ["mask-reveal", "slide-left", "slide-right", "slide-down", "blur-in"];
const CONNECTOR_ENTRANCES: EntranceType[] = ["typewriter", "slice-reveal", "slide-up"];

export function pickVariedEntrance(role: WordRole, index: number, prevEntrance?: EntranceType): EntranceType {
  const pool =
    role === "hero"
      ? HERO_ENTRANCES
      : role === "accent"
        ? ACCENT_ENTRANCES
        : role === "connector"
          ? CONNECTOR_ENTRANCES
          : NORMAL_ENTRANCES;

  let chosen = pool[index % pool.length] ?? "mask-reveal";
  if (chosen === prevEntrance) {
    chosen = pool[(index + 1) % pool.length] ?? "slide-up";
  }
  return chosen;
}

export type LayoutOptions = {
  safeMargin?: number;
  offsetY?: number;
  unit: number;
  fps: number;
  baseFontSizeU?: number;
};

const DEFAULT_ROLE_TYPOGRAPHY: Record<WordRole, { family: FontFamily; weight: number; scale: number; uppercase: boolean; trackingEm: number; color: string; opacity?: number; fontStyle?: "normal" | "italic" }> = {
  hero: { family: "Anton", weight: 700, scale: 2.0, uppercase: true, trackingEm: 0.02, color: "#FFE600" },
  accent: { family: "Montserrat", weight: 700, scale: 1.35, uppercase: true, trackingEm: 0.04, color: "#FFFFFF" },
  normal: { family: "Inter", weight: 500, scale: 1.0, uppercase: false, trackingEm: 0, color: "#FFFFFF" },
  connector: { family: "Inter", weight: 300, scale: 0.65, uppercase: false, trackingEm: 0.15, color: "#94A3B8", opacity: 0.8 },
};

export function computeChunkLayout(
  chunk: ChunkData,
  style: StyleTokens,
  frameSize: { width: number; height: number },
  options: LayoutOptions,
): ChunkLayout {
  const { unit, fps } = options;
  const safeMargin = options.safeMargin ?? 0.08;
  const offsetY = options.offsetY ?? 0;
  const baseFontSize = (options.baseFontSizeU ?? 54) * unit;

  type MeasuredRawWord = {
    word: WordData;
    role: WordRole;
    fontFamily: FontFamily;
    fontWeight: number;
    fontStyle: "normal" | "italic";
    fontSize: number;
    trackingEm: number;
    uppercase: boolean;
    color: string;
    opacity: number;
    entrance: EntranceType;
    effect: string;
    width: number;
    height: number;
    spaceWidth: number;
    lineIndex: number;
    wordIndexInLine: number;
    globalIndex: number;
  };

  const rawLines: MeasuredRawWord[][] = [];
  let prevEntrance: EntranceType | undefined;
  let globalWordIndex = 0;

  for (let l = 0; l < chunk.lines.length; l++) {
    const line = chunk.lines[l];
    if (!line) continue;
    const measuredWordsInLine: MeasuredRawWord[] = [];

    for (let w = 0; w < line.words.length; w++) {
      const word = line.words[w];
      if (!word) continue;
      const role: WordRole = word.role ?? "normal";
      const typo = style.roles?.[role] ?? DEFAULT_ROLE_TYPOGRAPHY[role];

      const scaleMult = (typo.scale ?? 1.0) * (word.scale ?? 1.0);
      const fontSize = Math.round(baseFontSize * scaleMult);
      const uppercase = typo.uppercase;
      const family: FontFamily = (word.fontKey as FontFamily) ?? typo.family;
      const weight = typo.weight;
      const fontStyle = typo.fontStyle ?? "normal";
      const trackingEm = typo.trackingEm;
      const color = word.color ?? typo.color;
      const opacity = typo.opacity ?? 1;

      const entrance: EntranceType = (word.entrance as EntranceType) ?? pickVariedEntrance(role, globalWordIndex, prevEntrance);
      prevEntrance = entrance;

      const effect = word.effect ?? (role === "hero" ? "highlight-wipe" : role === "accent" ? "underline-draw" : "none");

      const text = uppercase ? word.text.toUpperCase() : word.text;
      const fontCss = fontFamilyCss(family);

      const wordMeas = measureText({
        text,
        fontFamily: fontCss,
        fontWeight: weight,
        fontSize,
        letterSpacing: `${trackingEm}em`,
      });

      const spaceMeas = measureText({
        text: " ",
        fontFamily: fontCss,
        fontWeight: weight,
        fontSize,
        letterSpacing: `${trackingEm}em`,
      });

      const trackingPx = trackingEm * fontSize;
      const cleanWidth = Math.max(1, wordMeas.width - (text.length > 0 ? trackingPx : 0));
      const wordHeight = Math.max(1, fontSize * 1.25);

      measuredWordsInLine.push({
        word,
        role,
        fontFamily: family,
        fontWeight: weight,
        fontStyle,
        fontSize,
        trackingEm,
        uppercase,
        color,
        opacity,
        entrance,
        effect,
        width: cleanWidth,
        height: wordHeight,
        spaceWidth: Math.max(8 * unit, spaceMeas.width),
        lineIndex: l,
        wordIndexInLine: w,
        globalIndex: globalWordIndex++,
      });
    }

    rawLines.push(measuredWordsInLine);
  }

  // Calculate unscaled line widths and heights
  const unscaledLineWidths = rawLines.map((lineWords) => {
    let w = 0;
    lineWords.forEach((mw, i) => {
      w += mw.width;
      if (i < lineWords.length - 1) w += mw.spaceWidth;
    });
    return w;
  });

  const unscaledLineHeights = rawLines.map((lineWords) => {
    return Math.max(...lineWords.map((mw) => mw.height), 20 * unit);
  });

  const lineGap = 16 * unit;
  const unscaledTotalHeight =
    unscaledLineHeights.reduce((sum, h) => sum + h, 0) + Math.max(0, rawLines.length - 1) * lineGap;
  const unscaledMaxWidth = Math.max(0, ...unscaledLineWidths);

  // Check safe margin overflow and compute auto-shrink factor
  const safeWidth = frameSize.width * (1 - 2 * safeMargin);
  const safeHeight = frameSize.height * (1 - 2 * safeMargin);

  let shrink = 1.0;
  if (unscaledMaxWidth > safeWidth || unscaledTotalHeight > safeHeight) {
    const shrinkW = safeWidth / Math.max(1, unscaledMaxWidth);
    const shrinkH = safeHeight / Math.max(1, unscaledTotalHeight);
    shrink = Math.min(shrinkW, shrinkH) * 0.96;
  }

  // Apply shrink to all measurements
  const scaledLineHeights = unscaledLineHeights.map((h) => h * shrink);
  const scaledLineGap = lineGap * shrink;
  const scaledTotalHeight =
    scaledLineHeights.reduce((sum, h) => sum + h, 0) + Math.max(0, rawLines.length - 1) * scaledLineGap;

  const scaledLineWidths: number[] = [];
  rawLines.forEach((lineWords) => {
    let lw = 0;
    lineWords.forEach((mw, i) => {
      mw.fontSize *= shrink;
      mw.width *= shrink;
      mw.height *= shrink;
      mw.spaceWidth *= shrink;
      lw += mw.width;
      if (i < lineWords.length - 1) lw += mw.spaceWidth;
    });
    scaledLineWidths.push(lw);
  });

  const scaledMaxWidth = Math.max(0, ...scaledLineWidths);

  // Position block centered horizontally AND vertically
  const centerX = frameSize.width / 2;
  const centerY = frameSize.height / 2 + offsetY;
  const blockTop = centerY - scaledTotalHeight / 2;

  let currentLineY = blockTop;
  const placedLines: PlacedLine[] = [];

  for (let l = 0; l < rawLines.length; l++) {
    const lineWords = rawLines[l] ?? [];
    const lineWidth = scaledLineWidths[l] ?? 0;
    const lineHeight = scaledLineHeights[l] ?? 0;
    const lineStartX = centerX - lineWidth / 2; // Center aligned line

    let currentWordX = lineStartX;
    const placedWords: PlacedWord[] = [];

    for (let w = 0; w < lineWords.length; w++) {
      const mw = lineWords[w];
      if (!mw) continue;

      const wordY = currentLineY + (lineHeight - mw.height) / 2;

      placedWords.push({
        text: mw.word.text,
        start: mw.word.start,
        end: mw.word.end,
        role: mw.role,
        effect: mw.effect,
        color: mw.color,
        fontFamily: mw.fontFamily,
        fontWeight: mw.fontWeight,
        fontStyle: mw.fontStyle,
        fontSize: mw.fontSize,
        trackingEm: mw.trackingEm,
        uppercase: mw.uppercase,
        opacity: mw.opacity,
        entrance: mw.entrance,
        width: mw.width,
        height: mw.height,
        spaceWidth: mw.spaceWidth,
        x: Math.round(currentWordX),
        y: Math.round(wordY),
        lineIndex: l,
        wordIndexInLine: w,
        globalIndex: mw.globalIndex,
      });

      currentWordX += mw.width + mw.spaceWidth;
    }

    placedLines.push({
      words: placedWords,
      width: lineWidth,
      height: lineHeight,
      y: currentLineY,
      lineIndex: l,
    });

    currentLineY += lineHeight + scaledLineGap;
  }

  const startFrame = Math.round(chunk.start * fps);
  const endFrame = Math.round(chunk.end * fps);

  return {
    chunk,
    startFrame,
    endFrame,
    lines: placedLines,
    bounds: {
      x: Math.round(centerX - scaledMaxWidth / 2),
      y: Math.round(blockTop),
      width: Math.round(scaledMaxWidth),
      height: Math.round(scaledTotalHeight),
    },
    scale: shrink,
  };
}
