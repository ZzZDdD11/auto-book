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

  // 编辑表单状态
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

  const onSaveMaterial = async () => {
    setBusy(true);
    try {
      await patchMaterial(materialId, {
        source_text: sourceText,
        my_take: myTake,
        chapter: chapter || null,
      });
      setEditing(false);
      await load(); // 重新加载，会拿到新的 job 状态
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onCreateJob = async () => {
    if (!material) return;
    setBusy(true);
    try {
      const newJob = await createJob(materialId);
      setJob(newJob);
      // 开始轮询
      const poll = async () => {
        const updated = await getJob(newJob.id);
        setJob(updated);
        if (updated.status !== "done" && updated.status !== "failed" && !updated.status.endsWith("_pending")) {
          setTimeout(poll, 2000);
        }
      };
      setTimeout(poll, 2000);
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div style={{ padding: 40, color: "#c44" }}>{error}</div>;
  if (!material) return <div style={{ padding: 40, color: "#999" }}>加载中…</div>;

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 20px 60px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <Link to="/materials" style={{ fontSize: 14, color: "#666", textDecoration: "none" }}>
          ← 素材管理
        </Link>
        {material.book_id ? (
          <Link to={`/read/${material.book_id}`} style={{ fontSize: 13, color: "#666", textDecoration: "none" }}>
            在阅读器中打开 →
          </Link>
        ) : null}
      </div>

      {/* 素材内容区 */}
      <div
        style={{
          padding: "18px 20px",
          borderRadius: 10,
          border: "1px solid #eee",
          background: "#fff",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{material.book_title ?? "无书名"}</span>
            {material.book_author ? (
              <span style={{ fontSize: 12, color: "#999", marginLeft: 8 }}>{material.book_author}</span>
            ) : null}
          </div>
          <button
            onClick={() => setEditing(!editing)}
            style={{
              border: "1px solid #ddd",
              background: "transparent",
              color: "#666",
              padding: "4px 12px",
              borderRadius: 5,
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {editing ? "取消" : "编辑素材"}
          </button>
        </div>

        {editing ? (
          <div>
            <label style={{ fontSize: 11, color: "#999", display: "block", marginBottom: 4 }}>划线原文</label>
            <textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              rows={4}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "8px 10px",
                fontSize: 14,
                borderRadius: 6,
                border: "1px solid #ddd",
                resize: "vertical",
                fontFamily: "inherit",
                marginBottom: 10,
              }}
            />
            <label style={{ fontSize: 11, color: "#999", display: "block", marginBottom: 4 }}>我的想法</label>
            <textarea
              value={myTake}
              onChange={(e) => setMyTake(e.target.value)}
              rows={4}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "8px 10px",
                fontSize: 14,
                borderRadius: 6,
                border: "1px solid #ddd",
                resize: "vertical",
                fontFamily: "inherit",
                marginBottom: 10,
              }}
            />
            <label style={{ fontSize: 11, color: "#999", display: "block", marginBottom: 4 }}>章节</label>
            <input
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "8px 10px",
                fontSize: 14,
                borderRadius: 6,
                border: "1px solid #ddd",
                fontFamily: "inherit",
                marginBottom: 12,
              }}
            />
            <p style={{ fontSize: 11, color: "#999", marginBottom: 10 }}>
              保存后任务会退回「AI 写脚本」重跑，旧视频保留为历史版本。
            </p>
            <button
              onClick={onSaveMaterial}
              disabled={busy}
              style={{
                padding: "8px 20px",
                border: "none",
                borderRadius: 6,
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
            <p style={{ margin: "0 0 8px", fontSize: 14, lineHeight: 1.7, color: "#333" }}>
              {material.source_text}
            </p>
            {material.my_take ? (
              <p style={{ margin: "0 0 8px", fontSize: 13, lineHeight: 1.7, color: "#0f7050" }}>
                {material.my_take}
              </p>
            ) : null}
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#999" }}>
              {material.chapter ?? ""} {material.progress !== null ? `· ${material.progress}%` : ""}
              {` · ${material.mode === "deep" ? "深耕档" : "快产档"}`}
            </p>
          </div>
        )}
      </div>

      {/* 任务五环节面板 */}
      {job ? (
        <JobPanel job={job} setJob={setJob} />
      ) : (
        <div style={{ textAlign: "center", padding: "30px 0" }}>
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
  );
}
