import { splitInlineValues, wantsHelp } from "./cli";
import { parseRate } from "./probe";

export type SampleArgs = {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  out: string;
  audio: boolean;
  force: boolean;
  concurrency: number | null;
};

export type ParseOutcome = { kind: "help" } | { kind: "ok"; args: SampleArgs } | { kind: "error"; message: string };

export const SAMPLE_DEFAULTS: SampleArgs = {
  width: 1920,
  height: 1080,
  fps: 30,
  durationSec: 14,
  out: "public/intro.mp4",
  audio: true,
  force: false,
  concurrency: null,
};

const MAX_SIDE = 7680;
const MAX_DURATION_SEC = 120;

type Setter = (args: SampleArgs, value: string) => string | null;

function positiveInt(name: string, max: number, assign: (args: SampleArgs, n: number) => void): Setter {
  return (args, value) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0 || n > max) return `${name} must be a whole number between 1 and ${max}, got "${value}".`;
    assign(args, n);
    return null;
  };
}

const VALUE_FLAGS: Record<string, Setter> = {
  "--width": positiveInt("--width", MAX_SIDE, (a, n) => (a.width = n)),
  "--height": positiveInt("--height", MAX_SIDE, (a, n) => (a.height = n)),
  "--concurrency": positiveInt("--concurrency", 64, (a, n) => (a.concurrency = n)),
  "--fps": (args, value) => {
    const fps = parseRate(value);
    if (!Number.isFinite(fps) || fps < 1 || fps > 120) return `--fps must be between 1 and 120 (e.g. 30, 29.97, 30000/1001), got "${value}".`;
    args.fps = fps;
    return null;
  },
  "--duration": (args, value) => {
    const sec = Number(value);
    if (!Number.isFinite(sec) || sec <= 0 || sec > MAX_DURATION_SEC) return `--duration must be seconds between 0 and ${MAX_DURATION_SEC}, got "${value}".`;
    args.durationSec = sec;
    return null;
  },
  "--out": (args, value) => {
    if (!value.toLowerCase().endsWith(".mp4")) return `--out must be an .mp4 file, got "${value}".`;
    args.out = value;
    return null;
  },
};

const BOOLEAN_FLAGS: Record<string, (args: SampleArgs) => void> = {
  "--no-audio": (args) => (args.audio = false),
  "--force": (args) => (args.force = true),
};

export function parseSampleArgs(argv: string[]): ParseOutcome {
  if (wantsHelp(argv)) return { kind: "help" };
  const tokens = splitInlineValues(argv);
  const args: SampleArgs = { ...SAMPLE_DEFAULTS };
  for (let i = 0; i < tokens.length; i++) {
    const flag = tokens[i] ?? "";
    const toggle = BOOLEAN_FLAGS[flag];
    if (toggle) {
      toggle(args);
      continue;
    }
    const setter = VALUE_FLAGS[flag];
    if (!setter) return { kind: "error", message: `Unknown argument "${flag}".` };
    const value = tokens[++i];
    if (value === undefined || value.startsWith("--")) return { kind: "error", message: `Missing value for ${flag}.` };
    const problem = setter(args, value);
    if (problem) return { kind: "error", message: problem };
  }
  return { kind: "ok", args };
}

export function frameAlignedDuration(args: Pick<SampleArgs, "fps" | "durationSec">): number {
  return Math.max(1, Math.round(args.durationSec * args.fps)) / args.fps;
}
