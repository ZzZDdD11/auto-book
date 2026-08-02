import { useEffect, useRef, useState } from "react";
import { getJob, type JobOut } from "../api";

/** 状态是否是「在跑」—— 需要轮询。 */
function isRunning(status: JobOut["status"]): boolean {
  // _pending 状态不需要轮询：任务停着等用户操作，轮询只是白白打后端。
  // 用户 resume 后手动 setJob 触发重新轮询。
  const stopped = new Set(["done", "failed", "script_pending", "tts_pending", "render_pending", "cover_pending", "copy_pending"]);
  return !stopped.has(status);
}

/** 轮询任务状态，完成/失败/待审自动停。两个页面共用。 */
export function useJobPolling() {
  const [job, setJob] = useState<JobOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!job || !isRunning(job.status)) return;
    timer.current = window.setTimeout(async () => {
      try {
        setJob(await getJob(job.id));
      } catch (e) {
        setError(String(e));
      }
    }, 2000);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [job]);

  const running = job !== null && isRunning(job.status);

  return { job, setJob, error, setError, running };
}
