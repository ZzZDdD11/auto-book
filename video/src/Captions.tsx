import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { font, size } from "./theme";
import type { Caption } from "./types";

export const Captions: React.FC<{ captions: Caption[] }> = ({ captions }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const active = captions.find((c) => t >= c.startS && t < c.endS);
  if (!active) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 190,
        textAlign: "center",
        padding: "0 70px",
      }}
    >
      <span
        style={{
          display: "inline-block",
          background: "rgba(0,0,0,0.72)",
          color: "#fff",
          fontFamily: font.sans,
          fontWeight: 500,
          fontSize: size.caption,
          lineHeight: 1.5,
          letterSpacing: 1,
          padding: "12px 22px",
          borderRadius: 10,
        }}
      >
        {active.text}
      </span>
    </div>
  );
};
