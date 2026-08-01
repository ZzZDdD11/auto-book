import { useEffect, useRef, useState } from "react";
import { getJob, type JobOut } from "../api";

/** 轮询任务状态，完成或失败自动停。两个页面共用。 */
export function useJobPolling() {
  const [job, setJob] = useState<JobOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!job || job.status === "done" || job.status === "failed") return;
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

  const running = job !== null && job.status !== "done" && job.status !== "failed";

  return { job, setJob, error, setError, running };
}
