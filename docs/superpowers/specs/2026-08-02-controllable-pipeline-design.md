# 可控可调的生产流水线

日期：2026-08-02
状态：已确认，待实现

## 背景

v1/v2 的 pipeline 是 fire-and-forget：`run_job` 从 pending 一路跑到 done，
中间没有暂停点。用户对 AI 生成的内容（脚本、配音、画面）完全无法介入，
看到成品时已经定型，不满意只能整条重跑。

用户要的是「每个生产环节可控可调整」：素材能改、脚本能改、单帧能改、
AI 能重写单帧。但默认仍然一路跑到 done —— 介入是可选的，不是强制的。

## 目标

把 pipeline 从「一发就走」改成「分阶段可暂停」：

- 每个生产环节产出后进入 `_pending` 状态，可介入
- 默认自动放行（`auto_advance=true`），保持「随手记、自动出片」的体验
- 任何编辑操作把 `auto_advance` 关掉，停在当前阶段等用户确认
- `resume` 把 `auto_advance` 重新打开，进下一阶段
- 三个编辑入口：改素材重跑、手改单帧、AI 重写单帧
- 改素材重跑时旧视频保留为历史版本

## 非目标

- 不做「强制每环节都停」—— 那会让出一条视频要操作五次，使用成本比 v1 还高
- 不做 TTS 的语速/语调细调 —— edge-tts 不支持，能调的只有音色
- 不做「只渲一帧再拼」—— Remotion 没法只渲一帧，整体渲染十几秒，够快
- 不做新版素材的 AB 对比 —— 历史版本保留，但前端不主动做并排比较

## 决策记录

以下决策均经用户逐项确认：

| 决策点 | 选择 | 理由 |
|---|---|---|
| 编辑需求 | B + C3 | 改素材重跑 + 手改单帧 + AI 重写单帧 |
| AI 重写单帧时其他帧 | A 完全冻结 | 边界清晰，操作后果可预测 |
| 介入模式 | 能停 | 默认一路跑完，介入可选，不破坏「随手记」体验 |
| tts_pending | 默认跳过 | edge-tts 能调的只有音色，价值不大；保留 `pause_after_tts` 开关 |
| 改素材时旧视频 | 保留为历史 | 不满意重跑时旧版不丢，可回看 |
| evidence 手改时 | 仍过 strip_fake_evidence | 护城河不能松，假引用比没引用严重 |
| AI 重写后旧版单帧 | 进 script_json_history 可回滚 | 重写有失败概率，旧版要能找回 |
| 阶段间状态传递 | 全走数据库 | 跨进程续跑，今天改一半明天 resume 也行 |

## 状态机

从线性改成分阶段可暂停：

```
pending
  → scripting
  → script_pending ──(auto_advance)──→ tts
        ↓ (编辑操作把 auto_advance 关掉)
      script_editing
        ↓ (提交)
      script_pending
        ↓ (resume)
  → tts
  → tts_pending*  ──(auto_advance)──→ rendering
        ↓ (* 默认跳过，pause_after_tts=true 时才停)
  → rendering
  → render_pending ──(auto_advance)──→ copywriting
        ↓ (编辑操作：手改单帧 / AI 重写单帧)
      render_editing
        ↓ (提交)
      render_pending
        ↓ (resume)
  → copywriting
  → cover_pending ──(auto_advance)──→ done
  → done

任意阶段失败 → failed
```

`auto_advance` 是 Job 上的布尔字段：
- 默认 `true`，阶段完成后自动进下一阶段
- 任何编辑操作（PATCH script / regenerate-frame / PATCH material）设为 `false`
- `resume` 设回 `true` 并进下一阶段

## 数据模型变更

### Job 表

新增字段：

```
auto_advance: bool = true           # 是否自动推进到下一阶段
script_json_history: str | None     # 历史脚本 JSON 数组，AI 重写单帧时追加
```

不新增 `current_stage` —— `status` 字段本身就是阶段。

### Asset 表

新增字段：

```
version: int = 1    # 产物版本号，每次重跑 +1
```

`kind` 不变，仍用 `kind="video"` 查询；同 kind 多条时取 `version` 最大。
`kind="cover:9x16"` 等同理。

### 不新增表

版本数不会多（一个 job 改几次顶天），`script_json_history` 一个 JSON 字段够用。
等真的膨胀再说。

## API 变更

```
PATCH /api/materials/{id}
  body: { source_text?, my_take?, chapter?, progress? }
  → 改素材。关联 job 的 script_json 清空、auto_advance=false、退回 scripting

PATCH /api/jobs/{id}/script
  body: { frame: "hook"|"quote"|"breakdown"|"my_take"|"outro",
          patch: { ...对应帧的字段 } }
  → 手改某一帧。script_json 直接 patch，auto_advance=false
  → evidence 仍过 strip_fake_evidence（护城河不能松）
  → 重做该帧 TTS + 整体渲染

POST /api/jobs/{id}/regenerate-frame
  body: { frame: "hook"|"quote"|..., feedback?: "要具体冲突" }
  → AI 重写指定帧，其他四帧冻结（喂给 AI 作为 context）
  → 旧版整份 script_json 追加到 script_json_history
  → 重做该帧 TTS + 整体渲染

POST /api/jobs/{id}/resume
  → auto_advance=true，从当前 _pending 状态进下一阶段

GET /api/jobs/{id}/history
  → 列出该 job 的所有视频版本（version + 创建时间 + 文件大小）

GET /api/jobs/{id}/video?version=2
  → 下载指定版本，默认最新
```

### 关键约束

- `frame` 字段白名单校验，它进 JSON path 和命令行
- `patch` 的字段必须匹配对应帧的 schema —— 不允许塞 hook 的字段到 quote
- evidence 手改时仍过 `strip_fake_evidence`，不在原文里的会被置 `None`
- AI 重写单帧的 prompt 必须把其他四帧作为 context 喂进去，并明确「只输出指定帧」
- 路径校验沿用 `_safe_under` / `_asset_file`，防目录穿越

## pipeline 拆分

现在 `run_job` 是一个 async 函数跑到底。拆成阶段函数：

```
run_scripting(job, session)     # 素材 → 脚本
run_tts(job, session)           # 脚本 → 五帧配音
run_rendering(job, session)     # 配音 + 脚本 → 视频 + 封面
run_copywriting(job, session)   # 脚本 → 三平台文案
```

`run_job` 变成调度器：
1. 读 `status`，调对应阶段函数
2. 阶段完成后进入 `_pending` 状态
3. 如果 `auto_advance=true`：自动进下一阶段
4. 如果 `auto_advance=false`：停在这里，等 `resume`

### 阶段间状态走数据库

阶段函数之间不传内存变量，全部通过数据库（`script_json`、`Asset` 行）。
原因：暂停再继续可能跨进程 —— 今天改一半明天 resume，进程早没了。
状态全在 DB 里才能跨进程续。

### 局部重做的实现

手改单帧或 AI 重写单帧后：
1. `script_json` 更新（手改直接 patch / AI 重写替换那一帧）
2. 只重做被改帧的 TTS（其他帧的 mp3 保留）
3. 重新调 `build_payload` 组装五帧 props
4. 整体渲染（Remotion 没法只渲一帧，全渲十几秒够快）
5. `Asset` 表新增一行 `kind="video"`，`version` +1

## 前端

### Reader 页

划线列表每条素材加「编辑」按钮。点开弹框，可改 `source_text` / `my_take` /
`chapter` / `progress`。提交后调用 `PATCH /api/materials/{id}`，关联 job 退回
scripting 重跑。

### JobPanel

加几种状态显示：
- `script_pending`：显示「脚本已生成，待审」+ 「继续」按钮 + 单帧编辑入口
- `render_pending`：显示「视频已渲染，待审」+ 「继续」按钮 + 单帧编辑/重写入口
- 其他 `_pending`：显示对应阶段名 + 「继续」按钮

单帧编辑入口：展开某一帧的字段，可直接手改。改完提交调
`PATCH /api/jobs/{id}/script`。

AI 重写入口：每帧旁边一个「重新生成」按钮，可选填反馈。调用
`POST /api/jobs/{id}/regenerate-frame`。

历史版本入口：视频列表里显示所有版本，可下载任意版本。

## 验证方式

1. 默认流程（不介入）仍然一路跑到 done，行为与现在一致
2. 改素材后，旧视频保留为新版本，新视频 version+1
3. 手改 hook 的 lines，只重做 hook 的 TTS，其他帧配音不变
4. AI 重写 breakdown，其他四帧内容字面不变
5. AI 重写后旧版 script_json 在 history 里，可回滚
6. evidence 手填假引用仍被 strip_fake_evidence 丢掉
7. resume 后从 _pending 进下一阶段，auto_advance 恢复 true
8. 跨进程续跑：手动 kill 后端，重启，resume 仍能继续

## 风险

- **状态机变复杂**（5 状态 → 9 状态）。pipeline 代码要拆，不能再一个 async 函数
  跑到底。测试覆盖要跟上，否则状态转换容易出 bug。
- **AI 重写单帧的成功率**。其他四帧冻结时，AI 可能写出不连贯的内容。已用
  history + 回滚兜底，最坏情况是退回旧版。
- **版本数膨胀**。一个 job 改十几次后 Asset 表会堆十几行。短期不是问题，
  长期可能要加清理策略（保留最近 N 版）。
- **跨进程续跑的隐含约束**。阶段函数必须能从 DB 完整恢复状态，不能依赖
  任何内存变量。这条约束容易被破坏，code review 要盯紧。
