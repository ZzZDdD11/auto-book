import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { coverUrl, listBooks, uploadEpub, type BookOut } from "../api";

export function Shelf() {
  const [books, setBooks] = useState<BookOut[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    try {
      setBooks(await listBooks());
    } catch (e) {
      setErr(String(e));
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setBusy(true);
    try {
      await uploadEpub(file);
      await refresh();
    } catch (e2) {
      setErr(String(e2));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "40px 20px" }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>我的书架</h1>
        <Link to="/compose" style={{ fontSize: 13, color: "#666" }}>
          手动粘贴入口 →
        </Link>
      </header>
      <p style={{ color: "#777", fontSize: 14, marginTop: 8 }}>
        上传 EPUB，在网页里读。划一句话、写一句想法，其余全自动。
      </p>

      <div style={{ margin: "22px 0" }}>
        <input
          ref={fileRef}
          type="file"
          accept=".epub,application/epub+zip"
          onChange={onPick}
          disabled={busy}
          style={{ display: "none" }}
          id="epub-input"
        />
        <label
          htmlFor="epub-input"
          style={{
            display: "inline-block",
            padding: "11px 20px",
            background: busy ? "#bbb" : "#0f2a24",
            color: "#fff",
            borderRadius: 8,
            cursor: busy ? "default" : "pointer",
            fontSize: 14,
          }}
        >
          {busy ? "解析中…" : "上传 EPUB"}
        </label>
      </div>

      {err ? (
        <p style={{ color: "#b5301a", fontSize: 14, whiteSpace: "pre-wrap" }}>{err}</p>
      ) : null}

      {books.length === 0 ? (
        <p style={{ color: "#999", fontSize: 14, marginTop: 40 }}>
          书架还是空的。上传一本 EPUB 开始。
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            gap: 20,
            marginTop: 10,
          }}
        >
          {books.map((b) => (
            <Link
              key={b.id}
              to={`/read/${b.id}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div
                style={{
                  aspectRatio: "3 / 4",
                  borderRadius: 8,
                  background: b.has_cover ? "#eee" : "#12100e",
                  color: "#f4f1ec",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  boxShadow: "0 2px 10px rgba(0,0,0,.12)",
                  padding: b.has_cover ? 0 : 14,
                  textAlign: "center",
                  fontSize: 15,
                  fontWeight: 600,
                }}
              >
                {b.has_cover ? (
                  <img
                    src={coverUrl(b.id)}
                    alt={b.title}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  b.title
                )}
              </div>
              <p style={{ margin: "9px 0 2px", fontSize: 14, fontWeight: 600 }}>{b.title}</p>
              <p style={{ margin: 0, fontSize: 12, color: "#888" }}>
                {b.author || "未知作者"}
              </p>
              <p style={{ margin: "3px 0 0", fontSize: 12, color: "#0f2a24" }}>
                {b.material_count > 0 ? `${b.material_count} 条划线` : "还没划线"}
                {b.last_cfi ? " · 在读" : ""}
              </p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
