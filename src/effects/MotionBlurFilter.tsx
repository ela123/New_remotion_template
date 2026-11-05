import type React from "react";

type Props = { id: string; x: number; y: number; boxWidth: number; boxHeight: number; padPx: number };

const region = (sigma: number, pad: number, size: number): { start: string; extent: string } => {
  const margin = (3 * sigma + pad) / Math.max(1, size);
  return { start: `${-margin * 100}%`, extent: `${(1 + 2 * margin) * 100}%` };
};

export const MotionBlurFilter: React.FC<Props> = ({ id, x, y, boxWidth, boxHeight, padPx }) => {
  const h = region(x, padPx, boxWidth);
  const v = region(y, padPx, boxHeight);
  return (
    <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
      <defs>
        <filter id={id} x={h.start} y={v.start} width={h.extent} height={v.extent} colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation={`${x} ${y}`} />
        </filter>
      </defs>
    </svg>
  );
};
