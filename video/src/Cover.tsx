import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { font } from "./theme";
import type { Theme } from "./types";

/**
 * 封面。四个平台尺寸共用这一个组件。
 *
 * 为什么用 Remotion 而不是 Pillow 画：封面必须和视频长得一样
 * （同字体、同配色、同间距）。用别的工具画等于把版式规则实现两遍，
 * 改一处就得改两处，必然漂移。
 *
 * 文案直接复用 hook 帧的 lines/highlight —— 零额外 AI 成本，
 * 而且封面承诺的和视频前三秒说的是同一句话，观众点进来不会有落差。
 */
export type CoverProps = {
  lines: string[];
  highlight: string | null;
  bookTitle: string;
  bookAuthor: string;
  bookIndex: number;
  year: number;
  progress: number;
  theme?: Theme;
};

/**
 * 按画布形状选排版档位。
 *
 * 不能只靠缩放：2.35:1 的横条上「能力不够 只是表象」一行放得下，
 * 9:16 竖屏上必须断成两行。这是排版问题，不是缩放问题。
 */
type Layout = {
  /** 是否把 lines 合并成一行 */
  inline: boolean;
  padX: number;
  padY: number;
  titleSize: number;
  metaSize: number;
  gap: number;
  showMeta: boolean;
};

export const pickLayout = (width: number, height: number): Layout => {
  const ratio = width / height;

  // 2.35:1 这类横条：空间极扁，合并成一行，去掉次要信息
  if (ratio > 1.8) {
    return {
      inline: true,
      padX: 64,
      padY: 48,
      titleSize: 76,
      metaSize: 26,
      gap: 18,
      showMeta: false,
    };
  }

  // 1:1 方图
  if (ratio > 0.9) {
    return {
      inline: false,
      padX: 96,
      padY: 96,
      titleSize: 132,
      metaSize: 36,
      gap: 34,
      showMeta: true,
    };
  }

  // 3:4 与 9:16 竖图
  const tall = ratio < 0.65;
  return {
    inline: false,
    padX: 88,
    padY: tall ? 150 : 110,
    titleSize: tall ? 138 : 130,
    metaSize: 36,
    gap: 36,
    showMeta: true,
  };
};

export const Cover: React.FC<CoverProps> = ({
  lines,
  highlight,
  bookTitle,
  bookAuthor,
  bookIndex,
  year,
  progress,
  theme,
}) => {
  // 宽高从 Remotion 拿，不从 props 传 —— 传参会与真实画布不一致
  const { width, height } = useVideoConfig();
  const t = theme ?? {};
  const ink = t.ink ?? "#12100e";
  const paper = t.paper ?? "#f4f1ec";
  const accent = t.accent ?? "#e8b84b";
  const layout = pickLayout(width, height);

  const titleBlock = layout.inline ? (
    <div
      style={{
        fontFamily: font.sans,
        fontWeight: 700,
        fontSize: layout.titleSize,
        lineHeight: 1.24,
        letterSpacing: -2,
        display: "flex",
        gap: 26,
        flexWrap: "wrap",
      }}
    >
      {lines.map((line, i) => (
        <span key={i} style={line === highlight ? { color: accent } : undefined}>
          {line}
        </span>
      ))}
    </div>
  ) : (
    <div
      style={{
        fontFamily: font.sans,
        fontWeight: 700,
        fontSize: layout.titleSize,
        lineHeight: 1.3,
        letterSpacing: -3,
      }}
    >
      {lines.map((line, i) => (
        <div key={i} style={line === highlight ? { color: accent } : undefined}>
          {line}
        </div>
      ))}
    </div>
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: ink,
        color: paper,
        padding: `${layout.padY}px ${layout.padX}px`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      {/* 书名条：合理使用要求指明作品名称与作者，同时也是「真读过」的信任状 */}
      <div
        style={{
          fontFamily: font.sans,
          fontSize: layout.metaSize,
          opacity: 0.55,
          letterSpacing: 2,
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: layout.gap,
        }}
      >
        <span
          style={{
            width: layout.metaSize * 0.7,
            height: layout.metaSize * 1.1,
            borderRadius: 4,
            background: "currentColor",
            opacity: 0.6,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {bookTitle}
          {bookAuthor ? ` · ${bookAuthor}` : ""}
        </span>
      </div>

      {titleBlock}

      {layout.showMeta ? (
        <>
          <div
            style={{
              width: 72,
              height: 5,
              borderRadius: 5,
              background: accent,
              marginTop: layout.gap * 1.2,
            }}
          />
          <div
            style={{
              fontFamily: font.sans,
              fontSize: layout.metaSize,
              opacity: 0.5,
              marginTop: layout.gap,
              lineHeight: 1.8,
            }}
          >
            {year} 年第 {bookIndex} 本 · 读到 {progress}%
          </div>
        </>
      ) : null}
    </AbsoluteFill>
  );
};
