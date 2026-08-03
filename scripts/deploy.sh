#!/usr/bin/env bash
#
# auto-book 自动部署脚本
# 由 systemd timer (auto-book-deploy.timer) 每 2 分钟触发一次；
# 也可手动执行：bash /root/auto-book-gitclone/scripts/deploy.sh
#
# 逻辑：
#   1. git fetch 远程 DEPLOY_BRANCH 最新引用
#   2. 本地与远程 commit 一致 -> 无更新，直接退出（开销极小）
#   3. 有更新 -> 强制同步到远程版本 -> 按需重装依赖 -> 重启 auto-book 后端
#
# 说明：
#   - 自动部署以「远程分支」为准，会丢弃本地未提交改动（git reset --hard）
#   - 远程仓库当前只有 feat/v1-pipeline、没有 main；
#     若之后远程建了 main，把下面 DEPLOY_BRANCH 改成 main 即可
#   - 前端 vite dev server 自带热更新，拉代码即生效、无需重启；
#     仅当 web 依赖文件有变化时才自动 npm install
#   - 后端依赖以 requirements.txt 为准，用 pip 幂等安装；
#     不要用 uv sync —— 本仓库 pyproject.toml 只有工具配置、没有 [project] 依赖，
#     uv sync 会把 venv 里所有运行时依赖当多余清空（踩过坑）。
#
# 安全提示：这个脚本会以运行它的用户身份（通常是 root，见对应的 systemd
# service）自动执行 git reset --hard 到远程分支最新 commit 再重启服务——
# 任何能推送到这个分支的人，事实上等同于能在服务器上以该权限执行代码。
# 确保远程仓库的推送权限收得足够紧（只有你自己），不要开放协作者直推。

set -euo pipefail

REPO_DIR="/root/auto-book-gitclone"
SERVICE="auto-book.service"                        # systemd 后端服务名
DEPLOY_BRANCH="${DEPLOY_BRANCH:-feat/v1-pipeline}"  # <- 监听/部署的目标分支
LOG_DIR="/var/log/auto-book"
LOG="$LOG_DIR/deploy.log"
NPM_BIN="$(command -v npm || true)"
PIP_BIN="$REPO_DIR/.venv/bin/pip"

mkdir -p "$LOG_DIR"
log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG"; }

cd "$REPO_DIR"

# ---------- 1. 获取远程最新引用 ----------
if ! git fetch origin "$DEPLOY_BRANCH" >>"$LOG" 2>&1; then
    log "WARN: git fetch 失败（网络或 gitclone 镜像未同步），本次跳过"
    exit 1
fi

LOCAL=$(git rev-parse --verify -q "refs/heads/$DEPLOY_BRANCH" || true)
REMOTE=$(git rev-parse --verify -q "refs/remotes/origin/$DEPLOY_BRANCH" || true)

if [ -z "$REMOTE" ]; then
    log "ERROR: 远程没有分支 origin/$DEPLOY_BRANCH，自动部署停止"
    exit 1
fi

if [ -n "$LOCAL" ] && [ "$LOCAL" = "$REMOTE" ]; then
    log "无更新（$DEPLOY_BRANCH @ ${LOCAL:0:8}）"
    exit 0
fi

log "======== 检测到更新: ${LOCAL:+${LOCAL:0:8} -> }${REMOTE:0:8} ($DEPLOY_BRANCH) ========"

# ---------- 2. 切到目标分支，强制同步到远程 ----------
if ! git rev-parse --verify -q "refs/heads/$DEPLOY_BRANCH" >/dev/null; then
    git checkout -q -b "$DEPLOY_BRANCH" "refs/remotes/origin/$DEPLOY_BRANCH"
else
    git checkout -q "$DEPLOY_BRANCH"
fi
git reset -q --hard "refs/remotes/origin/$DEPLOY_BRANCH"
log "已同步代码到 ${REMOTE:0:8}"

# ---------- 3. 重装后端依赖（pip 幂等，已装版本秒过） ----------
if [ -f requirements.txt ]; then
    if [ -x "$PIP_BIN" ]; then
        if timeout 600 "$PIP_BIN" install -r requirements.txt >>"$LOG" 2>&1; then
            log "pip install -r requirements.txt 完成"
        else
            log "WARN: pip install 失败，继续用现有环境部署"
        fi
    else
        log "WARN: 未找到 $PIP_BIN，跳过依赖安装"
    fi
fi

# 清理 uv sync 可能遗留的空 lock 文件（本仓库不用 uv 管理依赖）
rm -f "$REPO_DIR/uv.lock"

# ---------- 4. 前端依赖有变化时自动 npm install ----------
if [ -n "$NPM_BIN" ] && [ -d web ]; then
    WEB_CHANGED=$(git diff --name-only "HEAD@{1}" "HEAD" 2>/dev/null \
        | grep -E '^web/(package\.json|package-lock\.json)$' || true)
    if [ -n "$WEB_CHANGED" ]; then
        log "web 依赖有变化，执行 npm install ..."
        if ( cd web && timeout 600 "$NPM_BIN" install --no-audit --no-fund ) >>"$LOG" 2>&1; then
            log "npm install 完成"
        else
            log "WARN: npm install 失败，继续部署"
        fi
    fi
fi

# ---------- 5. 重启后端服务 ----------
systemctl restart "$SERVICE"
log "部署完成，已重启 $SERVICE（新版本 ${REMOTE:0:8}）"
