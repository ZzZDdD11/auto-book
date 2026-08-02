import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  createJob,
  getJob,
  getMaterialFull,
  patchMaterial,
  type JobOut,
  type MaterialFull,
} from "../api";
import { JobPanel } from "../components/JobPanel";

export function MaterialDetail({ materialId }: { materialId: number }) {
  const [material, setMaterial] = useState<MaterialFull | null>(null);
  const [job, setJob] = useState<JobOut | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sourceText, setSourceText] = useState("");
  const [myTake, setMyTake] = useState("");
  const [chapter, setChapter] = useState("");

  const load = async () => {
    try {
      const m = await getMaterialFull(materialId);
      setMaterial(m);
      setSourceText(m.source_text);
      setMyTake(m.my_take);
      setChapter(m.chapter ?? "");
      if (m.job_id) {
        setJob(await getJob(m.job_id));
      } else {
        setJob(null);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    load();
  }, [materialId]);

  // 轮询：任务在跑时自动刷新
  useEffect(() => {
    if (!job) return;
    const stopped = ["done", "failed", "script_pending", "render_pending", "copy_pending", "tts_pending", "cover_pending"];
    if (stopped.includes(job.status)) return;
    const timer = setTimeout(async () => {
      try {
        setJob(await getJob(job.id));
      } catch { /* ignore */ }
    }, 2000);
    return () => clearTimeout(timer);
  }, [job]);

  const onSaveMaterial = async () => {
    setBusy(true);
    try {
      await patchMaterial(materialId, {
        source_text: sourceText,
        my_take: myTake,
        chapter: chapter || null,
      });
      setEditing(false);
      await load();
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onCreateJob = async () => {
    setBusy(true);
    try {
      const newJob = await createJob(materialId);
      setJob(newJob);
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div style={{ padding: 40, color: "#c44" }}>{error}</div>;
  if (!material) return <div style={{ padding: 40, color: "#999", textAlign: "center" }}>加载中…</div>;

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    fontSize: 14,
    borderRadius: 8,
    border: "1px solid #e0dedb",
    background: "#fff",
    fontFamily: "inherit",
    outline: "none",
    transition: "border-color 0.15s",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8f7f5" }}>
      {/* 顶栏 */}
      <header
        style={{
          background: "#fff",
          borderBottom: "1px solid #ececec",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link to="/materials" style={{ fontSize: 14, color: "#999", textDecoration: "none" }}>
          ← 素材管理
        </Link>
        {material.book_id ? (
          <Link
            to={`/read/${material.book_id}`}
            style={{ fontSize: 13, color: "#666", textDecoration: "none" }}
          >
            在阅读器中打开 →
          </Link>
        ) : null}
      </header>

      <div
        style={{
          maxWidth: 1160,
          margin: "0 auto",
          padding: "24px 24px 60px",
          display: "flex",
          gap: 24,
          alignItems: "flex-start",
        }}
      >
        {/* 左：素材卡片，固定宽度，吸顶 */}
        <div
          style={{
            width: 320,
            flexShrink: 0,
            padding: "20px 22px",
            borderRadius: 14,
            background: "#fff",
            border: "1px solid #ececec",
            position: "sticky",
            top: 24,
          }}
        >
          {/* 书名行 */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 14,
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ width: 3, height: 18, borderRadius: 2, background: "#0f2a24", flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {material.book_title ?? "手动粘贴"}
                </div>
                {material.book_author ? (
                  <div style={{ fontSize: 11, color: "#aaa" }}>{material.book_author}</div>
                ) : null}
              </div>
            </div>
            <button
              onClick={() => setEditing(!editing)}
              style={{
                border: "1px solid #e0dedb",
                background: "transparent",
                color: "#666",
                padding: "5px 12px",
                borderRadius: 6,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.15s",
                flexShrink: 0,
              }}
            >
              {editing ? "取消" : "✎ 编辑"}
            </button>
          </div>

          {editing ? (
            <div>
              <label style={{ fontSize: 11, color: "#999", display: "block", marginBottom: 5, fontWeight: 600 }}>
                划线原文
              </label>
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                rows={4}
                style={{ ...inputStyle, resize: "vertical", marginBottom: 12 }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#0f2a24")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#e0dedb")}
              />
              <label style={{ fontSize: 11, color: "#999", display: "block", marginBottom: 5, fontWeight: 600 }}>
                我的想法
              </label>
              <textarea
                value={myTake}
                onChange={(e) => setMyTake(e.target.value)}
                rows={4}
                style={{ ...inputStyle, resize: "vertical", marginBottom: 12 }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#0f2a24")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#e0dedb")}
              />
              <label style={{ fontSize: 11, color: "#999", display: "block", marginBottom: 5, fontWeight: 600 }}>
                章节
              </label>
              <input
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
                style={{ ...inputStyle, marginBottom: 14 }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#0f2a24")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#e0dedb")}
              />
              <p style={{ fontSize: 11, color: "#bbb", marginBottom: 12 }}>
                保存后任务退回「AI 写脚本」重跑，旧视频保留为历史版本。
              </p>
              <button
                onClick={onSaveMaterial}
                disabled={busy}
                style={{
                  width: "100%",
                  padding: "9px 24px",
                  border: "none",
                  borderRadius: 8,
                  background: "#0f2a24",
                  color: "#fff",
                  fontSize: 14,
                  cursor: busy ? "default" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {busy ? "保存中…" : "保存并重跑"}
              </button>
            </div>
          ) : (
            <div>
              <div
                style={{
                  padding: "12px 14px",
                  background: "#f8f7f5",
                  borderRadius: 8,
                  marginBottom: 10,
                  borderLeft: "3px solid #e8b84b",
                }}
              >
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.75, color: "#333" }}>
                  {material.source_text}
                </p>
              </div>
              {material.my_take ? (
                <div
                  style={{
                    padding: "12px 14px",
                    background: "#f0f9f5",
                    borderRadius: 8,
                    borderLeft: "3px solid #10b981",
                  }}
                >
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.75, color: "#0f7050" }}>
                    💬 {material.my_take}
                  </p>
                </div>
              ) : null}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  marginTop: 12,
                  fontSize: 11,
                  color: "#bbb",
                }}
              >
                <span>{material.chapter ?? ""}</span>
                {material.progress !== null ? <span>进度 {material.progress}%</span> : null}
                <span>{material.mode === "deep" ? "深耕档" : "快产档"}</span>
                <span>
                  {new Date(material.created_at).toLocaleDateString("zh-CN", { month: "long", day: "numeric" })}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 右：任务面板，占据剩余宽度 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {job ? (
            <div
              style={{
                padding: "20px 22px",
                borderRadius: 14,
                background: "#fff",
                border: "1px solid #ececec",
              }}
            >
              <JobPanel job={job} setJob={setJob} />
            </div>
          ) : (
            <div
              style={{
                textAlign: "center",
                padding: "60px 0",
                borderRadius: 14,
                background: "#fff",
                border: "1px solid #ececec",
              }}
            >
              <p style={{ fontSize: 36, margin: "0 0 8px" }}>🎬</p>
              <p style={{ color: "#999", fontSize: 14, marginBottom: 16 }}>这个素材还没出过视频</p>
              <button
                onClick={onCreateJob}
                disabled={busy}
                style={{
                  padding: "10px 28px",
                  border: "none",
                  borderRadius: 8,
                  background: "#0f2a24",
                  color: "#fff",
                  fontSize: 15,
                  cursor: busy ? "default" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {busy ? "创建中…" : "生成视频"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
