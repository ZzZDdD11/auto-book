export type Mode = "deep" | "fast";
export type Source = "paste" | "epub" | "wechat";

export type MaterialIn = {
  book_id?: number | null;
  book_title?: string;
  book_author?: string;
  source_text: string;
  my_take: string;
  chapter?: string | null;
  highlighted_at?: string | null;
  progress?: number | null;
  cfi?: string | null;
  source?: Source;
  mode: Mode;
};

export type JobStatus =
  | "pending"
  | "scripting"
  | "tts"
  | "rendering"
  | "done"
  | "failed";

export type CopyVariant = { title: string; body: string; tags: string[] };

export type JobOut = {
  id: number;
  status: JobStatus;
  error: string | null;
  cost_tokens: number;
  copies: Record<string, CopyVariant> | null;
};

export type BookOut = {
  id: number;
  title: string;
  author: string;
  total_chars: number;
  last_cfi: string | null;
  has_cover: boolean;
  material_count: number;
};

export type MaterialBrief = {
  id: number;
  source_text: string;
  my_take: string;
  chapter: string | null;
  progress: number | null;
  cfi: string | null;
};

async function readError(resp: Response): Promise<string> {
  const text = await resp.text();
  try {
    const data = JSON.parse(text);
    // FastAPI 的 422 是 {detail: [{msg, loc}, ...]}，直接展示 msg 更有用
    if (Array.isArray(data.detail)) {
      return data.detail.map((d: { msg?: string }) => d.msg ?? "").join("；");
    }
    if (typeof data.detail === "string") return data.detail;
  } catch {
    // 不是 JSON，原样返回
  }
  return `${resp.status} ${text.slice(0, 200)}`;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(await readError(resp));
  return resp.json() as Promise<T>;
}

async function get<T>(url: string): Promise<T> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(await readError(resp));
  return resp.json() as Promise<T>;
}

export const createMaterial = (data: MaterialIn) =>
  post<{ material_id: number; book_id: number }>("/api/materials", data);

export const createJob = (materialId: number) =>
  post<JobOut>("/api/jobs", { material_id: materialId });

export const getJob = (id: number) => get<JobOut>(`/api/jobs/${id}`);

export const listBooks = () => get<BookOut[]>("/api/books");

export const listBookMaterials = (bookId: number) =>
  get<MaterialBrief[]>(`/api/books/${bookId}/materials`);

/** 全书进度必须由后端算 —— epub.js 只能给出章节内进度。 */
export const calcProgress = (bookId: number, chapterIndex: number, fraction: number) =>
  post<{ progress: number }>(`/api/books/${bookId}/progress`, {
    chapter_index: chapterIndex,
    fraction,
  });

export async function savePosition(bookId: number, cfi: string): Promise<void> {
  const resp = await fetch(`/api/books/${bookId}/position`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cfi }),
  });
  if (!resp.ok) throw new Error(await readError(resp));
}

export async function uploadEpub(file: File): Promise<BookOut> {
  const form = new FormData();
  form.append("file", file);
  // 不要手动设 Content-Type，浏览器要自己加 multipart boundary
  const resp = await fetch("/api/books/upload", { method: "POST", body: form });
  if (!resp.ok) throw new Error(await readError(resp));
  return resp.json();
}

export const epubFileUrl = (bookId: number) => `/api/books/${bookId}/file`;
export const coverUrl = (bookId: number) => `/api/books/${bookId}/cover`;
