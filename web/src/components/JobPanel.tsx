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

  // 默认展开：待审环节优先，done 全展开，否则展开当前进行中的
  const initialOpenStage = (() => {
    const s = job.status;
    if (s === "script_pending" || s === "scripting") return "script";
    if (s === "render_pending" || s === "rendering") return "video";
    if (s === "copy_pending" || s === "copywriting") return "copy";
    return "script";
  })();
  const doneAllOpen = job.status === "done";

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
      <StepBlock label="素材" stage="material" jobStatus={job.status} initialOpen={doneAllOpen} ui={c}>
        <MaterialStep jobId={job.id} ui={c} setJob={setJob} />
      </StepBlock>

      <StepBlock label="脚本" stage="script" jobStatus={job.status} initialOpen={doneAllOpen || initialOpenStage === "script"} ui={c}>
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

      <StepBlock label="配音" stage="audio" jobStatus={job.status} initialOpen={doneAllOpen} ui={c}>
        <AudioStep jobId={job.id} ui={c} />
      </StepBlock>

      <StepBlock label="视频" stage="video" jobStatus={job.status} initialOpen={doneAllOpen || initialOpenStage === "video"} ui={c}>
        <VideoStep job={job} ui={c} />
        {job.script && job.status === "render_pending" ? (
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

      <StepBlock label="文案" stage="copy" jobStatus={job.status} initialOpen={doneAllOpen || initialOpenStage === "copy"} ui={c}>
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

/** 可折叠的环节块。每个是一张独立卡片，边界清晰。 */
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
        marginBottom: 10,
        borderRadius: 10,
        background: "#fff",
        border: `1px solid ${ss === "pending_review" ? color : "#e0dedb"}`,
        overflow: "hidden",
      }}
    >
      {/* 标题行：卡片头部，有自己的背景色 */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          background: ss === "pending_review" ? `${color}10` : "#faf9f7",
          border: "none",
          borderBottom: open ? `1px solid #ececec` : "none",
          padding: "11px 14px",
          cursor: "pointer",
          color: ui.text,
          fontSize: 14,
          fontFamily: "inherit",
          textAlign: "left",
          transition: "background 0.15s",
        }}
      >
        <span
          style={{
            color,
            fontSize: 14,
            width: 18,
            textAlign: "center",
            fontWeight: 700,
          }}
        >
          {icon}
        </span>
        <span style={{ fontWeight: 600 }}>{label}</span>
        {ss === "pending_review" ? (
          <span
            style={{
              fontSize: 10,
              color: "#fff",
              background: color,
              padding: "1px 7px",
              borderRadius: 8,
              fontWeight: 600,
            }}
          >
            待审
          </span>
        ) : ss === "active" ? (
          <span
            style={{
              fontSize: 10,
              color: color,
              padding: "1px 7px",
              borderRadius: 8,
              background: `${color}15`,
            }}
          >
            进行中
          </span>
        ) : null}
        <span style={{ marginLeft: "auto", color: ui.sub, fontSize: 11 }}>
          {open ? "收起 ▲" : "展开 ▼"}
        </span>
      </button>
      {/* 内容区：浅灰底，和标题行区分开 */}
      {open ? (
        <div style={{ padding: "14px 16px", background: "#f8f7f5" }}>{children}</div>
      ) : null}
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
        点「编辑」直接改文字，或点「AI 重写」让它重新写这一帧。
      </p>

      <FrameBlock
        name="hook"
        label={FRAME_LABELS.hook}
        ui={ui}
        busy={busy}
        editing={editingFrame === "hook"}
        onEdit={() => onEditFrame("hook")}
        onCancel={onCancelEdit}
        onRegenerate={onRegenerate}
        editor={<HookEditor data={script.hook} onSubmit={(p) => onPatchFrame("hook", p)} ui={ui} />}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {script.hook.lines.map((l, i) => (
            <span
              key={i}
              style={{
                fontWeight: 700,
                fontSize: 15,
                color: l === script.hook.highlight ? "#e8b84b" : ui.text,
              }}
            >
              {l === script.hook.highlight ? `★ ${l}` : l}
            </span>
          ))}
        </div>
      </FrameBlock>

      <FrameBlock
        name="quote"
        label={FRAME_LABELS.quote}
        ui={ui}
        busy={busy}
        editing={editingFrame === "quote"}
        onEdit={() => onEditFrame("quote")}
        onCancel={onCancelEdit}
        onRegenerate={onRegenerate}
        editor={<QuoteEditor data={script.quote} onSubmit={(p) => onPatchFrame("quote", p)} ui={ui} />}
      >
        <span style={{ fontStyle: "italic" }}>「{script.quote.text}」</span>
        <div style={{ marginTop: 4, fontSize: 11, color: ui.sub }}>
          {script.quote.chapter ? `${script.quote.chapter} · ` : ""}
          进度 {script.quote.progress}%
        </div>
      </FrameBlock>

      <FrameBlock
        name="breakdown"
        label={FRAME_LABELS.breakdown}
        ui={ui}
        busy={busy}
        editing={editingFrame === "breakdown"}
        onEdit={() => onEditFrame("breakdown")}
        onCancel={onCancelEdit}
        onRegenerate={onRegenerate}
        editor={
          <BreakdownEditor
            data={script.breakdown}
            onSubmit={(p) => onPatchFrame("breakdown", p)}
            ui={ui}
          />
        }
      >
        <div style={{ fontSize: 11, color: ui.sub, marginBottom: 4 }}>{script.breakdown.kicker}</div>
        {script.breakdown.points.map((p, i) => (
          <div key={i} style={{ marginBottom: 6 }}>
            <span style={{ fontWeight: 600 }}>
              {i + 1}. {p.text}
            </span>
            {p.evidence ? (
              <div style={{ color: ui.sub, fontSize: 12, marginTop: 2 }}>原文「{p.evidence}」</div>
            ) : null}
          </div>
        ))}
      </FrameBlock>

      <FrameBlock
        name="my_take"
        label={FRAME_LABELS.my_take}
        ui={ui}
        busy={busy}
        editing={editingFrame === "my_take"}
        onEdit={() => onEditFrame("my_take")}
        onCancel={onCancelEdit}
        onRegenerate={onRegenerate}
        editor={<MyTakeEditor data={script.my_take} onSubmit={(p) => onPatchFrame("my_take", p)} ui={ui} />}
      >
        <div style={{ fontSize: 11, color: ui.sub, marginBottom: 4 }}>{script.my_take.kicker}</div>
        <span>{script.my_take.text}</span>
      </FrameBlock>

      <FrameBlock
        name="outro"
        label={FRAME_LABELS.outro}
        ui={ui}
        busy={busy}
        editing={editingFrame === "outro"}
        onEdit={() => onEditFrame("outro")}
        onCancel={onCancelEdit}
        onRegenerate={onRegenerate}
        editor={<OutroEditor data={script.outro} onSubmit={(p) => onPatchFrame("outro", p)} ui={ui} />}
      >
        <span style={{ fontWeight: 600 }}>{script.outro.question}</span>
        <div style={{ marginTop: 4, fontSize: 11, color: ui.sub }}>
          {script.outro.footer_lines.join(" · ")}
        </div>
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
    width: "100%",
    boxSizing: "border-box",
    padding: "7px 10px",
    fontSize: 13.5,
    borderRadius: 6,
    border: "1px solid #ddd",
    background: "#fff",
    color: ui.text,
    fontFamily: "inherit",
    outline: "none",
  };

  return (
    <div>
      {Object.entries(edited).map(([platform, v]) => (
        <div
          key={platform}
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            background: "#fff",
            borderRadius: 8,
            border: "1px solid #ececec",
          }}
        >
          <h3 style={{ fontSize: 12, margin: "0 0 8px", color: "#888", fontWeight: 700 }}>{platform}</h3>
          <div style={{ ...fieldLabel, marginBottom: 4 }}>
            <span>标题</span>
          </div>
          <input
            value={v.title}
            onChange={(e) => setEdited({ ...edited, [platform]: { ...v, title: e.target.value } })}
            style={{ ...inputStyle, marginBottom: 8, fontWeight: 600 }}
          />
          <div style={{ ...fieldLabel, marginBottom: 4 }}>
            <span>正文</span>
          </div>
          <textarea
            value={v.body}
            onChange={(e) => setEdited({ ...edited, [platform]: { ...v, body: e.target.value } })}
            rows={4}
            style={{ ...inputStyle, marginBottom: 8, resize: "vertical" }}
          />
          <div style={{ ...fieldLabel, marginBottom: 4 }}>
            <span>标签（空格分隔）</span>
          </div>
          <input
            value={v.tags.join(" ")}
            onChange={(e) =>
              setEdited({
                ...edited,
                [platform]: {
                  ...v,
                  tags: e.target.value.split(/\s+/).map((t) => t.replace(/^#/, "")).filter(Boolean),
                },
              })
            }
            style={{ ...inputStyle, fontSize: 12, color: ui.sub }}
          />
        </div>
      ))}
      <button
        onClick={async () => {
          setSaving(true);
          try {
            setJob(await patchCopy(jobId, edited));
          } catch (e) {
            alert(String(e));
          } finally {
            setSaving(false);
          }
        }}
        disabled={saving || busy}
        style={{
          padding: "7px 18px",
          border: "none",
          borderRadius: 6,
          background: ui.accent,
          color: ui.accentText,
          fontSize: 12.5,
          fontWeight: 600,
          cursor: saving ? "default" : "pointer",
          fontFamily: "inherit",
        }}
      >
        {saving ? "保存中…" : "保存文案"}
      </button>
    </div>
  );
}

/** 单帧的展示块：内容 / 编辑表单 二选一显示，配 AI 重写反馈框。 */
function FrameBlock({
  name,
  label,
  children,
  editor,
  ui,
  busy,
  editing,
  onEdit,
  onCancel,
  onRegenerate,
}: {
  name: FrameName;
  label: string;
  children: React.ReactNode;
  editor: React.ReactNode;
  ui: JobPanelPalette;
  busy: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onRegenerate: (frame: FrameName, feedback?: string) => void;
}) {
  const [showRewrite, setShowRewrite] = useState(false);
  const [feedback, setFeedback] = useState("");

  const btnStyle: React.CSSProperties = {
    border: "1px solid #ddd",
    background: "#fff",
    color: "#555",
    padding: "3px 10px",
    borderRadius: 5,
    fontSize: 11.5,
    cursor: busy ? "default" : "pointer",
    fontFamily: "inherit",
  };
  const primaryBtnStyle: React.CSSProperties = {
    ...btnStyle,
    background: "#0f2a24",
    color: "#fff",
    border: "none",
  };

  return (
    <div
      style={{
        marginTop: 8,
        borderRadius: 8,
        background: "#fff",
        border: `1px solid ${editing ? "#0f2a24" : "#ececec"}`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 12px",
          background: "#faf9f7",
          borderBottom: "1px solid #ececec",
        }}
      >
        <span style={{ fontSize: 11.5, color: "#888", fontWeight: 700, letterSpacing: 0.5 }}>
          {label}
        </span>
        {!editing ? (
          <div style={{ display: "flex", gap: 6 }}>
            <button disabled={busy} style={btnStyle} onClick={onEdit}>
              ✎ 编辑
            </button>
            <button
              disabled={busy}
              style={btnStyle}
              onClick={() => setShowRewrite(!showRewrite)}
            >
              ✨ AI 重写
            </button>
          </div>
        ) : null}
      </div>

      <div style={{ padding: "12px 14px" }}>
        {editing ? (
          <div>{editor}</div>
        ) : (
          <>
            <div style={{ lineHeight: 1.7 }}>{children}</div>
            {showRewrite ? (
              <div
                style={{
                  marginTop: 10,
                  paddingTop: 10,
                  borderTop: "1px dashed #e0dedb",
                  display: "flex",
                  gap: 6,
                }}
              >
                <input
                  autoFocus
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="给 AI 的要求（可留空，直接重写）"
                  style={{
                    flex: 1,
                    fontSize: 12,
                    padding: "5px 8px",
                    border: "1px solid #ddd",
                    borderRadius: 5,
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      onRegenerate(name, feedback.trim() || undefined);
                      setShowRewrite(false);
                      setFeedback("");
                    }
                  }}
                />
                <button
                  disabled={busy}
                  style={primaryBtnStyle}
                  onClick={() => {
                    onRegenerate(name, feedback.trim() || undefined);
                    setShowRewrite(false);
                    setFeedback("");
                  }}
                >
                  {busy ? "生成中…" : "确认重写"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      {editing ? (
        <div
          style={{
            padding: "8px 14px",
            background: "#faf9f7",
            borderTop: "1px solid #ececec",
          }}
        >
          <button style={btnStyle} onClick={onCancel}>
            取消
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ============================================================
// 各帧专属编辑表单
// ============================================================

/** 字数计数标签，超限变红。 */
function CountLabel({ text, max, ui }: { text: string; max: number; ui: JobPanelPalette }) {
  const over = text.length > max;
  return (
    <span style={{ fontSize: 11, color: over ? "#e85b4f" : ui.sub }}>
      {text.length}/{max}
    </span>
  );
}

const fieldLabel: React.CSSProperties = {
  fontSize: 11,
  color: "#999",
  fontWeight: 600,
  display: "flex",
  justifyContent: "space-between",
  marginBottom: 4,
};

const textInput: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "7px 10px",
  fontSize: 13.5,
  borderRadius: 6,
  border: "1px solid #ddd",
  fontFamily: "inherit",
  outline: "none",
};

/** 保存/取消区的保存按钮，统一样式。 */
function SaveButton({ onClick, ui }: { onClick: () => void; ui: JobPanelPalette }) {
  return (
    <button
      onClick={onClick}
      style={{
        marginTop: 4,
        padding: "6px 16px",
        border: "none",
        borderRadius: 6,
        background: ui.accent,
        color: ui.accentText,
        fontSize: 12.5,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      保存修改
    </button>
  );
}

function HookEditor({
  data,
  onSubmit,
  ui,
}: {
  data: { lines: string[]; highlight: string | null };
  onSubmit: (patch: Record<string, unknown>) => void;
  ui: JobPanelPalette;
}) {
  const [lines, setLines] = useState<string[]>(data.lines.length ? data.lines : [""]);
  const [highlightIdx, setHighlightIdx] = useState(
    data.highlight ? data.lines.indexOf(data.highlight) : -1,
  );

  return (
    <div>
      <div style={fieldLabel}>
        <span>钩子文字（最多 2 行，压屏大字）</span>
      </div>
      {lines.map((line, i) => (
        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
          <button
            onClick={() => setHighlightIdx(highlightIdx === i ? -1 : i)}
            title="设为高亮行"
            style={{
              width: 26,
              height: 26,
              flexShrink: 0,
              borderRadius: 5,
              border: `1px solid ${highlightIdx === i ? "#e8b84b" : "#ddd"}`,
              background: highlightIdx === i ? "#e8b84b" : "#fff",
              color: highlightIdx === i ? "#fff" : "#ccc",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            ★
          </button>
          <input
            value={line}
            onChange={(e) => {
              const next = [...lines];
              next[i] = e.target.value;
              setLines(next);
            }}
            style={{ ...textInput, flex: 1 }}
          />
          {lines.length > 1 ? (
            <button
              onClick={() => {
                setLines(lines.filter((_, j) => j !== i));
                if (highlightIdx === i) setHighlightIdx(-1);
              }}
              style={{ border: "none", background: "transparent", color: "#bbb", cursor: "pointer", fontSize: 14 }}
            >
              ✕
            </button>
          ) : null}
        </div>
      ))}
      {lines.length < 2 ? (
        <button
          onClick={() => setLines([...lines, ""])}
          style={{ fontSize: 11.5, color: ui.sub, background: "transparent", border: "1px dashed #ddd", borderRadius: 5, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit" }}
        >
          + 加一行
        </button>
      ) : null}
      <p style={{ fontSize: 11, color: "#bbb", marginTop: 8 }}>点 ★ 标记要强调的那一行（会变琥珀色）</p>
      <SaveButton
        ui={ui}
        onClick={() =>
          onSubmit({
            lines: lines.filter((l) => l.trim()),
            highlight: highlightIdx >= 0 ? lines[highlightIdx] : null,
          })
        }
      />
    </div>
  );
}

function QuoteEditor({
  data,
  onSubmit,
  ui,
}: {
  data: { text: string; chapter: string | null };
  onSubmit: (patch: Record<string, unknown>) => void;
  ui: JobPanelPalette;
}) {
  const [text, setText] = useState(data.text);
  const [chapter, setChapter] = useState(data.chapter ?? "");

  return (
    <div>
      <div style={fieldLabel}>
        <span>原文金句</span>
        <CountLabel text={text} max={120} ui={ui} />
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        style={{ ...textInput, resize: "vertical", marginBottom: 10 }}
      />
      <div style={fieldLabel}>
        <span>章节（可选）</span>
      </div>
      <input value={chapter} onChange={(e) => setChapter(e.target.value)} style={{ ...textInput, marginBottom: 10 }} />
      <SaveButton ui={ui} onClick={() => onSubmit({ text, chapter: chapter || null })} />
    </div>
  );
}

function BreakdownEditor({
  data,
  onSubmit,
  ui,
}: {
  data: { kicker: string; points: { text: string; evidence: string | null }[] };
  onSubmit: (patch: Record<string, unknown>) => void;
  ui: JobPanelPalette;
}) {
  const [kicker, setKicker] = useState(data.kicker);
  const [points, setPoints] = useState(data.points.map((p) => ({ ...p })));

  const update = (i: number, field: "text" | "evidence", value: string) => {
    const next = [...points];
    next[i] = { ...next[i], [field]: field === "evidence" && !value ? null : value };
    setPoints(next);
  };

  return (
    <div>
      <div style={fieldLabel}>
        <span>小标题</span>
        <CountLabel text={kicker} max={20} ui={ui} />
      </div>
      <input value={kicker} onChange={(e) => setKicker(e.target.value)} style={{ ...textInput, marginBottom: 12 }} />

      {points.map((p, i) => (
        <div
          key={i}
          style={{
            marginBottom: 10,
            padding: "10px 12px",
            background: "#f8f7f5",
            borderRadius: 6,
            border: "1px solid #ececec",
          }}
        >
          <div style={fieldLabel}>
            <span>要点 {i + 1}</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <CountLabel text={p.text} max={24} ui={ui} />
              {points.length > 2 ? (
                <button
                  onClick={() => setPoints(points.filter((_, j) => j !== i))}
                  style={{ border: "none", background: "transparent", color: "#bbb", cursor: "pointer", fontSize: 13 }}
                >
                  ✕
                </button>
              ) : null}
            </div>
          </div>
          <input
            value={p.text}
            onChange={(e) => update(i, "text", e.target.value)}
            style={{ ...textInput, marginBottom: 6 }}
          />
          <div style={{ ...fieldLabel, marginTop: 4 }}>
            <span>原文依据（找不到就留空，不要编）</span>
            <CountLabel text={p.evidence ?? ""} max={80} ui={ui} />
          </div>
          <input
            value={p.evidence ?? ""}
            onChange={(e) => update(i, "evidence", e.target.value)}
            placeholder="留空 = 无原文依据"
            style={{ ...textInput, fontStyle: p.evidence ? "normal" : "italic" }}
          />
        </div>
      ))}

      {points.length < 3 ? (
        <button
          onClick={() => setPoints([...points, { text: "", evidence: null }])}
          style={{ fontSize: 11.5, color: ui.sub, background: "transparent", border: "1px dashed #ddd", borderRadius: 5, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit", marginBottom: 8 }}
        >
          + 加一条要点（最多 3 条）
        </button>
      ) : null}

      <p style={{ fontSize: 11, color: "#bbb", margin: "4px 0 8px" }}>
        原文依据会校验是否真的出现在划线原文里，不是原文子串的会被自动清空。
      </p>
      <SaveButton
        ui={ui}
        onClick={() =>
          onSubmit({
            kicker,
            points: points.filter((p) => p.text.trim()),
          })
        }
      />
    </div>
  );
}

function MyTakeEditor({
  data,
  onSubmit,
  ui,
}: {
  data: { kicker: string; text: string };
  onSubmit: (patch: Record<string, unknown>) => void;
  ui: JobPanelPalette;
}) {
  const [kicker, setKicker] = useState(data.kicker);
  const [text, setText] = useState(data.text);

  return (
    <div>
      <div style={fieldLabel}>
        <span>小标题</span>
        <CountLabel text={kicker} max={20} ui={ui} />
      </div>
      <input value={kicker} onChange={(e) => setKicker(e.target.value)} style={{ ...textInput, marginBottom: 10 }} />
      <div style={fieldLabel}>
        <span>我的想法（屏幕显示的文字）</span>
        <CountLabel text={text} max={200} ui={ui} />
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        style={{ ...textInput, resize: "vertical", marginBottom: 10 }}
      />
      <SaveButton ui={ui} onClick={() => onSubmit({ kicker, text })} />
    </div>
  );
}

function OutroEditor({
  data,
  onSubmit,
  ui,
}: {
  data: { question: string; footer_lines: string[] };
  onSubmit: (patch: Record<string, unknown>) => void;
  ui: JobPanelPalette;
}) {
  const [question, setQuestion] = useState(data.question);
  const [lines, setLines] = useState(data.footer_lines.length ? data.footer_lines : [""]);

  return (
    <div>
      <div style={fieldLabel}>
        <span>抛给观众的问题</span>
        <CountLabel text={question} max={40} ui={ui} />
      </div>
      <input value={question} onChange={(e) => setQuestion(e.target.value)} style={{ ...textInput, marginBottom: 12 }} />

      <div style={fieldLabel}>
        <span>落款（最多 3 行）</span>
      </div>
      {lines.map((line, i) => (
        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <input
            value={line}
            onChange={(e) => {
              const next = [...lines];
              next[i] = e.target.value;
              setLines(next);
            }}
            style={{ ...textInput, flex: 1 }}
          />
          {lines.length > 1 ? (
            <button
              onClick={() => setLines(lines.filter((_, j) => j !== i))}
              style={{ border: "none", background: "transparent", color: "#bbb", cursor: "pointer", fontSize: 14 }}
            >
              ✕
            </button>
          ) : null}
        </div>
      ))}
      {lines.length < 3 ? (
        <button
          onClick={() => setLines([...lines, ""])}
          style={{ fontSize: 11.5, color: ui.sub, background: "transparent", border: "1px dashed #ddd", borderRadius: 5, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit", marginBottom: 8 }}
        >
          + 加一行
        </button>
      ) : null}
      <div>
        <SaveButton
          ui={ui}
          onClick={() =>
            onSubmit({ question, footer_lines: lines.filter((l) => l.trim()) })
          }
        />
      </div>
    </div>
  );
}
