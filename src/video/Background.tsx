import type React from "react";
import { AbsoluteFill, OffthreadVideo, staticFile } from "remotion";
import { config } from "../intro.config";
import type { Quality } from "../types";

export const Background: React.FC<{ quality: Quality; hasProxy: boolean; videoSrc?: string }> = ({ quality, hasProxy, videoSrc }) => {
  const file = videoSrc ?? (quality === "preview" && hasProxy ? config.proxyVideo : config.video);
  const src = file.startsWith("http") || file.startsWith("file:") || file.startsWith("/") ? file : staticFile(file);
  return (
    <AbsoluteFill>
      <OffthreadVideo src={src} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </AbsoluteFill>
  );
};
