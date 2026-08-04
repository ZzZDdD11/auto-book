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
  /** 轻点正文（非划线、非翻页）时触发。用于沉浸式下切换顶部工具条显隐。 */
  onTap?: () => void;
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
 * 目前是react-reader（底层 epub.js）。若要换成 foliate-js，只改这个文件。
 *
 * 两个不能动的约束：
 *   1. 不能开 swipeable —— 它会禁用 iframe 内的文字选中，划线就没了
 *   2. 不能开 allowScriptedContent —— EPUB 是不可信输入，开了 sandbox 就失效
 */
export const BookView = forwardRef<BookViewHandle, Props>(function BookView(
  { url, initialCfi, onSelect, onPositionChange, onTap, settings },
  ref,
) {
  const [location, setLocation] = useState<string | number>(initialCfi ?? 0);
  // 必须用 state 而不是 ref：ref 赋值不触发重渲染，绑事件的 effect 就永远
  // 只在 rendition 还是 null 时跑过一次，selected 事件绑不上，划线会失效。
  const [rendition, setRendition] = useState<Rendition | null>(null);
  // 用 ref 存回调，避免 rendition 的事件监听绑到过期的闭包上
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

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

  // 拖动翻页：按住任意位置快速水平滑动就翻页，慢速拖动仍然走浏览器正常的
  // 文字选中（划线要用）。不用 epub.js 的 swipeable —— 它在 touchmove 时
  // preventDefault，会把选区行为一起杀了。
  //
  // 之前两次尝试（绑 rendition 创建时那一刻的 iframe.window / 监听
  // "rendered" 事件后用 WeakSet 补绑）在真机上都没生效——问题出在"自己伸手
  // 进 iframe 内部找 window"这条路径本身就不牢靠，时机、事件目标都可能跟
  // 猜测的不一样，而且没法用无头浏览器的真实触屏动作复现来验证。
  //
  // 正确做法是不用自己管 iframe：epub.js 内部本来就会把每个 view 的原生
  // DOM 事件（touchstart/touchend/mousedown/mouseup 等）转发成 rendition
  // 级别的事件——见 epubjs/src/rendition.js 构造函数里的
  // `hooks.content.register(this.passEvents)`，每次任何内容渲染完成
  // （首次加载/翻章/重排）都会重新执行一遍，换 iframe 天然覆盖，不用我们
  // 自己判断"什么时候该重新绑定"。直接监听 rendition.on("touchstart", ...)
  // 拿到的就是原始 DOM 事件对象，用法跟直接绑 window 一样。
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
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      // 快速（< 800ms）且水平为主（水平位移 > 垂直的 1.2倍）且超过 40px →
      // 翻页。阈值比"理论上刚好够用"松一点，真手指划的动作不会像模拟事件
      // 那么干净。
      if (dt < 800 && absX > 40 && absX > absY * 1.2) {
        // 手指/鼠标向右移动（dx > 0）→ 上一页；向左移动 → 下一页。
        // 主流阅读 App（iBooks 等）对 LTR 内容都是这个方向。
        if (dx > 0) rendition.prev();
        else rendition.next();
        return;
      }
      // 轻点：几乎没移动 + 时间短，既不是翻页也不是划词选中→ 切换工具条显隐
      // （沉浸式阅读的标准手势：点一下藏/显顶部 chrome）。
      if (dt < 400 && absX < 10 && absY < 10) {
        onTapRef.current?.();
      }
    };

    // 手机上一次触摸（点/滑）结束后，浏览器还会补发一组合成的 mouse 事件
    // （mousedown/mouseup）。如果 mouse 处理器不加区分，就会把同一个动作处理
    // 两遍——轻点被 touchend 切一次工具条、又被合成的 mouseup 切回去，净效果
    // 是"点了没反应"（这正是之前 tap 显不出工具条的原因）；滑动同理会翻两页。
    // 所以 mouse 处理器只在"最近没发生过 touch"时才生效（纯桌面鼠标场景）。
    let lastTouchEnd = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchEnd = (e: TouchEvent) => {
      lastTouchEnd = Date.now();
      if (e.changedTouches.length === 1)
        onEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    };
    let mouseDown = false;
    const isSyntheticAfterTouch = () => Date.now() - lastTouchEnd < 700;
    const onMouseDown = (e: MouseEvent) => {
      if (isSyntheticAfterTouch()) return;
      mouseDown = true;
      onStart(e.clientX, e.clientY);
    };
    const onMouseUp = (e: MouseEvent) => {
      if (isSyntheticAfterTouch()) return;
      if (mouseDown) onEnd(e.clientX, e.clientY);
      mouseDown = false;
    };

    rendition.on("touchstart", onTouchStart);
    rendition.on("touchend", onTouchEnd);
    rendition.on("mousedown", onMouseDown);
    rendition.on("mouseup", onMouseUp);
    return () => {
      rendition.off("touchstart", onTouchStart);
      rendition.off("touchend", onTouchEnd);
      rendition.off("mousedown", onMouseDown);
      rendition.off("mouseup", onMouseUp);
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
  //
  // 但只改override CSS 不够：epub.js 的 themes.fontSize 只是往 iframe 注入
  // 一条 `font-size`覆盖规则，并不会重新分页。分栏（column）宽度和总页数
  // 会随字号变，可视口却还停在旧的翻页偏移上，于是常常显示成一整片空白
  // （默认 110% 能正常显示，只是因为初次渲染时 react-reader 正好 display 过
  // 一次，位置是对的）。所以改完字号要重新 display 当前位置，强制按新字号
  // 重新分页——这正是 epub.js 自己在 onResized 里做的事
  // （display(this.location.start.cfi)）。
  //
  // 放到下一帧执行：先让 override CSS 完成 reflow，再读当前 cfi 重新定位，
  // 否则读到的是旧布局的位置。第一次运行（rendition 刚就绪、内容还没显示）
  // 跳过，避免和react-reader 的初始 display 打架。
  const fontFirstRunRef = useRef(true);
  useEffect(() => {
    if (!rendition) return;
    rendition.themes.fontSize(`${settings.fontSize}%`);
    if (fontFirstRunRef.current) {
      fontFirstRunRef.current = false;
      return;
    }
    const raf = requestAnimationFrame(() => {
      const cfi = (
        rendition.currentLocation() as unknown as { start?: { cfi?: string } }
      )?.start?.cfi;
      if (cfi) rendition.display(cfi);
    });
    return () => cancelAnimationFrame(raf);
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
