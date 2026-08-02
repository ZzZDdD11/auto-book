import { useState } from "react";
import {
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

/**
 * 可选的调色板，让阅读器夜间模式能把任务面板一起变暗。
 * 不传则用默认浅色，书架页 / 粘贴页不受影响。
 */
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

/** 任务进度与结果展示。书架页和粘贴页共用。 */
export function JobPanel({
  job,
  ui,
  setJob,
}: {
  job: JobOut;
  ui?: JobPanelPalette;
  setJob: (j: JobOut | null) => void;
}) {
  const c = ui ?? DEFAULT_PALETTE;
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingFrame, setEditingFrame] = useState<FrameName | null>(null);

  const isPending = job.status.endsWith("_pending");
  const canResume = isPending && !busy;

  const onPatchFrame = async (frame: FrameName, patch: Record<string, unknown>) => {
    setBusy(true);
    try {
      const updated = await patchScriptFrame(job.id, frame, patch);
      setJob(updated);
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
      const updated = await regenerateFrame(job.id, frame, feedback);
      setJob(updated);
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
      const updated = await resumeJob(job.id);
      setJob(updated);
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onShowHistory = async () => {
    if (history) {
      setHistory(null);
      return;
    }
    try {
      setHistory(await listHistory(job.id));
    } catch {
      /* ignore */
    }
  };

  return (
    <section
      style={{
        marginTop: 24,
        borderTop: `1px solid ${c.border}`,
        paddingTop: 18,
        color: c.text,
      }}
    >
      <p style={{ fontSize: 15 }}>
        任务 #{job.id} · <b>{STATUS_LABEL[job.status]}</b>
        {job.cost_tokens ? `　消耗 ${job.cost_tokens} tokens` : ""}
        {job.video_version ? `　v${job.video_version}` : ""}
      </p>

      {job.status === "failed" ? (
        <pre
          style={{
            background: c.errorBg,
            color: c.errorText,
            padding: 14,
            borderRadius: 8,
            fontSize: 13,
            whiteSpace: "pre-wrap",
          }}
        >
          {job.error}
        </pre>
      ) : null}

      {/* 待审状态：显示脚本内容 + 编辑/重写/继续 */}
      {isPending && job.script && job.status === "script_pending" ? (
        <ReviewPanel
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

      {/* render_pending：视频已渲完，先看再决定改不改 */}
      {job.status === "render_pending" && job.video_version ? (
        <div style={{ marginTop: 14 }}>
          <video
            src={videoUrl(job.id, job.video_version)}
            controls
            style={{
              width: "100%",
              maxWidth: 320,
              borderRadius: 8,
              display: "block",
              margin: "0 auto",
            }}
          />
          {job.script ? (
            <ReviewPanel
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
        </div>
      ) : null}

      {/* copy_pending：文案已生成，可看可改 */}
      {job.status === "copy_pending" && job.copies ? (
        <CopyReviewPanel
          jobId={job.id}
          copies={job.copies}
          ui={c}
          busy={busy}
          setJob={setJob}
        />
      ) : null}

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

      {job.status === "done" ? (
        <>
          <p>
            <a
              href={videoUrl(job.id)}
              download
              style={{
                display: "inline-block",
                padding: "9px 16px",
                background: c.accent,
                color: c.accentText,
                borderRadius: 7,
                textDecoration: "none",
                fontSize: 14,
              }}
            >
              下载 MP4{job.video_version ? ` (v${job.video_version})` : ""}
            </a>
            {job.video_version && job.video_version > 1 ? (
              <button
                onClick={onShowHistory}
                style={{
                  marginLeft: 10,
                  padding: "9px 12px",
                  background: "transparent",
                  color: c.sub,
                  border: `1px solid ${c.border}`,
                  borderRadius: 7,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {history ? "收起历史" : `历史版本 (${job.video_version})`}
              </button>
            ) : null}
          </p>

          {history ? (
            <div style={{ marginTop: 10 }}>
              {history.map((h) => (
                <a
                  key={h.version}
                  href={videoUrl(job.id, h.version)}
                  download
                  style={{
                    display: "block",
                    padding: "6px 10px",
                    marginBottom: 4,
                    background: c.panelAlt,
                    borderRadius: 5,
                    textDecoration: "none",
                    color: c.text,
                    fontSize: 13,
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

          {job.cover_ratios.length > 0 ? (
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {job.cover_ratios.map((r) => (
                <a
                  key={r}
                  href={`/api/jobs/${job.id}/cover/${r}`}
                  download
                  style={{
                    padding: "6px 10px",
                    background: c.panelAlt,
                    color: c.sub,
                    borderRadius: 5,
                    textDecoration: "none",
                    fontSize: 12,
                  }}
                >
                  封面 {r}
                </a>
              ))}
            </div>
          ) : null}

          {job.copies
            ? Object.entries(job.copies).map(([platform, v]) => (
                <div key={platform} style={{ marginTop: 18 }}>
                  <h3 style={{ fontSize: 15, marginBottom: 6 }}>{platform}</h3>
                  <p style={{ margin: "4px 0", fontWeight: 600 }}>{v.title}</p>
                  <p style={{ margin: "4px 0", whiteSpace: "pre-wrap", fontSize: 14 }}>
                    {v.body}
                  </p>
                  <p style={{ margin: "4px 0", color: c.sub, fontSize: 13 }}>
                    {v.tags.map((t) => `#${t}`).join(" ")}
                  </p>
                </div>
              ))
            : null}
        </>
      ) : null}
    </section>
  );
}

/** 待审面板：显示脚本各帧内容，可编辑、可 AI 重写。 */
function ReviewPanel({
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
    <div
      style={{
        marginTop: 14,
        padding: 14,
        background: ui.panelAlt,
        borderRadius: 8,
        fontSize: 13,
      }}
    >
      <p style={{ margin: "0 0 10px", fontSize: 12, color: ui.sub }}>
        脚本已生成。点「编辑/重写」改文字或让 AI 重新写这一帧。
      </p>

      <FrameBlock
        name="hook"
        label={FRAME_LABELS.hook}
        ui={ui}
        busy={busy}
        editing={editingFrame === "hook"}
        onEdit={() => onEditFrame("hook")}
        onCancel={onCancelEdit}
        onPatch={onPatchFrame}
        onRegenerate={onRegenerate}
      >
        {script.hook.lines.map((l, i) => (
          <span key={i} style={{ fontWeight: 700 }}>
            {l === script.hook.highlight ? `★ ${l}` : l}
            {i < script.hook.lines.length - 1 ? " / " : ""}
          </span>
        ))}
      </FrameBlock>

      <FrameBlock
        name="quote"
        label={FRAME_LABELS.quote}
        ui={ui}
        busy={busy}
        editing={editingFrame === "quote"}
        onEdit={() => onEditFrame("quote")}
        onCancel={onCancelEdit}
        onPatch={onPatchFrame}
        onRegenerate={onRegenerate}
      >
        <span style={{ fontStyle: "italic" }}>{script.quote.text}</span>
        {script.quote.chapter ? (
          <span style={{ color: ui.sub }}>　{script.quote.chapter}</span>
        ) : null}
      </FrameBlock>

      <FrameBlock
        name="breakdown"
        label={FRAME_LABELS.breakdown}
        ui={ui}
        busy={busy}
        editing={editingFrame === "breakdown"}
        onEdit={() => onEditFrame("breakdown")}
        onCancel={onCancelEdit}
        onPatch={onPatchFrame}
        onRegenerate={onRegenerate}
      >
        {script.breakdown.points.map((p, i) => (
          <div key={i} style={{ marginBottom: 6 }}>
            <span style={{ fontWeight: 600 }}>{i + 1}. {p.text}</span>
            {p.evidence ? (
              <span style={{ color: ui.sub }}>　原文「{p.evidence}」</span>
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
        onPatch={onPatchFrame}
        onRegenerate={onRegenerate}
      >
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
        onPatch={onPatchFrame}
        onRegenerate={onRegenerate}
      >
        <span>{script.outro.question}</span>
      </FrameBlock>
    </div>
  );
}

/** 单帧的展示块：内容 + 编辑/重写按钮。 */
function FrameBlock({
  name,
  label,
  children,
  ui,
  busy,
  editing,
  onEdit,
  onCancel,
  onPatch,
  onRegenerate,
}: {
  name: FrameName;
  label: string;
  children: React.ReactNode;
  ui: JobPanelPalette;
  busy: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onPatch: (frame: FrameName, patch: Record<string, unknown>) => void;
  onRegenerate: (frame: FrameName, feedback?: string) => void;
}) {
  const [feedback, setFeedback] = useState("");

  const btnStyle: React.CSSProperties = {
    border: `1px solid ${ui.border}`,
    background: "transparent",
    color: ui.sub,
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 11,
    cursor: busy ? "default" : "pointer",
  };

  return (
    <div
      style={{
        marginTop: 12,
        paddingBottom: 12,
        borderBottom: `1px solid ${ui.border}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 11, color: ui.sub, fontWeight: 600 }}>{label}</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {editing ? (
            <>
              <input
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="重写要求（可选）"
                style={{
                  width: 120,
                  fontSize: 11,
                  padding: "2px 6px",
                  border: `1px solid ${ui.border}`,
                  borderRadius: 4,
                  background: "transparent",
                  color: ui.text,
                }}
              />
              <button
                disabled={busy}
                style={btnStyle}
                onClick={() => onRegenerate(name, feedback.trim() || undefined)}
              >
                {busy ? "…" : "AI 重写"}
              </button>
              <button style={btnStyle} onClick={onCancel}>
                取消
              </button>
            </>
          ) : (
            <button disabled={busy} style={btnStyle} onClick={onEdit}>
              编辑/重写
            </button>
          )}
        </div>
      </div>
      <div style={{ lineHeight: 1.6 }}>
        {editing ? (
          <FrameEditor name={name} onPatch={onPatch} />
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/** 单帧的文本编辑器。用 JSON patch —— 简单粗暴但覆盖所有帧类型。 */
function FrameEditor({
  name,
  onPatch,
}: {
  name: FrameName;
  onPatch: (frame: FrameName, patch: Record<string, unknown>) => void;
}) {
  const [text, setText] = useState("");

  const placeholders: Record<FrameName, string> = {
    hook: '{"lines": ["第一行", "第二行"], "highlight": "第一行"}',
    quote: '{"text": "原文金句", "chapter": "章节"}',
    breakdown: '{"points": [{"text": "结论", "evidence": "原文片段或null"}]}',
    my_take: '{"text": "你的观点", "narration": "念出来的话"}',
    outro: '{"question": "抛给观众的问题"}',
  };

  return (
    <div>
      <textarea
        autoFocus
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholders[name]}
        style={{
          width: "100%",
          boxSizing: "border-box",
          fontSize: 12,
          fontFamily: "monospace",
          padding: "6px",
          borderRadius: 4,
          border: "1px solid #ccc",
          resize: "vertical",
        }}
      />
      <button
        onClick={() => {
          try {
            const patch = JSON.parse(text);
            onPatch(name, patch);
          } catch {
            alert("JSON 格式错误");
          }
        }}
        style={{
          marginTop: 4,
          padding: "4px 10px",
          fontSize: 12,
          border: "none",
          background: "#0f2a24",
          color: "#fff",
          borderRadius: 4,
          cursor: "pointer",
        }}
      >
        提交修改
      </button>
    </div>
  );
}

/** 文案审改面板：三平台文案，每条可编辑标题/正文/标签。 */
function CopyReviewPanel({
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

  const platforms = Object.keys(edited);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "6px 8px",
    fontSize: 13,
    borderRadius: 5,
    border: `1px solid ${ui.border}`,
    background: "transparent",
    color: ui.text,
    fontFamily: "inherit",
    outline: "none",
  };

  return (
    <div
      style={{
        marginTop: 14,
        padding: 14,
        background: ui.panelAlt,
        borderRadius: 8,
      }}
    >
      <p style={{ margin: "0 0 12px", fontSize: 12, color: ui.sub }}>
        文案已生成。改完点「保存文案」，然后点「确认，继续」完成。
      </p>
      {platforms.map((platform) => {
        const v = edited[platform];
        return (
          <div key={platform} style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>{platform}</h3>
            <input
              value={v.title}
              onChange={(e) =>
                setEdited({ ...edited, [platform]: { ...v, title: e.target.value } })
              }
              placeholder="标题"
              style={{ ...inputStyle, marginBottom: 6, fontWeight: 600 }}
            />
            <textarea
              value={v.body}
              onChange={(e) =>
                setEdited({ ...edited, [platform]: { ...v, body: e.target.value } })
              }
              rows={4}
              placeholder="正文"
              style={{ ...inputStyle, marginBottom: 6, resize: "vertical" }}
            />
            <input
              value={v.tags.join(" ")}
              onChange={(e) =>
                setEdited({
                  ...edited,
                  [platform]: {
                    ...v,
                    tags: e.target.value
                      .split(/\s+/)
                      .map((t) => t.replace(/^#/, ""))
                      .filter(Boolean),
                  },
                })
              }
              placeholder="#标签 用空格分隔"
              style={{ ...inputStyle, fontSize: 12, color: ui.sub }}
            />
          </div>
        );
      })}
      <button
        onClick={async () => {
          setSaving(true);
          try {
            const updated = await patchCopy(jobId, edited);
            setJob(updated);
          } catch (e) {
            alert(String(e));
          } finally {
            setSaving(false);
          }
        }}
        disabled={saving || busy}
        style={{
          padding: "7px 16px",
          border: "none",
          borderRadius: 6,
          background: ui.accent,
          color: ui.accentText,
          fontSize: 13,
          cursor: saving ? "default" : "pointer",
        }}
      >
        {saving ? "保存中…" : "保存文案"}
      </button>
    </div>
  );
}
