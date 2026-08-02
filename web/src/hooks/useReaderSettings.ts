import { useCallback, useEffect, useState } from "react";

export type ReaderTheme = "day" | "night";
export type ReaderSpread = "single" | "double";

export type ReaderSettings = {
  /** 日间 / 夜间 */
  theme: ReaderTheme;
  /** 字号百分比，100 = 100% */
  fontSize: number;
  /** 单页 / 双页排列 */
  spread: ReaderSpread;
};

const STORAGE_KEY = "auto-book:reader-settings";

export const FONT_MIN = 80;
export const FONT_MAX = 200;
export const FONT_STEP = 10;

const DEFAULTS: ReaderSettings = {
  theme: "day",
  fontSize: 110,
  spread: "single",
};

function clampFont(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : DEFAULTS.fontSize;
  const stepped = Math.round(n / FONT_STEP) * FONT_STEP;
  return Math.min(FONT_MAX, Math.max(FONT_MIN, stepped));
}

function loadSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<ReaderSettings>;
    return {
      theme: p.theme === "night" ? "night" : "day",
      fontSize: clampFont(p.fontSize),
      spread: p.spread === "double" ? "double" : "single",
    };
  } catch {
    return DEFAULTS;
  }
}

/**
 * 阅读器外观设置：主题 / 字号 / 单双页。
 * 持久化到 localStorage，跨刷新保留。纯客户端状态，不碰后端。
 */
export function useReaderSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(loadSettings);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // 无痕模式 / 配额满，忽略
    }
  }, [settings]);

  const toggleTheme = useCallback(() => {
    setSettings((s) => ({ ...s, theme: s.theme === "day" ? "night" : "day" }));
  }, []);

  const bumpFont = useCallback((delta: number) => {
    setSettings((s) => ({
      ...s,
      fontSize: Math.min(FONT_MAX, Math.max(FONT_MIN, s.fontSize + delta)),
    }));
  }, []);

  const cycleSpread = useCallback(() => {
    setSettings((s) => ({
      ...s,
      spread: s.spread === "single" ? "double" : "single",
    }));
  }, []);

  return { settings, toggleTheme, bumpFont, cycleSpread };
}
