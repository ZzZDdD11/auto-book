import { useState } from "react";
import { Link } from "react-router-dom";
import { createJob, createMaterial, type Mode } from "../api";
import { JobPanel, STATUS_LABEL } from "../components/JobPanel";
import { useIsMobile } from "../hooks/useIsMobile";
import { useJobPolling } from "../hooks/useJobPolling";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  fontSize: 14,
  borderRadius: 7,
  border: "1px solid #ddd",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ flex: 1, display: "block" }}>
      <span style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 5 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

/** 手动粘贴入口。给纸质书、微信读书、PDF 用 —— 这些没法走阅读器。 */
export function Compose() {
  const isMobile = useIsMobile();
  const [bookTitle, setBookTitle] = useState("");
  const [bookAuthor, setBookAuthor] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [myTake, setMyTake] = useState("");
  const [chapter, setChapter] = useState("");
  const [progress, setProgress] = useState("");
  const [mode, setMode] = useState<Mode>("fast");
  const [busy, setBusy] = useState(false);
  const { job, setJob, error, setError, running } = useJobPolling();

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const { material_id } = await createMaterial({
        book_title: bookTitle.trim(),
        book_author: bookAuthor.trim(),
        source_text: sourceText.trim(),
        my_take: myTake.trim(),
        chapter: chapter.trim() || null,
        highlighted_at: new Date().toISOString().slice(0, 10),
        progress: progress ? Number(progress) : null,
        source: "paste",
        mode,
      });
      setJob(await createJob(material_id));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px" }}>
      <Link to="/" style={{ fontSize: 13, color: "#666" }}>
        ← 书架
      </Link>
      <h1 style={{ fontSize: 24, marginBottom: 6, marginTop: 12 }}>手动粘贴</h1>
      <p style={{ color: "#777", marginTop: 0, fontSize: 14 }}>
        纸质书、微信读书、PDF 用这里。EPUB 建议走书架里的阅读器，字段会自动带入。
      </p>

      <div style={{ display: "grid", gap: 14, marginTop: 24 }}>
        <Field label="书名">
          <input
            value={bookTitle}
            onChange={(e) => setBookTitle(e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="作者">
          <input
            value={bookAuthor}
            onChange={(e) => setBookAuthor(e.target.value)}
            style={inputStyle}
          />
        </Field>
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 14 }}>
          <Field label="章节（可留空）">
            <input
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="进度 %（可留空）">
            <input
              type="number"
              min={0}
              max={100}
              value={progress}
              onChange={(e) => setProgress(e.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>
        <Field label="原文摘录">
          <textarea
            rows={4}
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </Field>
        <Field
          label={`我的想法${mode === "deep" ? "（深耕档必填）" : "（留空则由 AI 起草）"}`}
        >
          <textarea
            rows={5}
            value={myTake}
            onChange={(e) => setMyTake(e.target.value)}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </Field>

        <div style={{ display: "flex", gap: 18, fontSize: 14 }}>
          {(["deep", "fast"] as Mode[]).map((m) => (
            <label key={m} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="radio" checked={mode === m} onChange={() => setMode(m)} />
              {m === "deep" ? "深耕档（用我写的想法）" : "快产档（AI 起草，我审改）"}
            </label>
          ))}
        </div>

        <button
          onClick={submit}
          disabled={busy || running || !bookTitle.trim() || !sourceText.trim()}
          style={{
            padding: "12px 20px",
            fontSize: 15,
            borderRadius: 8,
            border: "none",
            background: busy || running ? "#bbb" : "#0f2a24",
            color: "#fff",
            cursor: busy || running ? "default" : "pointer",
          }}
        >
          {running && job ? `${STATUS_LABEL[job.status]}…` : "生成视频"}
        </button>
      </div>

      {error ? (
        <p style={{ color: "#b5301a", fontSize: 14, whiteSpace: "pre-wrap" }}>{error}</p>
      ) : null}
      {job ? <JobPanel job={job} setJob={setJob} /> : null}
    </main>
  );
}
