import { useState } from "react";
import {
  audioUrl,
  listHistory,
  patchCopy,
  patchScriptFrame,
  regenerateFrame,
  resumeJob,
  videoUrl,
  type CopyVariant,
  type FrameName,
  type HistoryEntry,
  type JobOut,
  type JobStatus,
  type Script,
} from "../api";

export const STATUS_LABEL: Record<JobStatus, string> = {
  pending: "排队中",
  scripting: "AI 写脚本",
  script_pending: "脚本待审",
  tts: "配音与字幕",
  tts_pending: "配音待审",
  rendering: "渲染视频",
  render_pending: "视频待审",
  cover_pending: "封面待审",
  copywriting: "写发布文案",
  copy_pending: "文案待审",
  done: "完成",
  failed: "失败",
};

export type JobPanelPalette = {
  border: string;
  panelAlt: string;
  text: string;
  sub: string;
  accent: string;
  accentText: string;
  errorBg: string;
  errorText: string;
};

const DEFAULT_PALETTE: JobPanelPalette = {
  border: "#eee",
  panelAlt: "#f4f1ec",
  text: "#1a1a1a",
  sub: "#666",
  accent: "#0f2a24",
  accentText: "#fff",
  errorBg: "#fdf2f0",
  errorText: "#8a2617",
};

const FRAME_LABELS: Record<FrameName, string> = {
  hook: "钩子",
  quote: "原文",
  breakdown: "拆解",
  my_take: "我的想法",
  outro: "收尾",
};

type StepStatus = "done" | "active" | "pending_review" | "waiting" | "failed";

function stepStatus(jobStatus: JobStatus, stage: string): StepStatus {
  if (jobStatus === "failed") return "failed";
  const order: JobStatus[] = [
    "pending",
    "scripting",
    "script_pending",
    "tts",
    "tts_pending",
    "rendering",
    "render_pending",
    "copywriting",
    "copy_pending",
    "done",
  ];
  const cur = order.indexOf(jobStatus);
  if (cur === -1) return "waiting";

  if (stage === "material") {
    return cur >= 1 ? "done" : "waiting";
  }
  if (stage === "script") {
    if (jobStatus === "script_pending") return "pending_review";
    return cur >= 3 ? "done" : cur >= 1 ? "active" : "waiting";
  }
  if (stage === "audio") {
    if (jobStatus === "tts_pending") return "pending_review";
    return cur >= 5 ? "done" : cur >= 3 ? "active" : "waiting";
  }
  if (stage === "video") {
    if (jobStatus === "render_pending") return "pending_review";
    return cur >= 7 ? "done" : cur >= 5 ? "active" : "waiting";
  }
  if (stage === "copy") {
    if (jobStatus === "copy_pending") return "pending_review";
    return cur >= 9 ? "done" : cur >= 7 ? "active" : "waiting";
  }
  return "waiting";
}

const STEP_ICON: Record<StepStatus, string> = {
  done: "✓",
  active: "●",
  pending_review: "✎",
  waiting: "○",
  failed: "✕",
};

const STEP_COLOR: Record<StepStatus, string> = {
  done: "#4fd1a5",
  active: "#5b9cf5",
  pending_review: "#e8b84b",
  waiting: "#bbb",
  failed: "#e85b4f",
};

export function JobPanel({
  job,
  ui: p,
  setJob,
}: {
  job: JobOut;
  ui?: JobPanelPalette;
  setJob: (j: JobOut | null) => void;
}) {
  const c = p ?? DEFAULT_PALETTE;
  const [busy, setBusy] = useState(false);
  const [editingFrame, setEditingFrame] = useState<FrameName | null>(null);

  const isPending = job.status.endsWith("_pending");
  const canResume = isPending && !busy;

  const onPatchFrame = async (frame: FrameName, patch: Record<string, unknown>) => {
    setBusy(true);
    try {
      setJob(await patchScriptFrame(job.id, frame, patch));
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(false);
      setEditingFrame(null);
    }
  };

  const onRegenerate = async (frame: FrameName, feedback?: string) => {
    setBusy(true);
    try {
      setJob(await regenerateFrame(job.id, frame, feedback));
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(false);
      setEditingFrame(null);
    }
  };

  const onResume = async () => {
    setBusy(true);
    try {
      setJob(await resumeJob(job.id));
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(false);
    }
  };

  // 默认展开：当前进行中/待审的环节
  const initialOpen = (() => {
    const s = job.status;
    if (s === "script_pending" || s === "scripting") return "script";
    if (s === "render_pending" || s === "rendering") return "video";
    if (s === "copy_pending" || s === "copywriting") return "copy";
    if (s === "done") return "copy";
    return "script";
  })();

  return (
    <section
      style={{
        marginTop: 24,
        borderTop: `1px solid ${c.border}`,
        paddingTop: 18,
        color: c.text,
      }}
    >
      <p style={{ fontSize: 14, marginBottom: 14 }}>
        任务 #{job.id} · <b>{STATUS_LABEL[job.status]}</b>
        {job.cost_tokens ? `　${job.cost_tokens} tokens` : ""}
        {job.video_version ? `　v${job.video_version}` : ""}
      </p>

      {job.status === "failed" ? (
        <pre
          style={{
            background: c.errorBg,
            color: c.errorText,
            padding: 12,
            borderRadius: 8,
            fontSize: 12,
            whiteSpace: "pre-wrap",
          }}
        >
          {job.error}
        </pre>
      ) : null}

      {/* 五个环节，每个可折叠 */}
      <StepBlock label="素材" stage="material" jobStatus={job.status} initialOpen={false} ui={c}>
        <MaterialStep jobId={job.id} ui={c} setJob={setJob} />
      </StepBlock>

      <StepBlock label="脚本" stage="script" jobStatus={job.status} initialOpen={initialOpen === "script"} ui={c}>
        {job.script ? (
          <ScriptStep
            script={job.script}
            ui={c}
            busy={busy}
            editingFrame={editingFrame}
            onEditFrame={(f) => setEditingFrame(f)}
            onCancelEdit={() => setEditingFrame(null)}
            onPatchFrame={onPatchFrame}
            onRegenerate={onRegenerate}
          />
        ) : (
          <p style={{ color: c.sub, fontSize: 13 }}>脚本还没生成</p>
        )}
      </StepBlock>

      <StepBlock label="配音" stage="audio" jobStatus={job.status} initialOpen={false} ui={c}>
        <AudioStep jobId={job.id} ui={c} />
      </StepBlock>

      <StepBlock label="视频" stage="video" jobStatus={job.status} initialOpen={initialOpen === "video"} ui={c}>
        <VideoStep job={job} ui={c} />
        {job.script && (job.status === "render_pending") ? (
          <ScriptStep
            script={job.script}
            ui={c}
            busy={busy}
            editingFrame={editingFrame}
            onEditFrame={(f) => setEditingFrame(f)}
            onCancelEdit={() => setEditingFrame(null)}
            onPatchFrame={onPatchFrame}
            onRegenerate={onRegenerate}
          />
        ) : null}
      </StepBlock>

      <StepBlock label="文案" stage="copy" jobStatus={job.status} initialOpen={initialOpen === "copy"} ui={c}>
        {job.copies ? (
          <CopyStep jobId={job.id} copies={job.copies} ui={c} busy={busy} setJob={setJob} />
        ) : (
          <p style={{ color: c.sub, fontSize: 13 }}>文案还没生成</p>
        )}
      </StepBlock>

      {/* resume 按钮 */}
      {canResume ? (
        <button
          onClick={onResume}
          style={{
            display: "block",
            width: "100%",
            padding: "10px",
            marginTop: 14,
            background: c.accent,
            color: c.accentText,
            border: "none",
            borderRadius: 7,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          确认，继续 ▶
        </button>
      ) : null}
    </section>
  );
}

/** 可折叠的环节块。标题行有状态图标 + 名称 + 展开/折叠箭头。 */
function StepBlock({
  label,
  stage,
  jobStatus,
  initialOpen,
  ui,
  children,
}: {
  label: string;
  stage: string;
  jobStatus: JobStatus;
  initialOpen: boolean;
  ui: JobPanelPalette;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(initialOpen);
  const ss = stepStatus(jobStatus, stage);
  const color = STEP_COLOR[ss];
  const icon = STEP_ICON[ss];

  // 待审环节自动展开
  if (ss === "pending_review" && !open) {
    setTimeout(() => setOpen(true), 0);
  }

  return (
    <div
      style={{
        borderBottom: `1px solid ${ui.border}`,
        padding: "10px 0",
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: ui.text,
          fontSize: 14,
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <span style={{ color, fontSize: 14, width: 16, textAlign: "center" }}>{icon}</span>
        <span style={{ fontWeight: 600 }}>{label}</span>
        {ss === "pending_review" ? (
          <span style={{ fontSize: 11, color, background: `${color}22`, padding: "1px 7px", borderRadius: 8 }}>
            待审
          </span>
        ) : null}
        <span style={{ marginLeft: "auto", color: ui.sub, fontSize: 12 }}>{open ? "▼" : "▶"}</span>
      </button>
      {open ? <div style={{ marginTop: 10, paddingLeft: 26 }}>{children}</div> : null}
    </div>
  );
}

// ============================================================
// 各环节内容
// ============================================================

function MaterialStep({
  jobId: _jobId,
  ui,
  setJob: _setJob,
}: {
  jobId: number;
  ui: JobPanelPalette;
  setJob: (j: JobOut | null) => void;
}) {
  return (
    <p style={{ fontSize: 12, color: ui.sub, lineHeight: 1.6 }}>
      素材可在划线列表中点「编辑」修改。改完后任务自动退回「AI 写脚本」重跑。
    </p>
  );
}

function ScriptStep({
  script,
  ui,
  busy,
  editingFrame,
  onEditFrame,
  onCancelEdit,
  onPatchFrame,
  onRegenerate,
}: {
  script: Script;
  ui: JobPanelPalette;
  busy: boolean;
  editingFrame: FrameName | null;
  onEditFrame: (f: FrameName) => void;
  onCancelEdit: () => void;
  onPatchFrame: (frame: FrameName, patch: Record<string, unknown>) => void;
  onRegenerate: (frame: FrameName, feedback?: string) => void;
}) {
  return (
    <div style={{ fontSize: 13 }}>
      <p style={{ margin: "0 0 10px", fontSize: 11, color: ui.sub }}>
        点「编辑/重写」改文字或让 AI 重新写这一帧。
      </p>
      <FrameBlock name="hook" label={FRAME_LABELS.hook} ui={ui} busy={busy} editing={editingFrame === "hook"} onEdit={() => onEditFrame("hook")} onCancel={onCancelEdit} onPatch={onPatchFrame} onRegenerate={onRegenerate}>
        {script.hook.lines.map((l, i) => (
          <span key={i} style={{ fontWeight: 700 }}>{l === script.hook.highlight ? `★ ${l}` : l}{i < script.hook.lines.length - 1 ? " / " : ""}</span>
        ))}
      </FrameBlock>
      <FrameBlock name="quote" label={FRAME_LABELS.quote} ui={ui} busy={busy} editing={editingFrame === "quote"} onEdit={() => onEditFrame("quote")} onCancel={onCancelEdit} onPatch={onPatchFrame} onRegenerate={onRegenerate}>
        <span style={{ fontStyle: "italic" }}>{script.quote.text}</span>
        {script.quote.chapter ? <span style={{ color: ui.sub }}>　{script.quote.chapter}</span> : null}
      </FrameBlock>
      <FrameBlock name="breakdown" label={FRAME_LABELS.breakdown} ui={ui} busy={busy} editing={editingFrame === "breakdown"} onEdit={() => onEditFrame("breakdown")} onCancel={onCancelEdit} onPatch={onPatchFrame} onRegenerate={onRegenerate}>
        {script.breakdown.points.map((p, i) => (
          <div key={i} style={{ marginBottom: 5 }}>
            <span style={{ fontWeight: 600 }}>{i + 1}. {p.text}</span>
            {p.evidence ? <span style={{ color: ui.sub }}>　原文「{p.evidence}」</span> : null}
          </div>
        ))}
      </FrameBlock>
      <FrameBlock name="my_take" label={FRAME_LABELS.my_take} ui={ui} busy={busy} editing={editingFrame === "my_take"} onEdit={() => onEditFrame("my_take")} onCancel={onCancelEdit} onPatch={onPatchFrame} onRegenerate={onRegenerate}>
        <span>{script.my_take.text}</span>
      </FrameBlock>
      <FrameBlock name="outro" label={FRAME_LABELS.outro} ui={ui} busy={busy} editing={editingFrame === "outro"} onEdit={() => onEditFrame("outro")} onCancel={onCancelEdit} onPatch={onPatchFrame} onRegenerate={onRegenerate}>
        <span>{script.outro.question}</span>
      </FrameBlock>
    </div>
  );
}

function AudioStep({ jobId, ui }: { jobId: number; ui: JobPanelPalette }) {
  const frames: FrameName[] = ["hook", "quote", "breakdown", "my_take", "outro"];
  return (
    <div style={{ fontSize: 13 }}>
      {frames.map((f) => (
        <div key={f} style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 50, color: ui.sub, fontSize: 12 }}>{FRAME_LABELS[f]}</span>
          <audio src={audioUrl(jobId, f)} controls style={{ height: 32, flex: 1 }} />
        </div>
      ))}
    </div>
  );
}

function VideoStep({ job, ui }: { job: JobOut; ui: JobPanelPalette }) {
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);

  if (!job.video_version) {
    return <p style={{ color: ui.sub, fontSize: 13 }}>视频还没渲染</p>;
  }

  return (
    <div style={{ fontSize: 13 }}>
      <video
        src={videoUrl(job.id, job.video_version)}
        controls
        style={{ width: "100%", maxWidth: 300, borderRadius: 8, display: "block", margin: "0 auto 12px" }}
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        <a href={videoUrl(job.id)} download style={{ padding: "6px 12px", background: ui.accent, color: ui.accentText, borderRadius: 5, textDecoration: "none", fontSize: 12 }}>
          下载 MP4
        </a>
        {job.video_version > 1 ? (
          <button
            onClick={async () => {
              if (history) { setHistory(null); return; }
              try { setHistory(await listHistory(job.id)); } catch { /* ignore */ }
            }}
            style={{ padding: "6px 10px", background: "transparent", color: ui.sub, border: `1px solid ${ui.border}`, borderRadius: 5, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
          >
            {history ? "收起" : `历史 (${job.video_version})`}
          </button>
        ) : null}
        {job.cover_ratios.map((r) => (
          <a key={r} href={`/api/jobs/${job.id}/cover/${r}`} download style={{ padding: "6px 8px", background: ui.panelAlt, color: ui.sub, borderRadius: 5, textDecoration: "none", fontSize: 11 }}>
            封面 {r}
          </a>
        ))}
      </div>
      {history ? (
        <div style={{ marginTop: 8 }}>
          {history.map((h) => (
            <a key={h.version} href={videoUrl(job.id, h.version)} download style={{ display: "block", padding: "5px 8px", marginBottom: 3, background: ui.panelAlt, borderRadius: 4, textDecoration: "none", color: ui.text, fontSize: 12 }}>
              v{h.version} · {Math.round(h.size_bytes / 1024)}KB · {new Date(h.created_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CopyStep({
  jobId,
  copies,
  ui,
  busy,
  setJob,
}: {
  jobId: number;
  copies: Record<string, CopyVariant>;
  ui: JobPanelPalette;
  busy: boolean;
  setJob: (j: JobOut | null) => void;
}) {
  const [edited, setEdited] = useState<Record<string, CopyVariant>>(copies);
  const [saving, setSaving] = useState(false);

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "6px 8px", fontSize: 13,
    borderRadius: 5, border: `1px solid ${ui.border}`, background: "transparent",
    color: ui.text, fontFamily: "inherit", outline: "none",
  };

  return (
    <div>
      {Object.entries(edited).map(([platform, v]) => (
        <div key={platform} style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: 13, margin: "0 0 6px" }}>{platform}</h3>
          <input value={v.title} onChange={(e) => setEdited({ ...edited, [platform]: { ...v, title: e.target.value } })} style={{ ...inputStyle, marginBottom: 5, fontWeight: 600 }} />
          <textarea value={v.body} onChange={(e) => setEdited({ ...edited, [platform]: { ...v, body: e.target.value } })} rows={3} style={{ ...inputStyle, marginBottom: 5, resize: "vertical" }} />
          <input value={v.tags.join(" ")} onChange={(e) => setEdited({ ...edited, [platform]: { ...v, tags: e.target.value.split(/\s+/).map((t) => t.replace(/^#/, "")).filter(Boolean) } })} style={{ ...inputStyle, fontSize: 12, color: ui.sub }} />
        </div>
      ))}
      <button
        onClick={async () => { setSaving(true); try { setJob(await patchCopy(jobId, edited)); } catch (e) { alert(String(e)); } finally { setSaving(false); } }}
        disabled={saving || busy}
        style={{ padding: "6px 14px", border: "none", borderRadius: 5, background: ui.accent, color: ui.accentText, fontSize: 12, cursor: saving ? "default" : "pointer" }}
      >
        {saving ? "保存中…" : "保存文案"}
      </button>
    </div>
  );
}

/** 单帧的展示块 */
function FrameBlock({
  name, label, children, ui, busy, editing, onEdit, onCancel, onPatch, onRegenerate,
}: {
  name: FrameName; label: string; children: React.ReactNode; ui: JobPanelPalette;
  busy: boolean; editing: boolean; onEdit: () => void; onCancel: () => void;
  onPatch: (frame: FrameName, patch: Record<string, unknown>) => void;
  onRegenerate: (frame: FrameName, feedback?: string) => void;
}) {
  const [feedback, setFeedback] = useState("");
  const btnStyle: React.CSSProperties = {
    border: `1px solid ${ui.border}`, background: "transparent", color: ui.sub,
    padding: "2px 8px", borderRadius: 4, fontSize: 11, cursor: busy ? "default" : "pointer", fontFamily: "inherit",
  };

  return (
    <div style={{ marginTop: 10, paddingBottom: 10, borderBottom: `1px solid ${ui.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: ui.sub, fontWeight: 600 }}>{label}</span>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          {editing ? (
            <>
              <input value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="重写要求（可选）" style={{ width: 100, fontSize: 11, padding: "2px 5px", border: `1px solid ${ui.border}`, borderRadius: 4, background: "transparent", color: ui.text, fontFamily: "inherit" }} />
              <button disabled={busy} style={btnStyle} onClick={() => onRegenerate(name, feedback.trim() || undefined)}>{busy ? "…" : "AI 重写"}</button>
              <button style={btnStyle} onClick={onCancel}>取消</button>
            </>
          ) : (
            <button disabled={busy} style={btnStyle} onClick={onEdit}>编辑/重写</button>
          )}
        </div>
      </div>
      <div style={{ lineHeight: 1.6 }}>{editing ? <FrameEditor name={name} onPatch={onPatch} /> : children}</div>
    </div>
  );
}

function FrameEditor({ name, onPatch }: { name: FrameName; onPatch: (frame: FrameName, patch: Record<string, unknown>) => void }) {
  const [text, setText] = useState("");
  const placeholders: Record<FrameName, string> = {
    hook: '{"lines": ["第一行", "第二行"], "highlight": "第一行"}',
    quote: '{"text": "原文金句", "chapter": "章节"}',
    breakdown: '{"points": [{"text": "结论", "evidence": "原文片段或null"}]}',
    my_take: '{"text": "你的观点"}',
    outro: '{"question": "抛给观众的问题"}',
  };
  return (
    <div>
      <textarea autoFocus rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholders[name]} style={{ width: "100%", boxSizing: "border-box", fontSize: 12, fontFamily: "monospace", padding: "6px", borderRadius: 4, border: "1px solid #ccc", resize: "vertical" }} />
      <button onClick={() => { try { onPatch(name, JSON.parse(text)); } catch { alert("JSON 格式错误"); } }} style={{ marginTop: 4, padding: "3px 10px", fontSize: 12, border: "none", background: "#0f2a24", color: "#fff", borderRadius: 4, cursor: "pointer" }}>提交修改</button>
    </div>
  );
}
