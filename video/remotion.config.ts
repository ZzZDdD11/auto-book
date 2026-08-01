import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setCodec("h264");
// 中文字体渲染依赖字体加载完成，给足超时
Config.setDelayRenderTimeoutInMilliseconds(60_000);
