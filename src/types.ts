export type LegacyStyleName = "minimal" | "neon" | "bold" | "cinematic";
export type StylePresetName = "clean-minimal" | "neon-techy" | "bold-energetic" | "cinematic-elegant";
export type StyleName = LegacyStyleName;
export type StylePreset = StylePresetName | LegacyStyleName;

export type Quality = "preview" | "final";
export type SlotName = "A" | "B" | "C";
export type Direction = "top" | "bottom" | "left" | "right" | "none";
export type EaseName = "outExpo" | "outCubic" | "inCubic" | "inOutCubic" | "outBack";
export type SpringName = "soft" | "snappy" | "pop" | "bouncy";
export type MotionCurve = EaseName | SpringName;
export type VerticalAnchor = "top" | "center" | "bottom";
export type HorizontalAnchor = "left" | "center" | "right";
export type Align = "left" | "center" | "right";
export type AutoFlag = boolean | "auto";

export type FontFamily =
  | "Inter"
  | "Space Grotesk"
  | "JetBrains Mono"
  | "Anton"
  | "Montserrat"
  | "Poppins"
  | "Playfair Display";

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export type SrtWarning = {
  code:
    | "invalid-block"
    | "overlap"
    | "too-short"
    | "too-long"
    | "too-many-lines"
    | "line-too-long"
    | "beyond-video"
    | "reading-speed"
    | "unbalanced-marker"
    | "min-display-extended"
    | "fit";
  message: string;
  cueId?: number;
  line?: number;
};

/** Cue as written in the SRT: text lines keep their *emphasis* markers. */
export type RawCue = {
  id: number;
  startMs: number;
  endMs: number;
  lines: string[];
};

export type ParseResult = { cues: RawCue[]; warnings: SrtWarning[] };

export type AnnotatedWord = {
  text: string;
  emphasis?: boolean;
  startMs: number;
  endMs: number;
};

export type AnnotatedLine = { text: string; words: AnnotatedWord[] };

export type AnnotatedCue = {
  id: number;
  startMs: number;
  endMs: number;
  lines: AnnotatedLine[];
};

export type Enter = {
  from: Direction;
  distance: number | "offscreen";
  ease: MotionCurve;
  frames: number;
  delay: number;
  fade: boolean;
  scaleFrom?: number;
};

export type Exit = {
  to: Direction;
  ease: EaseName;
  frames: number;
  delay: number;
};

export type LineRecipe = {
  font: SlotName;
  enter: Enter;
  exit: Exit;
  motionBlur: boolean;
};

export type Recipe = {
  lines: [LineRecipe, LineRecipe, LineRecipe];
  anticipationFrames: number;
  exitOrder: "reverse" | "forward" | "together";
  settle: { overshoot: number; frames: number };
};

export type RecipeOverride = DeepPartial<Recipe>;

export type SlotTypography = {
  family: FontFamily;
  weight: number;
  sizeU: number;
  uppercase: boolean;
  trackingEm: number;
  color: string;
};

export type WordRole = "hero" | "accent" | "normal" | "connector";

export type RoleTypography = {
  family: FontFamily;
  weight: number;
  scale: number;
  uppercase: boolean;
  trackingEm: number;
  color: string;
  opacity?: number;
  fontStyle?: "normal" | "italic";
};

export type EntranceType =
  | "mask-reveal"
  | "slide-up"
  | "slide-down"
  | "slide-left"
  | "slide-right"
  | "scale-pop"
  | "blur-in"
  | "letter-stagger"
  | "rotate-in"
  | "tracking-collapse"
  | "typewriter"
  | "slice-reveal";

export type EmphasisEffect =
  | "highlight-wipe"
  | "underline-draw"
  | "squiggle-draw"
  | "color-flash"
  | "outline-fill"
  | "strike-through"
  | "impact-punch"
  | "glitch-rgb"
  | "glow-pulse"
  | "count-up"
  | "float-breathe"
  | "none";

export type WordData = {
  text: string;
  start: number; // in seconds
  end: number;   // in seconds
  role: WordRole;
  effect?: EmphasisEffect | string;
  color?: string;
  fontKey?: FontFamily | string;
  scale?: number;
  entrance?: EntranceType | string;
};

export type LineData = {
  words: WordData[];
};

export type ChunkData = {
  start: number; // in seconds
  end: number;   // in seconds
  lines: LineData[];
};

export type CaptionsDoc = {
  chunks: ChunkData[];
};

export type EmphasisSpec = {
  pop: boolean;
  accentColor: string;
  underline: boolean;
  glowPulse: boolean;
};

export type StyleEffects = {
  scrim: boolean;
  shadow: boolean;
  depthLayer: boolean;
  glow: boolean;
  glitch: boolean;
  grain: boolean;
};

export type StyleGraphics = {
  brackets: boolean;
  accentLines: boolean;
  rings: boolean;
  glowBlob: boolean;
  sweep: boolean;
  particles: boolean;
  maxParticles: number;
  vignette: boolean;
  glassBackdrop?: boolean;
  audioBars?: boolean;
  shockwaves?: boolean;
  cornerDots?: boolean;
};

export type StyleTokens = {
  name: StyleName;
  slots: Record<SlotName, SlotTypography>;
  roles?: Record<WordRole, RoleTypography>;
  graphics?: StyleGraphics;
  recipe: RecipeOverride;
  durationMultiplier: number;
  emphasis: EmphasisSpec;
  effects: StyleEffects;
};

/** Recipe after the precedence merge and the style duration multiplier, still in 30 fps frames. */
export type ResolvedRecipe = Recipe & {
  style: StyleTokens;
  slotTypography: Record<SlotName, SlotTypography>;
};

export type Palette = {
  dominant: string;
  accent: string;
  dark: string;
  light: string;
};

export type IntroConfig = {
  video: string;
  proxyVideo: string;
  srt: string;
  captionsJson?: string;
  srtOffsetMs: number;
  maxDurationSec?: number;
  cueSource: "srt" | "json";
  style: StylePreset;
  recipe: RecipeOverride;
  layout: {
    anchor: { vertical: VerticalAnchor; horizontal: HorizontalAnchor };
    align: Align;
    safeArea: { x: number; y: number };
    lineGap: number;
    offsetY?: number;
    maxWordsPerLine?: number;
    maxLinesPerChunk?: number;
  };
  palette: { enabled: boolean };
  effects: {
    scrim: boolean;
    shadow: boolean;
    depthLayer: AutoFlag;
    glow: AutoFlag;
    glitch: AutoFlag;
    grain: AutoFlag;
  };
  motionBlur: { enabled: boolean };
  drift: boolean;
  outputScale: number;
  render: { concurrency: number };
};

export type CaptionProps = {
  quality: Quality;
  style?: StylePreset;
  safeMargin?: number;
  offsetY?: number;
  maxWordsPerLine?: number;
  maxLinesPerChunk?: number;
  cues: AnnotatedCue[];
  captionsDoc?: CaptionsDoc | null;
  /** Set by calculateMetadata when something blocks rendering (missing video/SRT). */
  error: string | null;
  warnings: string[];
  hasProxy: boolean;
  durationInFrames?: number;
  fps?: number;
  width?: number;
  height?: number;
  videoDurationSec?: number;
  videoSrc?: string;
};
