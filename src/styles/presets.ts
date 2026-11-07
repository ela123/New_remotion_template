import type { RoleTypography, StyleGraphics, StyleTokens } from "../types";
import { bold } from "./bold";
import { cinematic } from "./cinematic";
import { minimal } from "./minimal";
import { neon } from "./neon";

export const CLEAN_MINIMAL_ROLES: Record<string, RoleTypography> = {
  hero: { family: "Inter", weight: 800, scale: 1.85, uppercase: false, trackingEm: -0.03, color: "#FFFFFF" },
  accent: { family: "Inter", weight: 600, scale: 1.35, uppercase: false, trackingEm: -0.01, color: "#38BDF8" },
  normal: { family: "Inter", weight: 500, scale: 1.0, uppercase: false, trackingEm: 0, color: "#F8FAFC" },
  connector: { family: "Inter", weight: 400, scale: 0.7, uppercase: false, trackingEm: 0.1, color: "#94A3B8", opacity: 0.85 },
};

export const CLEAN_MINIMAL_GRAPHICS: StyleGraphics = {
  brackets: true,
  accentLines: true,
  rings: true,
  glowBlob: true,
  sweep: true,
  particles: true,
  maxParticles: 16,
  vignette: true,
  glassBackdrop: true,
  audioBars: true,
  shockwaves: true,
  cornerDots: true,
};

export const NEON_TECHY_ROLES: Record<string, RoleTypography> = {
  hero: { family: "Space Grotesk", weight: 700, scale: 2.05, uppercase: true, trackingEm: 0.04, color: "#00F0FF" },
  accent: { family: "JetBrains Mono", weight: 700, scale: 1.4, uppercase: true, trackingEm: 0.08, color: "#FF007F" },
  normal: { family: "Space Grotesk", weight: 600, scale: 1.0, uppercase: false, trackingEm: 0.01, color: "#FFFFFF" },
  connector: { family: "JetBrains Mono", weight: 500, scale: 0.7, uppercase: true, trackingEm: 0.16, color: "#A78BFA", opacity: 0.85 },
};

export const NEON_TECHY_GRAPHICS: StyleGraphics = {
  brackets: true,
  accentLines: true,
  rings: true,
  glowBlob: true,
  sweep: true,
  particles: true,
  maxParticles: 32,
  vignette: true,
  glassBackdrop: true,
  audioBars: true,
  shockwaves: true,
  cornerDots: true,
};

export const BOLD_ENERGETIC_ROLES: Record<string, RoleTypography> = {
  hero: { family: "Anton", weight: 400, scale: 2.2, uppercase: true, trackingEm: 0.02, color: "#FFE600" },
  accent: { family: "Montserrat", weight: 800, scale: 1.4, uppercase: true, trackingEm: 0.04, color: "#FFFFFF" },
  normal: { family: "Poppins", weight: 600, scale: 1.0, uppercase: false, trackingEm: 0.01, color: "#FFFFFF" },
  connector: { family: "Poppins", weight: 500, scale: 0.72, uppercase: false, trackingEm: 0.08, color: "#CBD5E1", opacity: 0.85 },
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
  glassBackdrop: true,
  audioBars: true,
  shockwaves: true,
  cornerDots: true,
};

export const CINEMATIC_ELEGANT_ROLES: Record<string, RoleTypography> = {
  hero: { family: "Playfair Display", weight: 700, scale: 2.0, uppercase: false, fontStyle: "italic", trackingEm: 0.01, color: "#F5E6C8" },
  accent: { family: "Montserrat", weight: 500, scale: 1.3, uppercase: true, trackingEm: 0.2, color: "#E5C07B" },
  normal: { family: "Playfair Display", weight: 400, scale: 1.0, uppercase: false, trackingEm: 0.02, color: "#FAF8F5" },
  connector: { family: "Montserrat", weight: 300, scale: 0.68, uppercase: false, trackingEm: 0.22, color: "#C7B9A5", opacity: 0.85 },
};

export const CINEMATIC_ELEGANT_GRAPHICS: StyleGraphics = {
  brackets: true,
  accentLines: true,
  rings: true,
  glowBlob: true,
  sweep: true,
  particles: true,
  maxParticles: 20,
  vignette: true,
  glassBackdrop: true,
  audioBars: false,
  shockwaves: true,
  cornerDots: true,
};

export const PRESET_THEMES: Record<string, StyleTokens> = {
  "clean-minimal": {
    ...minimal,
    name: "minimal",
    emphasis: { pop: true, accentColor: "#38BDF8", underline: true, glowPulse: false },
    roles: CLEAN_MINIMAL_ROLES,
    graphics: CLEAN_MINIMAL_GRAPHICS,
  },
  "neon-techy": {
    ...neon,
    name: "neon",
    emphasis: { pop: true, accentColor: "#00F0FF", underline: false, glowPulse: true },
    roles: NEON_TECHY_ROLES,
    graphics: NEON_TECHY_GRAPHICS,
  },
  "bold-energetic": {
    ...bold,
    name: "bold",
    emphasis: { pop: true, accentColor: "#FFE600", underline: false, glowPulse: true },
    roles: BOLD_ENERGETIC_ROLES,
    graphics: BOLD_ENERGETIC_GRAPHICS,
  },
  "cinematic-elegant": {
    ...cinematic,
    name: "cinematic",
    emphasis: { pop: false, accentColor: "#E5C07B", underline: true, glowPulse: false },
    roles: CINEMATIC_ELEGANT_ROLES,
    graphics: CINEMATIC_ELEGANT_GRAPHICS,
  },
  minimal: {
    ...minimal,
    name: "minimal",
    roles: CLEAN_MINIMAL_ROLES,
    graphics: CLEAN_MINIMAL_GRAPHICS,
  },
  neon: {
    ...neon,
    name: "neon",
    roles: NEON_TECHY_ROLES,
    graphics: NEON_TECHY_GRAPHICS,
  },
  bold: {
    ...bold,
    name: "bold",
    roles: BOLD_ENERGETIC_ROLES,
    graphics: BOLD_ENERGETIC_GRAPHICS,
  },
  cinematic: {
    ...cinematic,
    name: "cinematic",
    roles: CINEMATIC_ELEGANT_ROLES,
    graphics: CINEMATIC_ELEGANT_GRAPHICS,
  },
};
