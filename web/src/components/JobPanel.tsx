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

type Stage = "material" | "script" | "audio" | "video" | "copy";
const STAGES: { key: Stage; label: string }[] = [
  { key: "material", label: "素材" },
  { key: "script", label: "脚本" },
  { key: "audio", label: "配音" },
  { key: "video", label: "视频" },
  { key: "copy", label: "文案" },
];

type StepStatus = "done" | "active" | "pending_review" | "waiting" | "failed";

function stepStatus(jobStatus: JobStatus, stage: Stage): StepStatus {
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

  if (stage === "material") return cur >= 1 ? "done" : "waiting";
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

const STEP_COLOR: Record<StepStatus, string> = {
  done: "#4fd1a5",
  active: "#5b9cf5",
  pending_review: "#e8b84b",
  waiting: "#bbb",
  failed: "#e85b4f",
};

/** 当前该看哪个环节：待审环节优先，否则跟着进行中的环节走。 */
function defaultTab(status: JobStatus): Stage {
  if (status === "script_pending" || status === "scripting" || status === "pending") return "script";
  if (status === "tts" || status === "tts_pending") return "audio";
  if (status === "render_pending" || status === "rendering") return "video";
  if (status === "copywriting" || status === "copy_pending" || status === "done") return "copy";
  return "script";
}

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
  const [tab, setTab] = useState<Stage>(defaultTab(job.status));

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

  return (
    <section style={{ color: c.text }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <p style={{ fontSize: 14, margin: 0 }}>
          任务 #{job.id} · <b>{STATUS_LABEL[job.status]}</b>
        </p>
        <p style={{ fontSize: 12, margin: 0, color: c.sub }}>
          {job.cost_tokens ? `${job.cost_tokens} tokens` : ""}
          {job.video_version ? `　v${job.video_version}` : ""}
        </p>
      </div>

      {job.status === "failed" ? (
        <pre
          style={{
            background: c.errorBg,
            color: c.errorText,
            padding: 12,
            borderRadius: 8,
            fontSize: 12,
            whiteSpace: "pre-wrap",
            marginBottom: 14,
          }}
        >
          {job.error}
        </pre>
      ) : null}

      {/* 横向标签：五个环节并排，充分利用宽度 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${STAGES.length}, 1fr)`,
          gap: 6,
          marginBottom: 16,
        }}
      >
        {STAGES.map(({ key, label }) => {
          const ss = stepStatus(job.status, key);
          const color = STEP_COLOR[ss];
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                padding: "10px 6px",
                borderRadius: 8,
                border: `1.5px solid ${active ? c.accent : "#e8e6e3"}`,
                background: active ? "#fff" : "#faf9f7",
                cursor: "pointer",
                fontFamily: "inherit",
                position: "relative",
                transition: "all 0.15s",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: color,
                }}
              />
              <span style={{ fontSize: 12.5, fontWeight: active ? 700 : 500, color: active ? c.text : c.sub }}>
                {label}
              </span>
              {ss === "pending_review" ? (
                <span
                  style={{
                    position: "absolute",
                    top: -6,
                    right: -4,
                    fontSize: 9,
                    color: "#fff",
                    background: color,
                    padding: "1px 5px",
                    borderRadius: 6,
                    fontWeight: 700,
                  }}
                >
                  待审
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* 内容区 */}
      <div
        style={{
          borderRadius: 10,
          background: "#f8f7f5",
          border: "1px solid #ececec",
          padding: "16px 18px",
          minHeight: 120,
        }}
      >
        {tab === "material" ? <MaterialStep ui={c} /> : null}

        {tab === "script" ? (
          job.script ? (
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
            <EmptyHint text="脚本还没生成" />
          )
        ) : null}

        {tab === "audio" ? <AudioStep jobId={job.id} ui={c} /> : null}

        {tab === "video" ? (
          <>
            <VideoStep job={job} ui={c} />
            {job.script && job.status === "render_pending" ? (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed #ddd" }}>
                <p style={{ fontSize: 12, color: c.sub, marginBottom: 10 }}>
                  看完视频想改内容？直接改下面对应的帧：
                </p>
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
              </div>
            ) : null}
          </>
        ) : null}

        {tab === "copy" ? (
          job.copies ? (
            <CopyStep jobId={job.id} copies={job.copies} ui={c} busy={busy} setJob={setJob} />
          ) : (
            <EmptyHint text="文案还没生成" />
          )
        ) : null}
      </div>

      {canResume ? (
        <button
          onClick={onResume}
          style={{
            display: "block",
            width: "100%",
            padding: "11px",
            marginTop: 14,
            background: c.accent,
            color: c.accentText,
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          确认，继续 ▶
        </button>
      ) : null}
    </section>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p style={{ color: "#999", fontSize: 13, textAlign: "center", padding: "20px 0" }}>{text}</p>;
}

// ============================================================
// 各环节内容
// ============================================================

function MaterialStep({ ui }: { ui: JobPanelPalette }) {
  return (
    <p style={{ fontSize: 12, color: ui.sub, lineHeight: 1.6, margin: 0 }}>
      素材内容在页面上方卡片里编辑。改完保存后任务会自动退回「AI 写脚本」重跑，
      旧视频会保留为历史版本。
    </p>
  );
}

/** 脚本五帧：网格排列，拆解帧内容较多单独占一行。 */
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
      <p style={{ margin: "0 0 12px", fontSize: 11, color: ui.sub }}>
        点「编辑」直接改文字，或点「AI 重写」让它重新写这一帧。
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 12,
        }}
      >
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

        {/* 拆解内容较多（小标题+2-3条要点+依据），单独占满一行 */}
        <div style={{ gridColumn: "1 / -1" }}>
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
            <div style={{ fontSize: 11, color: ui.sub, marginBottom: 6 }}>{script.breakdown.kicker}</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 10,
              }}
            >
              {script.breakdown.points.map((pt, i) => (
                <div key={i}>
                  <span style={{ fontWeight: 600 }}>
                    {i + 1}. {pt.text}
                  </span>
                  {pt.evidence ? (
                    <div style={{ color: ui.sub, fontSize: 12, marginTop: 2 }}>原文「{pt.evidence}」</div>
                  ) : null}
                </div>
              ))}
            </div>
          </FrameBlock>
        </div>
      </div>
    </div>
  );
}

function AudioStep({ jobId, ui }: { jobId: number; ui: JobPanelPalette }) {
  const frames: FrameName[] = ["hook", "quote", "breakdown", "my_take", "outro"];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 12,
      }}
    >
      {frames.map((f) => (
        <div
          key={f}
          style={{
            padding: "10px 12px",
            background: "#fff",
            borderRadius: 8,
            border: "1px solid #ececec",
          }}
        >
          <div style={{ fontSize: 11.5, color: ui.sub, fontWeight: 700, marginBottom: 6 }}>
            {FRAME_LABELS[f]}
          </div>
          <audio src={audioUrl(jobId, f)} controls style={{ width: "100%", height: 32 }} />
        </div>
      ))}
    </div>
  );
}

function VideoStep({ job, ui }: { job: JobOut; ui: JobPanelPalette }) {
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);

  if (!job.video_version) {
    return <EmptyHint text="视频还没渲染" />;
  }

  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
      <video
        src={videoUrl(job.id, job.video_version)}
        controls
        style={{ width: 220, borderRadius: 10, flexShrink: 0, background: "#000" }}
      />
      <div style={{ flex: 1, minWidth: 200, fontSize: 13 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <a
            href={videoUrl(job.id)}
            download
            style={{
              padding: "7px 16px",
              background: ui.accent,
              color: ui.accentText,
              borderRadius: 6,
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            下载 MP4
          </a>
          {job.video_version > 1 ? (
            <button
              onClick={async () => {
                if (history) {
                  setHistory(null);
                  return;
                }
                try {
                  setHistory(await listHistory(job.id));
                } catch {
                  /* ignore */
                }
              }}
              style={{
                padding: "7px 12px",
                background: "#fff",
                color: ui.sub,
                border: "1px solid #ddd",
                borderRadius: 6,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {history ? "收起历史" : `历史版本 (${job.video_version})`}
            </button>
          ) : null}
        </div>

        {job.cover_ratios.length > 0 ? (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: ui.sub, marginBottom: 6 }}>封面</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {job.cover_ratios.map((r) => (
                <a
                  key={r}
                  href={`/api/jobs/${job.id}/cover/${r}`}
                  download
                  style={{
                    padding: "5px 10px",
                    background: "#fff",
                    color: ui.sub,
                    borderRadius: 5,
                    textDecoration: "none",
                    fontSize: 11.5,
                    border: "1px solid #ececec",
                  }}
                >
                  {r}
                </a>
              ))}
            </div>
          </div>
        ) : null}

        {history ? (
          <div>
            <div style={{ fontSize: 11, color: ui.sub, marginBottom: 6 }}>历史版本</div>
            {history.map((h) => (
              <a
                key={h.version}
                href={videoUrl(job.id, h.version)}
                download
                style={{
                  display: "block",
                  padding: "6px 10px",
                  marginBottom: 4,
                  background: "#fff",
                  border: "1px solid #ececec",
                  borderRadius: 5,
                  textDecoration: "none",
                  color: ui.text,
                  fontSize: 12,
                }}
              >
                v{h.version} · {Math.round(h.size_bytes / 1024)}KB ·{" "}
                {new Date(h.created_at).toLocaleString("zh-CN", {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </a>
            ))}
          </div>
        ) : null}
      </div>
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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
          marginBottom: 14,
        }}
      >
        {Object.entries(edited).map(([platform, v]) => (
          <div
            key={platform}
            style={{
              padding: "12px 14px",
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
              rows={5}
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
      </div>
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
          padding: "8px 20px",
          border: "none",
          borderRadius: 6,
          background: ui.accent,
          color: ui.accentText,
          fontSize: 13,
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
        height: "100%",
        borderRadius: 8,
        background: "#fff",
        border: `1px solid ${editing ? "#0f2a24" : "#ececec"}`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
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
            <button disabled={busy} style={btnStyle} onClick={() => setShowRewrite(!showRewrite)}>
              ✨ AI 重写
            </button>
          </div>
        ) : null}
      </div>

      <div style={{ padding: "12px 14px", flex: 1 }}>
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
                  placeholder="给 AI 的要求（可留空）"
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
                  {busy ? "生成中…" : "确认"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      {editing ? (
        <div style={{ padding: "8px 14px", background: "#faf9f7", borderTop: "1px solid #ececec" }}>
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 10,
          marginBottom: 10,
        }}
      >
        {points.map((p, i) => (
          <div
            key={i}
            style={{
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
      </div>

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
          onClick={() => onSubmit({ question, footer_lines: lines.filter((l) => l.trim()) })}
        />
      </div>
    </div>
  );
}
