import type React from "react";
import type { Quality, VerticalAnchor } from "../types";

type Band = { y: number; height: number };

const MAX_ALPHA = 0.38;
const PAD_U = 120;

const gradient = (direction: "to bottom" | "to top", quality: Quality): string =>
  quality === "preview"
    ? `linear-gradient(${direction}, rgba(0,0,0,0), rgba(0,0,0,${MAX_ALPHA}))`
    : `linear-gradient(${direction}, rgba(0,0,0,0) 0%, rgba(0,0,0,${MAX_ALPHA * 0.45}) 40%, rgba(0,0,0,${MAX_ALPHA}) 100%)`;

function scrimStyle(block: Band, frameHeight: number, anchor: VerticalAnchor, pad: number, quality: Quality): React.CSSProperties {
  if (anchor === "bottom") {
    const top = Math.max(0, block.y - pad);
    return { top, height: frameHeight - top, background: gradient("to bottom", quality) };
  }
  if (anchor === "top") {
    return { top: 0, height: Math.min(frameHeight, block.y + block.height + pad), background: gradient("to top", quality) };
  }
  return {
    top: block.y - pad,
    height: block.height + 2 * pad,
    background: `radial-gradient(ellipse at center, rgba(0,0,0,${MAX_ALPHA * 0.9}) 0%, rgba(0,0,0,0) 70%)`,
  };
}

export const Scrim: React.FC<{
  block: Band;
  frameHeight: number;
  anchor: VerticalAnchor;
  opacity: number;
  unit: number;
  quality: Quality;
}> = ({ block, frameHeight, anchor, opacity, unit, quality }) => {
  if (opacity <= 0) return null;
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: 0,
        width: "100%",
        opacity,
        pointerEvents: "none",
        ...scrimStyle(block, frameHeight, anchor, PAD_U * unit, quality),
      }}
    />
  );
};
