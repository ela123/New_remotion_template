import { copyFileSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { config } from "../src/intro.config";
import { run } from "./lib/ffmpeg";
import { fromRoot } from "./lib/paths";
import { probeVideo } from "./lib/probe";
import { runRemotion } from "./lib/remotion";
import { frameAlignedDuration, parseSampleArgs, SAMPLE_DEFAULTS, type SampleArgs } from "./lib/sample-args";
import { encodeWav, synthPad } from "./lib/wav";

const SAMPLE_TAG = "remotion-intro-captioner sample footage";
const SAMPLE_RATE = 48000;
const FAST_GL = process.platform === "darwin" || process.platform === "win32" ? "angle" : "swangle";

const USAGE = `Usage: npm run sample -- [options]

Renders the SampleFootage composition (soft moving bokeh + a quiet pad tone)
to ${SAMPLE_DEFAULTS.out} so you can try the pipeline without your own video.

  --width <px>         default ${SAMPLE_DEFAULTS.width}
  --height <px>        default ${SAMPLE_DEFAULTS.height}
  --fps <rate>         default ${SAMPLE_DEFAULTS.fps} (29.97 or 30000/1001 also work)
  --duration <sec>     default ${SAMPLE_DEFAULTS.durationSec}
  --out <file.mp4>     default ${SAMPLE_DEFAULTS.out}
  --concurrency <n>    default render.concurrency from src/intro.config.ts
  --no-audio           leave out the tone track
  --force              overwrite an existing file that is not sample footage
  -h, --help           show this help`;

function fail(message: string): never {
  console.error(`sample: ${message}`);
  console.error('Run "npm run sample -- --help" for usage.');
  process.exit(1);
}

async function isSampleFile(file: string): Promise<boolean> {
  try {
    return (await probeVideo(file)).comment === SAMPLE_TAG;
  } catch {
    return false;
  }
}

async function guardOverwrite(out: string, force: boolean): Promise<void> {
  if (force || !existsSync(out) || (await isSampleFile(out))) return;
  fail(`${out} already exists and is not sample footage. Move it away or pass --force to overwrite it.`);
}

function renderArgs(args: SampleArgs, output: string): string[] {
  const props = { width: args.width, height: args.height, fps: args.fps, durationInSeconds: args.durationSec };
  return [
    "render", "src/sample/index.ts", "SampleFootage", output,
    `--props=${JSON.stringify(props)}`,
    "--codec=h264", "--crf=18",
    "--image-format=jpeg", "--jpeg-quality=95",
    "--scale=1",
    `--gl=${FAST_GL}`,
    `--concurrency=${args.concurrency ?? config.render.concurrency}`,
    "--log=error",
  ];
}

function muxArgs(video: string, wav: string | null, output: string): string[] {
  const audio = wav ? ["-i", wav, "-map", "0:v:0", "-map", "1:a:0", "-c:a", "aac", "-b:a", "192k"] : ["-map", "0:v:0"];
  return [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", video,
    ...audio,
    "-c:v", "copy",
    "-metadata", `comment=${SAMPLE_TAG}`,
    "-movflags", "+faststart",
    output,
  ];
}

async function build(args: SampleArgs, workDir: string, out: string): Promise<void> {
  const silent = path.join(workDir, "video.mp4");
  await runRemotion(renderArgs(args, silent));
  let wav: string | null = null;
  if (args.audio) {
    wav = path.join(workDir, "tone.wav");
    writeFileSync(wav, encodeWav(synthPad({ durationSec: frameAlignedDuration(args), sampleRate: SAMPLE_RATE }), SAMPLE_RATE));
  }
  const muxed = path.join(workDir, "muxed.mp4");
  await run("ffmpeg", muxArgs(silent, wav, muxed));
  mkdirSync(path.dirname(out), { recursive: true });
  renameOrCopy(muxed, out);
}

function renameOrCopy(from: string, to: string): void {
  try {
    renameSync(from, to);
  } catch {
    copyFileSync(from, to);
  }
}

function displayPath(file: string): string {
  const relative = path.relative(process.cwd(), file);
  return relative.startsWith("..") ? file : relative;
}

async function main(): Promise<void> {
  const parsed = parseSampleArgs(process.argv.slice(2));
  if (parsed.kind === "help") {
    console.log(USAGE);
    return;
  }
  if (parsed.kind === "error") fail(parsed.message);
  const { args } = parsed;
  const out = path.resolve(fromRoot("."), args.out);
  await guardOverwrite(out, args.force);

  const workDir = mkdtempSync(path.join(tmpdir(), "intro-sample-"));
  try {
    await build(args, workDir, out);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
  const info = await probeVideo(out);
  console.log(`\nWrote ${displayPath(out)}: ${info.width}x${info.height}, ${info.fps.toFixed(3)} fps, ${info.durationSec.toFixed(2)} s, audio: ${info.hasAudio ? "yes" : "no"}`);
}

main().catch((error: unknown) => {
  console.error(`\nnpm run sample failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
