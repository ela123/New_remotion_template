import type { DeepPartial, Enter, Exit, LineRecipe, Recipe, RecipeOverride, ResolvedRecipe, StyleTokens } from "../types";

function line(font: LineRecipe["font"], from: Enter["from"], distance: number, delay: number, ease: Enter["ease"], frames: number): LineRecipe {
  return {
    font,
    enter: { from, distance, ease, frames, delay, fade: true },
    exit: { to: from, ease: "inCubic", frames: 10, delay: 2 },
    motionBlur: true,
  };
}

export const DEFAULT_RECIPE: Recipe = {
  lines: [line("A", "top", 140, 0, "outExpo", 14), line("B", "top", 100, 5, "outExpo", 14), line("C", "left", 160, 10, "outCubic", 16)],
  anticipationFrames: 3,
  exitOrder: "reverse",
  settle: { overshoot: 0.03, frames: 6 },
};

function defined<T extends object>(value: T | undefined): Partial<T> {
  if (!value) return {};
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function mergeLine(base: LineRecipe, override: DeepPartial<LineRecipe> | undefined): LineRecipe {
  if (!override) return base;
  const { enter, exit, ...rest } = override;
  return {
    ...base,
    ...defined(rest),
    enter: { ...base.enter, ...defined<DeepPartial<Enter>>(enter) },
    exit: { ...base.exit, ...defined<DeepPartial<Exit>>(exit) },
  };
}

function mergeOne(base: Recipe, override: RecipeOverride): Recipe {
  const { lines, settle, ...rest } = override;
  return {
    ...base,
    ...defined(rest),
    lines: [mergeLine(base.lines[0], lines?.[0]), mergeLine(base.lines[1], lines?.[1]), mergeLine(base.lines[2], lines?.[2])],
    settle: { ...base.settle, ...defined(settle) },
  };
}

export function mergeRecipe(base: Recipe, ...overrides: RecipeOverride[]): Recipe {
  return overrides.reduce(mergeOne, base);
}

function scaleLine(lineRecipe: LineRecipe, multiplier: number): LineRecipe {
  const scale = (frames: number) => Math.round(frames * multiplier);
  return {
    ...lineRecipe,
    enter: { ...lineRecipe.enter, frames: scale(lineRecipe.enter.frames), delay: scale(lineRecipe.enter.delay) },
    exit: { ...lineRecipe.exit, frames: scale(lineRecipe.exit.frames), delay: scale(lineRecipe.exit.delay) },
  };
}

export function resolveRecipe(style: StyleTokens, override: RecipeOverride = {}): ResolvedRecipe {
  const merged = mergeRecipe(DEFAULT_RECIPE, style.recipe, override);
  const m = style.durationMultiplier;
  return {
    ...merged,
    lines: [scaleLine(merged.lines[0], m), scaleLine(merged.lines[1], m), scaleLine(merged.lines[2], m)],
    style,
    slotTypography: style.slots,
  };
}
