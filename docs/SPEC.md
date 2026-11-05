# Remotion Intro Captioner — Agent Build Spec

Build this project exactly as specified. Output **complete files**, not partial diffs. Do not add features beyond this spec. If something is ambiguous, choose the simplest option that satisfies the acceptance criteria in section 20 and note the choice in the README.

---

## 1. Goal

A React + Remotion project that takes an **already-made intro video (max 30 s, with speech)** and a **hand-written `.srt` file**, then renders a **final video** with:

- professional, editor-grade **text animation and captions** synced to the speech using the SRT timestamps
- subtle **motion graphics / effects** over the original footage
- the **original audio preserved**

The look must resemble work from After Effects / Premiere (graph-editor easing, motion blur, staggered per-line motion, secondary motion), not default Remotion output.

### In scope (v1)
- ONE template: **Layered Multi-line Caption** (section 10)
- FOUR style presets: `minimal`, `neon`, `bold`, `cinematic` (section 12)
- SRT pipeline: parse, emphasis markers, `srt:fit` script, AI-analysis stub (sections 7-9)
- Auto-detect resolution, fps and duration from the video
- Slow-PC workflow: proxy preview, still-frame checks, final render (section 16)
- Unit tests for the SRT pipeline
- English text only

### Out of scope (v1)
- Other templates (they will be separate projects later)
- Transparent/alpha overlay output composited with ffmpeg (planned v2 render speed-up), Amharic or other languages
- Light rays, wave warp, pixelate/mosaic effects
- Samples-mode motion blur (`@remotion/motion-blur` / `CameraMotionBlur`): too slow at 4K on the target machine
- Real LLM calls (only a stub with a clean interface)
- Audio generation, music, sound effects

---

## 2. Inputs and outputs

| Item | Detail |
|---|---|
| Input video | `public/intro.mp4` (user-provided, max 30 s) |
| Input captions | `public/captions.srt` (user-provided or produced by `srt:fit`) |
| Output | `out/intro.mp4`, H.264, source resolution (up to 4K) and source fps, original audio |

Width, height, fps and duration are **never hardcoded**. They are read from the video file.

---

## 3. Tech stack

- Node 20+, TypeScript (strict), React 18, Remotion 4.x (latest stable, **pinned exact version**)
- Packages: `remotion`, `@remotion/cli`, `@remotion/google-fonts`, `@remotion/layout-utils`, `@remotion/noise`, plus the current Remotion-recommended metadata API (`@remotion/media-parser`, or the newer Mediabunny-based helpers if the docs now recommend them). Verify against the current Remotion docs. Likewise verify whether `<OffthreadVideo>` or `<Video>` from `@remotion/media` is the recommended background video component, and use that one.
- `tsx` for running scripts, `dotenv` for `.env`, `vitest` (dev) for tests
- `ffmpeg` and `ffprobe` are expected on the system PATH (used for proxy, CFR and palette scripts); check and print a clear error if missing
- No other animation libraries (no GSAP, Framer Motion, CSS transitions/animations). All motion must be driven by `useCurrentFrame()`, `interpolate()`, `spring()` so renders are deterministic.

---

## 4. Project structure

```
remotion-intro-captioner/
├── package.json
├── remotion.config.ts           # render settings, reads intro.config.ts (section 18)
├── tsconfig.json
├── .env.example
├── .gitignore
├── README.md
├── props/
│   ├── preview.json             # {"quality":"preview"}
│   └── final.json               # {"quality":"final"}
├── public/
│   ├── intro.mp4                # user video (not committed)
│   ├── intro.cfr.mp4            # generated only if the source is variable frame rate
│   ├── intro.proxy.mp4          # generated 720p proxy
│   └── captions.srt
├── scripts/
│   ├── make-proxy.ts
│   ├── srt-fit.ts
│   ├── srt-check.ts
│   ├── extract-palette.ts
│   └── analyze-srt.ts           # stub entry for future AI analysis
├── tests/
│   ├── parse.test.ts
│   ├── timing.test.ts
│   └── srt-fit.test.ts
└── src/
    ├── index.ts                 # registerRoot
    ├── Root.tsx                 # registers composition "LayeredCaption"
    ├── intro.config.ts          # all user-editable settings
    ├── palette.json             # committed neutral default; overwritten by `npm run palette`
    ├── types.ts
    ├── video/
    │   ├── metadata.ts          # calculateMetadata: video metadata + cues
    │   └── Background.tsx       # background video (proxy in preview, original in final)
    ├── srt/
    │   ├── parse.ts             # SRT parser preserving line breaks + emphasis markers
    │   ├── timing.ts            # ms to frames, word timing within a cue
    │   ├── annotate.ts          # AnnotatedCue builder (markers provider)
    │   ├── fit.ts               # pure srt:fit logic (used by the script and tests)
    │   └── analyze.ts           # provider interface + markers provider + llm stub
    ├── motion/
    │   ├── easing.ts            # named bezier presets
    │   ├── springs.ts           # named spring presets
    │   ├── stagger.ts
    │   └── blur.ts              # velocity-based motion blur helper
    ├── styles/
    │   ├── index.ts             # style registry
    │   ├── minimal.ts  neon.ts  bold.ts  cinematic.ts
    │   └── fonts.ts             # google-fonts loading (active style only)
    ├── template/
    │   ├── LayeredCaption.tsx   # the composition component
    │   ├── recipe.ts            # recipe types + default recipe + precedence merge
    │   ├── CaptionBlock.tsx     # one cue: lines + layout + exit
    │   ├── CaptionLine.tsx      # one independent line layer
    │   ├── Word.tsx             # word with emphasis effect
    │   └── layout.ts            # anchor, safe area, alignment, slot mapping
    └── effects/
        ├── Scrim.tsx            # soft gradient behind caption area
        ├── Shadow.tsx           # soft shadow + depth duplicate
        ├── Glow.tsx
        ├── Glitch.tsx           # neon only
        └── Grain.tsx            # cinematic only (grain + vignette)
```

---

## 5. Config (`src/intro.config.ts`)

All user-editable settings live here. No content or style value may be hardcoded elsewhere.

```ts
import type { StyleName, RecipeOverride } from "./types";

export const config = {
  video: "intro.mp4",              // file in /public (set to "intro.cfr.mp4" if `npm run proxy` says so)
  proxyVideo: "intro.proxy.mp4",   // used when quality = "preview"
  srt: "captions.srt",             // file in /public
  srtOffsetMs: 0,                  // shift all cues (+ later, - earlier)
  maxDurationSec: 30,              // hard cap; warn and trim if video is longer
  cueSource: "srt" as "srt" | "json", // "json" reads public/annotated-cues.json (section 9)

  style: "bold" as StyleName,      // "minimal" | "neon" | "bold" | "cinematic"
  recipe: {} as RecipeOverride,    // partial overrides (highest precedence, section 10.3 rule 9)

  layout: {
    anchor: { vertical: "bottom", horizontal: "center" }, // top|center|bottom, left|center|right
    align: "center",                                      // text alignment inside the block
    safeArea: { x: 0.08, y: 0.10 },                       // fraction of width / height
    lineGap: 0.12,                                        // fraction of the line's font size
  },

  palette: { enabled: false },     // true: accent colors come from src/palette.json

  effects: {
    scrim: true,                   // subtle gradient behind captions for readability
    shadow: true,
    depthLayer: true,              // duplicate text behind (92-95% scale, 60-70% opacity)
    glow: "auto",                  // "auto" = style default, or true/false
    glitch: "auto",                // only has effect in neon
    grain: "auto",                 // only has effect in cinematic
  },

  motionBlur: { enabled: true },   // velocity-based directional blur (section 11.4)
  drift: false,                    // subtle idle "breathing" after settle (section 11.5)

  outputScale: 1,                  // render scale multiplier (1 = source resolution)
  render: { concurrency: 2 },      // keep low on a slow PC
};
```

The composition also takes an input prop `quality: "preview" | "final"` (default `"preview"` in Studio; render scripts pass it via `props/*.json`).

`outputScale` and `render.concurrency` are applied in `remotion.config.ts` (section 18), not through CLI flags.

---

## 6. Video handling

1. **Metadata:** in `calculateMetadata`, read **width, height, fps, durationInFrames** from `public/<config.video>` (always the original, never the proxy), using the current Remotion metadata API (section 3).
2. **Cues:** `calculateMetadata` also loads the cues (section 9) and passes the resulting `AnnotatedCue[]` to the composition as props. Components never fetch files themselves.
3. **Duration cap:** `durationInFrames = min(videoFrames, floor(maxDurationSec * fps))`. If the video is longer than `maxDurationSec`, print a clear warning and trim to the cap.
4. **fps:** the composition fps equals the source fps, including fractional rates (29.97, 59.94). All frame math derives from `useVideoConfig().fps`.
5. **Variable frame rate:** phone footage is often variable frame rate (VFR), which makes fps metadata unreliable. `npm run proxy` detects VFR (section 16) and writes a constant-frame-rate (CFR) copy. The composition must use the CFR file.
6. **Background:** `Background.tsx` renders the background video filling the frame (`objectFit: "cover"`). In `preview` quality it uses the proxy file but the **composition size stays the original size**, so layout is identical to the final render.
7. **Audio:** the video's audio plays/renders unchanged (do not mute, do not add audio).
8. **Missing file:** if the video is missing, show a clear error screen in Studio ("Put your video at public/intro.mp4") instead of crashing.

### Layout units
Author all sizes in **reference units (u)** on a 1080 px short side, and scale at runtime with one shared helper: `unit = referenceUnit(width, height) = min(width, height) / 1080` (`src/template/units.ts`). For every 16:9 frame this equals `width / 1920`, so a 4K render looks identical to 1080p, only sharper. Vertical (9:16) and square frames get the same physical text size relative to their short side instead of shrinking with the narrow width. Every px value in styles, shadows, offsets, blur and layout gaps goes through this unit. Safe-area margins stay fractions of width / height.

---

## 7. SRT pipeline

### 7.1 Parsing (`src/srt/parse.ts`)
Write a small own parser (do not rely on a parser that flattens lines):
- standard SRT blocks: index, `HH:MM:SS,mmm --> HH:MM:SS,mmm`, text lines
- **preserve line breaks**: each text line is one entry in `lines[]`
- tolerate `.` instead of `,` in timestamps, BOM, `\r\n`, extra blank lines
- apply `config.srtOffsetMs`
- pure function (no file or Remotion access) so it runs in the browser, in scripts and in tests

### 7.2 Emphasis markers
Inside cue text, `*word*` or `*two words*` marks emphasis.
- The parser strips the asterisks and records `emphasis: true` on the covered words.
- Markers may span words but not lines. Any tool that re-breaks lines (`srt:fit`) must close the marker at the end of a line and reopen it at the start of the next.
- `\*` is a literal asterisk.
- An unclosed marker is a warning; it is treated as ending at the end of its line.

### 7.3 Annotated cue (the single contract used by the template)

```ts
export type AnnotatedWord = {
  text: string;
  emphasis?: boolean;
  startMs: number;   // estimated, see 7.4
  endMs: number;
};

export type AnnotatedLine = { text: string; words: AnnotatedWord[] };

export type AnnotatedCue = {
  id: number;
  startMs: number;
  endMs: number;
  lines: AnnotatedLine[];   // mapped to slots by section 10.3 rule 1
};
```

### 7.4 Word timing inside a cue
SRT only has cue-level timing. Distribute each cue's duration across all its words by **character-count weight** (weight = number of characters + 1 for the space; punctuation-ending words get +2 weight for the pause). Words are timed in reading order across lines.

### 7.5 Validation (`npm run srt:check`)
Print warnings (do not crash) for: overlapping cues, cues shorter than 400 ms, cues longer than 6 s, more than 3 lines in a cue, lines longer than 28 characters, cues beyond video duration, reading speed above 20 characters per second, unbalanced emphasis markers.

---

## 8. `srt:fit` script (word-fit)

`npm run srt:fit -- <input.srt> <output.srt> [options]`

Purpose: take long or messy cues and produce **display-ready chunks** with a sensible number of words per line and per caption, with adjusted timing. The user can review and hand-edit the output.

The logic lives in `src/srt/fit.ts` as a pure function; `scripts/srt-fit.ts` only handles file I/O and arguments.

Options and defaults:

| Option | Default | Meaning |
|---|---|---|
| `--max-lines` | 3 | max lines per chunk |
| `--max-chars` | 22 | max characters per line (`balanced`); see per-slot limits for `hook` |
| `--max-words` | 7 | max words per chunk |
| `--min-dur` | 0.8 | min seconds per chunk |
| `--max-dur` | 4.0 | max seconds per chunk |
| `--cps` | 17 | target reading speed (chars/sec) |
| `--strategy` | `hook` | `hook` or `balanced` |

Per-slot line limits for `hook` (they match the slot font sizes): line 1 ≤ 12 chars, line 2 ≤ 22 chars, line 3 ≤ 28 chars.

Algorithm:
1. Flatten all cues into a word stream, keeping each word's source time span and emphasis markers. `*...*` must survive and stay balanced when a marked phrase is split across chunks **or lines**: close and reopen the marker.
2. Split into chunks, preferring break points in this order: sentence end (`. ? !`), clause punctuation (`, ; :`), before conjunctions (and, but, so, because, or), then by limits. Never create a chunk of one tiny word (2 chars or less) unless it is a single-word cue in the source.
3. Break chunk text into lines:
   - `hook` (default): line 1 is the **first single word**, remaining text is split between line 2 (a short phrase) and line 3 (the rest), matching the template's word / phrase / text structure. If the chunk is too short for three lines, produce one or two lines; the template maps them by section 10.3 rule 1.
   - `balanced`: even line lengths, no orphan word on the last line.
4. Timing: each chunk spans from its first word's source start to its last word's source end. Then adjust: enforce `min-dur` and `max-dur`, extend a chunk toward its reading-speed need (`chars / cps`) if the following gap allows, remove overlaps, close gaps smaller than 100 ms.
5. Write a valid SRT (marker syntax preserved) and print a summary: input cues, output chunks, average chars/line, warnings.

Never silently drop words. Output must contain exactly the same words in the same order as the input.

---

## 9. AI analysis stub (future)

Today the user writes emphasis markers by hand. Later an LLM will analyze the SRT and decide emphasis and line roles. Prepare the interface now, implement nothing external.

`src/srt/analyze.ts`:

```ts
export interface CueAnalyzer {
  name: string;
  analyze(cues: RawCue[]): Promise<AnnotatedCue[]>;
}

export const markersAnalyzer: CueAnalyzer;   // v1: reads *markers* from the SRT text
export const llmAnalyzer: CueAnalyzer;       // stub: throws "Not implemented yet"
```

- `scripts/analyze-srt.ts` takes `--provider markers|llm` (default `markers`), writes the annotated result to `public/annotated-cues.json`, and prints a clear "LLM provider not implemented yet" message for `llm`.
- **Cue source (single source of truth):** with `config.cueSource: "srt"` (default), `calculateMetadata` parses the SRT and runs `markersAnalyzer`. With `"json"`, it reads `public/annotated-cues.json` instead. Nothing else reads cues.
- `.env.example` contains `LLM_API_KEY=` and `LLM_PROVIDER=` with comments. Keys are read only in scripts via `dotenv`, **never** in browser/Remotion code and never committed.
- The template only consumes `AnnotatedCue[]`, so swapping the analyzer changes nothing in the animation code.

---

## 10. The template: Layered Multi-line Caption

Composition id: `LayeredCaption`.

**Core idea:** every line of a caption is an **independent text layer** with its own font style, entrance direction, timing delay, easing and effects. The caption is never animated as a single object. All lines end in clean, aligned final positions that form one cohesive caption.

### 10.1 Recipe types (`src/template/recipe.ts`)

```ts
export type Direction = "top" | "bottom" | "left" | "right" | "none";

export type Enter = {
  from: Direction;
  distance: number | "offscreen";   // reference units (default finite); "offscreen" is opt-in
  ease: EaseName | SpringName;      // named preset from motion/
  frames: number;                   // duration at 30 fps; scale by fps/30 at runtime
  delay: number;                    // frames after the cue's pre-roll start (scaled by fps/30)
  fade: boolean;                    // fade in while moving
  scaleFrom?: number;               // optional start scale (e.g. 0.9)
};

export type Exit = {
  to: Direction;
  ease: EaseName;
  frames: number;
  delay: number;                    // exit stagger per line
};

export type LineRecipe = {
  font: "A" | "B" | "C";            // slot from the active style
  enter: Enter;
  exit: Exit;
  motionBlur: boolean;
};

export type Recipe = {
  lines: LineRecipe[];              // indexed by slot: 0 = A, 1 = B, 2 = C
  anticipationFrames: number;       // lines start this many frames BEFORE the cue start (default 3)
  exitOrder: "reverse" | "forward" | "together";
  settle: { overshoot: number; frames: number }; // follow-through stage after arrival
};
```

- All frame values are authored for 30 fps and multiplied by `fps / 30`.
- When `ease` is a spring preset, drive it with `spring({ ..., durationInFrames: frames })` so `frames` is honored.
- Bezier curves cannot overshoot, so `settle` is a **separate stage** that starts when the entrance arrives: offset by `overshoot` past the rest position along the entry direction, then return to rest within `settle.frames`.

### 10.2 Default recipe (matches the user's reference idea)

| Slot | Font | Enter from | Distance | Delay | Ease | Frames |
|---|---|---|---|---|---|---|
| Line 1 (single word) | A | top, drops in | 140u | 0 | outExpo | 14 |
| Line 2 (phrase) | B | top, drops in | 100u | 5 | outExpo | 14 |
| Line 3 (text) | C | left, slides in | 160u | 10 | outCubic | 16 |

- All three lines fade in while moving.
- Exit: `exitOrder: "reverse"`, ease `inCubic`, 10 frames, 2 frames stagger; each line exits back toward the side it came from, over the same distance, fading out.
- Settle: 3% overshoot that returns within 6 frames. Styles may override it (section 10.3 rule 9).
- Lines remain independent layers with independent transforms, blur and effects.
- `distance: "offscreen"` (fully outside the frame) is available as a recipe override, not used by default.

### 10.3 Behavior rules

1. **Line to slot mapping (by role):**

   | Cue lines | Slots used |
   |---|---|
   | 1 | B |
   | 2 | A + C if line 1 is a single word, otherwise B + C |
   | 3 | A, B, C |
   | 4+ | A, B, C, with lines 4+ merged into C's text |

   The block is anchored so the used slots stay aligned with no gap for missing slots.
2. **Anticipation:** the entrance starts `anticipationFrames` before `startMs` so text lands as the voice begins. Clamp at frame 0.
3. **Hand-off (one rule):** the exit begins at the cue end and must finish by `nextCue.entranceStart` (the next cue's start minus its anticipation). If that leaves fewer than the recipe's exit frames, shorten the exit, with a minimum of 4 frames. If even 4 frames don't fit, the outgoing caption fades out over those 4 frames while the incoming one enters. The next cue's entrance is never delayed.
4. **Hold:** the final aligned state holds until the exit starts. Minimum display time per cue is `max(800 ms, chars / 17 s)`; if the SRT cue is shorter, extend toward the next cue without breaking rule 3, and warn.
5. **Emphasis (per word):** at the estimated word start (minus 2 frames anticipation) play the style's emphasis effect: `pop` (scale 1 to 1.10 to 1 with spring), `accent color`, `underline sweep` (width 0 to 100% over 8 frames, starts 3-6 frames after the pop), and `glow pulse` where the style enables glow.
6. **Readability:** text is sharp at rest (blur exactly 0 when speed is 0), always uses a soft shadow, and uses the scrim when enabled. Never let motion blur or glitch reduce legibility of a stationary caption.
7. **Layout:** the block is anchored per `config.layout`, kept inside the safe area, lines aligned per `align`. All text is measured with `@remotion/layout-utils` **only after the active style's fonts have finished loading** (section 15); if a line would exceed the safe width, **scale that line's font size down** (never overflow, never wrap mid-recipe).
8. **Pixel snapping:** use `transform` only (translate/scale), never `top/left` animation. At rest, round translation to whole device pixels so there is no sub-pixel shimmer at 4K. Drift (section 11.5) never translates, so snapping always holds at rest.
9. **Precedence:** for ease, durations, distances, overshoot and every other recipe value: **default recipe < style tokens < `config.recipe`**. Later sources override earlier ones field by field. The merge lives in `recipe.ts`.

---

## 11. Motion engine

### 11.1 Easing presets (`motion/easing.ts`) using `Easing.bezier`

| Name | Bezier | Use |
|---|---|---|
| `outExpo` | (0.16, 1, 0.3, 1) | main entrances |
| `outCubic` | (0.33, 1, 0.68, 1) | softer entrances |
| `inCubic` | (0.32, 0, 0.67, 0) | exits |
| `inOutCubic` | (0.65, 0, 0.35, 1) | repositioning |
| `outBack` | (0.34, 1.56, 0.64, 1) | playful overshoot |

Never use linear motion for position or scale.

### 11.2 Spring presets (`motion/springs.ts`)

| Name | Config | Use |
|---|---|---|
| `soft` | damping 200 | minimal, cinematic |
| `snappy` | damping 20, stiffness 200 | neon |
| `pop` | damping 12, stiffness 180 | emphasis, bold |
| `bouncy` | damping 8 | optional |

### 11.3 Stagger
Per-line delay comes from the recipe. Presets for reference: snappy = 1-2 frames, thoughtful = 3-4 frames (at 30 fps).

### 11.4 Motion blur (`motion/blur.ts`)
- Velocity-based: for each line layer compute displacement between this frame and the previous frame (evaluate the same animation function at `frame - 1`). `blurPx = clamp(speedPxPerFrame * k, 0, maxBlur)` applied as **directional** blur along the movement axis (SVG `feGaussianBlur` with `stdDeviation="x y"` where the non-moving axis is 0, one filter per layer with a unique id).
- Blur falls to exactly 0 when the line settles, and applies only while speed is above a small threshold and only to layers with `motionBlur: true`.
- In `quality: "preview"`, motion blur is disabled. In `final`, it follows `config.motionBlur.enabled`.

### 11.5 Continuous subtle life (off by default)
When `config.drift` is true and quality is `final`, settled lines get a slow, seeded `noise2D` **scale breathing** of at most ±0.3%. Drift never translates, so it cannot break alignment or pixel snapping. Disabled in `preview` and when `config.drift` is false.

---

## 12. Style presets

Each style file exports tokens: fonts per slot, sizes (u), weights, case, tracking, colors, spring/ease overrides, emphasis effect, and effect defaults. Load fonts with `@remotion/google-fonts` and block rendering until loaded.

### Slot typography

| Style | Slot A | Slot B | Slot C |
|---|---|---|---|
| **minimal** | Inter 600, 112u, tracking -0.02em, white | Inter 300, 64u, tracking 0.01em, white 90% | Inter 500, 44u, UPPERCASE, tracking 0.18em, accent `#8AB4FF` |
| **neon** | Space Grotesk 700, 120u, UPPERCASE, cyan `#00E5FF` | Space Grotesk 500, 64u, white | JetBrains Mono 500, 40u, UPPERCASE, tracking 0.12em, magenta `#FF2BD6` |
| **bold** | Anton, 150u, UPPERCASE, yellow `#FFD60A` | Montserrat 800, 72u, UPPERCASE, white | Poppins 600, 46u, white 90% |
| **cinematic** | Playfair Display 700, 112u, warm white `#F5E6C8` | Montserrat 300, 56u, UPPERCASE, tracking 0.3em, white 85% | Montserrat 300, 36u, UPPERCASE, tracking 0.4em, gold `#D4AF37` |

### Behavior per style

| Style | Ease / spring | Durations | Emphasis | Default effects |
|---|---|---|---|---|
| minimal | `soft`, outCubic | normal, low overshoot (2%) | accent color + underline | shadow, scrim |
| neon | `snappy`, outExpo | fast (frames x0.85) | pop + glow pulse | shadow, glow, **glitch** flicker on entrance (2-4 frames, RGB split) |
| bold | `pop`, outBack for slot A | normal, 6-8% overshoot | pop + accent color | shadow, depth layer |
| cinematic | `soft`, outCubic | slow (frames x1.4) | color shift to gold + underline | shadow, scrim, **grain + vignette** |

These behavior values are style tokens and override the default recipe per section 10.3 rule 9 (e.g. bold's 6-8% overshoot replaces the default 3%). `config.recipe` overrides both. For accent colors, the extracted palette overrides the style when `config.palette.enabled` is true.

---

## 13. Effects (all cost-aware)

Each effect component takes `quality` and degrades cheaply in `preview`.

- **Scrim:** soft vertical gradient (0 to ~35-40% black) behind the caption area, fades in/out with the caption.
- **Shadow:** soft layered text shadow, e.g. `0 2u 12u rgba(0,0,0,0.45)`, scaled by the unit scale.
- **Depth layer:** duplicate of each line behind the original at 92-95% scale, 60-70% opacity, offset 2-5u, optional 1-2u blur.
- **Glow:** `drop-shadow` / text-shadow in the line's accent color; pulses on emphasis.
- **Glitch (neon only):** brief RGB-split + horizontal offset jitter on entrance, seeded noise so renders are deterministic. Never active on a settled caption.
- **Grain + vignette (cinematic only):** low-intensity animated grain via seeded noise and a soft vignette; keep intensity low.
- **Not included in v1:** volumetric light rays, wave warp, mosaic/pixelate (too heavy at 4K on the target machine).

---

## 14. Palette from video (optional)

`npm run palette` extracts one frame from the video (`ffmpeg`) and computes a small palette (dominant, accent, dark, light), writing `src/palette.json`. A neutral default `src/palette.json` is committed so the import never fails. When `config.palette.enabled` is true, the style's accent colors are replaced by palette colors that pass a contrast check (>= 4.5:1 against the scrim/shadowed background; otherwise fall back to the style's default).

---

## 15. Fonts

Use `@remotion/google-fonts` for: Inter, SpaceGrotesk, JetBrainsMono, Anton, Montserrat, Poppins, PlayfairDisplay.
- Load **only the active style's** fonts and only the weights it needs.
- Await each font's `loadFont(...).waitUntilDone()` before any `measureText` call or render (use `delayRender`/`continueRender`). Measuring before fonts load gives wrong widths.
- Confirm there is no flash of fallback font in a still.

---

## 16. Slow-PC workflow (important)

The user's machine is slow and the output resolution is the source maximum (possibly 4K).

1. `npm run proxy`:
   - Probes the source with `ffprobe`. If it is variable frame rate, it first writes `public/intro.cfr.mp4` (constant frame rate at the nearest standard rate, audio copied, video at `-crf 14`) and tells the user to set `config.video` to it.
   - Then creates `public/intro.proxy.mp4` from the (CFR) source: 720p tall, same fps, same duration, `libx264 -crf 23 -preset veryfast`, AAC audio.
   - Prints the exact ffmpeg commands used.
2. Studio preview uses the proxy and `quality: "preview"` (no motion blur, no grain, no drift, lighter effects).
3. Frame checks: `npm run still -- --frame=<n>` renders a single frame at final quality.
4. Final render happens once at the end with `quality: "final"`.
5. Concurrency comes from `config.render.concurrency` (default 2). Document tuning guidance in the README.
6. Keep per-frame work light: avoid heavy filters on full-frame layers, apply filters only to caption-sized layers, memoize measured text.

---

## 17. Scripts (`package.json`)

Props are passed as files so the commands work in every shell, including Windows `cmd`.

```json
{
  "scripts": {
    "dev": "remotion studio",
    "proxy": "tsx scripts/make-proxy.ts",
    "srt:fit": "tsx scripts/srt-fit.ts",
    "srt:check": "tsx scripts/srt-check.ts",
    "palette": "tsx scripts/extract-palette.ts",
    "analyze": "tsx scripts/analyze-srt.ts",
    "test": "vitest run",
    "still": "remotion still LayeredCaption out/frame.png --props=./props/final.json",
    "render:test": "remotion render LayeredCaption out/test.mp4 --scale=0.5 --props=./props/preview.json",
    "render": "remotion render LayeredCaption out/intro.mp4 --codec=h264 --crf=17 --props=./props/final.json"
  }
}
```

---

## 18. Output settings

- Container/codec: MP4, H.264, `--crf=17` (allow 16-18 via flag), source resolution and fps
- Audio: carried from the source video (AAC)
- The user renders with **Remotion's own renderer** (`remotion render`); no other render pipeline
- `remotion.config.ts` imports `src/intro.config.ts` and sets:
  - `Config.setVideoImageFormat("png")`, so the source footage isn't degraded by the default JPEG frame capture
  - `Config.setColorSpace("bt709")`
  - `Config.setScale(config.outputScale)`
  - `Config.setConcurrency(config.render.concurrency)`
  - `Config.setChromiumOpenGlRenderer("swangle")`, for deterministic output

Verify these `Config` method names against the pinned Remotion version.

---

## 19. Error handling

- Missing video, SRT or font: show a clear message in Studio and fail renders with an actionable error.
- Non-blocking warnings (`props.warnings`): printed to the console by `calculateMetadata` and shown in Studio as a small badge in the top-left corner (click to expand). The badge is rendered only when not rendering (`getRemotionEnvironment().isRendering` is false), so it never appears in stills or videos.
- Video longer than `maxDurationSec`: warn and trim.
- Variable-frame-rate source used directly: warn in Studio and in `npm run proxy`, pointing to the CFR file.
- Invalid SRT block: skip it, warn with the block index and line.
- Unknown style name: fall back to `bold` and warn.
- `ffmpeg`/`ffprobe` not found: scripts print install instructions and exit with a non-zero code.

---

## 20. Acceptance criteria

1. `npm i && npm run dev` opens Remotion Studio with the `LayeredCaption` composition, no console errors, using the proxy video when present.
2. The composition's width, height, fps and duration match the source video automatically (including fractional fps). A video longer than 30 s is trimmed with a warning.
3. Changing only `intro.config.ts` (style, anchor, recipe overrides, effects) and `captions.srt` changes the output; nothing else needs editing.
4. Each cue line animates as an **independent layer** (different direction, delay, font), with the default recipe behaving as in section 10.2, and ends in a clean aligned final state. 1-, 2- and 3-line cues map to slots per section 10.3 rule 1.
5. Captions land on the speech: entrances begin 2-3 frames before the cue start; the hand-off follows section 10.3 rule 3 (outgoing exit done by the next entrance start, or a minimum 4-frame fade).
6. `*emphasis*` words trigger the style's emphasis effect near their estimated time; markers never appear in the rendered text.
7. Motion blur appears only while a line is moving fast and is exactly 0 at rest in `final` quality.
8. Text never overflows the safe area; long lines auto-scale down.
9. `npm run srt:fit` outputs a valid SRT with the same words in the same order, honors the limits, preserves balanced emphasis markers, and prints a summary. `npm run srt:check` reports the warnings listed in 7.5.
10. All four styles render correctly with their fonts, colors and effect defaults; neon glitch and cinematic grain appear only in their styles.
11. A 4K render looks identical to 1080p in layout (reference-unit scaling) and has no sub-pixel shimmer on settled text (drift off by default, and it never translates).
12. Repeated renders of the same frame on the same machine are pixel-identical (no unseeded randomness, `swangle` renderer).
13. `npm run render` produces `out/intro.mp4` with the original audio intact and no visible degradation of the source footage (PNG frame capture).
14. The analyzer interface exists with a working `markers` provider and a stubbed `llm` provider; no API key is hardcoded and `.env.example` documents the variables.
15. `README.md` explains, command by command: setup, where to put the video and SRT, how to write emphasis markers, how to run `srt:fit`, how to make the proxy (and when to switch to the CFR file), how to preview, how to check a still, how to render, how to switch styles and override the recipe, and how to add a new template later.
16. `npm test` passes, covering at least: SRT parsing edge cases (BOM, `\r\n`, `.` timestamps, escaped `\*`, unclosed markers), word timing, and the `srt:fit` invariants (same words, same order, balanced markers, limits honored).

---

## 21. Build order for the agent

1. Scaffold project, config, types, `props/`, `remotion.config.ts`, `.gitignore`, `.env.example`, default `palette.json`.
2. Video metadata + `Background` (proxy/original), unit scaling, error screens.
3. SRT parser, timing, annotate, `srt:check`, with tests.
4. Motion engine: easing, springs, blur helper.
5. Styles and fonts.
6. Template: `CaptionLine` (one layer), then `CaptionBlock`, slot mapping, layout and safe area, emphasis `Word`.
7. Effects: scrim, shadow, depth, glow, then glitch and grain.
8. `srt:fit` (pure logic in `src/srt/fit.ts` plus script), with tests.
9. Proxy/CFR and palette scripts, analyzer stub.
10. Render scripts, README, final pass against section 20.

Verify each step in Studio before moving on. Output complete files at every step.
