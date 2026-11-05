import type { AnnotatedCue, RawCue } from "../types";
import { annotateCues } from "./annotate";

export const ANNOTATED_CUES_FILE = "annotated-cues.json";

export interface CueAnalyzer {
  name: string;
  analyze(cues: RawCue[]): Promise<AnnotatedCue[]>;
}

export const markersAnalyzer: CueAnalyzer = {
  name: "markers",
  analyze: (cues) => Promise.resolve(annotateCues(cues)),
};

export const llmAnalyzer: CueAnalyzer = {
  name: "llm",
  analyze: () => Promise.reject(new Error("LLM provider not implemented yet")),
};

export function getAnalyzer(name: "markers" | "llm"): CueAnalyzer {
  return name === "llm" ? llmAnalyzer : markersAnalyzer;
}
