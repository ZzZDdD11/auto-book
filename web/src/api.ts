export type Mode = "deep" | "fast";

export type MaterialIn = {
  book_title: string;
  book_author: string;
  source_text: string;
  my_take: string;
  chapter: string | null;
  highlighted_at: string | null;
  progress: number | null;
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

async function post<T>(url: string, body: unknown): Promise<T> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`${resp.status} ${detail.slice(0, 300)}`);
  }
  return resp.json() as Promise<T>;
}

export const createMaterial = (data: MaterialIn) =>
  post<{ material_id: number; book_id: number }>("/api/materials", data);

export const createJob = (materialId: number) =>
  post<JobOut>("/api/jobs", { material_id: materialId });

export async function getJob(id: number): Promise<JobOut> {
  const resp = await fetch(`/api/jobs/${id}`);
  if (!resp.ok) throw new Error(`查询任务失败 ${resp.status}`);
  return resp.json();
}
