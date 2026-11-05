import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

function localImports(file: string): string[] {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(/^(?:import|export)\s[^;]*?from\s+"(\.[^"]+)"/gms)].flatMap((match) => {
    const base = path.resolve(path.dirname(file), match[1] ?? "");
    const found = [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find((candidate) => existsSync(candidate));
    return found ? [found] : [];
  });
}

const graph = new Map(sourceFiles(SRC).map((file) => [file, localImports(file)]));

function reachable(from: string): Set<string> {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length > 0) {
    const next = stack.pop() ?? "";
    for (const dep of graph.get(next) ?? []) {
      if (seen.has(dep)) continue;
      seen.add(dep);
      stack.push(dep);
    }
  }
  return seen;
}

describe("module structure", () => {
  it("has no import cycles in src/", () => {
    const cyclic = [...graph.keys()].filter((file) => reachable(file).has(file)).map((file) => path.relative(SRC, file));
    expect(cyclic).toEqual([]);
  });

  it.each(["video/metadata.ts", "template/active-style.ts", "template/schedule.ts", "template/layout.ts", "srt/fit.ts"])(
    "%s never pulls in a React component",
    (file) => {
      const components = [...reachable(path.join(SRC, file))].filter((dep) => dep.endsWith(".tsx")).map((dep) => path.relative(SRC, dep));
      expect(components).toEqual([]);
    },
  );

  it("keeps src/ free of Node APIs, env access and unseeded randomness", () => {
    for (const file of graph.keys()) {
      const text = readFileSync(file, "utf8");
      expect(text, path.relative(SRC, file)).not.toMatch(/from "node:|process\.env|Math\.random|Date\.now/);
    }
  });
});
