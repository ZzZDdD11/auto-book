import { continueRender, delayRender, staticFile } from "remotion";

export const SERIF = "NotoSerifSC";
export const SANS = "NotoSansSC";

const handle = delayRender("加载中文字体");

const faces = [
  new FontFace(SERIF, `url(${staticFile("fonts/NotoSerifSC-Bold.woff2")}) format("woff2")`, {
    weight: "700",
  }),
  new FontFace(SANS, `url(${staticFile("fonts/NotoSansSC-Medium.woff2")}) format("woff2")`, {
    weight: "500",
  }),
  new FontFace(SANS, `url(${staticFile("fonts/NotoSansSC-Bold.woff2")}) format("woff2")`, {
    weight: "700",
  }),
];

Promise.all(faces.map((f) => f.load()))
  .then((loaded) => {
    loaded.forEach((f) => document.fonts.add(f));
    continueRender(handle);
  })
  .catch((err) => {
    // 字体加载失败要让渲染继续但报错可见，否则会静默出方框
    console.error("字体加载失败，画面可能出现方框", err);
    continueRender(handle);
  });
