import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listAllMaterials, type MaterialWithJob } from "../api";

const JOB_STATUS_ICON: Record<string, string> = {
  done: "✓",
  failed: "✕",
  script_pending: "✎",
  render_pending: "✎",
  copy_pending: "✎",
  scripting: "●",
  tts: "●",
  rendering: "●",
  copywriting: "●",
  pending: "○",
};

const JOB_STATUS_COLOR: Record<string, string> = {
  done: "#4fd1a5",
  failed: "#e85b4f",
  script_pending: "#e8b84b",
  render_pending: "#e8b84b",
  copy_pending: "#e8b84b",
  scripting: "#5b9cf5",
  tts: "#5b9cf5",
  rendering: "#5b9cf5",
  copywriting: "#5b9cf5",
  pending: "#bbb",
};

export function MaterialsPage() {
  const [materials, setMaterials] = useState<MaterialWithJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAllMaterials()
      .then(setMaterials)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 20px 60px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>素材管理中心</h1>
        <Link to="/" style={{ fontSize: 14, color: "#666", textDecoration: "none" }}>
          ← 书架
        </Link>
      </div>

      {error ? <p style={{ color: "#c44" }}>{error}</p> : null}

      {!materials ? (
        <p style={{ color: "#999" }}>加载中…</p>
      ) : materials.length === 0 ? (
        <p style={{ color: "#999" }}>还没有素材。去书架打开一本书，选中文字记下想法。</p>
      ) : (
        materials.map((m) => {
          const icon = m.job_status ? (JOB_STATUS_ICON[m.job_status] ?? "○") : "○";
          const color = m.job_status ? (JOB_STATUS_COLOR[m.job_status] ?? "#bbb") : "#bbb";
          return (
            <div
              key={m.id}
              style={{
                marginBottom: 16,
                padding: "16px 18px",
                borderRadius: 10,
                border: "1px solid #eee",
                background: "#fff",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  {m.book_title ? (
                    <Link
                      to={`/read/${m.book_id}`}
                      style={{ fontSize: 13, color: "#0f2a24", textDecoration: "none", fontWeight: 600 }}
                    >
                      {m.book_title}
                    </Link>
                  ) : null}
                  <span style={{ fontSize: 12, color: "#999", marginLeft: 8 }}>
                    {m.chapter ?? ""} {m.progress !== null ? `· ${m.progress}%` : ""}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: "#999" }}>
                  {new Date(m.created_at).toLocaleDateString("zh-CN")}
                </span>
              </div>

              <p style={{ margin: "0 0 6px", fontSize: 14, lineHeight: 1.6, color: "#333" }}>
                {m.source_text}
              </p>
              {m.my_take ? (
                <p style={{ margin: "0 0 10px", fontSize: 13, lineHeight: 1.6, color: "#0f7050" }}>
                  {m.my_take}
                </p>
              ) : null}

              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
                <Link
                  to={`/material/${m.id}`}
                  style={{
                    fontSize: 12,
                    color: "#fff",
                    textDecoration: "none",
                    background: "#0f2a24",
                    padding: "4px 14px",
                    borderRadius: 5,
                  }}
                >
                  查看 / 编辑
                </Link>
                {m.job_id ? (
                  <>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color }}>
                      <span style={{ fontSize: 14 }}>{icon}</span>
                      任务 #{m.job_id}
                      <span style={{ color: "#999" }}>
                        {m.job_status === "done" ? "完成" : m.job_status?.endsWith("_pending") ? "待审" : "进行中"}
                      </span>
                    </span>
                    <a
                      href={`/api/jobs/${m.job_id}/video`}
                      download
                      style={{ fontSize: 12, color: "#999", textDecoration: "none" }}
                    >
                      下载视频
                    </a>
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: "#ccc" }}>未出过视频</span>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
