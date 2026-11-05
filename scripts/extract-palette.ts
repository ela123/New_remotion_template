import { writeFileSync } from "node:fs";
import { config } from "../src/intro.config";
import { handleNoArgs } from "./lib/cli";
import { run } from "./lib/ffmpeg";
import { extractPalette } from "./lib/palette";
import { fromRoot, requireVideo } from "./lib/paths";
import { probeVideo } from "./lib/probe";

const WIDTH = 64;
const HEIGHT = 36;
const OUTPUT = "src/palette.json";
const USAGE = `Usage: npm run palette

Grabs the middle frame of public/${config.video} and writes ${OUTPUT}
(dominant, accent, dark, light). Use it with  palette: { enabled: true }  in src/intro.config.ts.

  -h, --help   show this help`;

async function grabFrame(input: string, atSec: number): Promise<Uint8Array> {
  const frame = await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-ss", atSec.toFixed(3),
    "-i", input,
    "-frames:v", "1",
    "-vf", `scale=${WIDTH}:${HEIGHT}:flags=area`,
    "-pix_fmt", "rgb24",
    "-c:v", "rawvideo",
    "-f", "image2pipe",
    "pipe:1",
  ]);
  const expected = WIDTH * HEIGHT * 3;
  if (frame.length < expected) {
    throw new Error(`expected ${expected} bytes of RGB data at ${atSec.toFixed(2)} s, got ${frame.length}`);
  }
  return new Uint8Array(frame.subarray(0, expected));
}

async function main(): Promise<void> {
  if (handleNoArgs("palette", USAGE, process.argv.slice(2)) === "done") return;
  const input = requireVideo(config.video);
  const info = await probeVideo(input);
  const palette = extractPalette(await grabFrame(input, info.durationSec / 2));

  writeFileSync(fromRoot(OUTPUT), `${JSON.stringify(palette, null, 2)}\n`);

  console.log(`\nWrote ${OUTPUT}:`);
  for (const [name, hex] of Object.entries(palette)) console.log(`  ${name.padEnd(9)} ${hex}`);
  if (!config.palette.enabled) {
    console.log("\nTo use it, set  palette: { enabled: true }  in src/intro.config.ts");
  }
}

main().catch((error: unknown) => {
  console.error(`\nnpm run palette failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
