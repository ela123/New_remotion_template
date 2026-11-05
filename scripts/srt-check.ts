import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseMedia } from "@remotion/media-parser";
import { nodeReader } from "@remotion/media-parser/node";
import { config } from "../src/intro.config";
import { checkCues } from "../src/srt/check";
import { parseSrt } from "../src/srt/parse";
import { wantsHelp } from "./lib/cli";

const USAGE = `Usage: npm run srt:check -- [file.srt]

Checks captions and prints warnings (overlaps, too short/long, too many lines,
lines over 28 chars, cues after the video ends, reading speed over 20 chars/s,
unbalanced *emphasis* markers). Warnings never fail the command; a file with
no valid cues exits with code 1.

  [file.srt]   SRT to check (default: public/${config.srt}, from config.srt in src/intro.config.ts)
  -h, --help   show this help`;

async function readVideoDurationMs(videoPath: string): Promise<number | null> {
  if (!existsSync(videoPath)) return null;
  try {
    const { slowDurationInSeconds } = await parseMedia({
      src: videoPath,
      reader: nodeReader,
      fields: { slowDurationInSeconds: true },
      acknowledgeRemotionLicense: true,
    });
    return slowDurationInSeconds * 1000;
  } catch (error) {
    console.warn(`Could not read video duration from ${videoPath}: ${(error as Error).message}`);
    return null;
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (wantsHelp(argv)) {
    console.log(USAGE);
    return;
  }
  const unknownFlag = argv.find((arg) => arg.startsWith("-"));
  if (unknownFlag) {
    console.error(`srt:check: unknown option ${unknownFlag}. Run "npm run srt:check -- --help" for usage.`);
    process.exit(1);
  }
  const srtPath = argv[0] ?? path.join("public", config.srt);
  if (!existsSync(srtPath)) {
    console.error(`srt:check: SRT file not found: ${path.resolve(srtPath)}`);
    console.error(`Put your captions at public/${config.srt} (see config.srt in src/intro.config.ts) or pass a path: npm run srt:check -- <file.srt>`);
    process.exit(1);
  }

  const { cues, warnings: parseWarnings } = parseSrt(readFileSync(srtPath, "utf8"), { offsetMs: config.srtOffsetMs });
  const videoPath = path.join("public", config.video);
  const videoDurationMs = await readVideoDurationMs(videoPath);
  const checkWarnings = checkCues(cues, videoDurationMs === null ? {} : { videoDurationMs });
  const warnings = [...parseWarnings, ...checkWarnings];

  console.log(`Checked ${srtPath}: ${cues.length} cues${config.srtOffsetMs !== 0 ? ` (offset ${config.srtOffsetMs} ms)` : ""}`);
  if (cues.length === 0) process.exitCode = 1;
  if (videoDurationMs === null) console.log(`Video ${videoPath} not readable; skipped the beyond-video check.`);
  if (warnings.length > 0) {
    console.log(`${warnings.length} warning(s):`);
    for (const warning of warnings) console.log(`  [${warning.code}] ${warning.message}`);
  } else if (cues.length > 0) {
    console.log("No warnings.");
  }
  if (cues.length === 0) console.error("No valid captions: Studio shows an error and renders fail until you fix the file.");
}

main().catch((error: unknown) => {
  console.error(`srt:check failed unexpectedly: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
