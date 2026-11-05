export const MAX_LISTED_WARNINGS = 5;

export type StudioWarnings = { count: number; listed: string[]; hidden: number };

export function studioWarnings(warnings: string[], env: { isRendering: boolean }): StudioWarnings | null {
  if (env.isRendering || warnings.length === 0) return null;
  const listed = warnings.slice(0, MAX_LISTED_WARNINGS);
  return { count: warnings.length, listed, hidden: warnings.length - listed.length };
}
