import type { StyleName, StylePreset, StyleTokens } from "../types";
import { bold } from "./bold";
import { cinematic } from "./cinematic";
import { minimal } from "./minimal";
import { neon } from "./neon";
import { PRESET_THEMES } from "./presets";

export const STYLES: Record<StyleName, StyleTokens> = { minimal, neon, bold, cinematic };

export function getStyle(name: string): { style: StyleTokens; warning: string | null } {
  // Check legacy styles first (exact equality – tests assert against these objects)
  if (Object.hasOwn(STYLES, name)) {
    return { style: STYLES[name as StyleName], warning: null };
  }
  // Check enriched preset themes (new preset names: clean-minimal, neon-techy, etc.)
  if (Object.hasOwn(PRESET_THEMES, name)) {
    return { style: PRESET_THEMES[name]!, warning: null };
  }
  // Fallback
  return { style: STYLES.bold, warning: `Unknown style "${name}"; falling back to "bold".` };
}
