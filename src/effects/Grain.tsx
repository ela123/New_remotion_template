import type React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { Quality } from "../types";

const GRAIN_OPACITY = 0.07;

export const Grain: React.FC<{ quality: Quality }> = ({ quality }) => {
  const frame = useCurrentFrame();
  if (quality === "preview") return null;
  const filterId = `grain-${frame}`;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg
        viewBox="0 0 960 540"
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0, opacity: GRAIN_OPACITY, mixBlendMode: "overlay" }}
      >
        <filter id={filterId}>
          <feTurbulence type="fractalNoise" baseFrequency={0.85} numOctaves={2} seed={frame % 9973} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${filterId})`} />
      </svg>
      <AbsoluteFill
        style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.45) 100%)" }}
      />
    </AbsoluteFill>
  );
};
