import type { RoleTypography, StyleGraphics, StyleTokens } from "../types";
import { bold } from "./bold";
import { cinematic } from "./cinematic";
import { minimal } from "./minimal";
import { neon } from "./neon";

export const CLEAN_MINIMAL_ROLES: Record<string, RoleTypography> = {
  hero: { family: "Inter", weight: 800, scale: 1.85, uppercase: false, trackingEm: -0.02, color: "#FFFFFF" },
  accent: { family: "Inter", weight: 600, scale: 1.3, uppercase: false, trackingEm: 0, color: "#38BDF8" },
  normal: { family: "Inter", weight: 400, scale: 1.0, uppercase: false, trackingEm: 0, color: "#F1F5F9" },
  connector: { family: "Inter", weight: 300, scale: 0.65, uppercase: false, trackingEm: 0.14, color: "#94A3B8", opacity: 0.8 },
};

export const CLEAN_MINIMAL_GRAPHICS: StyleGraphics = {
  brackets: true,
  accentLines: true,
  rings: true,
  glowBlob: true,
  sweep: false,
  particles: true,
  maxParticles: 12,
  vignette: true,
};

export const NEON_TECHY_ROLES: Record<string, RoleTypography> = {
  hero: { family: "Space Grotesk", weight: 700, scale: 2.0, uppercase: true, trackingEm: 0.02, color: "#00E5FF" },
  accent: { family: "JetBrains Mono", weight: 700, scale: 1.35, uppercase: true, trackingEm: 0.08, color: "#FF007F" },
  normal: { family: "Space Grotesk", weight: 500, scale: 1.0, uppercase: false, trackingEm: 0, color: "#FFFFFF" },
  connector: { family: "JetBrains Mono", weight: 400, scale: 0.65, uppercase: false, trackingEm: 0.15, color: "#A78BFA", opacity: 0.85 },
};

export const NEON_TECHY_GRAPHICS: StyleGraphics = {
  brackets: true,
  accentLines: true,
  rings: true,
  glowBlob: true,
  sweep: true,
  particles: true,
  maxParticles: 28,
  vignette: true,
};

export const BOLD_ENERGETIC_ROLES: Record<string, RoleTypography> = {
  hero: { family: "Anton", weight: 400, scale: 2.2, uppercase: true, trackingEm: 0.02, color: "#FFE600" },
  accent: { family: "Montserrat", weight: 800, scale: 1.4, uppercase: true, trackingEm: 0.03, color: "#FFFFFF" },
  normal: { family: "Poppins", weight: 600, scale: 1.0, uppercase: false, trackingEm: 0, color: "#FFFFFF" },
  connector: { family: "Poppins", weight: 400, scale: 0.65, uppercase: false, trackingEm: 0.1, color: "#CBD5E1", opacity: 0.85 },
};

export const BOLD_ENERGETIC_GRAPHICS: StyleGraphics = {
  brackets: true,
  accentLines: true,
  rings: true,
  glowBlob: true,
  sweep: true,
  particles: true,
  maxParticles: 35,
  vignette: true,
};

export const CINEMATIC_ELEGANT_ROLES: Record<string, RoleTypography> = {
  hero: { family: "Playfair Display", weight: 700, scale: 1.95, uppercase: false, fontStyle: "italic", trackingEm: 0.01, color: "#E5C07B" },
  accent: { family: "Montserrat", weight: 500, scale: 1.3, uppercase: true, trackingEm: 0.18, color: "#F5E6C8" },
  normal: { family: "Playfair Display", weight: 400, scale: 1.0, uppercase: false, trackingEm: 0.02, color: "#FAF8F5" },
  connector: { family: "Montserrat", weight: 300, scale: 0.65, uppercase: false, trackingEm: 0.22, color: "#C7B9A5", opacity: 0.8 },
};

export const CINEMATIC_ELEGANT_GRAPHICS: StyleGraphics = {
  brackets: true,
  accentLines: true,
  rings: true,
  glowBlob: true,
  sweep: true,
  particles: true,
  maxParticles: 18,
  vignette: true,
};

export const PRESET_THEMES: Record<string, StyleTokens> = {
  "clean-minimal": {
    ...minimal,
    roles: CLEAN_MINIMAL_ROLES,
    graphics: CLEAN_MINIMAL_GRAPHICS,
  },
  "neon-techy": {
    ...neon,
    roles: NEON_TECHY_ROLES,
    graphics: NEON_TECHY_GRAPHICS,
  },
  "bold-energetic": {
    ...bold,
    roles: BOLD_ENERGETIC_ROLES,
    graphics: BOLD_ENERGETIC_GRAPHICS,
  },
  "cinematic-elegant": {
    ...cinematic,
    roles: CINEMATIC_ELEGANT_ROLES,
    graphics: CINEMATIC_ELEGANT_GRAPHICS,
  },
  minimal: {
    ...minimal,
    roles: CLEAN_MINIMAL_ROLES,
    graphics: CLEAN_MINIMAL_GRAPHICS,
  },
  neon: {
    ...neon,
    roles: NEON_TECHY_ROLES,
    graphics: NEON_TECHY_GRAPHICS,
  },
  bold: {
    ...bold,
    roles: BOLD_ENERGETIC_ROLES,
    graphics: BOLD_ENERGETIC_GRAPHICS,
  },
  cinematic: {
    ...cinematic,
    roles: CINEMATIC_ELEGANT_ROLES,
    graphics: CINEMATIC_ELEGANT_GRAPHICS,
  },
};
