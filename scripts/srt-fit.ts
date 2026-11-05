import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_FIT_OPTIONS, fitCues, type FitOptions } from "../src/srt/fit";
import { parseSrt, serializeSrt } from "../src/srt/parse";
import { splitInlineValues, wantsHelp } from "./lib/cli";

const USAGE = `Usage: npm run srt:fit -- <input.srt> <output.srt> [options]

Re-chunks long or messy cues into display-ready captions and writes a new SRT.
Example: npm run srt:fit -- raw.srt public/captions.srt --max-words 6 --strategy balanced

Options (as "--flag value" or "--flag=value"):
  --max-lines <n>     max lines per chunk                        (default ${DEFAULT_FIT_OPTIONS.maxLines})
  --max-chars <n>     max characters per line, balanced only     (default ${DEFAULT_FIT_OPTIONS.maxChars})
  --max-words <n>     max words per chunk                        (default ${DEFAULT_FIT_OPTIONS.maxWords})
  --min-dur <sec>     min seconds per chunk                      (default ${DEFAULT_FIT_OPTIONS.minDur})
  --max-dur <sec>     max seconds per chunk                      (default ${DEFAULT_FIT_OPTIONS.maxDur})
  --cps <n>           target reading speed in chars/sec          (default ${DEFAULT_FIT_OPTIONS.cps})
  --strategy <name>   hook (word / phrase / text) or balanced    (default ${DEFAULT_FIT_OPTIONS.strategy})
  -h, --help          show this help`;

const NUMERIC_FLAGS = {
  "--max-lines": "maxLines",
  "--max-chars": "maxChars",
  "--max-words": "maxWords",
  "--min-dur": "minDur",
  "--max-dur": "maxDur",
  "--cps": "cps",
} as const satisfies Record<string, keyof FitOptions>;

type NumericFlag = keyof typeof NUMERIC_FLAGS;

const INTEGER_FLAGS: ReadonlySet<string> = new Set(["--max-lines", "--max-chars", "--max-words"]);

function fail(message: string): never {
  console.error(`srt:fit: ${message}`);
  console.error('Run "npm run srt:fit -- --help" for usage.');
  process.exit(1);
}

function isNumericFlag(flag: string): flag is NumericFlag {
  return Object.hasOwn(NUMERIC_FLAGS, flag);
}

function parseArgs(argv: string[]): { input: string; output: string; options: FitOptions } {
  const args = splitInlineValues(argv);
  const positional: string[] = [];
  const options: FitOptions = { ...DEFAULT_FIT_OPTIONS };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const value = args[++i];
    if (value === undefined || value.startsWith("--")) fail(`Missing value for ${arg}.`);
    if (arg === "--strategy") {
      if (value !== "hook" && value !== "balanced") fail(`--strategy must be "hook" or "balanced", got "${value}".`);
      options.strategy = value;
    } else if (isNumericFlag(arg)) {
      const number = Number(value);
      if (!Number.isFinite(number) || number <= 0) fail(`${arg} must be a positive number, got "${value}".`);
      if (INTEGER_FLAGS.has(arg) && !Number.isInteger(number)) fail(`${arg} must be a whole number, got "${value}".`);
      options[NUMERIC_FLAGS[arg]] = number;
    } else {
      fail(`Unknown option ${arg}.`);
    }
  }
  const [input, output] = positional;
  if (!input || !output) fail("Missing <input.srt> and/or <output.srt>.");
  if (positional.length > 2) fail(`Unexpected extra argument "${positional[2] ?? ""}".`);
  if (options.minDur > options.maxDur) fail(`--min-dur (${options.minDur}) must not exceed --max-dur (${options.maxDur})`);
  return { input, output, options };
}

function main(): void {
  const argv = process.argv.slice(2);
  if (wantsHelp(argv)) {
    console.log(USAGE);
    return;
  }
  const { input, output, options } = parseArgs(argv);
  if (!existsSync(input)) fail(`Input SRT not found: ${path.resolve(input)}`);
  if (path.resolve(input) === path.resolve(output)) fail("Output must be a different file from the input.");

  const parsed = parseSrt(readFileSync(input, "utf8"));
  if (parsed.cues.length === 0) {
    for (const warning of parsed.warnings) console.error(`  [${warning.code}] ${warning.message}`);
    fail(`${input} has no valid SRT cues; nothing written to ${output}.`);
  }
  const { cues, summary } = fitCues(parsed.cues, options);
  mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  writeFileSync(output, serializeSrt(cues), "utf8");

  const warnings = [...parsed.warnings, ...summary.warnings];
  console.log(`Wrote ${output} (strategy: ${options.strategy})`);
  console.log(`  input cues:      ${summary.inputCues}`);
  console.log(`  output chunks:   ${summary.outputChunks}`);
  console.log(`  avg chars/line:  ${summary.avgCharsPerLine}`);
  console.log(`  warnings:        ${warnings.length}`);
  for (const warning of warnings) console.log(`    [${warning.code}] ${warning.message}`);
}

try {
  main();
} catch (error) {
  console.error(`srt:fit failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
