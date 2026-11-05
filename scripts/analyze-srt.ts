import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { config } from "../src/intro.config";
import { ANNOTATED_CUES_FILE, getAnalyzer } from "../src/srt/analyze";
import { parseSrt } from "../src/srt/parse";
import { wantsHelp } from "./lib/cli";

const OUTPUT_PATH = path.join("public", ANNOTATED_CUES_FILE);
const USAGE = `Usage: npm run analyze -- [--provider markers|llm]

Annotates public/${config.srt} and writes ${OUTPUT_PATH} (used when cueSource is "json").

  --provider <name>  markers: emphasis from *markers* in the SRT (default, or LLM_PROVIDER from .env)
                     llm: not implemented yet
  -h, --help         show this help`;

type Provider = "markers" | "llm";

function isProvider(value: string | undefined): value is Provider {
  return value === "markers" || value === "llm";
}

function fail(message: string): never {
  console.error(`analyze: ${message}`);
  console.error('Run "npm run analyze -- --help" for usage.');
  process.exit(1);
}

function readProviderFlag(argv: string[]): string | undefined {
  let provider: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg.startsWith("--provider=")) provider = arg.slice("--provider=".length);
    else if (arg === "--provider") provider = argv[++i] ?? fail("Missing value for --provider.");
    else fail(`Unknown argument ${arg}.`);
  }
  return provider;
}

function readProvider(argv: string[]): Provider {
  const requested = readProviderFlag(argv) ?? (process.env.LLM_PROVIDER || "markers");
  if (!isProvider(requested)) fail(`Unknown provider "${requested}". Use "markers" or "llm".`);
  return requested;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (wantsHelp(argv)) {
    console.log(USAGE);
    return;
  }
  dotenv.config({ quiet: true });
  const provider = readProvider(argv);
  const srtPath = path.join("public", config.srt);
  if (!existsSync(srtPath)) {
    fail(`SRT file not found: ${path.resolve(srtPath)}. Put your captions there or change config.srt in src/intro.config.ts.`);
  }

  const { cues, warnings } = parseSrt(readFileSync(srtPath, "utf8"), { offsetMs: config.srtOffsetMs });
  for (const warning of warnings) console.warn(`[${warning.code}] ${warning.message}`);

  try {
    const annotated = await getAnalyzer(provider).analyze(cues);
    writeFileSync(OUTPUT_PATH, `${JSON.stringify(annotated, null, 2)}\n`, "utf8");
    console.log(`Wrote ${annotated.length} annotated cues to ${OUTPUT_PATH} using the "${provider}" provider.`);
    console.log(`Set cueSource: "json" in src/intro.config.ts to render from this file.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`analyze: ${message}. Use --provider markers (emphasis from *markers* in the SRT) for now.`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(`analyze failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
