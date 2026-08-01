import type { JobOut, JobStatus } from "../api";

export const STATUS_LABEL: Record<JobStatus, string> = {
  pending: "排队中",
  scripting: "AI 写脚本",
  tts: "配音与字幕",
  rendering: "渲染视频",
  done: "完成",
  failed: "失败",
};

/** 任务进度与结果展示。书架页和粘贴页共用。 */
export function JobPanel({ job }: { job: JobOut }) {
  return (
    <section style={{ marginTop: 24, borderTop: "1px solid #eee", paddingTop: 18 }}>
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
            <a
              href={`/api/jobs/${job.id}/video`}
              download
              style={{
                display: "inline-block",
                padding: "9px 16px",
                background: "#0f2a24",
                color: "#fff",
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
                  <p style={{ margin: "4px 0", color: "#666", fontSize: 13 }}>
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
