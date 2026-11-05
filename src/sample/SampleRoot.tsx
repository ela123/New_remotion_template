import type React from "react";
import { Composition } from "remotion";
import { SampleFootage, calculateSampleMetadata } from "./SampleFootage";
import { DEFAULT_SAMPLE } from "./scene";

const SAMPLE_COMPOSITION_ID = "SampleFootage";

export const SampleComposition: React.FC = () => (
  <Composition
    id={SAMPLE_COMPOSITION_ID}
    component={SampleFootage}
    defaultProps={DEFAULT_SAMPLE}
    calculateMetadata={calculateSampleMetadata}
  />
);
