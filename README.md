# auto-book

把读书笔记做成竖屏短视频。记录读书，同时倒逼自己输出。

## 这是什么

贴一段书摘和你自己的想法，产出一条 1080×1920 的竖屏视频（五帧结构：钩子 / 原文 / 拆解 / 我的想法 / 收尾），
外加抖音、小红书、视频号三版发布文案。

发布是手动的 —— 这三个平台没有开放 API，自动化上传有封号风险，不值得。

## 两档模式

- **深耕档** —— 视频里「我的想法」完全来自你写的内容，AI 只做整理，不代笔
- **快产档** —— 没时间时用，AI 起草观点，你审一遍改两句

数据库记录每条内容走的哪一档。不为考核，是为了让你年底能看出有多少是真正想过的。

## 跑起来

前置：Python 3.12、Node 20+、ffmpeg。

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt

cd video && npm install && cd ..
cd web && npm install && cd ..

cp .env.example .env   # 填入 DEEPSEEK_API_KEY

.venv/bin/python scripts/make_bgm.py   # 生成背景音乐（只需一次）

./scripts/dev.sh       # 打开 http://localhost:5173
```

## 配音与背景音乐

**背景音乐是自己合成的，不用现成音乐。** 音乐版权是抖音/视频号自动检测的重点，
会直接消音或限流，风险比引用书籍原文高得多。`scripts/make_bgm.py` 用标准库合成
两首无版权 BGM，版权属于自己：

- `ink.mp3` —— 缓慢琶音 + 低音垫，有一点旋律感（默认）
- `dusk.mp3` —— 纯低音垫，几乎察觉不到，最不抢戏

BGM 不入 git（每次生成结果一致，没必要存二进制）。换曲子改 `BGM_SRC=bgm/dusk.mp3`。

**BGM 音量分两档，不是一个固定值。** 固定值必然二选一地错：够撑住无人声的钩子帧，
就会盖住人声；不盖人声，钩子帧开头就发空（实测原本是 `-inf` 完全静音）。
所以有人声时 `0.10`、无人声时 `0.26`，切换处用 0.4s 过渡，结尾 2s 淡出。
实测有人声段只抬高 1.2dB，音乐在但不抢。

**换音色先试听，别看参数猜。**

```bash
.venv/bin/python scripts/preview_voice.py   # 合成候选音色 + 混上 BGM
```

edge-tts 的中文音色实测只有 8 个。默认用 `zh-CN-YunyangNeural`（男声，微软官方人格
标签 Professional/Reliable，播报腔）。备选 `zh-CN-XiaoxiaoNeural`（女声，Warm）。
原先的 `zh-CN-YunxiNeural` 标签是 Lively/Sunshine，少年音，念读书感悟违和。

## 开发

```bash
.venv/bin/pytest                     # 后端测试
.venv/bin/ruff check backend tests scripts
cd video && npm run typecheck         # 视频侧类型检查
cd video && npm run studio            # 视频预览（改排版时用这个，不用每次渲染）
.venv/bin/python scripts/gen_types.py # 改了 schema 后重新生成 TS 类型
```

## 结构

| 目录 | 说明 |
|---|---|
| `backend/schema/frames.py` | **五帧结构，全系统唯一真源**。改这里意味着 prompt、组件、文案都要跟着变。 |
| `backend/core/` | 每个模块单一职责，输入输出都是纯数据，不依赖 HTTP 层 |
| `video/` | Remotion 视频工程。只消费五帧 JSON，对后端零依赖 |
| `video/src/types.ts` | 由 `scripts/gen_types.py` 生成，**不要手改** |
| `web/` | 最小前端 |
| `storage/` | 数据库与产物，不进 git |

## 实测踩到的坑（改代码前先读）

**edge-tts 拿不到逐词时间戳。** 官方文档描述了 `WordBoundary` 事件，但实测当前服务端对中文和英文音色
都只返回 `SentenceBoundary`（整句一条）。所以字幕是「句级时间戳 + 句内按字数比例插值」，
见 `backend/core/caption.py`。不要照着文档改回逐词。

**相邻句的时间会重叠约 50ms。** 服务端返回的数据如此，不是计算错误。`group_captions` 会裁掉重叠，
否则字幕切换瞬间会显示上一句。

**edge-tts 偶发连接失败。** 走公网 websocket，实测遇到过 DNS 解析失败。`synthesize` 内置 3 次重试
加指数退避，否则网络抖一下整个任务就废了，前面生成脚本的钱也白花。

**中文字体必须嵌入。** `video/public/fonts/` 里的三个 woff2 是必需文件，不能依赖系统字体，
否则渲出来满屏方框。

## 注意

- `DEEPSEEK_API_KEY` 只从环境变量读。`.env` 已被 gitignore，不要提交。
- v1 只监听 `127.0.0.1`，不要直接暴露公网。
- 渲染在本地跑，不在服务器上跑（2 核 4G 跑 headless Chrome 太挤）。
