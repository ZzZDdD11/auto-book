#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "缺少 .env，请复制 .env.example 并填入 DEEPSEEK_API_KEY" >&2
  exit 1
fi

# BGM 不入 git（生成结果确定），换机器/重装后会缺。
# 缺了视频照样能出，只是没有背景音乐 —— 静默降级最容易让人误以为已经有了，
# 所以这里明确提示一次。
if ! ls video/public/bgm/*.mp3 >/dev/null 2>&1; then
  echo "提示：还没有背景音乐，跑一次 .venv/bin/python scripts/make_bgm.py" >&2
fi

# 只监听本机，不暴露公网。8077 是为了避开常被占用的 8000。
.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8077 --reload &
BACKEND=$!
trap 'kill $BACKEND 2>/dev/null || true' EXIT

cd web && npm run dev
