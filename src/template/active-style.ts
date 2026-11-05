import { config } from "../intro.config";
import palette from "../palette.json";
import { getStyle } from "../styles";
import { applyPalette } from "../styles/palette";
import type { AutoFlag, IntroConfig, Quality, ResolvedRecipe, StyleTokens } from "../types";
import { resolveRecipe } from "./recipe";

export type ActiveEffects = {
  scrim: boolean;
  shadow: boolean;
  depthLayer: boolean;
  glow: boolean;
  glitch: boolean;
  grain: boolean;
  motionBlur: boolean;
  drift: boolean;
};

export type ActiveStyle = { style: StyleTokens; recipe: ResolvedRecipe; warning: string | null };

type EffectSettings = Pick<IntroConfig, "effects" | "motionBlur" | "drift">;

const pick = (flag: AutoFlag, styleDefault: boolean): boolean => (flag === "auto" ? styleDefault : flag);

const isNeon = (name: string): boolean => name === "neon" || name === "neon-techy";
const isCinematic = (name: string): boolean => name === "cinematic" || name === "cinematic-elegant";

export function resolveEffects(style: StyleTokens, quality: Quality, settings: EffectSettings = config): ActiveEffects {
  const fx = settings.effects;
  const final = quality === "final";
  return {
    scrim: fx.scrim,
    shadow: fx.shadow,
    depthLayer: pick(fx.depthLayer, style.effects.depthLayer),
    glow: pick(fx.glow, style.effects.glow),
    glitch: final && isNeon(style.name) && pick(fx.glitch, style.effects.glitch),
    grain: final && isCinematic(style.name) && pick(fx.grain, style.effects.grain),
    motionBlur: final && settings.motionBlur.enabled,
    drift: final && settings.drift,
  };
}

export function resolveActiveStyle(settings: Pick<IntroConfig, "style" | "palette" | "recipe"> = config): ActiveStyle {
  const { style: base, warning } = getStyle(settings.style);
  const style = settings.palette.enabled ? applyPalette(base, palette) : base;
  return { style, recipe: resolveRecipe(style, settings.recipe), warning };
}
