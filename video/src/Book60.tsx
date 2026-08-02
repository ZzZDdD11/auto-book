import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile } from "remotion";
import { Captions } from "./Captions";
import { Breakdown, type BreakdownData } from "./frames/Breakdown";
import { Hook, type HookData } from "./frames/Hook";
import { MyTake, type MyTakeData } from "./frames/MyTake";
import { Outro, type OutroData } from "./frames/Outro";
import { Quote, type QuoteData } from "./frames/Quote";
import type { FramePayload, RenderPayload, Theme } from "./types";

const renderFrame = (frame: FramePayload, theme: Theme) => {
  // data 的具体结构由 kind 决定，Python 侧已用 Script 校验过
  const pos = { index: frame.index, total: frame.total };
  switch (frame.kind) {
    case "hook":
      return <Hook theme={theme} data={frame.data as unknown as HookData} {...pos} />;
    case "quote":
      return <Quote theme={theme} data={frame.data as unknown as QuoteData} {...pos} />;
    case "breakdown":
      return (
        <Breakdown theme={theme} data={frame.data as unknown as BreakdownData} {...pos} />
      );
    case "my_take":
      return <MyTake theme={theme} data={frame.data as unknown as MyTakeData} {...pos} />;
    case "outro":
      return <Outro theme={theme} data={frame.data as unknown as OutroData} {...pos} />;
    default:
      return null;
  }
};

/** BGM 音量随时间变化的关键点。[帧号, 音量] */
type VolumePoint = [number, number];

/**
 * 算出 BGM 的音量曲线。
 *
 * 为什么不能用固定音量：钩子帧没有配音，音量若压到人声之下画面会发空；
 * 但同样的音量盖在人声上又会抢戏。所以按「这一帧有没有人声」分两档，
 * 并在切换处用 12 帧（0.4s）过渡，避免音量突变被听成杂音 —— 这正是
 * 「不抢眼、不杂乱」的关键。
 */
export const buildVolumePoints = (
  frames: FramePayload[],
  loud: number,
  quiet: number,
  fps: number,
  fadeOutS: number,
): VolumePoint[] => {
  if (frames.length === 0) return [[0, quiet]];

  const RAMP = Math.max(1, Math.round(fps * 0.4));
  const levelOf = (f: FramePayload) => (f.audioSrc ? quiet : loud);

  // 先铺出「让位曲线」：每帧入点渐变到本帧音量，出点保持到帧尾
  const ducking: VolumePoint[] = [[0, levelOf(frames[0])]];
  let cursor = 0;
  frames.forEach((frame) => {
    const end = cursor + frame.durationInFrames;
    ducking.push([Math.min(cursor + RAMP, end), levelOf(frame)]);
    ducking.push([end, levelOf(frame)]);
    cursor = end;
  });

  const total = cursor;
  const fadeFrames = Math.min(Math.round(fadeOutS * fps), Math.floor(total / 2));

  let points = ducking;
  if (fadeFrames > 0) {
    const fadeStart = total - fadeFrames;
    // 淡出必须覆盖让位曲线，不能只是追加：
    // 追加的话末尾帧号会与最后一帧的出点重复而被去重丢掉，淡出静默失效。
    const levelAtFadeStart =
      [...ducking].reverse().find(([at]) => at <= fadeStart)?.[1] ?? quiet;
    points = [
      ...ducking.filter(([at]) => at < fadeStart),
      [fadeStart, levelAtFadeStart],
      [total, 0],
    ];
  }

  // interpolate 要求输入严格递增；同一帧号取后写入的值
  const byFrame = new Map<number, number>();
  points.forEach(([at, v]) => byFrame.set(at, v));
  return [...byFrame.entries()].sort((a, b) => a[0] - b[0]);
};

export const Book60: React.FC<RenderPayload> = ({
  frames,
  theme,
  fps,
  bgmSrc,
  bgmVolume,
  bgmVolumeSolo,
  bgmFadeOutS,
}) => {
  const resolvedTheme: Theme = theme ?? {};
  const points = buildVolumePoints(
    frames,
    bgmVolumeSolo ?? 0.26,
    bgmVolume ?? 0.1,
    fps,
    bgmFadeOutS ?? 2,
  );

  let cursor = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: resolvedTheme.ink ?? "#12100e" }}>
      {bgmSrc ? (
        <Audio
          src={staticFile(bgmSrc)}
          loop
          // 逐帧计算音量：有人声时压低，无人声时抬起，结尾淡出
          volume={(f) =>
            interpolate(
              f,
              points.map((p) => p[0]),
              points.map((p) => p[1]),
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )
          }
        />
      ) : null}
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
