import { renameSync, rmSync } from "node:fs";
import { config } from "../src/intro.config";
import { handleNoArgs } from "./lib/cli";
import { run } from "./lib/ffmpeg";
import { isVariableFrameRate, nearestStandardRate } from "./lib/frame-rate";
import { fromRoot, publicRelative, requireVideo } from "./lib/paths";
import { probeVideo, type VideoInfo } from "./lib/probe";

const CFR_FILE = "intro.cfr.mp4";
const ENCODE_FLAGS = ["-hide_banner", "-loglevel", "error", "-stats", "-y"];
const USAGE = `Usage: npm run proxy

Writes public/${config.proxyVideo} (720p, same fps and duration) from public/${config.video}
for smooth Studio preview. If the video has a variable frame rate it first writes
public/${CFR_FILE} and tells you to switch config.video to it. Prints every ffmpeg command.

  -h, --help   show this help`;

function describeVideo(file: string, info: VideoInfo): void {
  console.log(`\n${file}`);
  console.log(`  size:     ${info.width}x${info.height}`);
  console.log(`  fps:      ${info.fps.toFixed(3)} (r_frame_rate ${info.rFrameRate}, avg_frame_rate ${info.avgFrameRate})`);
  console.log(`  duration: ${info.durationSec.toFixed(2)} s`);
  console.log(`  audio:    ${info.hasAudio ? "yes" : "no"}`);
}

function cfrArgs(input: string, output: string, rate: string, audioCodec: string[]): string[] {
  return [
    ...ENCODE_FLAGS,
    "-i", input,
    "-map", "0:v:0", "-map", "0:a:0?",
    "-fps_mode", "cfr", "-r", rate,
    "-c:v", "libx264", "-crf", "14", "-preset", "slow", "-pix_fmt", "yuv420p",
    ...audioCodec,
    "-movflags", "+faststart",
    output,
  ];
}

async function makeCfr(input: string, info: VideoInfo): Promise<string> {
  const rate = nearestStandardRate(info.fps);
  const output = publicRelative(CFR_FILE);
  console.warn(`\nWARNING: ${input} has a variable frame rate. Writing a constant ${rate.label} fps copy.`);
  await encodeAtomically(output, async (target) => {
    try {
      await run("ffmpeg", cfrArgs(input, target, rate.ffmpegRate, ["-c:a", "copy"]), { liveStderr: true });
    } catch {
      console.warn("Copying the audio failed, re-encoding it to AAC instead.");
      await run("ffmpeg", cfrArgs(input, target, rate.ffmpegRate, ["-c:a", "aac", "-b:a", "192k"]), { liveStderr: true });
    }
  });
  console.log(`\nWrote ${output}.`);
  return output;
}

async function encodeAtomically(output: string, encode: (target: string) => Promise<void>): Promise<void> {
  const partial = output.replace(/\.mp4$/i, ".partial.mp4");
  try {
    await encode(partial);
    renameSync(fromRoot(partial), fromRoot(output));
  } finally {
    rmSync(fromRoot(partial), { force: true });
  }
}

async function makeProxy(input: string, rate: string): Promise<string> {
  const output = publicRelative(config.proxyVideo);
  await encodeAtomically(output, (target) => run("ffmpeg", [
    ...ENCODE_FLAGS,
    "-i", input,
    "-map", "0:v:0", "-map", "0:a:0?",
    "-vf", "scale=-2:720",
    "-fps_mode", "cfr", "-r", rate,
    "-c:v", "libx264", "-crf", "23", "-preset", "veryfast", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    target,
  ], { liveStderr: true }).then(() => undefined));
  return output;
}

async function main(): Promise<void> {
  if (handleNoArgs("proxy", USAGE, process.argv.slice(2)) === "done") return;
  const input = requireVideo(config.video);
  const info = await probeVideo(input);
  describeVideo(input, info);

  let source = input;
  let rate = info.rFrameRate || info.avgFrameRate;
  if (isVariableFrameRate(info)) {
    rate = nearestStandardRate(info.fps).ffmpegRate;
    if (config.video === CFR_FILE) {
      console.warn(`\nWARNING: ${input} still looks variable frame rate; using it as is.`);
    } else {
      source = await makeCfr(input, info);
    }
  }

  const proxy = await makeProxy(source, rate);
  describeVideo(proxy, await probeVideo(proxy));
  console.log(`\nDone. Studio preview (npm run dev) now uses ${proxy}.`);
  if (source !== input) {
    console.log(`\nACTION NEEDED: in src/intro.config.ts set  video: "${CFR_FILE}"`);
  }
}

main().catch((error: unknown) => {
  console.error(`\nnpm run proxy failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
