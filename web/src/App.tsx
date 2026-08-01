import { useEffect, useRef, useState } from "react";
import {
  createJob,
  createMaterial,
  getJob,
  type JobOut,
  type JobStatus,
  type Mode,
} from "./api";

const STATUS_LABEL: Record<JobStatus, string> = {
  pending: "排队中",
  scripting: "AI 写脚本",
  tts: "配音与字幕",
  rendering: "渲染视频",
  done: "完成",
  failed: "失败",
};

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

export default function App() {
  const [bookTitle, setBookTitle] = useState("");
  const [bookAuthor, setBookAuthor] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [myTake, setMyTake] = useState("");
  const [chapter, setChapter] = useState("");
  const [progress, setProgress] = useState("");
  const [mode, setMode] = useState<Mode>("fast");

  const [job, setJob] = useState<JobOut | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  // 轮询任务状态，完成或失败就停
  useEffect(() => {
    if (!job || job.status === "done" || job.status === "failed") return;
    timer.current = window.setTimeout(async () => {
      try {
        setJob(await getJob(job.id));
      } catch (e) {
        setErr(String(e));
      }
    }, 2000);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [job]);

  const submit = async () => {
    setErr(null);
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
        mode,
      });
      setJob(await createJob(material_id));
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const running = job !== null && job.status !== "done" && job.status !== "failed";

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "48px 20px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>auto-book</h1>
      <p style={{ color: "#777", marginTop: 0, fontSize: 14 }}>
        贴一段书摘和你的想法，出一条竖屏视频。
      </p>

      <div style={{ display: "grid", gap: 14, marginTop: 28 }}>
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
        <div style={{ display: "flex", gap: 14 }}>
          <Field label="章节">
            <input
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="进度 %">
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
          {running ? `${STATUS_LABEL[job.status]}…` : "生成视频"}
        </button>
      </div>

      {err ? <p style={{ color: "#b5301a", fontSize: 14 }}>{err}</p> : null}

      {job ? (
        <section style={{ marginTop: 34, borderTop: "1px solid #eee", paddingTop: 22 }}>
          <p style={{ fontSize: 15 }}>
            任务 #{job.id} · <b>{STATUS_LABEL[job.status]}</b>
            {job.cost_tokens ? `　消耗 ${job.cost_tokens} tokens` : ""}
          </p>
          {job.status === "failed" ? (
            <pre
              style={{
                background: "#fdf2f0",
                color: "#8a2617",
                padding: 14,
                borderRadius: 8,
                fontSize: 13,
                whiteSpace: "pre-wrap",
              }}
            >
              {job.error}
            </pre>
          ) : null}
          {job.status === "done" ? (
            <>
              <p>
                <a href={`/api/jobs/${job.id}/video`} download>
                  下载 MP4
                </a>
              </p>
              {job.copies
                ? Object.entries(job.copies).map(([platform, v]) => (
                    <div key={platform} style={{ marginTop: 18 }}>
                      <h3 style={{ fontSize: 15, marginBottom: 6 }}>{platform}</h3>
                      <p style={{ margin: "4px 0", fontWeight: 600 }}>{v.title}</p>
                      <p style={{ margin: "4px 0", whiteSpace: "pre-wrap", fontSize: 14 }}>
                        {v.body}
                      </p>
                      <p style={{ margin: "4px 0", color: "#666", fontSize: 13 }}>
                        {v.tags.map((t) => `#${t}`).join(" ")}
                      </p>
                    </div>
                  ))
                : null}
            </>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
