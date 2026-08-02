import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { font, size } from "../theme";
import { Shell } from "./Shell";
import type { Theme } from "../types";

export type MyTakeData = {
  kicker: string;
  text: string;
};

/**
 * 这一帧是整个产品的存在理由。
 * 独立配色 + 左侧竖线，视觉上明确区分「作者说的」和「我说的」。
 */
export const MyTake: React.FC<{
  theme: Theme;
  data: MyTakeData;
  index?: number;
  total?: number;
}> = ({ theme, data, index, total }) => {
  const frame = useCurrentFrame();
  const grow = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const fade = interpolate(frame, [6, 24], [0, 1], { extrapolateRight: "clamp" });
  const accent = theme.takeAccent ?? "#4fd1a5";

  return (
    <Shell
      bg={theme.takeBg ?? "#0f2a24"}
      fg="#eaf5f0"
      label="我的想法"
      accent={theme.takeAccent ?? "#4fd1a5"}
      kind="my_take"
      index={index}
      total={total}
    >
      <div style={{ display: "flex", gap: 26 }}>
        <div
          style={{
            width: 5,
            background: accent,
            transformOrigin: "top",
            transform: `scaleY(${grow})`,
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, opacity: fade }}>
          <div
            style={{
              fontFamily: font.sans,
              fontSize: size.kicker,
              letterSpacing: 6,
              color: accent,
              marginBottom: 30,
            }}
          >
            {data.kicker}
          </div>
          <div
            style={{
              fontFamily: font.sans,
              fontWeight: 500,
              fontSize: size.take,
              lineHeight: 1.82,
            }}
          >
            {data.text}
          </div>
        </div>
      </div>
    </Shell>
  );
};
