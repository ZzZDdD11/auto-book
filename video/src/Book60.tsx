import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { Captions } from "./Captions";
import { Breakdown, type BreakdownData } from "./frames/Breakdown";
import { Hook, type HookData } from "./frames/Hook";
import { MyTake, type MyTakeData } from "./frames/MyTake";
import { Outro, type OutroData } from "./frames/Outro";
import { Quote, type QuoteData } from "./frames/Quote";
import type { FramePayload, RenderPayload, Theme } from "./types";

const renderFrame = (frame: FramePayload, theme: Theme) => {
  // data 的具体结构由 kind 决定，Python 侧已用 Script 校验过
  switch (frame.kind) {
    case "hook":
      return <Hook theme={theme} data={frame.data as unknown as HookData} />;
    case "quote":
      return <Quote theme={theme} data={frame.data as unknown as QuoteData} />;
    case "breakdown":
      return <Breakdown theme={theme} data={frame.data as unknown as BreakdownData} />;
    case "my_take":
      return <MyTake theme={theme} data={frame.data as unknown as MyTakeData} />;
    case "outro":
      return <Outro theme={theme} data={frame.data as unknown as OutroData} />;
    default:
      return null;
  }
};

export const Book60: React.FC<RenderPayload> = ({ frames, theme, bgmSrc, bgmVolume }) => {
  const resolvedTheme: Theme = theme ?? {};
  let cursor = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: resolvedTheme.ink ?? "#12100e" }}>
      {bgmSrc ? <Audio src={staticFile(bgmSrc)} volume={bgmVolume ?? 0.12} loop /> : null}
      {frames.map((frame, i) => {
        const from = cursor;
        cursor += frame.durationInFrames;
        return (
          <Sequence key={i} from={from} durationInFrames={frame.durationInFrames}>
            {renderFrame(frame, resolvedTheme)}
            {frame.audioSrc ? <Audio src={staticFile(frame.audioSrc)} /> : null}
            <Captions captions={frame.captions ?? []} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

/** 总时长由各帧累加得出，不硬编码。 */
export const calculateBookMetadata = ({ props }: { props: RenderPayload }) => ({
  durationInFrames: props.frames.reduce((sum, f) => sum + f.durationInFrames, 0),
  fps: props.fps,
  width: props.width ?? 1080,
  height: props.height ?? 1920,
});
