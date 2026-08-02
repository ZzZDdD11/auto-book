import React from "react";
import { Composition, Still } from "remotion";
import { Avatar } from "./Avatar";
import { Book60, calculateBookMetadata } from "./Book60";
import { Card } from "./Card";
import { Cover } from "./Cover";
import { coverDefaultProps, defaultProps } from "./defaultProps";

/**
 * 封面的四个平台尺寸。
 *
 * 必须一次出四张：同一张图发四个平台，三个会被裁坏 ——
 * 竖图发公众号头条被切掉六成，横图发抖音上下补黑边。
 * 这是排版问题，不是缩放问题，所以每个尺寸都是独立的 Still。
 *
 * id 里用 x 而不是冒号，因为它会进命令行和文件名。
 */
export const COVER_SIZES = [
  { id: "Cover9x16", width: 1080, height: 1920 },
  { id: "Cover3x4", width: 1080, height: 1440 },
  { id: "Cover1x1", width: 1080, height: 1080 },
  { id: "Cover235x1", width: 900, height: 383 },
] as const;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Book60"
      component={Book60}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={923}
      defaultProps={defaultProps}
      calculateMetadata={calculateBookMetadata}
    />
    {COVER_SIZES.map((size) => (
      <Still
        key={size.id}
        id={size.id}
        component={Cover}
        width={size.width}
        height={size.height}
        defaultProps={coverDefaultProps}
      />
    ))}
    {/* 小红书图集卡片：单个组件，张数由 backend/core/card.py 循环调用决定 */}
    <Still
      id="Card"
      component={Card}
      width={1080}
      height={1440}
      defaultProps={{
        kind: "quote",
        kicker: "原文摘录",
        text: "环境是塑造人类行为看不见的手。",
        highlight: null,
        footer: "第 12 章 · 读到 43%",
        bookTitle: "原子习惯",
        bookAuthor: "James Clear",
        index: 1,
        total: 6,
      }}
    />
    {/* 账号头像：1080x1080，各平台头像位都吃方图 */}
    <Still
      id="AvatarDark"
      component={Avatar}
      width={1080}
      height={1080}
      defaultProps={{ variant: "dark" }}
    />
    <Still
      id="AvatarLight"
      component={Avatar}
      width={1080}
      height={1080}
      defaultProps={{ variant: "light" }}
    />
  </>
);
