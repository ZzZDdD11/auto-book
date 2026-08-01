import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { font, size } from "../theme";
import { Shell } from "./Shell";
import type { Theme } from "../types";

export type QuoteData = {
  text: string;
  chapter: string | null;
  highlighted_at: string;
  progress: number;
  book_title: string;
};

export const Quote: React.FC<{ theme: Theme; data: QuoteData }> = ({ theme, data }) => {
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [0, 16], [0, 1], { extrapolateRight: "clamp" });

  return (
    <Shell
      bg={theme.paper ?? "#f4f1ec"}
      fg={theme.ink ?? "#12100e"}
      label={`原文${data.chapter ? ` · ${data.chapter}` : ""}`}
    >
      <div style={{ opacity: fade }}>
        <div
          style={{
            fontFamily: font.serif,
            fontSize: 130,
            lineHeight: 0.6,
            opacity: 0.22,
            marginBottom: 24,
          }}
        >
          “
        </div>
        <div
          style={{
            fontFamily: font.serif,
            fontWeight: 700,
            fontSize: size.quote,
            lineHeight: 1.72,
          }}
        >
          {data.text}
        </div>
        <div
          style={{
            height: 1,
            background: "currentColor",
            opacity: 0.16,
            margin: "48px 0 28px",
          }}
        />
        {/* 划线日期与进度 —— 「真读过」的证据，不要删 */}
        <div
          style={{
            fontFamily: font.sans,
            fontSize: size.meta,
            opacity: 0.55,
            lineHeight: 1.9,
          }}
        >
          <div>你划线于 {data.highlighted_at}</div>
          <div>阅读进度 {data.progress}%</div>
        </div>
      </div>
    </Shell>
  );
};
