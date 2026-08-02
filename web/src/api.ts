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
  | "script_pending"
  | "tts"
  | "tts_pending"
  | "rendering"
  | "render_pending"
  | "cover_pending"
  | "copywriting"
  | "copy_pending"
  | "done"
  | "failed";

export type CopyVariant = { title: string; body: string; tags: string[] };

/** 五帧脚本的类型，与后端 Script pydantic 模型一一对应。 */
export type FrameName = "hook" | "quote" | "breakdown" | "my_take" | "outro";

export type HookFrame = {
  lines: string[];
  highlight: string | null;
  narration: string;
};

export type QuoteFrame = {
  text: string;
  chapter: string | null;
  highlighted_at: string;
  progress: number;
  narration: string;
};

export type BreakdownPoint = {
  text: string;
  evidence: string | null;
};

export type BreakdownFrame = {
  kicker: string;
  points: BreakdownPoint[];
  narration: string;
};

export type MyTakeFrame = {
  kicker: string;
  text: string;
  narration: string;
};

export type OutroFrame = {
  question: string;
  footer_lines: string[];
  narration: string;
};

export type Script = {
  book_title: string;
  book_author: string;
  book_index: number;
  year: number;
  hook: HookFrame;
  quote: QuoteFrame;
  breakdown: BreakdownFrame;
  my_take: MyTakeFrame;
  outro: OutroFrame;
};

export type HistoryEntry = {
  version: number;
  created_at: string;
  size_bytes: number;
};

export type JobOut = {
  id: number;
  status: JobStatus;
  error: string | null;
  cost_tokens: number;
  copies: Record<string, CopyVariant> | null;
  cover_ratios: string[];
  card_count: number;
  video_version: number | null;
  auto_advance: boolean;
  script: Script | null;
};

export type BookOut = {
  id: number;
  title: string;
  author: string;
  total_chars: number;
  last_cfi: string | null;
  last_chapter: string | null;
  last_progress: number | null;
  last_opened_at: string | null;
  has_cover: boolean;
  material_count: number;
};

/** 一条历史记忆点：某次阅读时段结束时停留的位置。 */
export type CheckpointOut = {
  cfi: string;
  chapter: string | null;
  progress: number | null;
  created_at: string;
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

async function patch<T>(url: string, body: unknown): Promise<T> {
  const resp = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

/** 上报阅读位置。chapterIndex/fraction 用来让后端算全书进度，chapterTitle 是显示用的标签。 */
export async function savePosition(
  bookId: number,
  info: { cfi: string; chapterIndex: number; fraction: number; chapterTitle: string },
): Promise<void> {
  const resp = await fetch(`/api/books/${bookId}/position`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cfi: info.cfi,
      chapter_index: info.chapterIndex,
      fraction: info.fraction,
      chapter_title: info.chapterTitle,
    }),
  });
  if (!resp.ok) throw new Error(await readError(resp));
}

/** 该书最近的历史记忆点（不含「现在」，那条数据在 BookOut 里）。 */
export const listCheckpoints = (bookId: number) =>
  get<CheckpointOut[]>(`/api/books/${bookId}/checkpoints`);

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

// ============================================================
// 可控流水线：介入操作
// ============================================================

/** 改素材。最新关联 job 退回 scripting 重跑，旧视频保留为历史。 */
export const patchMaterial = (
  materialId: number,
  data: Partial<Pick<MaterialBrief, "source_text" | "my_take" | "chapter" | "progress">>,
) =>
  patch<{ material_id: number; restarted_jobs: number[] }>(
    `/api/materials/${materialId}`,
    data,
  );

/** 手改某一帧。改完停在 render_pending 等用户 resume。 */
export const patchScriptFrame = (
  jobId: number,
  frame: FrameName,
  framePatch: Record<string, unknown>,
) => patch<JobOut>(`/api/jobs/${jobId}/script`, { frame, patch: framePatch });

/** AI 重写指定帧，其他四帧冻结。旧版进 history 可回滚。 */
export const regenerateFrame = (
  jobId: number,
  frame: FrameName,
  feedback?: string,
) => post<JobOut>(`/api/jobs/${jobId}/regenerate-frame`, { frame, feedback });

/** 改文案。整体替换，改完停在 copy_pending。 */
export const patchCopy = (
  jobId: number,
  copies: Record<string, CopyVariant>,
) => patch<JobOut>(`/api/jobs/${jobId}/copy`, { copies });

/** 从 _pending 放行，auto_advance 恢复 true，继续往下跑。 */
export const resumeJob = (jobId: number) => post<JobOut>(`/api/jobs/${jobId}/resume`, {});

/** 列出该 job 的所有视频版本。 */
export const listHistory = (jobId: number) =>
  get<HistoryEntry[]>(`/api/jobs/${jobId}/history`);

/** 视频下载地址。默认最新版，可指定 version 拉历史。 */
export const videoUrl = (jobId: number, version?: number) =>
  version ? `/api/jobs/${jobId}/video?version=${version}` : `/api/jobs/${jobId}/video`;

/** 某一帧配音的播放地址。 */
export const audioUrl = (jobId: number, frame: FrameName) =>
  `/api/jobs/${jobId}/audio/${frame}`;

/** 图文卡片下载地址。index 从 0 起。 */
export const cardUrl = (jobId: number, index: number) =>
  `/api/jobs/${jobId}/card/${index}`;

/** 素材列表项（带关联书名和最新 job 状态）。 */
export type MaterialWithJob = {
  id: number;
  source_text: string;
  my_take: string;
  chapter: string | null;
  progress: number | null;
  created_at: string;
  book_id: number | null;
  book_title: string | null;
  job_id: number | null;
  job_status: JobStatus | null;
};

/** 列出所有素材，带关联书名和最新 job 状态。 */
export const listAllMaterials = () =>
  get<MaterialWithJob[]>("/api/materials");

/** 素材完整内容 + 关联书名 + 最新 job_id。 */
export type MaterialFull = {
  id: number;
  source_text: string;
  my_take: string;
  chapter: string | null;
  progress: number | null;
  highlighted_at: string | null;
  created_at: string;
  mode: string;
  book_id: number | null;
  book_title: string | null;
  book_author: string | null;
  job_id: number | null;
};

export const getMaterialFull = (id: number) =>
  get<MaterialFull>(`/api/materials/${id}/full`);
