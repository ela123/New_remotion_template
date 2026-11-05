import type { AnnotatedCue, LineRecipe, ResolvedRecipe, SlotName, SrtWarning } from "../types";
import { msToFrames } from "../srt/timing";
import { exitOrderIndex, scaleFrames } from "../motion/stagger";
import { displayableCues, mapLinesToSlots } from "./layout";

export type LineSchedule = {
  slot: SlotName;
  enterStart: number;
  enterFrames: number;
  settleFrames: number;
  exitStart: number;
  exitFrames: number;
  fadeOnlyExit: boolean;
};

export type CueSchedule = {
  cueId: number;
  startFrame: number;
  endFrame: number;
  entranceStart: number;
  exitEnd: number;
  lines: LineSchedule[];
};

const MIN_EXIT_FRAMES = 4;
const MIN_DISPLAY_MS = 800;
const READING_CPS = 17;

const SLOT_INDEX = { A: 0, B: 1, C: 2 } as const;

export function slotRecipe(recipe: ResolvedRecipe, slot: SlotName): LineRecipe {
  return recipe.lines[SLOT_INDEX[slot]];
}

function minDisplayMs(cue: AnnotatedCue): number {
  const chars = cue.lines.reduce((sum, line) => sum + line.text.length, 0);
  return Math.max(MIN_DISPLAY_MS, (chars / READING_CPS) * 1000);
}

type DraftLine = {
  slot: SlotName;
  enterStart: number;
  enterFrames: number;
  settleFrames: number;
  exitOffset: number;
  exitFrames: number;
};

type Draft = {
  cue: AnnotatedCue;
  startFrame: number;
  endFrame: number;
  entranceStart: number;
  lines: DraftLine[];
};

const exitSpan = (lines: DraftLine[]): number =>
  Math.max(0, ...lines.map((l) => l.exitOffset + l.exitFrames));

function draftCue(cue: AnnotatedCue, recipe: ResolvedRecipe, fps: number): Draft {
  const startFrame = msToFrames(cue.startMs, fps);
  const endFrame = msToFrames(cue.endMs, fps);
  const entranceStart = Math.max(0, startFrame - scaleFrames(recipe.anticipationFrames, fps));
  const slots = mapLinesToSlots(cue.lines).map((a) => a.slot);
  const delays = slots.map((slot) => scaleFrames(slotRecipe(recipe, slot).enter.delay, fps));
  const firstDelay = Math.min(...delays);
  const settleFrames = scaleFrames(recipe.settle.frames, fps);

  const lines = slots.map((slot, i): DraftLine => {
    const line = slotRecipe(recipe, slot);
    const order = exitOrderIndex(i, slots.length, recipe.exitOrder);
    return {
      slot,
      enterStart: entranceStart + (delays[i] ?? 0) - firstDelay,
      enterFrames: scaleFrames(line.enter.frames, fps),
      settleFrames,
      exitOffset: order * scaleFrames(line.exit.delay, fps),
      exitFrames: scaleFrames(line.exit.frames, fps),
    };
  });

  return { cue, startFrame, endFrame, entranceStart, lines };
}

function extendForMinDisplay(
  draft: Draft,
  deadline: number,
  fps: number,
): { endFrame: number; warning: SrtWarning | null } {
  const needed = minDisplayMs(draft.cue);
  if (draft.cue.endMs - draft.cue.startMs >= needed) return { endFrame: draft.endFrame, warning: null };

  const target = draft.startFrame + msToFrames(needed, fps);
  const cap = deadline - exitSpan(draft.lines);
  const endFrame = Math.max(draft.endFrame, Math.min(target, cap));
  const shownMs = Math.round(((endFrame - draft.startFrame) / fps) * 1000);
  const outcome =
    endFrame >= target
      ? `extended to ${shownMs} ms`
      : `extended only to ${shownMs} ms to keep the hand-off to the next cue`;
  return {
    endFrame,
    warning: {
      code: "min-display-extended",
      cueId: draft.cue.id,
      message: `Cue ${draft.cue.id} is shorter than its minimum display time of ${Math.round(needed)} ms; ${outcome}.`,
    },
  };
}

function finishLines(draft: Draft, endFrame: number, deadline: number): LineSchedule[] {
  const available = deadline - endFrame;
  const span = exitSpan(draft.lines);

  if (span <= available) {
    return draft.lines.map((l) => toSchedule(l, endFrame + l.exitOffset, l.exitFrames, false));
  }

  if (available >= MIN_EXIT_FRAMES) {
    const factor = available / span;
    return draft.lines.map((l) => {
      const offset = Math.min(Math.floor(l.exitOffset * factor), available - MIN_EXIT_FRAMES);
      return toSchedule(l, endFrame + offset, Math.min(l.exitFrames, available - offset), false);
    });
  }

  const fadeStart = Math.max(draft.entranceStart, Math.min(endFrame, deadline));
  return draft.lines.map((l) => toSchedule(l, fadeStart, MIN_EXIT_FRAMES, true));
}

const toSchedule = (l: DraftLine, exitStart: number, exitFrames: number, fadeOnlyExit: boolean): LineSchedule => ({
  slot: l.slot,
  enterStart: l.enterStart,
  enterFrames: l.enterFrames,
  settleFrames: l.settleFrames,
  exitStart,
  exitFrames,
  fadeOnlyExit,
});

export function scheduleCues(
  cues: AnnotatedCue[],
  recipe: ResolvedRecipe,
  fps: number,
): { schedules: CueSchedule[]; warnings: SrtWarning[] } {
  const drafts = displayableCues(cues).map((cue) => draftCue(cue, recipe, fps));
  const warnings: SrtWarning[] = [];

  const schedules = drafts.map((draft, i): CueSchedule => {
    const deadline = drafts[i + 1]?.entranceStart ?? Number.POSITIVE_INFINITY;
    const { endFrame, warning } = extendForMinDisplay(draft, deadline, fps);
    if (warning) warnings.push(warning);
    const lines = finishLines(draft, endFrame, deadline);
    return {
      cueId: draft.cue.id,
      startFrame: draft.startFrame,
      endFrame,
      entranceStart: draft.entranceStart,
      exitEnd: Math.max(draft.entranceStart, ...lines.map((l) => l.exitStart + l.exitFrames)),
      lines,
    };
  });

  return { schedules, warnings };
}
