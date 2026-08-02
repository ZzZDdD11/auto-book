import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { font, size } from "./theme";
import type { Theme } from "./types";

export type CardKind = "hook" | "quote" | "point" | "my_take" | "outro";

/**
 * 小红书图集卡片。
 *
 * 一个组件覆盖全部卡种，不是每种帧建一个组件 —— 张数跟着脚本的论点数走，
 * 不管建几个组件都要「循环调用同一个 Still」来处理这个变量，
 * 拆成多个组件不解决这个问题，只多写代码。
 *
 * 视觉语言延续 Cover.tsx：大字压屏、ink/paper/accent 三色，跟头像、
 * 封面是同一套东西，观众刷到认得出是同一账号。
 */
export type CardProps = {
  kind: CardKind;
  kicker?: string;
  text: string;
  /** text 里要高亮的子串，原样匹配一次；匹配不上就整段不高亮，不强行处理。 */
  highlight?: string | null;
  footer?: string | null;
  bookTitle: string;
  bookAuthor: string;
  index: number;
  total: number;
  theme?: Theme;
};

/** 把 text 按 highlight 子串切成三段，中间段单独包一层用于变色。 */
function splitHighlight(text: string, highlight?: string | null) {
  if (!highlight) return [text];
  const at = text.indexOf(highlight);
  if (at < 0) return [text];
  return [text.slice(0, at), text.slice(at, at + highlight.length), text.slice(at + highlight.length)];
}

export const Card: React.FC<CardProps> = ({
  kind,
  kicker,
  text,
  highlight,
  footer,
  bookTitle,
  bookAuthor,
  index,
  total,
  theme,
}) => {
  const { width } = useVideoConfig();
  const t = theme ?? {};
  const ink = t.ink ?? "#12100e";
  const paper = t.paper ?? "#f4f1ec";
  const accent = t.accent ?? "#e8b84b";

  const parts = splitHighlight(text, highlight);
  const isQuote = kind === "quote";
  const isPoint = kind === "point";

  return (
    <AbsoluteFill
      style={{
        backgroundColor: ink,
        color: paper,
        padding: `120px ${width * 0.09}px`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      {/* 书名条：所有卡种共用，是「真读过」的信任状，也是图集里认出同一本书的线索 */}
      <div
        style={{
          fontFamily: font.sans,
          fontSize: size.meta,
          opacity: 0.55,
          letterSpacing: 2,
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 32,
        }}
      >
        <span
          style={{
            width: size.meta * 0.7,
            height: size.meta * 1.1,
            borderRadius: 4,
            background: "currentColor",
            opacity: 0.6,
            flexShrink: 0,
          }}
        />
        <span>
          {bookTitle}
          {bookAuthor ? ` · ${bookAuthor}` : ""}
        </span>
      </div>

      {kicker ? (
        <div
          style={{
            fontFamily: font.sans,
            fontSize: size.kicker,
            letterSpacing: 4,
            color: accent,
            opacity: 0.9,
            marginBottom: 24,
          }}
        >
          {kicker}
        </div>
      ) : null}

      <div
        style={{
          fontFamily: isQuote ? font.serif : font.sans,
          fontWeight: isQuote ? 700 : 700,
          fontStyle: isQuote ? "italic" : "normal",
          fontSize: isPoint ? 56 : isQuote ? 48 : 60,
          lineHeight: 1.42,
          letterSpacing: -1,
        }}
      >
        {parts.length === 3 ? (
          <>
            {parts[0]}
            <span style={{ color: accent }}>{parts[1]}</span>
            {parts[2]}
          </>
        ) : (
          text
        )}
      </div>

      <div
        style={{
          height: 4,
          width: 56,
          borderRadius: 4,
          background: accent,
          marginTop: 36,
        }}
      />

      {/* footer：point 卡是原文依据，用引用块样式突出「这是原文，不是编的」 */}
      {footer ? (
        <div
          style={{
            marginTop: 28,
            fontFamily: font.serif,
            fontSize: size.evidence,
            lineHeight: 1.66,
            opacity: 0.6,
            paddingLeft: isPoint ? 20 : 0,
            borderLeft: isPoint ? `2px solid ${accent}55` : "none",
          }}
        >
          {isPoint ? `原文「${footer}」` : footer}
        </div>
      ) : null}

      {/* 图集页码：告诉观众还有几张，缩略图里也能看清楚数字，不靠文字 */}
      <div
        style={{
          position: "absolute",
          right: width * 0.09,
          bottom: 56,
          fontFamily: font.sans,
          fontSize: size.meta,
          opacity: 0.4,
          letterSpacing: 2,
        }}
      >
        {index + 1} / {total}
      </div>
    </AbsoluteFill>
  );
};
