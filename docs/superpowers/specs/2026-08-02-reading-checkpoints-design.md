# 阅读历史记忆点

日期：2026-08-02
状态：已确认，待实现

## 背景

阅读器现在只记一个位置（`Book.last_cfi`，每次覆盖），重开自动跳回。
这解决了"最后一次读到哪"，但解决不了"这几天陆续读了几段，想跳回某一段"——
比如今天下午读到第3章，晚上又读到第7章，重开只能看到第7章，
下午那个断点找不回来了。同时书架是平铺列表、按上传时间排序，
最近在读的书如果不是最新上传的，会被埋在列表里，找起来不方便。

## 目标

- 单本书内：记录最近几次"阅读时段"结束时停留的位置，可以点回去
- 书架维度：最近打开过的书排在前面，不用手动找
- 两者共用同一份"上报阅读位置"的数据链路，不新增一条平行的上报路径

## 非目标

- 不做手动书签（用户可以随时点划线跳回，已经够用；历史记忆点是自动产生的，
  不需要用户主动操作）
- 不做"阅读时长/阅读天数"这类统计仪表盘，只解决"跳回去"这一个问题
- 不做多设备同步冲突处理（v1 单用户单会话，这次不引入）
- 每次翻页都上报不算新的历史记忆点——按阅读时段聚合，避免列表被刷屏

## 决策记录

以下决策均经用户逐项确认：

| 决策点 | 选择 | 理由 |
|---|---|---|
| 记录范围 | **单本书内多点 + 书架多本书排序，两个都要** | 是两个独立但共享数据基础的问题，一起做不多花成本 |
| 单本书内记几条怎么触发 | **按阅读时段**：距上次上报超过 30 分钟才算新时段，记一条 | 每次翻页都记会刷屏；这个阈值能区分"连续阅读中"和"隔了一段时间又回来" |
| 单本书内展示方式 | **进度条+节点（在上）+ 文字列表（在下）合并版** | 进度条给整体感，列表给具体日期/章节/百分比，二者数据同源 |
| 书架排序 | **整体按最近打开时间重排，不加新 UI 区块** | 比单独做"继续阅读"区块改动小，效果类似 |

## 数据模型变更

### `Book` 新增字段

```python
last_opened_at: datetime | None = None   # 每次上报阅读位置都刷新，书架排序用
last_chapter: str | None = None           # 当前阅读位置的章节标题
last_progress: int | None = None          # 当前阅读位置的全书进度（0-100）
```

`last_cfi` 保持不变，仍是"重开自动跳回"用的那个值。新增两个字段是为了让
侧栏"现在"这一条不用额外算一次进度——`save_position` 已经在算，存下来复用。

### 新表 `ReadingCheckpoint`

```python
class ReadingCheckpoint(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    book_id: int = Field(foreign_key="book.id", index=True)
    cfi: str
    chapter: str | None = None
    progress: int | None = None
    created_at: datetime = Field(default_factory=utcnow)
```

每本书最多保留最近 **5 条**，插入新记录后如果超过 5 条，删掉最旧的
（按 `created_at` 排序淘汰）。5 条是够看又不至于让列表变长的经验值，
写死在 `backend/core/reading.py` 里，不做成配置项——这不是需要按环境
调整的东西。

### 新增配置

`backend/settings.py` 加 `reading_session_gap_minutes: int = 30`。
选 30 分钟：短于这个通常是"翻了几页又划走了"，不算真的离开；
长于这个基本可以确定是另一次坐下来读书。

## 记录时机（核心逻辑）

`backend/core/reading.py` 新增：

```python
def record_position(
    session: Session, book: Book, *, cfi: str, chapter: str | None, progress: int,
) -> None:
    """上报阅读位置。如果距上次上报超过 session_gap，先把「上一段停留的位置」
    存成一条历史记忆点，再覆盖 Book 上的当前位置。"""
    settings = get_settings()
    now = utcnow()
    gap = timedelta(minutes=settings.reading_session_gap_minutes)

    if book.last_opened_at and book.last_cfi and (now - book.last_opened_at) > gap:
        session.add(
            ReadingCheckpoint(
                book_id=book.id,
                cfi=book.last_cfi,
                chapter=book.last_chapter,
                progress=book.last_progress,
                created_at=book.last_opened_at,  # 时间戳用「那段结束时」，不是现在
            )
        )
        _trim_checkpoints(session, book.id, keep=5)

    book.last_cfi = cfi
    book.last_chapter = chapter
    book.last_progress = progress
    book.last_opened_at = now
    session.add(book)
    session.commit()
```

`_trim_checkpoints`：查出该 `book_id` 的全部记录按 `created_at` 降序，
第 6 条及以后全部删除。

**边界情况**：
- 第一次打开一本书（`last_opened_at` 为 `None`）：不会触发记录检查点
  （`if book.last_opened_at and ...` 短路），直接写入当前位置。符合预期——
  没有"上一段"可言。
- 同一时段内连续翻页：每次都进 `record_position`，但 gap 判断为假，
  只更新 `last_cfi/last_chapter/last_progress/last_opened_at`，不产生新纪录。
  `last_opened_at` 会跟着每次翻页刷新，这是有意的——它代表"最后一次有动作
  的时间"，是判断"这段阅读是否已经结束"的基准。

## 接口变更

### `POST /api/books/{book_id}/position`

请求体从只有 `cfi` 扩展为：

```python
class PositionIn(BaseModel):
    cfi: str = Field(min_length=1, max_length=500)
    chapter_index: int = Field(ge=0)
    fraction: float = Field(ge=0, le=1)
    chapter_title: str = Field(default="", max_length=200)
```

`chapter_index` + `fraction` 复用现有 `compute_progress()` 算全书进度——
和 `POST /books/{id}/progress`（划线时用）是同一个函数，不重复实现。
处理函数改为调用 `record_position`。

### `BookOut` 新增字段

```python
last_chapter: str | None
last_progress: int | None
last_opened_at: str | None  # ISO 格式，前端判断展示用
```

### 新增 `GET /api/books/{book_id}/checkpoints`

```python
class CheckpointOut(BaseModel):
    cfi: str
    chapter: str | None
    progress: int | None
    created_at: str
```

返回该书最近的历史记忆点，按 `created_at` 降序（最近的在前），最多 5 条。
不包含"现在"这一条——"现在"的数据已经在 `BookOut` 里，前端合并展示，
不用这个接口多返回一次。

### `GET /api/books` 排序规则

```sql
ORDER BY (last_opened_at IS NOT NULL) DESC, last_opened_at DESC, created_at DESC
```

开过的书按最近打开时间排在前面；从没打开过阅读器的书（比如刚上传、
还没点开读）按上传时间排在后面，保持原有顺序不打乱。

## 前端改动

### `BookView.tsx`

`onPositionChange` 签名从 `(cfi: string) => void` 扩展为
`(info: { cfi: string; chapterIndex: number; fraction: number; chapterTitle: string }) => void`。

取值逻辑和 `selected` 事件里已有的"算章节索引/页码比例/章节标题"是同一段代码，
抽成一个共享的 `currentLocationInfo(rendition)` 函数，两处调用，不重复写。

### `Reader.tsx`

侧栏"划线"标题上方新增一个区块（复用 `MaterialList` 相邻的视觉语言：
卡片、点击跳转、hover 高亮）：

- 进度条：细线 + 节点，历史记忆点用空心圆点，当前位置用实心琥珀色圆点
  （和视频里的 `accent` 色一致），位置按 `progress` 百分比映射到横轴
- 下方文字列表：当前位置一条（高亮样式）+ 最近的历史记忆点若干条
  （从新接口拿），每条显示"相对时间或日期 · 章节 · 进度%"，点击调
  `bookRef.current?.goto(cfi)`
- 没有历史记忆点时（新书或还没触发过时段切换）只显示"现在"这一条，
  不显示空的进度条节点

### `Shelf.tsx`

不改 UI 结构，`listBooks()` 返回顺序已经是排好的，列表按新顺序渲染即可。

## 验证方式

1. 造两条时间戳相差超过 30 分钟的位置上报（测试里直接控制
   `book.last_opened_at`），确认第二次上报后 `ReadingCheckpoint` 表新增一条，
   且记的是**第一次**上报的位置，不是第二次的
2. 连续多次上报（间隔小于 30 分钟），确认不产生新的 `ReadingCheckpoint`，
   只有 `Book.last_cfi` 等字段被更新
3. 插入第 6 条历史记忆点，确认最旧的一条被删除，表里始终 ≤ 5 条
4. 一本从没打开过阅读器的书：`GET /api/books` 里排序位置符合"未开过的书
   按上传时间排在最后"
5. 前端点历史记忆点列表里的某一条，确认阅读器跳转到对应 CFI

## 风险

- **30 分钟阈值可能不适合所有人的阅读习惯**（比如通勤读者习惯性中断
  又继续）。已接受——这是个经验值，不做成用户可调的设置项（v1 没有
  设置页面，加一个配置项换来的复杂度不值得），后续如果实测觉得不合适，
  改配置文件里的默认值即可，不需要动数据结构。
- **`record_position` 在 `save_position` 端点里做了「查+比较+可能插入」
  三步，不是原子操作**：v1 单用户单会话，并发写入的概率极低，
  暂不加锁；如果以后支持多设备同时读同一本书，需要重新评估。
