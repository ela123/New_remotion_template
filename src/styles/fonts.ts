import { fontFamily as antonFamily, loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { fontFamily as interFamily, loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { fontFamily as jetBrainsFamily, loadFont as loadJetBrainsMono } from "@remotion/google-fonts/JetBrainsMono";
import { fontFamily as montserratFamily, loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { fontFamily as playfairFamily, loadFont as loadPlayfairDisplay } from "@remotion/google-fonts/PlayfairDisplay";
import { fontFamily as poppinsFamily, loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import { fontFamily as spaceGroteskFamily, loadFont as loadSpaceGrotesk } from "@remotion/google-fonts/SpaceGrotesk";
import type { FontFamily, StyleTokens } from "../types";

type Loaded = { fontFamily: string; waitUntilDone: () => Promise<unknown> };
type Loader<W extends string> = (style: "normal", options: { weights: W[]; subsets: "latin"[] }) => Loaded;
type FamilyLoader = (weights: number[]) => Loaded;

function familyLoader<W extends string>(load: Loader<W>): FamilyLoader {
  return (weights) => load("normal", { weights: weights.map((w) => String(w) as W), subsets: ["latin"] });
}

const SANS = `"Helvetica Neue", Arial, sans-serif`;

const FAMILIES: Record<FontFamily, { name: string; fallback: string; load: FamilyLoader }> = {
  Inter: { name: interFamily, fallback: SANS, load: familyLoader(loadInter) },
  "Space Grotesk": { name: spaceGroteskFamily, fallback: SANS, load: familyLoader(loadSpaceGrotesk) },
  "JetBrains Mono": {
    name: jetBrainsFamily,
    fallback: `"SFMono-Regular", Menlo, Consolas, monospace`,
    load: familyLoader(loadJetBrainsMono),
  },
  Anton: { name: antonFamily, fallback: `Impact, "Arial Narrow", sans-serif`, load: familyLoader(loadAnton) },
  Montserrat: { name: montserratFamily, fallback: SANS, load: familyLoader(loadMontserrat) },
  Poppins: { name: poppinsFamily, fallback: SANS, load: familyLoader(loadPoppins) },
  "Playfair Display": {
    name: playfairFamily,
    fallback: `Georgia, "Times New Roman", serif`,
    load: familyLoader(loadPlayfairDisplay),
  },
};

function styleFontWeights(style: StyleTokens): Map<FontFamily, number[]> {
  const byFamily = new Map<FontFamily, number[]>();
  const add = (family: FontFamily, weight: number) => {
    const weights = byFamily.get(family) ?? [];
    if (!weights.includes(weight)) weights.push(weight);
    byFamily.set(family, weights);
  };
  if (style.slots) {
    for (const slot of Object.values(style.slots)) {
      add(slot.family, slot.weight);
    }
  }
  if (style.roles) {
    for (const role of Object.values(style.roles)) {
      add(role.family, role.weight);
    }
  }
  return byFamily;
}

export async function loadStyleFonts(style: StyleTokens): Promise<void> {
  const loads = [...styleFontWeights(style)].map(([family, weights]) => FAMILIES[family].load(weights));
  await Promise.all(loads.map((loaded) => loaded.waitUntilDone()));
}

export function fontFamilyCss(family: FontFamily): string {
  const info = FAMILIES[family];
  if (!info) return SANS;
  return `"${info.name}", ${info.fallback}`;
}
