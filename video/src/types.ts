/* 由 scripts/gen_types.py 生成，不要手改 */

export type Fps = number;
export type Width = number;
export type Height = number;
export type Ink = string;
export type Paper = string;
export type Accent = string;
export type Takebg = string;
export type Takeaccent = string;
/**
 * @minItems 1
 */
export type Frames = [FramePayload, ...FramePayload[]];
export type Kind = "hook" | "quote" | "breakdown" | "my_take" | "outro";
export type Durationinframes = number;
export type Audiosrc = string | null;
export type Text = string;
export type Starts = number;
export type Ends = number;
export type Captions = Caption[];
export type Bgmsrc = string | null;
export type Bgmvolume = number;

/**
 * Remotion Composition 的完整输入。
 */
export interface RenderPayload {
  fps: Fps;
  width?: Width;
  height?: Height;
  theme?: Theme;
  frames: Frames;
  bgmSrc?: Bgmsrc;
  bgmVolume?: Bgmvolume;
  [k: string]: unknown;
}
/**
 * 配色。改视觉调性只改这里，五个帧组件都读它。
 */
export interface Theme {
  ink?: Ink;
  paper?: Paper;
  accent?: Accent;
  takeBg?: Takebg;
  takeAccent?: Takeaccent;
  [k: string]: unknown;
}
/**
 * 一帧的全部渲染信息。
 *
 * data 是对应帧模型 dump 出来的字典，结构由 kind 决定。
 * 这里刻意用 dict 而不是联合类型：Python 侧已经用 Script 校验过了，
 * 这一层只负责搬运，不重复校验。
 */
export interface FramePayload {
  kind: Kind;
  durationInFrames: Durationinframes;
  data: Data;
  audioSrc?: Audiosrc;
  captions?: Captions;
  [k: string]: unknown;
}
export interface Data {
  [k: string]: unknown;
}
/**
 * 一行字幕。时间相对所属帧的起点。
 */
export interface Caption {
  text: Text;
  startS: Starts;
  endS: Ends;
  [k: string]: unknown;
}
