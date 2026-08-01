#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "缺少 .env，请复制 .env.example 并填入 DEEPSEEK_API_KEY" >&2
  exit 1
fi

# 只监听本机，不暴露公网。8077 是为了避开常被占用的 8000。
.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8077 --reload &
BACKEND=$!
trap 'kill $BACKEND 2>/dev/null || true' EXIT

cd web && npm run dev
