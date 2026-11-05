import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { remotionCliPath } from "../../scripts/lib/remotion";
import { projectRoot } from "../../scripts/lib/paths";

export type Result = { code: number; out: string };

const TSX = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");

function exec(args: string[], timeout = 240_000): Result {
  const res = spawnSync(process.execPath, args, { cwd: projectRoot, encoding: "utf8", timeout });
  return { code: res.status ?? -1, out: `${res.stdout ?? ""}${res.stderr ?? ""}` };
}

export const script = (file: string, args: string[] = []): Result => exec([TSX, path.join("scripts", file), ...args]);

export function remotion(args: string[]): Result {
  const cli = remotionCliPath();
  if (!cli) throw new Error("Remotion CLI not found");
  return exec([cli, ...args]);
}

export function workspace(): { dir: string; publicDir: (name: string) => string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), "intro-e2e-"));
  return {
    dir,
    publicDir: (name) => {
      const target = path.join(dir, name);
      mkdirSync(target, { recursive: true });
      return target;
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

export function makeClip(out: string, args: string[]): void {
  const res = script("make-sample.ts", ["--out", out, "--force", ...args]);
  if (res.code !== 0) throw new Error(`sample failed:\n${res.out}`);
}

export const SRT = "1\n00:00:00,100 --> 00:00:01,400\nHello\nto the *studio*\nsmall line here\n";

export function populate(dir: string, clip: string | null, srt: string | null): string {
  if (clip) copyFileSync(clip, path.join(dir, "intro.mp4"));
  if (srt !== null) writeFileSync(path.join(dir, "captions.srt"), srt);
  return dir;
}

export function compositionLine(out: string, id: string): string {
  return out.split("\n").find((line) => line.startsWith(id)) ?? "";
}

export function probe(file: string): string {
  return remotion(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate,duration", "-of", "compact=p=0", file]).out;
}
