import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { font, size } from "../theme";
import { Shell } from "./Shell";
import type { Theme } from "../types";

export type BreakdownPoint = {
  text: string;
  /**
   * 原文依据。null 表示素材里找不到能支撑这条结论的原话。
   *
   * 后端 strip_fake_evidence 已经把「意思相近但不是原文」的一律置成 null，
   * 所以这里拿到的非 null 值可以放心标为「原文」—— 它一定真的在书里。
   */
  evidence: string | null;
};

export type BreakdownData = {
  kicker: string;
  points: BreakdownPoint[];
  book_title: string;
};

/** 逐条浮现：把本帧时长均分给各条，讲到哪条哪条亮。 */
export const Breakdown: React.FC<{
  theme: Theme;
  data: BreakdownData;
  index?: number;
  total?: number;
}> = ({ theme, data, index, total }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const slot = durationInFrames / (data.points.length + 1);
  const accent = theme.accent ?? "#e8b84b";

  return (
    <Shell
      bg={theme.ink ?? "#12100e"}
      fg={theme.paper ?? "#f4f1ec"}
      label={data.book_title}
      accent={accent}
      kind="breakdown"
      index={index}
      total={total}
      align="start"
    >
      <div
        style={{
          fontFamily: font.sans,
          fontSize: size.kicker,
          letterSpacing: 6,
          opacity: 0.5,
          marginBottom: 44,
          color: accent,
        }}
      >
        {data.kicker}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 44 }}>
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
                gap: 24,
                opacity,
                transform: `translateY(${shift}px)`,
              }}
            >
              {/* 竖线把「结论 + 依据」在视觉上绑成一组 */}
              <span
                style={{
                  width: 4,
                  borderRadius: 4,
                  background: accent,
                  flexShrink: 0,
                  alignSelf: "stretch",
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: font.sans,
                    fontWeight: 700,
                    fontSize: size.kicker,
                    color: accent,
                    letterSpacing: 2,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div
                  style={{
                    fontFamily: font.sans,
                    fontWeight: 600,
                    fontSize: size.point,
                    lineHeight: 1.5,
                    marginTop: 8,
                  }}
                >
                  {point.text}
                </div>
                {/* evidence 为 null 时整块不渲染 —— 不留空占位，竖线会跟着变短 */}
                {point.evidence ? (
                  <div
                    style={{
                      fontFamily: font.serif,
                      fontSize: size.evidence,
                      lineHeight: 1.66,
                      opacity: 0.52,
                      marginTop: 12,
                    }}
                  >
                    原文「{point.evidence}」
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
};
