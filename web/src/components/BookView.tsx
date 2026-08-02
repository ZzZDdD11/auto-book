import { useEffect, useRef, useState } from "react";
import { ReactReader } from "react-reader";
import type { Rendition } from "epubjs";

export type SelectionInfo = {
  text: string;
  cfi: string;
  chapterIndex: number;
  chapterTitle: string;
  fraction: number;
};

type Props = {
  url: string;
  initialCfi?: string | null;
  onSelect: (info: SelectionInfo) => void;
  onPositionChange?: (cfi: string) => void;
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
export function BookView({ url, initialCfi, onSelect, onPositionChange }: Props) {
  const [location, setLocation] = useState<string | number>(initialCfi ?? 0);
  // 必须用 state 而不是 ref：ref 赋值不触发重渲染，绑事件的 effect 就永远
  // 只在 rendition 还是 null 时跑过一次，selected 事件绑不上，划线会失效。
  const [rendition, setRendition] = useState<Rendition | null>(null);
  // 用 ref 存回调，避免 rendition 的事件监听绑到过期的闭包上
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!rendition) return;

    const handler = (cfi: string, contents: { window: Window }) => {
      const raw = contents.window.getSelection()?.toString() ?? "";
      const text = raw.replace(/\s+/g, " ").trim();
      if (!text) return;

      // 章节索引与章内比例都来自 epub.js 的当前位置。
      // 注意：epub.js 拿不到全书进度，fraction 只是章节内的，
      // 全书百分比由后端用字数表换算。
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

      onSelectRef.current({
        text,
        cfi,
        chapterIndex: index,
        chapterTitle: title,
        fraction: total > 0 ? Math.min(1, page / total) : 0,
      });
      // 弹框出现后清掉选区，避免遮挡
      contents.window.getSelection()?.removeAllRanges();
    };

    rendition.on("selected", handler);
    return () => {
      rendition.off("selected", handler);
    };
  }, [rendition]);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <ReactReader
        url={url}
        location={location}
        locationChanged={(cfi: string) => {
          setLocation(cfi);
          onPositionChange?.(cfi);
        }}
        getRendition={(r) => {
          setRendition(r);
          // 让选中在深色文字上也看得清
          r.themes.default({
            "::selection": { background: "rgba(232,184,75,0.35)" },
            p: { "line-height": "1.8", "font-size": "1.05rem" },
          });
        }}
        // swipeable 会禁用 iframe 内文字选中，必须关
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
}
