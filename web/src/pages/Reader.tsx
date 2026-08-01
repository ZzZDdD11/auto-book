import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  calcProgress,
  createJob,
  createMaterial,
  epubFileUrl,
  listBookMaterials,
  listBooks,
  savePosition,
  type BookOut,
  type MaterialBrief,
  type Mode,
} from "../api";
import { BookView, type SelectionInfo } from "../components/BookView";
import { JobPanel, STATUS_LABEL } from "../components/JobPanel";
import { useJobPolling } from "../hooks/useJobPolling";

/** 划线后的弹框。整个产品里唯一需要手动输入的地方。 */
function TakeDialog({
  selection,
  progress,
  onClose,
  onSave,
  saving,
}: {
  selection: SelectionInfo;
  progress: number | null;
  onClose: () => void;
  onSave: (myTake: string, mode: Mode) => void;
  saving: boolean;
}) {
  const [myTake, setMyTake] = useState("");
  const [mode, setMode] = useState<Mode>("deep");

  const canSave = mode === "fast" || myTake.trim().length > 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
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
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          width: "100%",
          maxWidth: 560,
          boxShadow: "0 10px 40px rgba(0,0,0,.25)",
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: "#888",
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
            background: "#f4f1ec",
            borderRadius: 8,
            fontSize: 15,
            lineHeight: 1.75,
            maxHeight: 160,
            overflow: "auto",
          }}
        >
          {selection.text}
        </blockquote>

        <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 6 }}>
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
            border: "1px solid #ddd",
            fontFamily: "inherit",
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />

        <div style={{ display: "flex", gap: 16, fontSize: 13, margin: "14px 0 18px" }}>
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
              border: "1px solid #ddd",
              background: "#fff",
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
              background: !canSave || saving || progress === null ? "#bbb" : "#0f2a24",
              color: "#fff",
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

export function Reader() {
  const { bookId } = useParams<{ bookId: string }>();
  const id = Number(bookId);

  const [book, setBook] = useState<BookOut | null>(null);
  const [materials, setMaterials] = useState<MaterialBrief[]>([]);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
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

  // 选中后立刻问后端要真实进度 —— 前端算不了，它需要全书字数表
  const onSelect = (info: SelectionInfo) => {
    setSelection(info);
    setProgress(null);
    void calcProgress(id, info.chapterIndex, info.fraction)
      .then((r) => setProgress(r.progress))
      .catch(() => setProgress(0));
  };

  const onSave = async (myTake: string, mode: Mode) => {
    if (!selection || progress === null) return;
    setSaving(true);
    setError(null);
    try {
      const { material_id } = await createMaterial({
        book_id: id,
        source_text: selection.text,
        my_take: myTake,
        chapter: selection.chapterTitle || null,
        highlighted_at: new Date().toISOString().slice(0, 10),
        progress,
        cfi: selection.cfi,
        source: "epub",
        mode,
      });
      setSelection(null);
      setMaterials(await listBookMaterials(id));
      setNotice("已存为素材");
      setJob(await createJob(material_id));
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!Number.isFinite(id)) return <p style={{ padding: 40 }}>无效的书籍 ID</p>;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* 左侧：阅读区 */}
      <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
        <BookView
          url={epubFileUrl(id)}
          initialCfi={book?.last_cfi ?? null}
          onSelect={onSelect}
          onPositionChange={(cfi) => {
            void savePosition(id, cfi).catch(() => {});
          }}
        />
      </div>

      {/* 右侧：书信息 + 划线列表 + 任务状态 */}
      <aside
        style={{
          width: 330,
          flexShrink: 0,
          borderLeft: "1px solid #e6e6e6",
          padding: "18px 18px 40px",
          overflowY: "auto",
          background: "#fafafa",
        }}
      >
        <Link to="/" style={{ fontSize: 13, color: "#666" }}>
          ← 书架
        </Link>
        <h2 style={{ fontSize: 17, margin: "10px 0 2px" }}>{book?.title ?? "加载中…"}</h2>
        <p style={{ margin: 0, fontSize: 12, color: "#888" }}>{book?.author}</p>
        <p style={{ fontSize: 12, color: "#0f2a24", marginTop: 10 }}>
          选中正文里的一句话，就能写想法。
        </p>

        {notice ? (
          <p style={{ fontSize: 12, color: "#0a7d5a", marginTop: 8 }}>{notice}</p>
        ) : null}
        {error ? (
          <p style={{ fontSize: 12, color: "#b5301a", whiteSpace: "pre-wrap" }}>{error}</p>
        ) : null}

        {job ? (
          running ? (
            <p style={{ fontSize: 13, marginTop: 14 }}>
              任务 #{job.id} · <b>{STATUS_LABEL[job.status]}…</b>
            </p>
          ) : (
            <JobPanel job={job} />
          )
        ) : null}

        <h3 style={{ fontSize: 14, marginTop: 26, marginBottom: 10, color: "#555" }}>
          划线 {materials.length > 0 ? `（${materials.length}）` : ""}
        </h3>
        {materials.length === 0 ? (
          <p style={{ fontSize: 12, color: "#aaa" }}>还没有划线。</p>
        ) : (
          materials.map((m) => (
            <div
              key={m.id}
              style={{
                borderLeft: "2px solid #e8b84b",
                paddingLeft: 10,
                marginBottom: 16,
              }}
            >
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.65 }}>{m.source_text}</p>
              {m.my_take ? (
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#0f2a24" }}>
                  {m.my_take}
                </p>
              ) : null}
              <p style={{ margin: "5px 0 0", fontSize: 11, color: "#aaa" }}>
                {m.chapter ?? ""} {m.progress !== null ? `· ${m.progress}%` : ""}
              </p>
            </div>
          ))
        )}
      </aside>

      {selection ? (
        <TakeDialog
          selection={selection}
          progress={progress}
          saving={saving}
          onClose={() => setSelection(null)}
          onSave={onSave}
        />
      ) : null}
    </div>
  );
}
