import React from "react";
import { AbsoluteFill } from "remotion";
import { CAPTION_RESERVE, PAD_X, PAD_Y, font, size } from "../theme";

/** 帧的中文名，用在顶部进度指示里。 */
const KIND_LABEL: Record<string, string> = {
  hook: "开场",
  quote: "原文",
  breakdown: "拆解",
  my_take: "我的想法",
  outro: "收尾",
};

/**
 * 每帧共用的外壳：背景色 + 顶部书名条 + 播放进度 + 安全边距。
 *
 * 两个不显眼但重要的点：
 *   1. 正文区底部预留 CAPTION_RESERVE。字幕是绝对定位的，正文区如果占满
 *      整个高度，两者必然重叠 —— 实测过字幕压在正文上。
 *   2. 进度条按「当前帧算已播完」计算，不做帧内插值。逐帧推进的动画会把
 *      注意力吸到进度条上，与它「只是让人知道还剩多久」的定位相反。
 */
export const Shell: React.FC<{
  bg: string;
  fg: string;
  label: string;
  accent?: string;
  kind?: string;
  index?: number;
  total?: number;
  /**
   * 正文的纵向对齐方式。
   *
   * 默认 center 适合内容少的帧（hook 两行大字居中最有力）。
   * 内容多的帧要用 start —— 居中会把空白均分到上下两端，
   * 实测 breakdown 帧内容翻倍后依然显得空，就是这个原因。
   */
  align?: "center" | "start" | "end";
  children: React.ReactNode;
}> = ({ bg, fg, label, accent, kind, index, total, align = "center", children }) => {
  const showProgress =
    typeof index === "number" && typeof total === "number" && total > 0;
  const ratio = showProgress ? Math.min(1, (index + 1) / total) : 0;

  return (
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

        {showProgress ? (
          <div style={{ marginTop: 26 }}>
            <div
              style={{
                height: 3,
                borderRadius: 3,
                background: "currentColor",
                opacity: 0.14,
              }}
            >
              <div
                style={{
                  width: `${ratio * 100}%`,
                  height: "100%",
                  borderRadius: 3,
                  background: accent ?? "currentColor",
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontFamily: font.sans,
                fontSize: size.meta,
                opacity: 0.4,
                marginTop: 12,
                letterSpacing: 1,
              }}
            >
              <span>{KIND_LABEL[kind ?? ""] ?? ""}</span>
              <span>
                {(index ?? 0) + 1} / {total}
              </span>
            </div>
          </div>
        ) : null}

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent:
              align === "center" ? "center" : align === "end" ? "flex-end" : "flex-start",
            // 内容多的帧从顶部铺开，留白才不会被均分到上下两端
            paddingTop: align === "start" ? 56 : 0,
            // 给字幕留位置，否则字幕会压在正文上
            paddingBottom: CAPTION_RESERVE,
          }}
        >
          {children}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
