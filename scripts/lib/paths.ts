import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function publicRelative(file: string): string {
  return join("public", file);
}

export function fromRoot(relativePath: string): string {
  return join(projectRoot, relativePath);
}

export function requireVideo(file: string): string {
  const relativePath = publicRelative(file);
  if (!existsSync(fromRoot(relativePath))) {
    console.error(`Video not found: ${relativePath}`);
    console.error(`Put your video at ${relativePath} (or change "video" in src/intro.config.ts).`);
    process.exit(1);
  }
  return relativePath;
}
