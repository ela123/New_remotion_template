import { describe, expect, it } from "vitest";
import { frameAlignedDuration, parseSampleArgs, SAMPLE_DEFAULTS } from "../scripts/lib/sample-args";
import { encodeWav, synthPad } from "../scripts/lib/wav";
import { calculateSampleMetadata } from "../src/sample/SampleFootage";
import { DEFAULT_SAMPLE, fadeOpacity, isSampleProps, makeOrbs } from "../src/sample/scene";

describe("parseSampleArgs", () => {
  it("returns the defaults with no arguments", () => {
    expect(parseSampleArgs([])).toEqual({ kind: "ok", args: SAMPLE_DEFAULTS });
  });

  it("accepts spaced and inline values, fractional rates and toggles", () => {
    const outcome = parseSampleArgs(["--width=3840", "--height", "2160", "--fps", "30000/1001", "--duration=6", "--no-audio", "--force", "--out", "x.MP4"]);
    expect(outcome).toEqual({
      kind: "ok",
      args: { ...SAMPLE_DEFAULTS, width: 3840, height: 2160, fps: 30000 / 1001, durationSec: 6, audio: false, force: true, out: "x.MP4" },
    });
  });

  it.each([
    [["--width", "0"], "--width must be a whole number"],
    [["--height", "1.5"], "--height must be a whole number"],
    [["--fps", "abc"], "--fps must be between 1 and 120"],
    [["--fps", "240"], "--fps must be between 1 and 120"],
    [["--duration", "-1"], "--duration must be seconds"],
    [["--out", "clip.mov"], "--out must be an .mp4 file"],
    [["--width"], "Missing value for --width"],
    [["--width", "--force"], "Missing value for --width"],
    [["--colour", "red"], 'Unknown argument "--colour"'],
    [["stray"], 'Unknown argument "stray"'],
  ])("rejects %j", (argv, message) => {
    const outcome = parseSampleArgs(argv);
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") expect(outcome.message).toContain(message);
  });

  it("recognises help anywhere", () => {
    expect(parseSampleArgs(["--fps", "30", "-h"])).toEqual({ kind: "help" });
  });

  it("aligns the audio length to whole video frames", () => {
    expect(frameAlignedDuration({ fps: 30000 / 1001, durationSec: 6 })).toBeCloseTo(6.006, 6);
    expect(frameAlignedDuration({ fps: 30, durationSec: 14 })).toBe(14);
  });
});

describe("sample scene", () => {
  it("is deterministic", () => {
    expect(makeOrbs("a")).toEqual(makeOrbs("a"));
    expect(makeOrbs("a")).not.toEqual(makeOrbs("b"));
  });

  it("fades in and out without breaking on very short clips", () => {
    for (const frames of [1, 2, 3, 10, 420]) {
      const values = Array.from({ length: frames }, (_, f) => fadeOpacity(f, 30, frames));
      for (const v of values) expect(v).toBeGreaterThanOrEqual(0);
      for (const v of values) expect(v).toBeLessThanOrEqual(1);
    }
    expect(fadeOpacity(0, 30, 420)).toBe(0);
    expect(fadeOpacity(210, 30, 420)).toBe(1);
    expect(fadeOpacity(419, 30, 420)).toBe(0);
  });

  it("derives metadata from props, rounding odd sizes to even", async () => {
    const meta = await calculateSampleMetadata({
      props: { width: 1081, height: 1919, fps: 30000 / 1001, durationInSeconds: 6 },
    } as Parameters<typeof calculateSampleMetadata>[0]);
    expect(meta).toEqual({ width: 1082, height: 1920, fps: 30000 / 1001, durationInFrames: 180 });
  });

  it("falls back to defaults for invalid props", () => {
    expect(isSampleProps(DEFAULT_SAMPLE)).toBe(true);
    expect(isSampleProps({ ...DEFAULT_SAMPLE, fps: 0 })).toBe(false);
    expect(isSampleProps({ ...DEFAULT_SAMPLE, width: "1920" })).toBe(false);
  });
});

describe("wav", () => {
  it("writes a valid 16-bit stereo PCM header and the expected length", () => {
    const channels = synthPad({ durationSec: 0.5, sampleRate: 8000 });
    const wav = encodeWav(channels, 8000);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.readUInt16LE(22)).toBe(2);
    expect(wav.readUInt32LE(24)).toBe(8000);
    expect(wav.readUInt32LE(40)).toBe(4000 * 2 * 2);
    expect(wav.length).toBe(44 + 4000 * 2 * 2);
  });

  it("is deterministic, peaks at -6 dBFS and starts and ends silent", () => {
    const [left] = synthPad({ durationSec: 2, sampleRate: 8000 });
    const [again] = synthPad({ durationSec: 2, sampleRate: 8000 });
    expect(left).toEqual(again);
    const peak = Math.max(...Array.from(left ?? [], Math.abs));
    expect(peak).toBeCloseTo(0.5, 5);
    expect(left?.[0]).toBe(0);
    expect(Math.abs(left?.[(left?.length ?? 1) - 1] ?? 1)).toBeLessThan(0.01);
  });
});
