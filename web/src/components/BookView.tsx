import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ReactReader, ReactReaderStyle, type IReactReaderStyle } from "react-reader";
import type { Rendition } from "epubjs";
import type { ReaderSettings } from "../hooks/useReaderSettings";

export type SelectionInfo = {
  text: string;
  cfi: string;
  chapterIndex: number;
  chapterTitle: string;
  fraction: number;
};

export type PositionInfo = {
  cfi: string;
  chapterIndex: number;
  fraction: number;
  chapterTitle: string;
};

type Props = {
  url: string;
  initialCfi?: string | null;
  onSelect: (info: SelectionInfo) => void;
  onPositionChange?: (info: PositionInfo) => void;
  settings: ReaderSettings;
};

/** 命令式句柄：点击划线时用它跳回原文位置。 */
export type BookViewHandle = {
  goto: (cfi: string) => void;
};

/** epub.js 注入到 iframe 内部的正文主题。键是 CSS 选择器。 */
const DAY_THEME = {
  body: { background: "#faf8f3", color: "#1a1a1a" },
  p: { color: "#1a1a1a" },
  a: { color: "#0a7d5a" },
};

const NIGHT_THEME = {
  body: { background: "#1a1a1f", color: "#c9c9cf" },
  p: { color: "#c9c9cf" },
  a: { color: "#7fc7a8" },
  "a:link": { color: "#7fc7a8" },
  "a:visited": { color: "#6fae93" },
};

/** 双页排列的最小可用宽度（px）。窄于该值即使选了双页也退回单页。 */
const SPREAD_MIN_WIDTH = 700;

/**
 * 从 epub.js 的当前位置算出「章节索引 / 章内比例 / 章节标题」。
 *
 * 划线（selected 事件）和翻页上报（locationChanged）都要用同一份数据，
 * 抽成共享函数，不重复写这段容易出错的 epub.js 内部结构读取逻辑。
 * 注意：epub.js 拿不到全书进度，fraction 只是章节内的，全书百分比
 * 由后端用字数表换算。
 */
function currentLocationInfo(rendition: Rendition): { chapterIndex: number; fraction: number; chapterTitle: string } {
  const loc = rendition.currentLocation() as unknown as {
    start?: { index?: number; displayed?: { page?: number; total?: number } };
  };
  const index = loc?.start?.index ?? 0;
  const page = loc?.start?.displayed?.page ?? 1;
  const total = loc?.start?.displayed?.total ?? 1;

  let title = "";
  try {
    const spineItem = rendition.book.spine.get(index) as unknown as { href?: string };
    const nav = rendition.book.navigation?.get(spineItem?.href ?? "");
    title = (nav?.label ?? "").trim();
  } catch {
    title = "";
  }

  return {
    chapterIndex: index,
    fraction: total > 0 ? Math.min(1, page / total) : 0,
    chapterTitle: title,
  };
}

/**
 * react-reader 默认的 `reader`（实际装EpubView/iframe 的那个盒子）内边距是
 * top:50/left:50/right:50/bottom:20 的固定像素值——桌面排版遗留设定，在手机
 * 390px 宽的屏幕上左右各切掉 50px，内容区只剩 290px，是"没有铺满全屏"的直接
 * 原因（实测：390宽视口下 iframe 实际渲染宽度就是 290）。
 *
 * 这同时也是"划不动翻页"的真正原因：我们自己的滑动监听绑在 iframe 的
 * window 上（见下面的 effect），只能感知发生在 iframe 内部的触摸；但可视内容
 * 被这层内边距挤到中间一小块后，手指很容易从这块死白边（不在 iframe 内）起
 * 触，那次滑动我们的监听器根本收不到。改成 0（配safe-area 兜底刘海屏），
 * iframe 几乎铺满整个可视区域，两个问题一起解决。
 * toc 按钮、上一页/下一页箭头都是绝对定位的浮层，不依赖这个内边距，
 * 边到边之后依然正常显示（只是浮在内容上而不是浮在留白上）。
 */
const BASE_READER_STYLES: IReactReaderStyle = {
  ...ReactReaderStyle,
  reader: {
    ...ReactReaderStyle.reader,
    top: "env(safe-area-inset-top)",
    left: "env(safe-area-inset-left)",
    right: "env(safe-area-inset-right)",
    bottom: "env(safe-area-inset-bottom)",
  },
};

/** 夜间模式下 react-reader 外壳（标题、箭头、TOC）的样式覆盖。 */
const NIGHT_READER_STYLES: IReactReaderStyle = {
  ...BASE_READER_STYLES,
  readerArea: { ...BASE_READER_STYLES.readerArea, backgroundColor: "#1a1a1f" },
  titleArea: { ...BASE_READER_STYLES.titleArea, color: "#5a5a66" },
  arrow: { ...BASE_READER_STYLES.arrow, color: "#3a3a44" },
  arrowHover: { ...BASE_READER_STYLES.arrowHover, color: "#9a9aa6" },
  tocButtonBar: { ...BASE_READER_STYLES.tocButtonBar, background: "#9a9aa6" },
};

/**
 * EPUB 渲染层的唯一封装点。
 *
 * 对外只暴露 onSelect / onPositionChange，内部用什么引擎是实现细节。
 * 目前是 react-reader（底层 epub.js）。若要换成 foliate-js，只改这个文件。
 *
 * 两个不能动的约束：
 *   1. 不能开 swipeable —— 它会禁用 iframe 内的文字选中，划线就没了
 *   2. 不能开 allowScriptedContent —— EPUB 是不可信输入，开了 sandbox 就失效
 */
export const BookView = forwardRef<BookViewHandle, Props>(function BookView(
  { url, initialCfi, onSelect, onPositionChange, settings },
  ref,
) {
  const [location, setLocation] = useState<string | number>(initialCfi ?? 0);
  // 必须用 state 而不是 ref：ref 赋值不触发重渲染，绑事件的 effect 就永远
  // 只在 rendition 还是 null 时跑过一次，selected 事件绑不上，划线会失效。
  const [rendition, setRendition] = useState<Rendition | null>(null);
  // 用 ref 存回调，避免 rendition 的事件监听绑到过期的闭包上
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // 暴露 goto：点击划线时把 location 设为该 CFI，react-reader 受控跳转。
  useImperativeHandle(
    ref,
    () => ({
      goto: (cfi: string) => setLocation(cfi),
    }),
    [],
  );

  useEffect(() => {
    if (!rendition) return;

    const handler = (cfi: string, contents: { window: Window }) => {
      const raw = contents.window.getSelection()?.toString() ?? "";
      const text = raw.replace(/\s+/g, " ").trim();
      if (!text) return;

      // 章节索引与章内比例都来自 epub.js 的当前位置。
      const { chapterIndex, fraction, chapterTitle } = currentLocationInfo(rendition);

      onSelectRef.current({
        text,
        cfi,
        chapterIndex,
        chapterTitle,
        fraction,
      });
      // 弹框出现后清掉选区，避免遮挡
      contents.window.getSelection()?.removeAllRanges();
    };

    rendition.on("selected", handler);
    return () => {
      rendition.off("selected", handler);
    };
  }, [rendition]);

  // 主题、字号、单双页各自独立 effect，避免互相触发无谓重算。
  // effect 在 rendition 就绪后同步执行，早于首章内容加载，所以 select 不会闪屏。

  // 拖动翻页：快速水平滑动翻页，慢速拖动选中文字。
  // 不用 epub.js 的 swipeable —— 它在 touchmove 时preventDefault，
  // 把选区行为一起杀了。这里只在 touchend 判断：快速且水平为主的滑动才翻页，
  // 慢速长按的交给浏览器正常选中。
  // 桌面端也支持：鼠标快速横向拖动翻页，慢速拖动选中。
  //
  // 之前的实现只在 rendition 刚创建时绑一次：那一刻内容通常还没渲染进 iframe
  // （getContents() 是空数组），绑定直接短路退出，翻页手势从没生效过；换章后
  // epub.js 还会换一批新 iframe，旧监听也够不到新的。改成监听 "rendered" 事件，
  // 每次有新内容渲染（首次加载 / 翻章）都补绑，用 WeakSet 记重复绑定。
  useEffect(() => {
    if (!rendition) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;

    const onStart = (x: number, y: number) => {
      startX = x;
      startY = y;
      startTime = Date.now();
    };

    const onEnd = (x: number, y: number) => {
      const dx = x - startX;
      const dy = y - startY;
      const dt = Date.now() - startTime;
      // 快速（< 500ms）且水平为主（水平位移 > 垂直的 1.5 倍）且超过 50px → 翻页
      if (dt < 500 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx > 0) rendition.prev();
        else rendition.next();
      }
    };

    // 触摸
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.changedTouches.length === 1)
        onEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    };
    // 鼠标（桌面端）
    let mouseDown = false;
    const onMouseDown = (e: MouseEvent) => {
      mouseDown = true;
      onStart(e.clientX, e.clientY);
    };
    const onMouseUp = (e: MouseEvent) => {
      if (mouseDown) onEnd(e.clientX, e.clientY);
      mouseDown = false;
    };

    const bound = new WeakSet<Window>();
    const bindAll = () => {
      const contents = rendition.getContents() as unknown as { window?: Window }[];
      for (const c of contents) {
        const win = c.window;
        if (!win || bound.has(win)) continue;
        bound.add(win);
        win.addEventListener("touchstart", onTouchStart, { passive: true });
        win.addEventListener("touchend", onTouchEnd, { passive: true });
        win.addEventListener("mousedown", onMouseDown);
        win.addEventListener("mouseup", onMouseUp);
      }
    };

    bindAll();
    rendition.on("rendered", bindAll);
    return () => {
      rendition.off("rendered", bindAll);
      // 换章/卸载时旧 iframe 会被 epub.js 整个移除，监听跟着一起消失，
      // 不用逐个 removeEventListener。
    };
  }, [rendition]);

  // 主题：epub.js 的 themes.select 不会清掉旧主题注入的 <style>，同页来回切会
  // 叠加多个主题样式表（后注入者胜），导致切回日间失效。这里在切换前手动移除
  // 旧主题节点，保证同页切换干净。节点 id 形如 epubjs-inserted-css-{name}。
  const prevThemeRef = useRef(settings.theme);
  useEffect(() => {
    if (!rendition) return;
    const prev = prevThemeRef.current;
    if (prev !== settings.theme) {
      // getContents 运行时是数组，但 epub.js 的 .d.ts 错标成了单个 Contents
      const contents = rendition.getContents() as unknown as {
        document?: Document;
      }[];
      contents.forEach((c) => {
        c.document
          ?.getElementById(`epubjs-inserted-css-${prev}`)
          ?.remove();
      });
      prevThemeRef.current = settings.theme;
    }
    rendition.themes.select(settings.theme);
  }, [rendition, settings.theme]);

  // 字号：override 按属性名覆盖，天然幂等。
  useEffect(() => {
    if (!rendition) return;
    rendition.themes.fontSize(`${settings.fontSize}%`);
  }, [rendition, settings.fontSize]);

  // 单双页：spread() 内部会调 manager.updateLayout() 立即重排。
  useEffect(() => {
    if (!rendition) return;
    rendition.spread(
      settings.spread === "double" ? "auto" : "none",
      SPREAD_MIN_WIDTH,
    );
  }, [rendition, settings.spread]);

  const readerStyles =
    settings.theme === "night" ? NIGHT_READER_STYLES : BASE_READER_STYLES;

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <ReactReader
        url={url}
        location={location}
        locationChanged={(cfi: string) => {
          setLocation(cfi);
          if (onPositionChange && rendition) {
            const { chapterIndex, fraction, chapterTitle } = currentLocationInfo(rendition);
            onPositionChange({ cfi, chapterIndex, fraction, chapterTitle });
          }
        }}
        readerStyles={readerStyles}
        getRendition={(r) => {
          setRendition(r);
          // 让选中在深色文字上也看得清；行高统一更易读
          r.themes.default({
            "::selection": { background: "rgba(232,184,75,0.35)" },
            p: { "line-height": "1.8" },
          });
          r.themes.register("day", DAY_THEME);
          r.themes.register("night", NIGHT_THEME);
          // 实际套用（select/fontSize/spread）交给上面的 effect，那里更可控。
        }}
        // 不开 epub.js 的 swipeable —— 它 preventDefault touchmove 会杀掉文字选中。
        // 拖动翻页自己实现（见上面的 effect），快速滑动翻页、慢速拖动选中。
        swipeable={false}
        // epub.js 靠 URL 后缀猜类型。我们的地址是 /api/books/{id}/file，
        // 没有 .epub 后缀，它会当成「已解压目录」去请求
        // /api/books/{id}/META-INF/container.xml，必然 404 → Load error。
        // 所以必须显式告诉它这是一个打包的 epub 二进制流。
        epubInitOptions={{ openAs: "epub" }}
        epubOptions={{
          // EPUB 是不可信输入，绝不开脚本执行
          allowScriptedContent: false,
          allowPopups: false,
        }}
      />
    </div>
  );
});

BookView.displayName = "BookView";
