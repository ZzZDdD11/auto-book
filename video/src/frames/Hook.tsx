import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { font, size } from "../theme";
import { Shell } from "./Shell";
import type { Theme } from "../types";

export type HookData = {
  lines: string[];
  highlight: string | null;
  book_title: string;
  book_author: string;
};

export const Hook: React.FC<{ theme: Theme; data: HookData }> = ({ theme, data }) => {
  const frame = useCurrentFrame();
  const rise = interpolate(frame, [0, 18], [40, 0], { extrapolateRight: "clamp" });
  const fade = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" });

  return (
    <Shell
      bg={theme.ink ?? "#12100e"}
      fg={theme.paper ?? "#f4f1ec"}
      label={`${data.book_title}${data.book_author ? ` · ${data.book_author}` : ""}`}
    >
      <div
        style={{
          fontFamily: font.sans,
          fontWeight: 700,
          fontSize: size.hook,
          lineHeight: 1.32,
          letterSpacing: -2,
          transform: `translateY(${rise}px)`,
          opacity: fade,
        }}
      >
        {data.lines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
        {data.highlight ? (
          <div style={{ color: theme.accent ?? "#e8b84b", marginTop: 10 }}>{data.highlight}</div>
        ) : null}
      </div>
    </Shell>
  );
};
