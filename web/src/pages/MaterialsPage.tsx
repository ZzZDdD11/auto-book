import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listAllMaterials, type MaterialWithJob } from "../api";

/** 状态点 + 标签，比纯图标更直观 */
function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span style={badge("#ccc", "未出过视频")} />;
  const map: Record<string, { color: string; label: string }> = {
    done: { color: "#10b981", label: "已完成" },
    failed: { color: "#ef4444", label: "失败" },
    script_pending: { color: "#f59e0b", label: "脚本待审" },
    render_pending: { color: "#f59e0b", label: "视频待审" },
    copy_pending: { color: "#f59e0b", label: "文案待审" },
    scripting: { color: "#3b82f6", label: "写脚本中" },
    tts: { color: "#3b82f6", label: "配音中" },
    rendering: { color: "#3b82f6", label: "渲染中" },
    copywriting: { color: "#3b82f6", label: "写文案中" },
    pending: { color: "#9ca3af", label: "排队中" },
  };
  const s = map[status] ?? { color: "#9ca3af", label: status };
  return (
    <span style={badge(s.color, s.label)}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color }} />
      {s.label}
    </span>
  );
}

function badge(color: string, label: string): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    color,
    background: `${color}15`,
    padding: "2px 8px",
    borderRadius: 10,
    fontWeight: 500,
  };
}

export function MaterialsPage() {
  const [materials, setMaterials] = useState<MaterialWithJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "done" | "pending" | "none">("all");

  useEffect(() => {
    listAllMaterials()
      .then(setMaterials)
      .catch((e) => setError(String(e)));
  }, []);

  const filtered = materials?.filter((m) => {
    if (filter === "all") return true;
    if (filter === "done") return m.job_status === "done";
    if (filter === "pending") return m.job_status?.endsWith("_pending") ?? false;
    if (filter === "none") return !m.job_id;
    return true;
  });

  const counts = materials
    ? {
        all: materials.length,
        done: materials.filter((m) => m.job_status === "done").length,
        pending: materials.filter((m) => m.job_status?.endsWith("_pending")).length,
        none: materials.filter((m) => !m.job_id).length,
      }
    : null;

  return (
    <div style={{ minHeight: "100vh", background: "#f8f7f5" }}>
      {/* 顶栏 */}
      <header
        style={{
          background: "#fff",
          borderBottom: "1px solid #ececec",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link to="/" style={{ fontSize: 14, color: "#999", textDecoration: "none" }}>
            ← 书架
          </Link>
          <h1 style={{ fontSize: 18, margin: 0, fontWeight: 700 }}>素材管理</h1>
        </div>
        <Link
          to="/compose"
          style={{
            fontSize: 13,
            color: "#0f2a24",
            textDecoration: "none",
            padding: "6px 14px",
            borderRadius: 6,
            border: "1px solid #ddd",
          }}
        >
          + 手动粘贴
        </Link>
      </header>

      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "24px 24px 60px" }}>
        {/* 筛选 */}
        {counts ? (
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {([
              ["all", `全部 ${counts.all}`],
              ["done", `已完成 ${counts.done}`],
              ["pending", `待审 ${counts.pending}`],
              ["none", `未出视频 ${counts.none}`],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                style={{
                  padding: "5px 14px",
                  borderRadius: 16,
                  border: "none",
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  background: filter === key ? "#0f2a24" : "#e8e6e3",
                  color: filter === key ? "#fff" : "#666",
                  transition: "all 0.15s",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {error ? <p style={{ color: "#c44" }}>{error}</p> : null}

        {!materials ? (
          <p style={{ color: "#999", textAlign: "center", padding: 40 }}>加载中…</p>
        ) : filtered?.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#bbb" }}>
            <p style={{ fontSize: 40, margin: "0 0 12px" }}>📝</p>
            <p style={{ fontSize: 14 }}>还没有素材。去书架打开一本书，选中文字记下想法。</p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
              gap: 14,
            }}
          >
            {filtered?.map((m) => (
              <div
                key={m.id}
                style={{
                  padding: "16px 18px",
                  borderRadius: 12,
                  background: "#fff",
                  border: "1px solid #ececec",
                  transition: "box-shadow 0.15s, border-color 0.15s",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.06)";
                  e.currentTarget.style.borderColor = "#d5d3d0";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.borderColor = "#ececec";
                }}
                onClick={() => (window.location.href = `/material/${m.id}`)}
              >
                {/* 头部：书名 + 状态 */}
                <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span
                    style={{
                      width: 3,
                      height: 16,
                      borderRadius: 2,
                      background: "#0f2a24",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {m.book_title ?? "手动粘贴"}
                  </span>
                  <span style={{ fontSize: 11, color: "#aaa", flexShrink: 0 }}>
                    {m.chapter ?? ""}
                    {m.progress !== null ? ` · ${m.progress}%` : ""}
                  </span>
                </div>
                <StatusBadge status={m.job_status} />
              </div>

              {/* 正文 */}
              <p
                style={{
                  margin: "0 0 6px",
                  fontSize: 14,
                  lineHeight: 1.65,
                  color: "#333",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {m.source_text}
              </p>
              {m.my_take ? (
                <p
                  style={{
                    margin: "0 0 8px",
                    fontSize: 13,
                    lineHeight: 1.65,
                    color: "#0f7050",
                    display: "-webkit-box",
                    WebkitLineClamp: 1,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  💬 {m.my_take}
                </p>
              ) : null}

              {/* 底部：日期 + 任务 */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 8,
                }}
              >
                <span style={{ fontSize: 11, color: "#bbb" }}>
                  {new Date(m.created_at).toLocaleDateString("zh-CN", {
                    month: "long",
                    day: "numeric",
                  })}
                </span>
                {m.job_id ? (
                  <span style={{ fontSize: 11, color: "#999" }}>
                    任务 #{m.job_id}
                  </span>
                ) : null}
              </div>
            </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
