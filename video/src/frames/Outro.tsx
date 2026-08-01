import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { font, size } from "../theme";
import { Shell } from "./Shell";
import type { Theme } from "../types";

export type OutroData = {
  question: string;
  footer_lines: string[];
  book_index: number;
  year: number;
};

export const Outro: React.FC<{ theme: Theme; data: OutroData }> = ({ theme, data }) => {
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp" });

  return (
    <Shell
      bg={theme.paper ?? "#f4f1ec"}
      fg={theme.ink ?? "#12100e"}
      label={`第 ${data.book_index} 本 · ${data.year}`}
    >
      <div
        style={{
          opacity: fade,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          height: "100%",
          paddingBottom: 40,
        }}
      >
        <div
          style={{
            fontFamily: font.sans,
            fontWeight: 700,
            fontSize: size.take,
            lineHeight: 1.62,
            marginBottom: 40,
          }}
        >
          {data.question}
        </div>
        <div
          style={{
            fontFamily: font.sans,
            fontSize: size.meta,
            opacity: 0.6,
            lineHeight: 2,
          }}
        >
          {data.footer_lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      </div>
    </Shell>
  );
};
