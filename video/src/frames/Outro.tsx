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
  book_title: string;
  book_author: string;
};

export const Outro: React.FC<{
  theme: Theme;
  data: OutroData;
  index?: number;
  total?: number;
}> = ({ theme, data, index, total }) => {
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp" });
  const accent = theme.accent ?? "#e8b84b";

  return (
    <Shell
      bg={theme.paper ?? "#f4f1ec"}
      fg={theme.ink ?? "#12100e"}
      label={`第 ${data.book_index} 本 · ${data.year}`}
      accent={accent}
      kind="outro"
      index={index}
      total={total}
      align="start"
    >
      <div
        style={{
          opacity: fade,
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        {/* 书名压在上方 —— 收尾帧是观众决定要不要关注的位置，
            这里必须让人记住读的是哪本书，不能留空。 */}
        <div>
          <div
            style={{
              fontFamily: font.sans,
              fontSize: size.kicker,
              letterSpacing: 6,
              opacity: 0.45,
              marginBottom: 22,
            }}
          >
            读完这一段
          </div>
          <div
            style={{
              fontFamily: font.serif,
              fontWeight: 700,
              fontSize: size.quote,
              lineHeight: 1.42,
            }}
          >
            {data.book_title}
          </div>
          {data.book_author ? (
            <div
              style={{
                fontFamily: font.sans,
                fontSize: size.evidence,
                opacity: 0.5,
                marginTop: 16,
              }}
            >
              {data.book_author}
            </div>
          ) : null}
          <div
            style={{
              width: 64,
              height: 4,
              borderRadius: 4,
              background: accent,
              marginTop: 40,
            }}
          />
        </div>

        {/* 提问与落款贴底 —— 模仿书的版权页 */}
        <div style={{ marginTop: "auto" }}>
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
      </div>
    </Shell>
  );
};
