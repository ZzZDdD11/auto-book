import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import {
  calcProgress,
  createJob,
  createMaterial,
  epubFileUrl,
  listBookMaterials,
  listBooks,
  patchMaterial,
  savePosition,
  type BookOut,
  type MaterialBrief,
  type Mode,
} from "../api";
import { BookView, type BookViewHandle, type SelectionInfo } from "../components/BookView";
import { JobPanel, STATUS_LABEL } from "../components/JobPanel";
import { useJobPolling } from "../hooks/useJobPolling";
import {
  useReaderSettings,
  type ReaderSettings,
  FONT_MIN,
  FONT_MAX,
  FONT_STEP,
} from "../hooks/useReaderSettings";

/** 根据主题派生的 UI 调色板，让侧栏、弹框与阅读区在夜间保持一致。 */
type UiPalette = {
  panel: string;
  panelAlt: string;
  border: string;
  text: string;
  sub: string;
  faint: string;
  accent: string;
  accentText: string;
  success: string;
  error: string;
  inputBg: string;
  toolbarBg: string;
  marker: string;
};

function useUiPalette(settings: ReaderSettings): UiPalette {
  return settings.theme === "night"
    ? {
        panel: "#1d1d24",
        panelAlt: "#25252e",
        border: "#2e2e38",
        text: "#c9c9cf",
        sub: "#8a8a95",
        faint: "#56565f",
        accent: "#e8b84b",
        accentText: "#1a1a1a",
        success: "#7fc7a8",
        error: "#e07a6a",
        inputBg: "#2a2a34",
        toolbarBg: "rgba(29,29,36,.82)",
        marker: "#e8b84b",
      }
    : {
        panel: "#fafafa",
        panelAlt: "#f4f1ec",
        border: "#e6e6e6",
        text: "#1a1a1a",
        sub: "#888888",
        faint: "#aaaaaa",
        accent: "#0f2a24",
        accentText: "#ffffff",
        success: "#0a7d5a",
        error: "#b5301a",
        inputBg: "#ffffff",
        toolbarBg: "rgba(255,255,255,.82)",
        marker: "#e8b84b",
      };
}

function toolBtn(ui: UiPalette, disabled = false): CSSProperties {
  return {
    border: "none",
    background: "transparent",
    color: disabled ? ui.faint : ui.text,
    cursor: disabled ? "default" : "pointer",
    padding: "4px 9px",
    borderRadius: 999,
    fontSize: 13,
    lineHeight: 1,
    fontFamily: "inherit",
  };
}

/** 阅读区右上角的浮动设置条：主题 / 字号 / 单双页。 */
function ReaderToolbar({
  settings,
  ui,
  onToggleTheme,
  onBumpFont,
  onCycleSpread,
}: {
  settings: ReaderSettings;
  ui: UiPalette;
  onToggleTheme: () => void;
  onBumpFont: (delta: number) => void;
  onCycleSpread: () => void;
}) {
  const divider: CSSProperties = {
    width: 1,
    alignSelf: "stretch",
    background: ui.border,
    margin: "2px 2px",
  };
  return (
    <div
      style={{
        position: "absolute",
        top: 14,
        right: 16,
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "5px 8px",
        borderRadius: 999,
        background: ui.toolbarBg,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        border: `1px solid ${ui.border}`,
        boxShadow: "0 2px 12px rgba(0,0,0,.12)",
        fontSize: 13,
        color: ui.text,
        userSelect: "none",
      }}
    >
      <button
        onClick={onToggleTheme}
        style={toolBtn(ui)}
        title="切换日间 / 夜间"
      >
        {settings.theme === "day" ? "日间" : "夜间"}
      </button>
      <span style={divider} />
      <button
        onClick={() => onBumpFont(-FONT_STEP)}
        disabled={settings.fontSize <= FONT_MIN}
        style={toolBtn(ui, settings.fontSize <= FONT_MIN)}
        title="缩小字号"
      >
        A−
      </button>
      <span
        style={{
          minWidth: 40,
          textAlign: "center",
          fontVariantNumeric: "tabular-nums",
          color: ui.sub,
        }}
      >
        {settings.fontSize}%
      </span>
      <button
        onClick={() => onBumpFont(FONT_STEP)}
        disabled={settings.fontSize >= FONT_MAX}
        style={toolBtn(ui, settings.fontSize >= FONT_MAX)}
        title="放大字号"
      >
        A+
      </button>
      <span style={divider} />
      <button
        onClick={onCycleSpread}
        style={toolBtn(ui)}
        title="切换单页 / 双页排列"
      >
        {settings.spread === "single" ? "单页" : "双页"}
      </button>
    </div>
  );
}

/** 一条排队中的划线：选区信息 + 异步算好的全书进度。 */
type PendingSelection = {
  info: SelectionInfo;
  progress: number | null;
};

/**
 * 划线排队条：每次划线只在这里追加一条卡片，不弹窗、不挡住阅读区，
 * 可以连续划第二、第三条。想写想法时再点「写想法」才打开大弹框。
 */
function PendingQueue({
  items,
  ui,
  onOpen,
  onDiscard,
}: {
  items: PendingSelection[];
  ui: UiPalette;
  onOpen: (cfi: string) => void;
  onDiscard: (cfi: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: 60,
        right: 16,
        zIndex: 25,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        maxWidth: 280,
        alignItems: "flex-end",
      }}
    >
      {items.map((p) => (
        <div
          key={p.info.cfi}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 10px",
            borderRadius: 10,
            background: ui.toolbarBg,
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            border: `1px solid ${ui.border}`,
            boxShadow: "0 2px 10px rgba(0,0,0,.14)",
            fontSize: 12,
            color: ui.text,
            maxWidth: "100%",
          }}
        >
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={p.info.text}
          >
            {p.info.text}
          </span>
          <button
            onClick={() => onOpen(p.info.cfi)}
            style={{
              border: "none",
              background: ui.accent,
              color: ui.accentText,
              borderRadius: 6,
              padding: "3px 8px",
              fontSize: 11,
              cursor: "pointer",
              fontFamily: "inherit",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            写想法
          </button>
          <button
            onClick={() => onDiscard(p.info.cfi)}
            title="丢弃这条划线"
            style={{
              border: "none",
              background: "transparent",
              color: ui.faint,
              cursor: "pointer",
              fontSize: 14,
              padding: "0 2px",
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/** 划线后的弹框。整个产品里唯一需要手动输入的地方。 */
function TakeDialog({
  selection,
  progress,
  onClose,
  onSave,
  saving,
  ui,
}: {
  selection: SelectionInfo;
  progress: number | null;
  onClose: () => void;
  onSave: (myTake: string, mode: Mode) => void;
  saving: boolean;
  ui: UiPalette;
}) {
  const [myTake, setMyTake] = useState("");
  const [mode, setMode] = useState<Mode>("deep");

  const canSave = mode === "fast" || myTake.trim().length > 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: ui.panel,
          color: ui.text,
          borderRadius: 12,
          padding: 24,
          width: "100%",
          maxWidth: 560,
          boxShadow: "0 10px 40px rgba(0,0,0,.35)",
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: ui.sub,
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 10,
          }}
        >
          <span>{selection.chapterTitle || "未知章节"}</span>
          <span>进度 {progress === null ? "计算中…" : `${progress}%`}</span>
          <span>{new Date().toISOString().slice(0, 10)}</span>
        </div>

        <blockquote
          style={{
            margin: "0 0 18px",
            padding: "12px 16px",
            background: ui.panelAlt,
            borderRadius: 8,
            fontSize: 15,
            lineHeight: 1.75,
            maxHeight: 160,
            overflow: "auto",
            color: ui.text,
          }}
        >
          {selection.text}
        </blockquote>

        <label style={{ display: "block", fontSize: 13, color: ui.sub, marginBottom: 6 }}>
          我的想法{mode === "deep" ? "（必填，这是视频的主体）" : "（可留空，AI 起草）"}
        </label>
        <textarea
          autoFocus
          rows={5}
          value={myTake}
          onChange={(e) => setMyTake(e.target.value)}
          placeholder="你同意吗？想到什么例子？和你之前读过的哪个观点冲突？"
          style={{
            width: "100%",
            padding: "10px 12px",
            fontSize: 14,
            borderRadius: 8,
            border: `1px solid ${ui.border}`,
            background: ui.inputBg,
            color: ui.text,
            fontFamily: "inherit",
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />

        <div style={{ display: "flex", gap: 16, fontSize: 13, margin: "14px 0 18px", color: ui.text }}>
          {(["deep", "fast"] as Mode[]).map((m) => (
            <label key={m} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="radio" checked={mode === m} onChange={() => setMode(m)} />
              {m === "deep" ? "深耕档（用我写的）" : "快产档（AI 起草）"}
            </label>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "9px 16px",
              fontSize: 14,
              borderRadius: 7,
              border: `1px solid ${ui.border}`,
              background: "transparent",
              color: ui.text,
              cursor: "pointer",
            }}
          >
            取消
          </button>
          <button
            disabled={!canSave || saving || progress === null}
            onClick={() => onSave(myTake, mode)}
            style={{
              padding: "9px 18px",
              fontSize: 14,
              borderRadius: 7,
              border: "none",
              background: !canSave || saving || progress === null ? ui.faint : ui.accent,
              color: !canSave || saving || progress === null ? ui.sub : ui.accentText,
              cursor: !canSave || saving ? "default" : "pointer",
            }}
          >
            {saving ? "保存中…" : "存为素材"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 右侧划线列表：搜索 + 按章节分组折叠 + 点击跳回原文。 */
function MaterialList({
  materials,
  ui,
  onGoto,
  onEdit,
}: {
  materials: MaterialBrief[];
  ui: UiPalette;
  onGoto: (cfi: string) => void;
  onEdit: (m: MaterialBrief) => void;
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const q = query.trim().toLowerCase();
  const filtered = q
    ? materials.filter(
        (m) =>
          m.source_text.toLowerCase().includes(q) ||
          m.my_take.toLowerCase().includes(q),
      )
    : materials;

  // 按 chapter 分组，保留首次出现顺序（列表已按时间倒序，最近章节在前）。
  const groups: { key: string; title: string; items: MaterialBrief[] }[] = [];
  const idx: Record<string, number> = {};
  for (const m of filtered) {
    const key = m.chapter ?? "";
    if (!(key in idx)) {
      idx[key] = groups.length;
      groups.push({ key, title: m.chapter ?? "未标注章节", items: [] });
    }
    groups[idx[key]].items.push(m);
  }

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // 搜索时强制展开所有分组，否则匹配项会被折起看不到。
  const isCollapsed = (key: string) => !q && collapsed.has(key);

  if (materials.length === 0) {
    return <p style={{ fontSize: 12, color: ui.faint }}>还没有划线。</p>;
  }

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索划线或想法…"
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "7px 10px",
          fontSize: 13,
          borderRadius: 7,
          border: `1px solid ${ui.border}`,
          background: ui.inputBg,
          color: ui.text,
          fontFamily: "inherit",
          marginBottom: 12,
          outline: "none",
        }}
      />

      {filtered.length === 0 ? (
        <p style={{ fontSize: 12, color: ui.faint }}>没有匹配的划线。</p>
      ) : (
        groups.map((g) => (
          <div key={g.key || "__none__"} style={{ marginBottom: 14 }}>
            <button
              onClick={() => toggle(g.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                width: "100%",
                border: "none",
                background: "transparent",
                color: ui.sub,
                fontSize: 12,
                fontWeight: 600,
                padding: "4px 0",
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              <span style={{ display: "inline-block", width: 10 }}>
                {isCollapsed(g.key) ? "▶" : "▼"}
              </span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {g.title}
              </span>
              <span style={{ fontWeight: 400, color: ui.faint }}>{g.items.length}</span>
            </button>

            {!isCollapsed(g.key) &&
              g.items.map((m) => (
                <div
                  key={m.id}
                  onClick={() => m.cfi && onGoto(m.cfi)}
                  title={m.cfi ? "点击回到原文位置" : undefined}
                  style={{
                    borderLeft: `2px solid ${ui.marker}`,
                    paddingLeft: 10,
                    marginLeft: 8,
                    marginBottom: 12,
                    cursor: m.cfi ? "pointer" : "default",
                    borderRadius: "0 4px 4px 0",
                    transition: "background .15s",
                  }}
                  onMouseEnter={(e) => {
                    if (m.cfi) e.currentTarget.style.background = ui.panelAlt;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.65, color: ui.text }}>
                    {m.source_text}
                  </p>
                  {m.my_take ? (
                    <p style={{ margin: "6px 0 0", fontSize: 12, color: ui.accent }}>{m.my_take}</p>
                  ) : null}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 5 }}>
                    <p style={{ margin: 0, fontSize: 11, color: ui.faint }}>
                      {m.chapter ?? ""} {m.progress !== null ? `· ${m.progress}%` : ""}
                      {m.cfi ? " · ↩" : ""}
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(m);
                      }}
                      style={{
                        border: `1px solid ${ui.border}`,
                        background: "transparent",
                        color: ui.sub,
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      编辑
                    </button>
                  </div>
                </div>
              ))}
          </div>
        ))
      )}
    </div>
  );
}

/** 素材编辑弹框。改完调 patchMaterial，后端退回 scripting 重跑。 */
function MaterialEditDialog({
  material,
  ui,
  onClose,
  onSaved,
}: {
  material: MaterialBrief;
  ui: UiPalette;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [sourceText, setSourceText] = useState(material.source_text);
  const [myTake, setMyTake] = useState(material.my_take);
  const [chapter, setChapter] = useState(material.chapter ?? "");
  const [saving, setSaving] = useState(false);

  const overlay: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  };
  const dialog: React.CSSProperties = {
    background: ui.inputBg,
    borderRadius: 10,
    padding: 20,
    width: "min(90vw, 480px)",
    maxHeight: "80vh",
    overflow: "auto",
    color: ui.text,
  };
  const label: React.CSSProperties = {
    fontSize: 11,
    color: ui.sub,
    marginBottom: 4,
    display: "block",
  };
  const textarea: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 10px",
    fontSize: 13,
    borderRadius: 6,
    border: `1px solid ${ui.border}`,
    background: ui.inputBg,
    color: ui.text,
    fontFamily: "inherit",
    resize: "vertical",
    outline: "none",
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={dialog} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>编辑素材</h3>

        <label style={label}>划线原文</label>
        <textarea
          rows={3}
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
          style={textarea}
        />

      <label style={{ ...label, marginTop: 12 }}>我的想法</label>
      <textarea
        rows={4}
        value={myTake}
        onChange={(e) => setMyTake(e.target.value)}
        style={textarea}
      />

      <label style={{ ...label, marginTop: 12 }}>章节</label>
      <input
        value={chapter}
        onChange={(e) => setChapter(e.target.value)}
        style={{ ...textarea, height: 36, resize: "none" }}
      />

      <p style={{ fontSize: 11, color: ui.faint, marginTop: 12, lineHeight: 1.5 }}>
        保存后，最新的关联任务会退回「AI 写脚本」重跑。
        旧视频保留为历史版本。
      </p>

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button
          onClick={async () => {
            setSaving(true);
            try {
              await patchMaterial(material.id, {
                source_text: sourceText,
                my_take: myTake,
                chapter: chapter || null,
              });
              onSaved();
            } catch (e) {
              alert(String(e));
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving}
          style={{
            flex: 1,
            padding: "9px",
            border: "none",
            borderRadius: 6,
            background: ui.accent,
            color: ui.accentText,
            fontSize: 14,
            cursor: saving ? "default" : "pointer",
          }}
        >
          {saving ? "保存中…" : "保存并重跑"}
        </button>
        <button
          onClick={onClose}
          style={{
            padding: "9px 16px",
            border: `1px solid ${ui.border}`,
            borderRadius: 6,
            background: "transparent",
            color: ui.sub,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          取消
        </button>
      </div>
      </div>
    </div>
  );
}

export function Reader() {
  const { bookId } = useParams<{ bookId: string }>();
  const id = Number(bookId);

  const { settings, toggleTheme, bumpFont, cycleSpread } = useReaderSettings();
  const ui = useUiPalette(settings);

  const bookRef = useRef<BookViewHandle>(null);

  const [book, setBook] = useState<BookOut | null>(null);
  const [materials, setMaterials] = useState<MaterialBrief[]>([]);
  // 划线先进队列，不立刻弹窗，允许连续划第二、第三条；
  // 点队列里某一条的「写想法」才打开 TakeDialog（用 cfi 定位当前是哪条）。
  const [pending, setPending] = useState<PendingSelection[]>([]);
  const [activeCfi, setActiveCfi] = useState<string | null>(null);
  const active = pending.find((p) => p.info.cfi === activeCfi) ?? null;
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editMaterial, setEditMaterial] = useState<MaterialBrief | null>(null);
  const { job, setJob, error, setError, running } = useJobPolling();

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    void (async () => {
      try {
        const all = await listBooks();
        setBook(all.find((b) => b.id === id) ?? null);
        setMaterials(await listBookMaterials(id));
      } catch (e) {
        setError(String(e));
      }
    })();
  }, [id]);

  // 划线只入队，不弹窗 —— 允许接着划第二、第三条。
  // 进度仍立刻问后端要（前端算不了，它需要全书字数表），算好了原地更新那一条。
  const onSelect = (info: SelectionInfo) => {
    setPending((prev) => [...prev, { info, progress: null }]);
    const applyProgress = (progress: number) =>
      setPending((prev) =>
        prev.map((p) => (p.info.cfi === info.cfi ? { ...p, progress } : p)),
      );
    void calcProgress(id, info.chapterIndex, info.fraction)
      .then((r) => applyProgress(r.progress))
      .catch(() => applyProgress(0));
  };

  const onSave = async (myTake: string, mode: Mode) => {
    if (!active || active.progress === null) return;
    setSaving(true);
    setError(null);
    try {
      const { material_id } = await createMaterial({
        book_id: id,
        source_text: active.info.text,
        my_take: myTake,
        chapter: active.info.chapterTitle || null,
        highlighted_at: new Date().toISOString().slice(0, 10),
        progress: active.progress,
        cfi: active.info.cfi,
        source: "epub",
        mode,
      });
      setPending((prev) => prev.filter((p) => p.info.cfi !== active.info.cfi));
      setActiveCfi(null);
      setMaterials(await listBookMaterials(id));
      setNotice("已存为素材");
      setJob(await createJob(material_id));
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const [sidebarWidth, setSidebarWidth] = useState(330);
  const dragging = useRef(false);

  // 拖动分隔条调整侧栏宽度
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      // 侧栏在右侧，宽度 = 窗口宽度 - 鼠标 x
      const w = window.innerWidth - e.clientX;
      setSidebarWidth(Math.max(240, Math.min(600, w)));
    };
    const onUp = () => { dragging.current = false; document.body.style.cursor = ""; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  if (!Number.isFinite(id)) return <p style={{ padding: 40 }}>无效的书籍 ID</p>;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: ui.panel }}>
      {/* 左侧：阅读区 */}
      <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
        <BookView
          ref={bookRef}
          url={epubFileUrl(id)}
          initialCfi={book?.last_cfi ?? null}
          onSelect={onSelect}
          onPositionChange={(cfi) => {
            void savePosition(id, cfi).catch(() => {});
          }}
          settings={settings}
        />
        <ReaderToolbar
          settings={settings}
          ui={ui}
          onToggleTheme={toggleTheme}
          onBumpFont={bumpFont}
          onCycleSpread={cycleSpread}
        />
        <PendingQueue
          items={pending}
          ui={ui}
          onOpen={(cfi) => setActiveCfi(cfi)}
          onDiscard={(cfi) =>
            setPending((prev) => prev.filter((p) => p.info.cfi !== cfi))
          }
        />
      </div>

      {/* 可拖动分隔条 */}
      <div
        onMouseDown={() => {
          dragging.current = true;
          document.body.style.cursor = "col-resize";
        }}
        style={{
          width: 5,
          flexShrink: 0,
          cursor: "col-resize",
          background: ui.border,
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = ui.accent)}
        onMouseLeave={(e) => {
          if (!dragging.current) e.currentTarget.style.background = ui.border;
        }}
      />

      {/* 右侧：书信息 + 划线列表 + 任务状态 */}
      <aside
        style={{
          width: sidebarWidth,
          flexShrink: 0,
          borderLeft: `1px solid ${ui.border}`,
          padding: "18px 18px 40px",
          overflowY: "auto",
          background: ui.panel,
          color: ui.text,
        }}
      >
        <Link to="/" style={{ fontSize: 13, color: ui.sub }}>
          ← 书架
        </Link>
        <h2 style={{ fontSize: 17, margin: "10px 0 2px", color: ui.text }}>{book?.title ?? "加载中…"}</h2>
        <p style={{ margin: 0, fontSize: 12, color: ui.sub }}>{book?.author}</p>
        <p style={{ fontSize: 12, color: ui.accent, marginTop: 10 }}>
          选中正文可连续划多处，右上角排队等待处理，点「写想法」再产出内容。
        </p>

        {notice ? (
          <p style={{ fontSize: 12, color: ui.success, marginTop: 8 }}>{notice}</p>
        ) : null}
        {error ? (
          <p style={{ fontSize: 12, color: ui.error, whiteSpace: "pre-wrap" }}>{error}</p>
        ) : null}

        {job ? (
          running ? (
            <p style={{ fontSize: 13, marginTop: 14, color: ui.text }}>
              任务 #{job.id} · <b>{STATUS_LABEL[job.status]}…</b>
            </p>
          ) : (
            <JobPanel
              job={job}
              setJob={setJob}
              ui={{
                border: ui.border,
                panelAlt: ui.panelAlt,
                text: ui.text,
                sub: ui.sub,
                accent: ui.accent,
                accentText: ui.accentText,
                errorBg: settings.theme === "night" ? "#2a1a1d" : "#fdf2f0",
                errorText: settings.theme === "night" ? "#e07a6a" : "#8a2617",
              }}
            />
          )
        ) : null}

        <h3 style={{ fontSize: 14, marginTop: 26, marginBottom: 10, color: ui.sub }}>
          划线 {materials.length > 0 ? `（${materials.length}）` : ""}
        </h3>
        <MaterialList
          materials={materials}
          ui={ui}
          onGoto={(cfi) => bookRef.current?.goto(cfi)}
          onEdit={(m) => setEditMaterial(m)}
        />
      </aside>

      {active ? (
        <TakeDialog
          selection={active.info}
          progress={active.progress}
          saving={saving}
          ui={ui}
          // 只是收起弹框，这条划线还留在右上角队列里，不会丢。
          onClose={() => setActiveCfi(null)}
          onSave={onSave}
        />
      ) : null}

      {editMaterial ? (
        <MaterialEditDialog
          material={editMaterial}
          ui={ui}
          onClose={() => setEditMaterial(null)}
          onSaved={async () => {
            setEditMaterial(null);
            setNotice("素材已修改，最新任务正在重跑");
            // 刷新素材列表
            if (bookId) {
              setMaterials(await listBookMaterials(Number(bookId)));
            }
          }}
        />
      ) : null}
    </div>
  );
}
