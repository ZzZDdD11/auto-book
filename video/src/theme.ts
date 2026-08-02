import { SANS, SERIF } from "./fonts";

/** 竖屏安全边距。左右各 88px，上下 120px。 */
export const PAD_X = 88;
export const PAD_Y = 120;

/**
 * 正文区底部为字幕预留的高度。
 *
 * = 字幕的 bottom(190) + 字幕自身高度余量(40)。
 * 字幕是绝对定位的，正文区不预留就会被压住 —— 实测过。
 * 改字幕位置或字号时，这个值要跟着改。
 */
export const CAPTION_RESERVE = 230;

export const font = {
  serif: `"${SERIF}", serif`,
  sans: `"${SANS}", sans-serif`,
};

export const size = {
  hook: 116,
  quote: 62,
  point: 42,
  evidence: 30,
  take: 52,
  kicker: 30,
  meta: 26,
  caption: 40,
};
