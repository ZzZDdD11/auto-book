import React from "react";
import { AbsoluteFill } from "remotion";
import { PAD_X, PAD_Y, font, size } from "../theme";

/** 每帧共用的外壳：背景色 + 顶部书名条 + 安全边距。 */
export const Shell: React.FC<{
  bg: string;
  fg: string;
  label: string;
  children: React.ReactNode;
}> = ({ bg, fg, label, children }) => (
  <AbsoluteFill style={{ backgroundColor: bg, color: fg }}>
    <AbsoluteFill
      style={{
        padding: `${PAD_Y}px ${PAD_X}px`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontFamily: font.sans,
          fontSize: size.meta,
          opacity: 0.55,
          letterSpacing: 2,
        }}
      >
        <span
          style={{
            width: 26,
            height: 36,
            borderRadius: 4,
            background: "currentColor",
            opacity: 0.6,
            flexShrink: 0,
          }}
        />
        {label}
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  </AbsoluteFill>
);
