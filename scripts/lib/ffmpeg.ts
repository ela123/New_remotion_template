import { spawn, spawnSync } from "node:child_process";
import { projectRoot } from "./paths";
import { remotionCliPath } from "./remotion";

export type Tool = "ffmpeg" | "ffprobe";

type ResolvedTool = {
  command: string;
  prefix: string[];
  display: string;
};

export type RunOptions = {
  liveStderr?: boolean;
};

const resolved = new Map<Tool, ResolvedTool>();

function works(command: string, args: string[]): boolean {
  const result = spawnSync(command, args, { stdio: "ignore", cwd: projectRoot });
  return result.error === undefined && result.status === 0;
}

function printInstallHelp(tool: Tool): never {
  console.error(`Could not find ${tool}.`);
  console.error("Neither a system install nor Remotion's bundled copy (npx remotion " + tool + ") works.");
  console.error("Run `npm i` first. If it still fails, install ffmpeg:");
  console.error("  macOS:   brew install ffmpeg");
  console.error("  Windows: winget install Gyan.FFmpeg   (then open a new terminal)");
  console.error("  Linux:   sudo apt install ffmpeg");
  process.exit(1);
}

function resolveTool(tool: Tool): ResolvedTool {
  const cached = resolved.get(tool);
  if (cached) return cached;

  let found: ResolvedTool | null = null;
  if (works(tool, ["-version"])) {
    found = { command: tool, prefix: [], display: tool };
  } else {
    const cli = remotionCliPath();
    if (cli && works(process.execPath, [cli, tool, "-version"])) {
      found = { command: process.execPath, prefix: [cli, tool], display: `npx remotion ${tool}` };
    }
  }
  if (!found) printInstallHelp(tool);
  resolved.set(tool, found);
  return found;
}

function quote(arg: string): string {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `"${arg.replace(/(["\\$`])/g, "\\$1")}"`;
}

function describe(tool: Tool, args: string[]): string {
  return [resolveTool(tool).display, ...args.map(quote)].join(" ");
}

export function run(tool: Tool, args: string[], options: RunOptions = {}): Promise<Buffer> {
  const { command, prefix } = resolveTool(tool);
  console.log(`\n$ ${describe(tool, args)}`);

  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, [...prefix, ...args], {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", options.liveStderr ? "inherit" : "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise(Buffer.concat(stdout));
        return;
      }
      const details = Buffer.concat(stderr).toString("utf8").trim();
      if (details) console.error(details);
      reject(new Error(`${tool} exited with code ${code ?? "unknown"}`));
    });
  });
}
