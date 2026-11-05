# Module contracts

The source of truth for behaviour is `docs/SPEC.md`. This file is the map of modules and the exports between them, as built. Shared types live in `src/types.ts`; do not redefine them.

## Global rules

- TypeScript strict with `noUncheckedIndexedAccess`. `npm run check` (typecheck + unit tests) must pass.
- Files under `src/` are browser-safe: no `node:` imports, no `process`, no `fs`. Node-only code lives in `scripts/`. Enforced by `tests/architecture.test.ts`.
- No comments by default. At most one short line where the reason cannot be read from the code.
- Deterministic: no `Math.random`, no `Date.now` in `src/`. Seeded noise only (`@remotion/noise`, `random(seed)` from `remotion`).
- Frame values in recipes and styles are authored at 30 fps; scale with `scaleFrames(frames, fps)` at the point of use.
- Size values are reference units (u) on a 1080 px short side; multiply by `referenceUnit(width, height)` (`src/template/units.ts`) at the point of use. Nothing else derives a unit.
- No import cycles in `src/`. Pure modules (`.ts`) never import React components (`.tsx`); `tests/architecture.test.ts` checks `video/metadata.ts`, `template/active-style.ts`, `template/schedule.ts`, `template/layout.ts` and `srt/fit.ts`.

## Layering

```
srt/*                  pure: parse, emphasis, word timing, annotate, check, fit, analyzer interface
motion/*, styles/*     pure: easing, springs, curves, pose, emphasis, blur, drift; style tokens, fonts, palette
effects/*              shadows.ts (pure CSS builders) + caption-sized effect components
template/*.ts          pure: recipe, active-style, schedule, layout, units, measure, studio-warnings
template/*.tsx         components: LayeredCaption > CaptionBlock > CaptionLine > Word, ErrorScreen, WarningsBadge
video/*                calculateMetadata (media.ts, cues.ts, errors.ts, metadata.ts) + Background.tsx
sample/*               SampleFootage composition and its own entry point (tooling only)
scripts/*              Node CLIs; scripts/lib/* shared Node helpers
```

Data flow: `video/metadata.ts` reads the video (`media.ts`) and cues (`cues.ts` via `srt/*`), resolves the style (`template/active-style.ts`), schedules once for warnings, and passes `CaptionProps` to `LayeredCaption`. The component waits for fonts, then per cue: `scheduleCues` (timing) and `mapLinesToSlots` + `measureInk`/`measureText` + `layoutBlock` (geometry), memoised; per frame only `linePose`, blur, emphasis and effects are evaluated.

## `src/srt/*`

```ts
// parse.ts
export type ParsedWord = { text: string; emphasis: boolean };
export function parseSrt(text: string, opts?: { offsetMs?: number }): ParseResult;
export function parseEmphasisLine(line: string): { words: ParsedWord[]; unbalanced: boolean };
export const stripFormatting: (line: string) => string; // removes <i>, <b>, <u>, <s>, <font>, {\an8}
export function formatTimestamp(ms: number): string;
export function serializeSrt(cues: RawCue[]): string;

// timing.ts
export type TimedWord = { text: string; emphasis: boolean; startMs: number; endMs: number };
export function msToFrames(ms: number, fps: number): number; // Math.round
export function estimateWordTimings(lines: ParsedWord[][], startMs: number, endMs: number): TimedWord[][];

// annotate.ts
export function annotateCue(cue: RawCue): AnnotatedCue;
export function annotateCues(cues: RawCue[]): AnnotatedCue[];

// check.ts
export type CheckOptions = { videoDurationMs?: number };
export function checkCues(cues: RawCue[], opts?: CheckOptions): SrtWarning[];

// fit.ts
export type FitOptions = { maxLines: number; maxChars: number; maxWords: number; minDur: number; maxDur: number; cps: number; strategy: "hook" | "balanced" };
export const DEFAULT_FIT_OPTIONS: FitOptions;
export const HOOK_LINE_LIMITS: readonly [number, number, number]; // [12, 22, 28]
export type FitSummary = { inputCues: number; outputChunks: number; avgCharsPerLine: number; warnings: SrtWarning[] };
export function fitCues(cues: RawCue[], opts?: Partial<FitOptions>): { cues: RawCue[]; summary: FitSummary };

// analyze.ts
export const ANNOTATED_CUES_FILE: "annotated-cues.json";
export interface CueAnalyzer { name: string; analyze(cues: RawCue[]): Promise<AnnotatedCue[]> }
export const markersAnalyzer: CueAnalyzer;
export const llmAnalyzer: CueAnalyzer; // rejects with Error("LLM provider not implemented yet")
export function getAnalyzer(name: "markers" | "llm"): CueAnalyzer;
```

## `src/motion/*`

```ts
// easing.ts
export const EASINGS: Record<EaseName, (t: number) => number>; // Easing.bezier presets, SPEC 11.1

// springs.ts
export type SpringPreset = { damping: number; stiffness?: number; mass?: number };
export const SPRINGS: Record<SpringName, SpringPreset>;
export function isSpringName(name: string): name is SpringName;

// curve.ts
export function curveProgress(curve: MotionCurve, localFrame: number, frames: number, fps: number): number; // springs normalised to land on 1 at `frames`
export function springValue(name: SpringName, localFrame: number, fps: number): number;

// stagger.ts
export function scaleFrames(frames30: number, fps: number): number; // Math.round(frames30 * fps / 30)
export function exitOrderIndex(lineIndex: number, lineCount: number, order: Recipe["exitOrder"]): number;

// pose.ts
export type PoseSchedule = { enterStart; enterFrames; settleFrames; exitStart; exitFrames; fadeOnlyExit };
export type PoseInput = { schedule: PoseSchedule; recipe: LineRecipe; settle: Recipe["settle"]; enterDistance: number; exitDistance: number; fps: number };
export type Pose = { x: number; y: number; scale: number; opacity: number; resting: boolean; entranceFrame: number };
export function linePose(frame: number, p: PoseInput): Pose; // exactly { x: 0, y: 0, scale: 1 } when resting
export function curveOvershoots(curve: MotionCurve): boolean; // overshooting curves skip the settle stage
export function settleBump(s: number): number;
export function settleAmount(t: number, enterFrames: number, settleFrames: number, overshoot: number): number;
export function enterOpacity(t: number, enterFrames: number, fade: boolean): number;
export type GlitchWindow = { start: number; frames: number };
export function glitchWindow(enterFrames: number, glitchFrames: number): GlitchWindow;
export function glitchIntensity(entranceFrame: number, window: GlitchWindow): number;
export function travelDistance(distance: number | "offscreen", direction: Direction, placed: Box, frame: { width; height }, unit: number): number;

// emphasis.ts
export const EMPHASIS: { popAmount; popHold30; lead30; colorFrames30; underlineDelay30; underlineFrames30; glowBoost; restBump };
export type EmphasisState = { scale: number; colorMix: number; underline: number; glow: number };
export function emphasisStart(wordStartFrame: number, fps: number): number; // word start minus 2 frames at 30 fps
export function emphasisState(t: number, fps: number, pop: boolean): EmphasisState; // snaps to exactly 1 once the pop dies down
export function popOriginX(index: number, count: number, align: Align): number;

// blur.ts
export type Vec = { x: number; y: number };
export type BlurOptions = { k: number; maxBlurPx: number; thresholdPxPerFrame: number };
export const DEFAULT_BLUR: BlurOptions; // values in reference units
export function directionalBlur(prev: Vec, cur: Vec, opts?: BlurOptions): Vec; // exactly 0 per axis below threshold

// drift.ts
export function driftScale(seed: string, frame: number, fps: number, enabled: boolean): number; // 1 ± 0.003, never translates
```

## `src/styles/*`

```ts
// index.ts
export const STYLES: Record<StyleName, StyleTokens>;
export function getStyle(name: string): { style: StyleTokens; warning: string | null }; // unknown -> bold + warning

// minimal.ts, neon.ts, bold.ts, cinematic.ts
export const <name>: StyleTokens;

// fonts.ts
export function loadStyleFonts(style: StyleTokens): Promise<void>; // only the active style's families and weights
export function fontFamilyCss(family: FontFamily): string;

// palette.ts
export type Rgb = [number, number, number];
export function parseColor(color: string): Rgb | null;
export function contrastRatio(a: string, b: string): number;
export function darken(color: string, amount: number): string;
export function saturation(color: string): number;
export function applyPalette(style: StyleTokens, palette: Palette | null): StyleTokens; // accent >= 4.5:1 vs #111111 or unchanged
```

## `src/effects/*`

```ts
// shadows.ts (pure)
export const SHADOW_REACH_U: number;
export function withAlpha(color: string, alpha: number): string;
export function extrusionDepth(fontSize: number): { x: number; y: number };
export function extrusionCss(color: string, fontSize: number, quality: Quality): string; // bold depth layer
export function shadowCss(unit: number, quality: Quality, lift?: { x: number; y: number }): string;
export function glowStrength(color: string): number;
export function glowCss(color: string, unit: number, quality: Quality, intensity?: number): string | null;
export function joinShadows(...shadows: (string | null | undefined)[]): string | undefined;

// components
export const Scrim: React.FC<{ block: { y; height }; frameHeight; anchor: VerticalAnchor; opacity; unit; quality }>;
export const MotionBlurFilter: React.FC<{ id; x; y; boxWidth; boxHeight; padPx }>; // one SVG feGaussianBlur per layer
export const Glitch: React.FC<{ seed; unit; intensity; quality; children }>;     // neon only, final only
export const GLITCH_FRAMES_30: number;
export function glitchJitter(seed: string, unit: number, intensity: number): number;
export const Grain: React.FC<{ quality: Quality }>;                              // cinematic only, final only
```

## `src/template/*`

```ts
// units.ts
export function referenceUnit(width: number, height: number): number; // min(width, height) / 1080

// recipe.ts
export const DEFAULT_RECIPE: Recipe;
export function mergeRecipe(base: Recipe, ...overrides: RecipeOverride[]): Recipe;
export function resolveRecipe(style: StyleTokens, override?: RecipeOverride): ResolvedRecipe; // default < style < config, then durationMultiplier

// active-style.ts (pure; used by metadata and the component)
export type ActiveEffects = { scrim; shadow; depthLayer; glow; glitch; grain; motionBlur; drift: boolean };
export type ActiveStyle = { style: StyleTokens; recipe: ResolvedRecipe; warning: string | null };
export function resolveActiveStyle(settings?: Pick<IntroConfig, "style" | "palette" | "recipe">): ActiveStyle;
export function resolveEffects(style: StyleTokens, quality: Quality, settings?: Pick<IntroConfig, "effects" | "motionBlur" | "drift">): ActiveEffects;

// schedule.ts
export type LineSchedule = { slot: SlotName; enterStart; enterFrames; settleFrames; exitStart; exitFrames: number; fadeOnlyExit: boolean };
export type CueSchedule = { cueId: number; startFrame; endFrame; entranceStart; exitEnd: number; lines: LineSchedule[] };
export function slotRecipe(recipe: ResolvedRecipe, slot: SlotName): LineRecipe;
export function scheduleCues(cues: AnnotatedCue[], recipe: ResolvedRecipe, fps: number): { schedules: CueSchedule[]; warnings: SrtWarning[] }; // SPEC 10.3 rules 2-4

// layout.ts
export type SlotAssignment = { slot: SlotName; line: AnnotatedLine };
export type Rect, FontMetrics, InkBounds, MeasuredLine, PlacedLine, BlockLayout, LayoutFrame;
export function mapLinesToSlots(lines: AnnotatedLine[]): SlotAssignment[]; // SPEC 10.3 rule 1
export function displayableCues(cues: AnnotatedCue[]): AnnotatedCue[];     // sorted, blank lines and empty cues dropped
export function lineText(line: AnnotatedLine): string;
export const lineHeightFor: (uppercase: boolean) => number;
export function baselineInBox(line): number;
export function opticalGap(upper: MeasuredLine, lower: MeasuredLine, lineGap: number, unit: number): number;
export function layoutBlock(lines: MeasuredLine[], frame: LayoutFrame): BlockLayout; // fit-to-safe-width, anchor, align on ink edges, whole px

// measure.ts (browser canvas, returns null without a document)
export function measureInk(text: string, font: { fontFamily; fontWeight; fontSize; trackingPx }): { metrics: FontMetrics; ink: InkBounds } | null;

// studio-warnings.ts
export const MAX_LISTED_WARNINGS: number;
export type StudioWarnings = { count: number; listed: string[]; hidden: number };
export function studioWarnings(warnings: string[], env: { isRendering: boolean }): StudioWarnings | null; // null while rendering

// components
export const LayeredCaption: React.FC<CaptionProps>;      // ErrorScreen when props.error, else captions
export const CaptionBlock, CaptionLine, Word, ErrorScreen;
export const WarningsBadge: React.FC<{ warnings: string[]; unit: number }>; // Studio only
```

## `src/video/*`

```ts
// errors.ts
export class InputError extends Error {}          // user-fixable input problem: error screen in Studio, actionable throw in renders
export const describeError: (err: unknown) => string;
export function headOk(url: string, signal: AbortSignal): Promise<boolean>;

// media.ts
export type VideoInfo = { width: number; height: number; fps: number; durationInSeconds: number };
export function readVideo(signal: AbortSignal): Promise<VideoInfo>; // parseMedia: dimensions, slowFps, slowDurationInSeconds
export function proxyMismatch(video: VideoInfo, proxy: ProxyInfo): string | null;
export function checkProxy(video: VideoInfo, signal: AbortSignal): Promise<ProxyStatus>;

// cues.ts
export function loadCues(videoDurationMs: number, signal: AbortSignal): Promise<{ cues: AnnotatedCue[]; warnings: SrtWarning[] }>; // SRT or annotated JSON per config.cueSource

// metadata.ts
export const calculateCaptionMetadata: CalculateMetadataFunction<CaptionProps>;

// Background.tsx
export const Background: React.FC<{ quality: Quality; hasProxy: boolean }>; // OffthreadVideo, proxy only in preview
```

`calculateCaptionMetadata` never throws for a missing or broken video/SRT/JSON in Studio: it returns a 1920x1080 / 30 fps / 5 s composition with `props.error` set so the error screen shows. When rendering it throws `"<message>, then render again."`. Unexpected errors and aborts are rethrown unchanged. Non-blocking warnings go to `props.warnings` and the console.

## `src/sample/*`

```ts
// scene.ts (pure)
export type SampleProps = { width; height; fps; durationInSeconds: number };
export const DEFAULT_SAMPLE: SampleProps;
export function makeOrbs(seed: string): Orb[];
export function orbPosition(orb: Orb, t: number): { x: number; y: number };
export const wrap: (value: number, min: number, max: number) => number;
export function isSampleProps(value: unknown): value is SampleProps;
export function fadeOpacity(frame: number, fps: number, durationInFrames: number): number;

// SampleFootage.tsx, SampleRoot.tsx, index.ts
export const calculateSampleMetadata: CalculateMetadataFunction<SampleProps>;
export const SampleFootage: React.FC<SampleProps>;
export const SampleComposition: React.FC; // registered in Root.tsx under "Tools" and by its own entry point
```

## `scripts/lib/*` (Node only)

```ts
// cli.ts
export function splitInlineValues(argv: string[]): string[]; // "--flag=value" -> ["--flag", "value"]
export const wantsHelp: (argv: string[]) => boolean;
export function handleNoArgs(command: string, usage: string, argv: string[]): "run" | "done"; // for argument-less scripts

// ffmpeg.ts
export function run(tool: "ffmpeg" | "ffprobe", args: string[], options?: { liveStderr?: boolean }): Promise<Buffer>; // system binary, else Remotion's bundled one

// probe.ts
export type VideoInfo = { width; height; rFrameRate; avgFrameRate; fps; durationSec; frameCount; hasAudio; audioDurationSec; comment };
export function parseRate(rate: string): number;
export function probeVideo(file: string): Promise<VideoInfo>;

// frame-rate.ts
export function nearestStandardRate(fps: number): { label: string; ffmpegRate: string; fps: number };
export function isVariableFrameRate(info: VideoInfo): boolean;

// palette.ts
export function extractPalette(pixels: Uint8Array): { dominant; accent; dark; light: string };

// paths.ts
export const projectRoot: string;
export function publicRelative(file: string): string;
export function fromRoot(relativePath: string): string;
export function requireVideo(file: string): string; // exits 1 with instructions when missing

// remotion.ts
export function remotionCliPath(): string | null;
export function runRemotion(args: string[]): Promise<void>;

// sample-args.ts
export const SAMPLE_DEFAULTS: SampleArgs;
export function parseSampleArgs(argv: string[]): { kind: "help" } | { kind: "ok"; args: SampleArgs } | { kind: "error"; message: string };
export function frameAlignedDuration(args: Pick<SampleArgs, "fps" | "durationSec">): number;

// wav.ts
export function synthPad(opts: { durationSec: number; sampleRate?: number; fadeInSec?: number; fadeOutSec?: number }): Float32Array[];
export function encodeWav(channels: Float32Array[], sampleRate: number): Buffer;
```

## Scripts

| npm script | File | Arguments |
| --- | --- | --- |
| `sample` | `scripts/make-sample.ts` | `--width --height --fps --duration --out --concurrency --no-audio --force` |
| `proxy` | `scripts/make-proxy.ts` | none |
| `palette` | `scripts/extract-palette.ts` | none |
| `srt:fit` | `scripts/srt-fit.ts` | `<input.srt> <output.srt> --max-lines --max-chars --max-words --min-dur --max-dur --cps --strategy` |
| `srt:check` | `scripts/srt-check.ts` | `[file.srt]` |
| `analyze` | `scripts/analyze-srt.ts` | `--provider markers\|llm` (reads `LLM_PROVIDER` from `.env`) |

Every script accepts `-h` / `--help` and exits 1 on an unknown argument.
