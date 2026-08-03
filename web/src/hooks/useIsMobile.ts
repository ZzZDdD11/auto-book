import { useEffect, useState } from "react";

/** 窄屏断点。跟主流手机竖屏宽度对齐，横屏平板仍算桌面布局。 */
const MOBILE_BREAKPOINT = 768;

/**
 * 是否处于窄屏（手机）布局。用 matchMedia 而不是 window.innerWidth ——
 * 能拿到 resize 事件，窗口拖拽变宽变窄时布局跟着切换，不用刷新页面。
 *
 * 项目里没有 CSS 文件，全是行内样式，所以响应式断点也走 JS 判断而不是
 * @media，跟现有 useReaderSettings 是同一种写法，不引入新的样式体系。
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT,
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
