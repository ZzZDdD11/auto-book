import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { font, size } from "../theme";
import { Shell } from "./Shell";
import type { Theme } from "../types";

export type BreakdownData = {
  kicker: string;
  points: string[];
  book_title: string;
};

/** 逐条浮现：把本帧时长均分给各条，讲到哪条哪条亮。 */
export const Breakdown: React.FC<{ theme: Theme; data: BreakdownData }> = ({ theme, data }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const slot = durationInFrames / (data.points.length + 1);
  const accent = theme.accent ?? "#e8b84b";

  return (
    <Shell bg={theme.ink ?? "#12100e"} fg={theme.paper ?? "#f4f1ec"} label={data.book_title}>
      <div
        style={{
          fontFamily: font.sans,
          fontSize: size.kicker,
          letterSpacing: 6,
          opacity: 0.5,
          marginBottom: 40,
        }}
      >
        {data.kicker}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
        {data.points.map((point, i) => {
          const appearAt = slot * i;
          const opacity = interpolate(frame, [appearAt, appearAt + 12], [0.18, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const shift = interpolate(frame, [appearAt, appearAt + 12], [16, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 22,
                alignItems: "baseline",
                opacity,
                transform: `translateY(${shift}px)`,
              }}
            >
              <span
                style={{
                  fontFamily: font.sans,
                  fontWeight: 700,
                  fontSize: size.kicker,
                  color: accent,
                  flex: "0 0 46px",
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                style={{
                  fontFamily: font.sans,
                  fontWeight: 500,
                  fontSize: size.point,
                  lineHeight: 1.62,
                }}
              >
                {point}
              </span>
            </div>
          );
        })}
      </div>
    </Shell>
  );
};
