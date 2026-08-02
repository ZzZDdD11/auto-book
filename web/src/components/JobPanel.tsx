import type { JobOut, JobStatus } from "../api";

export const STATUS_LABEL: Record<JobStatus, string> = {
  pending: "排队中",
  scripting: "AI 写脚本",
  tts: "配音与字幕",
  rendering: "渲染视频",
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

/** 任务进度与结果展示。书架页和粘贴页共用。 */
export function JobPanel({ job, ui }: { job: JobOut; ui?: JobPanelPalette }) {
  const c = ui ?? DEFAULT_PALETTE;
  return (
    <section style={{ marginTop: 24, borderTop: `1px solid ${c.border}`, paddingTop: 18, color: c.text }}>
      <p style={{ fontSize: 15 }}>
        任务 #{job.id} · <b>{STATUS_LABEL[job.status]}</b>
        {job.cost_tokens ? `　消耗 ${job.cost_tokens} tokens` : ""}
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

      {job.status === "done" ? (
        <>
          <p>
            <a
              href={`/api/jobs/${job.id}/video`}
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
