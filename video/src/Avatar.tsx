import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { Theme } from "./types";

/**
 * 账号头像。
 *
 * 不用文字、不用书名 —— 头像在信息流里只有指甲盖大小，任何字都糊成一团。
 * 只留一个能在 40x40px 缩略图里也认得出的标志：一本摊开的书 + 一道划线。
 * 划线是这个产品的核心动作（读书时划线），也和视频里的高亮色系统一致，
 * 换账号名不用换头像。
 *
 * 出两个版本：dark 用在深色场景（抖音默认深色背景），light 用在浅色场景
 * （小红书、公众号大多是白底）。配色都取自 theme，不额外造一套颜色。
 */
export type AvatarProps = {
  variant?: "dark" | "light";
  theme?: Theme;
};

export const Avatar: React.FC<AvatarProps> = ({ variant = "dark", theme }) => {
  const { width, height } = useVideoConfig();
  const t = theme ?? {};
  const ink = t.ink ?? "#12100e";
  const paper = t.paper ?? "#f4f1ec";
  const accent = t.accent ?? "#e8b84b";

  const bg = variant === "dark" ? ink : paper;
  const page = variant === "dark" ? paper : ink;

  const pageW = width * 0.32;
  const pageH = height * 0.46;
  const angle = 16;

  const pageStyle: React.CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    width: pageW,
    height: pageH,
    background: page,
    borderRadius: pageW * 0.08,
  };

  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      {/* 摊开的书：两页从同一个书脊点向左右打开 */}
      <div style={{ position: "absolute", left: "50%", top: "68%" }}>
        <div
          style={{
            ...pageStyle,
            transformOrigin: "bottom right",
            transform: `translate(-${pageW}px, -${pageH}px) rotate(-${angle}deg)`,
          }}
        />
        <div
          style={{
            ...pageStyle,
            transformOrigin: "bottom left",
            transform: `translateY(-${pageH}px) rotate(${angle}deg)`,
            overflow: "hidden",
          }}
        >
          {/* 划线：右页上被划亮的那一行 */}
          <div
            style={{
              position: "absolute",
              left: "16%",
              top: "32%",
              width: "68%",
              height: "13%",
              background: accent,
              borderRadius: 999,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
