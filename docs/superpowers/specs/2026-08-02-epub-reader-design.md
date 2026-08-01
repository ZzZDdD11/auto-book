# auto-book v2 设计文档：EPUB 阅读器

日期：2026-08-02
状态：已确认，待实现
前序：`2026-08-02-auto-book-design.md`（v1 设计，已实现）

## 1. 为什么做这个

v1 上线后第一个真实反馈：**录入成本太高**。生成一条视频要手填 6 个字段。

但这 6 个字段的性质完全不同：

| 字段 | 谁该负责 |
|---|---|
| 书名、作者 | 应该自动 —— EPUB 元数据里就有 |
| 章节、进度 | 应该自动 —— 阅读器知道你读到哪 |
| 原文摘录 | 应该自动 —— 划线即可获得 |
| **我的想法** | **只能人写** —— 这是产品的全部意义 |

6 个字段里 5 个都该被阅读器消灭。v2 的目标就是：**只剩「我的想法」需要动手**。

### 顺带修掉一个已知缺陷

v1 的 `progress` 是假的。链路是：`Material.progress` 可为 `None` → 塞进 prompt 时兜成 `0` → 由 **AI 返回一个整数**填进 `QuoteFrame`。

也就是说「阅读进度」这个本该证明「真读过」的字段，现在靠 AI 输出保证，不靠数据保证。不填就在视频上印一个假的「0%」，比不显示更糟。

阅读器让它第一次名副其实：进度 = 划线位置字符偏移 / 全书总字数。

## 2. 技术选型

### 渲染引擎：react-reader

调研了四个候选：

| 方案 | 状态 | 结论 |
|---|---|---|
| **react-reader** | 10 个月前更新，周下载 2.8w | ✅ 采用 |
| epub.js | ⚠️ 3–4 年未发版（0.3.93），周下载 9.3w | 作为 react-reader 的底层间接使用 |
| foliate-js | 活跃，MIT，Readest 在用 | 无 npm 包、API 声明「随时会变」 |
| Readest | 23k star | ❌ 不采用（见下） |

**选 react-reader 的理由**：一个 `<ReactReader>` 组件即可渲染 EPUB，省掉整个渲染层；通过 `getRendition` 能拿到 epub.js 原生的 `selected` 事件和 CFI，正是划线定位所需；已用 TypeScript 重写，自带类型。

**为什么不二开 Readest**：它的渲染引擎是 foliate-js（MIT），但整个项目是 Next.js 16 + pnpm monorepo + Rust/Tauri v2，2713 commits。集成它等于用它的前端架构替换我们的 Vite + React 18，再把视频管线嫁接进去。而它的翻译、TTS、OPDS、KOReader 同步、对照阅读等功能我们一个都不需要，却全都要跟着维护。我们真正需要的只有四件事：渲染 EPUB、捕获选中、拿到 CFI、弹框写想法。

AGPL-3.0 不是主因（自用不触发），但需记录一个事实：**AGPL 的触发条件是「对外提供网络服务」，与仓库是否私有无关**。若未来按规划开放给他人使用，私有仓库不构成豁免。

**Readest 仍有价值**：遇到 EPUB 脏数据问题时读它的源码当参考。读代码学思路不构成衍生作品。

### 已查明的三个坑，实现时必须避开

| 坑 | 处理 |
|---|---|
| `swipeable={true}` 会禁用 iframe 内文字选中 | 必须关闭滑动翻页 |
| 官方 README 建议全局覆盖 `window.DOMParser` | **不做** —— 会影响整个页面的 XML 解析 |
| `allowScriptedContent: true` 会破坏 iframe sandbox | **不开** —— EPUB 是不可信输入 |

### 一个架构约束

epub.js **拿不到全书总页数**，只能提供「当前章节内的进度」。所以进度百分比必须由我们自己算：后端解包时统计各章节字数，前端划线时上报 `章节索引 + 章节内偏移`，后端换算成全书百分比。这不是可选项。

### 退路

渲染层封装成 `<BookView>` 组件，只对外暴露 `onSelect(text, cfi, chapterIndex, chapterTitle)`。若 epub.js 出问题，换 foliate-js 只需改这一个文件。

## 3. 数据模型变更

⚠️ **项目没有数据库迁移工具**（`db.py` 只有 `create_all`，幂等但不改已存在的表）。加字段后老库不会自动加列，会报 `no such column`。开发期直接删 `storage/auto-book.db` 重建 —— `storage/` 已被 gitignore，无生产数据。

### Book 新增字段

| 字段 | 类型 | 用途 |
|---|---|---|
| `epub_path` | `str \| None` | 文件位置 |
| `file_sha256` | `str \| None`（index） | 去重，同一本书重复上传不新建 |
| `total_chars` | `int` = 0 | **进度的分母** |
| `chapters_json` | `str \| None` | 各章节标题与累计字数偏移 |
| `last_cfi` | `str \| None` | 上次读到哪，重开自动跳回 |

`cover_path` 字段 v1 就存在但从未写入，这次用上。

### Material 新增字段

| 字段 | 类型 | 用途 |
|---|---|---|
| `cfi` | `str \| None` | EPUB 定位符，用于回到划线处 |

### 一处约束收紧

`MaterialIn` 增加规则：**当 `source == epub` 时，`progress` 和 `highlighted_at` 必填**。这样 `QuoteFrame` 的非空约束终于有数据层保证，不再依赖 AI 和 `or date.today()` 兜底。

`materials.py` 目前硬编码 `source=MaterialSource.paste`，改为从 payload 读取。`MaterialSource.epub` 这个枚举值 v1 定义了但零引用，这次启用。

## 4. 架构与数据流

```
上传 EPUB
  → 校验（magic bytes / 大小 / 解压体积 / 条目数）
  → 存 storage/epubs/<sha256>.epub
  → ebooklib 解包：书名、作者、封面、章节列表、各章字数
  → Book 表

打开阅读器
  → GET /api/books/{id}/file（走接口，不挂 StaticFiles）
  → react-reader 渲染（sandbox，不开脚本）
  → 翻页时上报 CFI，存 Book.last_cfi

选中文字
  → rendition.on('selected') → 拿到 CFI + 文本 + 章节索引
  → 弹框写「我的想法」（唯一需要手动输入的东西）
  → 进度 = (章节累计偏移 + 章节内偏移) / total_chars
  → POST /api/materials（source=epub，带 cfi）

生成视频
  → 复用 v1 全部链路，零改动
```

### 模块划分

**后端新增**

| 文件 | 职责 |
|---|---|
| `backend/core/epub.py` | 解包、校验、抽元数据、算字数。纯函数，不依赖 HTTP |
| `backend/api/books.py` | 上传、列表、下发文件、存位置、查划线 |

**前端重构**（当前 `App.tsx` 237 行把表单+轮询+结果焊在一起）

| 文件 | 职责 |
|---|---|
| `web/src/pages/Shelf.tsx` | 书架：上传、书列表 |
| `web/src/pages/Reader.tsx` | 阅读器：BookView + 划线弹框 |
| `web/src/pages/Compose.tsx` | 现有粘贴表单（保留） |
| `web/src/components/BookView.tsx` | 渲染引擎封装。换引擎只改这里 |
| `web/src/components/JobPanel.tsx` | 任务轮询 + 结果展示（两页共用） |
| `web/src/hooks/useJobPolling.ts` | 轮询逻辑 |

**保留粘贴入口的理由**：纸质书、微信读书、PDF 都还得靠它。阅读器只覆盖 EPUB。

## 5. 新增接口

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/api/books/upload` | 上传 EPUB（multipart） |
| GET | `/api/books` | 书架列表 |
| GET | `/api/books/{id}/file` | 下发 EPUB 给渲染器 |
| GET | `/api/books/{id}/cover` | 封面图 |
| POST | `/api/books/{id}/position` | 存阅读位置 |
| GET | `/api/books/{id}/materials` | 这本书的划线列表 |

`POST /api/materials` 改造：接受 `book_id`（替代 `book_title`）、`cfi`、`source`。

⚠️ CORS 目前 `allow_methods=["GET","POST"]`。存位置用 POST 而非 PUT，避免改动 CORS 配置。

## 6. 安全设计

EPUB 是**用户上传的不可信 ZIP**，这是本功能最大的新增攻击面。

| 风险 | 处理 |
|---|---|
| **XSS** | 正文用 iframe + `sandbox` 渲染（react-reader 默认）。绝不 `dangerouslySetInnerHTML`，绝不开 `allowScriptedContent` |
| **路径穿越** | 落盘文件名由服务端生成（sha256），绝不用客户端 `filename` 拼路径。下发照抄 `jobs.py` 的 `resolve()` + `is_relative_to()` |
| **Zip bomb** | 限制上传大小、解压后总体积、条目数。超限直接拒 |
| **文件类型伪装** | 校验 magic bytes（`PK\x03\x04`），不信任扩展名与 MIME |
| **越权访问** | 每个接口校验 `Book.user_id` 归属，不能靠 ID 猜到别人的书 |
| **目录暴露** | **不挂 `StaticFiles` 到 `storage/`** —— 那会把数据库和所有视频产物暴露成可枚举 HTTP 目录 |
| **XXE** | EPUB 的 OPF/NCX 是 XML。用安全解析，禁用外部实体 |

新增配置：`epub_dir`、`max_epub_bytes`、`max_epub_entries`、`max_epub_uncompressed_bytes`。

## 7. 新增依赖

- 后端：`python-multipart`（FastAPI 处理上传必需，当前未装）、`ebooklib`（EPUB 解析）
- 前端：`react-reader`、`react-router-dom`

## 8. 范围

### 做

1. 上传 EPUB，解析元数据入库
2. 书架页：书列表 + 上传
3. 阅读器页：渲染、翻页、记住位置
4. 选中文字 → 弹框写想法 → 存素材（自动带入书名/作者/章节/进度/CFI/日期）
5. 从素材一键生成视频（复用 v1）
6. 这本书的划线列表

### 不做

多本批量导入、划线高亮回显（v3）、划线颜色与标签、PDF 支持、全文搜索、阅读设置（字号/主题/夜间）、公众号接口、深耕档 AI 提问。

### 验收标准

1. 上传一本 EPUB，书架出现该书，书名作者正确
2. 打开阅读器能正常翻页，中文显示正常
3. 关闭后重开，自动回到上次位置
4. 选中一句话，弹框只需填「我的想法」，其余字段自动带入且**进度是真实计算值而非 0**
5. 保存后能一键生成视频，成品的原文帧显示正确的章节与进度
6. 上传非 EPUB 文件被拒绝，上传超大文件被拒绝
7. 无法通过改 URL 里的 book_id 访问不属于自己的书

## 9. 后续

- **v3** —— 划线高亮回显；公众号双向接口（速记入口 + 长文草稿）；深耕档 AI 提问
- **待验证后决定** —— 是否开放多用户；PDF 支持

先跑一段，看录入成本是否真的降到「只写想法」。
