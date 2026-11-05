import type React from "react";
import { Composition, Folder } from "remotion";
import { SampleComposition } from "./sample/SampleRoot";
import { LayeredCaption } from "./template/LayeredCaption";
import { calculateCaptionMetadata } from "./video/metadata";
import type { CaptionProps } from "./types";

const defaultProps: CaptionProps = {
  quality: "preview",
  style: "bold-energetic",
  safeMargin: 0.08,
  offsetY: 0,
  maxWordsPerLine: 5,
  maxLinesPerChunk: 3,
  cues: [],
  captionsDoc: null,
  error: null,
  warnings: [],
  hasProxy: false,
};

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="LayeredCaption"
      component={LayeredCaption}
      defaultProps={defaultProps}
      calculateMetadata={calculateCaptionMetadata}
    />
    <Folder name="Tools">
      <SampleComposition />
    </Folder>
  </>
);
