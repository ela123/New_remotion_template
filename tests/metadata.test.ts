import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalculateMetadataFunction } from "remotion";
import type { CaptionProps, IntroConfig } from "../src/types";

type Media = {
  dimensions: { width: number; height: number } | null;
  slowFps?: number;
  slowDurationInSeconds?: number;
  durationInSeconds?: number | null;
};

const state = vi.hoisted(() => ({
  isRendering: false,
  files: new Map<string, string>(),
  media: new Map<string, Media | Error>(),
  parseCalls: [] as string[],
  fetchCalls: [] as string[],
  config: {} as IntroConfig,
}));

vi.mock("remotion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("remotion")>()),
  staticFile: (file: string) => `/public/${file}`,
  getRemotionEnvironment: () => ({ isRendering: state.isRendering, isStudio: !state.isRendering }),
}));

vi.mock("@remotion/media-parser", () => ({
  mediaParserController: () => ({ abort: vi.fn() }),
  parseMedia: async ({ src }: { src: string }) => {
    state.parseCalls.push(src);
    const media = state.media.get(src);
    if (media === undefined) throw new Error("404 Not Found");
    if (media instanceof Error) throw media;
    return media;
  },
}));

vi.mock("../src/intro.config", () => ({ config: state.config }));

const { calculateCaptionMetadata } = await import("../src/video/metadata");
const { proxyMismatch } = await import("../src/video/media");

const BASE_CONFIG: IntroConfig = {
  video: "intro.mp4",
  proxyVideo: "intro.proxy.mp4",
  srt: "captions.srt",
  srtOffsetMs: 0,
  maxDurationSec: 30,
  cueSource: "srt",
  style: "bold",
  recipe: {},
  layout: {
    anchor: { vertical: "bottom", horizontal: "center" },
    align: "center",
    safeArea: { x: 0.08, y: 0.1 },
    lineGap: 0.12,
  },
  palette: { enabled: false },
  effects: { scrim: true, shadow: true, depthLayer: "auto", glow: "auto", glitch: "auto", grain: "auto" },
  motionBlur: { enabled: true },
  drift: false,
  outputScale: 1,
  render: { concurrency: 2 },
};

const GOOD_SRT = "1\n00:00:00,500 --> 00:00:02,700\nWelcome\nto the *studio*\n\n2\n00:00:03,000 --> 00:00:05,000\nEvery frame\n";
const VIDEO = "/public/intro.mp4";
const PROXY = "/public/intro.proxy.mp4";
const SRT = "/public/captions.srt";

const props: CaptionProps = { quality: "preview", cues: [], error: null, warnings: [], hasProxy: false };

type Args = Parameters<CalculateMetadataFunction<CaptionProps>>[0];

function run(overrides: Partial<CaptionProps> = {}, signal = new AbortController().signal) {
  const args = {
    props: { ...props, ...overrides },
    defaultProps: props,
    abortSignal: signal,
    compositionId: "LayeredCaption",
    isRendering: state.isRendering,
  } as Args;
  return Promise.resolve(calculateCaptionMetadata(args));
}

function video(width: number, height: number, fps: number, seconds: number): Media {
  return { dimensions: { width, height }, slowFps: fps, slowDurationInSeconds: seconds, durationInSeconds: seconds };
}

beforeEach(() => {
  Object.assign(state.config, structuredClone(BASE_CONFIG));
  state.isRendering = false;
  state.files = new Map([[SRT, GOOD_SRT]]);
  state.media = new Map([[VIDEO, video(1920, 1080, 30, 10)]]);
  state.parseCalls = [];
  state.fetchCalls = [];
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    state.fetchCalls.push(`${init?.method ?? "GET"} ${url}`);
    if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
    const exists = state.files.has(url) || state.media.has(url);
    return new Response(init?.method === "HEAD" ? null : (state.files.get(url) ?? ""), { status: exists ? 200 : 404 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("calculateCaptionMetadata: source detection", () => {
  it.each([
    ["1080p30", 1920, 1080, 30, 10, 300],
    ["4K30", 3840, 2160, 30, 10, 300],
    ["1080p24", 1920, 1080, 24, 6, 144],
    ["vertical", 1080, 1920, 30, 6, 180],
    ["29.97", 1920, 1080, 30000 / 1001, 6.006, 180],
    ["60", 1920, 1080, 60, 6, 360],
  ])("%s keeps the source size, fps and duration", async (_, width, height, fps, seconds, frames) => {
    state.media.set(VIDEO, video(width, height, fps, seconds));
    const result = await run();
    expect(result).toMatchObject({ width, height, fps, durationInFrames: frames });
    expect(result.props?.error).toBeNull();
    expect(result.props?.cues).toHaveLength(2);
  });

  it("keeps full duration of a video longer than 30s without trimming", async () => {
    state.media.set(VIDEO, video(1920, 1080, 30, 35));
    const result = await run();
    expect(result.durationInFrames).toBe(1050);
  });

  it("parses the video once and never fetches it in full", async () => {
    await run();
    expect(state.parseCalls.filter((src) => src === VIDEO)).toHaveLength(1);
    expect(state.fetchCalls).not.toContain(`GET ${VIDEO}`);
  });
});

describe("calculateCaptionMetadata: proxy", () => {
  it("uses a matching proxy in preview", async () => {
    state.media.set(PROXY, { dimensions: { width: 1280, height: 720 }, durationInSeconds: 10.02 });
    const result = await run();
    expect(result.props?.hasProxy).toBe(true);
    expect(result.width).toBe(1920);
  });

  it("ignores a stale proxy and says how to fix it", async () => {
    state.media.set(PROXY, { dimensions: { width: 1280, height: 720 }, durationInSeconds: 4 });
    const result = await run();
    expect(result.props?.hasProxy).toBe(false);
    expect(result.props?.warnings).toContainEqual(expect.stringContaining('Run "npm run proxy" again'));
  });

  it("does not probe the proxy for a final render", async () => {
    state.media.set(PROXY, { dimensions: { width: 1280, height: 720 }, durationInSeconds: 10 });
    const result = await run({ quality: "final" });
    expect(result.props?.hasProxy).toBe(false);
    expect(state.fetchCalls.some((call) => call.includes("proxy"))).toBe(false);
  });

  it("flags aspect and duration mismatches only beyond tolerance", () => {
    const source = { width: 1080, height: 1920, fps: 30, durationInSeconds: 6 };
    expect(proxyMismatch(source, { width: 406, height: 720, durationInSeconds: 6.03 })).toBeNull();
    expect(proxyMismatch(source, { width: 1280, height: 720, durationInSeconds: 6 })).toContain("1280x720");
    expect(proxyMismatch(source, { width: 406, height: 720, durationInSeconds: 14 })).toContain("14.00 s");
    expect(proxyMismatch(source, { width: 406, height: 720, durationInSeconds: null })).toBeNull();
  });
});

describe("calculateCaptionMetadata: input errors", () => {
  const cases: [string, () => void, string][] = [
    ["missing video", () => state.media.delete(VIDEO), "Put your video at public/intro.mp4"],
    ["unreadable video", () => state.media.set(VIDEO, new Error("Unknown container")), "Could not read public/intro.mp4 (Unknown container)"],
    ["audio-only file", () => state.media.set(VIDEO, { dimensions: null, slowFps: 0, slowDurationInSeconds: 3 }), "has no video track"],
    ["zero fps", () => state.media.set(VIDEO, video(1920, 1080, 0, 5)), "Could not detect the frame rate"],
    ["missing SRT", () => state.files.delete(SRT), "Put your captions at public/captions.srt"],
    ["empty SRT", () => state.files.set(SRT, ""), "public/captions.srt has no valid captions"],
    ["only invalid blocks", () => state.files.set(SRT, "1\nnot a timestamp\nhello\n\n2\n00:00:05,000 --> 00:00:01,000\nbackwards\n"), "invalid block(s) skipped"],
  ];

  it.each(cases)("%s shows the error screen in Studio", async (_, arrange, message) => {
    arrange();
    const result = await run();
    expect(result.props?.error).toContain(message);
    expect(result).toMatchObject({ width: 1920, height: 1080, fps: 30 });
    expect(result.props?.cues).toEqual([]);
  });

  it.each(cases)("%s fails a render with an actionable message", async (_, arrange, message) => {
    arrange();
    state.isRendering = true;
    await expect(run()).rejects.toThrow(message);
    await expect(run()).rejects.toThrow(/[^.], then render again\.$/);
  });

  it("rethrows unexpected errors instead of hiding them", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: true, text: () => Promise.reject(new TypeError("stream broke")) }));
    state.isRendering = false;
    await expect(run()).rejects.toThrow("stream broke");
  });

  it("propagates an abort instead of reporting a missing file", async () => {
    const controller = new AbortController();
    controller.abort();
    state.media.set(VIDEO, new Error("aborted"));
    await expect(run({}, controller.signal)).rejects.toThrow("aborted");
  });
});

describe("calculateCaptionMetadata: warnings that do not block", () => {
  it("skips malformed blocks but keeps the valid ones", async () => {
    state.files.set(SRT, `${GOOD_SRT}\n3\ngarbage line\n`);
    const result = await run();
    expect(result.props?.error).toBeNull();
    expect(result.props?.cues).toHaveLength(2);
    expect(result.props?.warnings).toContainEqual(expect.stringContaining("[invalid-block]"));
  });

  it("falls back to bold for an unknown style", async () => {
    state.config.style = "comic" as IntroConfig["style"];
    const result = await run();
    expect(result.props?.error).toBeNull();
    expect(result.props?.warnings).toContainEqual(expect.stringContaining('Unknown style "comic"'));
  });

  it("warns about cues that end after the video", async () => {
    state.media.set(VIDEO, video(1920, 1080, 30, 4));
    const result = await run();
    expect(result.props?.error).toBeNull();
    expect(result.props?.warnings).toContainEqual(expect.stringContaining("[beyond-video] Cue 2"));
  });

  it("applies srtOffsetMs", async () => {
    state.config.srtOffsetMs = 250;
    const result = await run();
    expect(result.props?.cues[0]?.startMs).toBe(750);
  });
});

describe("calculateCaptionMetadata: annotated JSON", () => {
  const JSON_FILE = "/public/annotated-cues.json";
  const cue = { id: 1, startMs: 0, endMs: 1000, lines: [{ text: "Hi", words: [{ text: "Hi", startMs: 0, endMs: 1000 }] }] };

  beforeEach(() => {
    state.config.cueSource = "json";
  });

  it("loads valid annotated cues", async () => {
    state.files.set(JSON_FILE, JSON.stringify([cue]));
    const result = await run();
    expect(result.props?.cues).toEqual([cue]);
  });

  it.each([
    ["missing", null, 'Run "npm run analyze"'],
    ["not JSON", "{oops", "is not a list of annotated cues"],
    ["wrong shape", JSON.stringify([{ id: 1, startMs: 0, endMs: 1, lines: ["Hi"] }]), "is not a list of annotated cues"],
    ["empty list", "[]", "has no cues"],
  ])("%s file shows an actionable error", async (_, body, message) => {
    if (body !== null) state.files.set(JSON_FILE, body);
    const result = await run();
    expect(result.props?.error).toContain(message);
  });
});
