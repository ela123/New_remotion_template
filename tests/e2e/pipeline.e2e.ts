import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compositionLine, makeClip, populate, probe, remotion, script, SRT, workspace } from "./helpers";

const ws = workspace();
const clips = { landscape: path.join(ws.dir, "landscape.mp4"), vertical: path.join(ws.dir, "vertical.mp4"), long: path.join(ws.dir, "long.mp4") };

beforeAll(() => {
  makeClip(clips.landscape, ["--width", "640", "--height", "360", "--fps", "30000/1001", "--duration", "2"]);
  makeClip(clips.vertical, ["--width", "360", "--height", "640", "--fps", "24", "--duration", "2"]);
  makeClip(clips.long, ["--width", "192", "--height", "108", "--fps", "10", "--duration", "31", "--no-audio"]);
});

afterAll(() => ws.cleanup());

describe("source detection", () => {
  it.each([
    ["landscape", "29.97002997002997", "640x360", "60 (2.00 sec)"],
    ["vertical", "24", "360x640", "48 (2.00 sec)"],
    ["long", "10", "192x108", "310 (31.00 sec)"],
  ] as const)("%s clip", (name, fps, size, duration) => {
    const dir = populate(ws.publicDir(`detect-${name}`), clips[name], SRT);
    const res = remotion(["compositions", `--public-dir=${dir}`]);
    expect(res.code).toBe(0);
    const line = compositionLine(res.out, "LayeredCaption");
    expect(line).toContain(fps);
    expect(line).toContain(size);
    expect(line).toContain(duration);
  });
});

describe("render", () => {
  it("keeps size, fps and the source audio", () => {
    const dir = populate(ws.publicDir("render"), clips.landscape, SRT);
    const out = path.join(ws.dir, "render.mp4");
    const res = remotion(["render", "LayeredCaption", out, "--props=./props/final.json", `--public-dir=${dir}`, "--frames=0-9"]);
    expect(res.code).toBe(0);
    const info = probe(out);
    expect(info).toMatch(/codec_type=video\|width=640\|height=360\|r_frame_rate=30000\/1001/);
    expect(info).toContain("codec_type=audio");
  });

  it("renders the same frame byte-identically twice", () => {
    const dir = populate(ws.publicDir("determinism"), clips.landscape, SRT);
    const stills = ["a.png", "b.png"].map((name) => path.join(ws.dir, name));
    for (const still of stills) {
      const res = remotion(["still", "LayeredCaption", still, "--frame=20", "--props=./props/final.json", `--public-dir=${dir}`]);
      expect(res.code).toBe(0);
    }
    const [a, b] = stills.map((still) => readFileSync(still));
    expect(a?.equals(b ?? Buffer.alloc(0))).toBe(true);
  });

  it.each([
    ["missing video", null, SRT, "Put your video at public/intro.mp4"],
    ["missing SRT", "landscape", null, "Put your captions at public/captions.srt"],
    ["empty SRT", "landscape", "", "has no valid captions"],
  ] as const)("fails with an actionable message for %s", (name, clip, srt, message) => {
    const dir = populate(ws.publicDir(`fail-${name.replace(/\s/g, "-")}`), clip ? clips[clip] : null, srt);
    const res = remotion(["render", "LayeredCaption", path.join(ws.dir, "fail.mp4"), "--props=./props/final.json", `--public-dir=${dir}`, "--frames=0-1"]);
    expect(res.code).not.toBe(0);
    expect(res.out).toContain(message);
    expect(res.out).toContain("then render again.");
  });
});

describe("CLI exit codes", () => {
  const srtFile = (name: string, body: string) => {
    const file = path.join(ws.publicDir("cli"), name);
    writeFileSync(file, body);
    return file;
  };

  it("srt:fit refuses to overwrite with an empty result", () => {
    const res = script("srt-fit.ts", [srtFile("empty.srt", ""), path.join(ws.dir, "cli", "out.srt")]);
    expect(res.code).toBe(1);
    expect(res.out).toContain("no valid SRT cues; nothing written");
  });

  it("srt:fit rejects bad options", () => {
    expect(script("srt-fit.ts", ["a.srt", "b.srt", "--max-lines", "0"]).code).toBe(1);
    expect(script("srt-fit.ts", ["a.srt", "b.srt", "--strategy", "fancy"]).out).toContain('--strategy must be "hook" or "balanced"');
  });

  it("srt:check exits 0 with warnings and 1 with no valid cues", () => {
    const messy = srtFile("messy.srt", "1\n00:00:00,000 --> 00:00:09,000\nThis line is far longer than twenty-eight characters\n");
    const ok = script("srt-check.ts", [messy]);
    expect(ok.code).toBe(0);
    expect(ok.out).toContain("[line-too-long]");
    expect(script("srt-check.ts", [srtFile("blank.srt", "\n\n")]).code).toBe(1);
  });

  it("analyze reports the llm stub with exit 1", () => {
    const res = script("analyze-srt.ts", ["--provider", "llm"]);
    expect(res.code).toBe(1);
    expect(res.out).toContain("LLM provider not implemented yet");
  });

  it("sample validates arguments", () => {
    const res = script("make-sample.ts", ["--fps", "0"]);
    expect(res.code).toBe(1);
    expect(res.out).toContain("--fps must be between 1 and 120");
  });
});
