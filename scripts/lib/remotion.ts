import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { projectRoot } from "./paths";

export function remotionCliPath(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve("@remotion/cli/package.json");
    const pkg: unknown = JSON.parse(readFileSync(pkgPath, "utf8"));
    if (typeof pkg !== "object" || pkg === null || !("bin" in pkg)) return null;
    const bin = pkg.bin;
    if (typeof bin !== "object" || bin === null || !("remotion" in bin)) return null;
    const entry = bin.remotion;
    return typeof entry === "string" ? join(dirname(pkgPath), entry) : null;
  } catch {
    return null;
  }
}

export function runRemotion(args: string[]): Promise<void> {
  const cli = remotionCliPath();
  if (!cli) return Promise.reject(new Error("Could not find the Remotion CLI. Run `npm i` first."));
  console.log(`\n$ npx remotion ${args.join(" ")}`);
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: projectRoot, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`remotion ${args[0] ?? ""} exited with code ${code ?? "unknown"}`));
    });
  });
}
