# 小红书图文卡片与公众号长文

日期：2026-08-02
状态：已确认，待实现

## 背景

现有流水线只产出一条竖屏视频 + 三平台"配这条视频"的短文案（抖音/小红书/视频号）。
但小红书的读书类内容推荐机制明显偏图文笔记，公众号本身就是图文媒介——
两个平台真正需要的是能独立成立的图文内容，不是视频的文字说明。上一版
《视频信息密度与封面产出》spec 里把"图文卡片这一整条产物线"列为非目标，
是因为当时范围会失控；现在单独立项，那条非目标在此撤销。

好消息是不需要新建内容管线：五帧脚本（hook/quote/breakdown/my_take/outro）
本身就是完整的图文素材，只是目前只喂给了 Remotion 渲成视频帧。复用
`Cover.tsx` 已验证的模式（同一份 Script 数据，换一个排版组件渲成静态图）即可。

## 目标

- 小红书图集：每个 job 产出一组 3:4 静态卡片，视觉语言延续 `Cover.tsx` /
  头像的"大字金句"风格（ink/paper/accent 品牌色，不新造配色）
- 卡片张数跟脚本走：hook + quote + breakdown 每个论点各一张 + my_take +
  outro，不固定张数
- 公众号长文：`PlatformCopy` 新增 `gongzhonghao` 字段，500~800 字，
  文中用 `[图: 卡{i} {标签}]` 占位标记标注配图位置，标记引用的卡片必须
  和实际生成的卡片一一对应

## 非目标

- 不做"自动发布"——三个平台都没有开放的图文/文章发布 API，或有 API 但
  风控风险高于收益（沿用 README 里"发布是手动的"这条既有结论）
- 不给图集卡片做逐帧的 AI 文案（复用 Script 已有文字，零额外 AI 成本，
  和封面的既有原则一致）
- 不改视频渲染、TTS、字幕、BGM 任何现有链路
- 不做卡片的"自定义排版"编辑器（v1 只出图，改内容靠改脚本重新出图，
  跟封面现在的方式一样）

## 决策记录

以下决策均经用户逐项确认：

| 决策点 | 选择 | 理由 |
|---|---|---|
| 本次范围 | **图集卡片 + 公众号长文一起做** | 两者共享同一套"卡片规格"数据，拆开做反而要多同步一次 |
| 图集张数 | **跟脚本走**（hook+quote+N个论点+my_take+outro） | 论点数本就不固定（2~3），砍成固定张数等于砍内容 |
| 卡片视觉 | **大字金句风**（延续 Cover/Avatar） | 与已建立的品牌视觉语言一致，观众刷到认得出是同一账号 |
| 卡片尺寸 | **3:4**（1080×1440） | 小红书官方推荐比例，首图不易被裁切；公众号那边这张图也能直接用，不追求两边都完美 |
| 公众号配图方式 | **文中标注占位标记** `[图: 卡i 标签]` | 用户复制到公众号编辑器时照标记插图，比纯文字少一道"自己判断插哪"的麻烦 |
| 组件方案 | **一个 Card 组件 + kind 分支**，非五个独立组件 | 张数不固定这个核心问题两个方案都要用"循环调用"解决，多建组件不解决问题，只加代码量 |

## 真源变更

`backend/schema/frames.py`（Script 结构）本次**不改**——图文卡片是消费方，
不产生新的脚本字段。改动集中在两处：

### 新增：backend/core/card.py

```python
@dataclass(frozen=True)
class CardSpec:
    index: int          # 0 起，图集里的顺序
    kind: str           # hook | quote | point | my_take | outro
    label: str           # 给公众号占位标记用的短标签，如"金句" "论点1"
    kicker: str          # 卡片小标题
    text: str            # 正文，自动换行
    highlight: str | None
    footer: str | None

def build_card_specs(script: Script) -> list[CardSpec]: ...
def render_cards(script: Script, out_dir: Path) -> dict[int, Path]: ...
```

`build_card_specs` 是纯函数，唯一真源——渲染图片和生成公众号占位标记
**都调这一个函数**，保证文案里引用的卡片和实际生成的卡片不会对不上。

映射表：

| kind | kicker | text | footer |
|---|---|---|---|
| hook | （空） | `hook.lines` 拼接 | 今年第几本（书名/作者已在顶部书名条，footer 不重复） |
| quote | 原文摘录 | `quote.text` | 第{chapter}章 · 读到{progress}% |
| point ×N | 作者的意思是 {i}/{N} | `point.text` | `point.evidence`（为 `None` 时留空） |
| my_take | 我的想法 | `my_take.text` | （空） |
| outro | 互动 | `outro.question` | `footer_lines` 拼接 |

### 新增：video/src/Card.tsx

单个 Remotion Still 组件，1080×1440 固定尺寸，`props` 为
`{ kind, kicker, text, highlight, footer, bookTitle, bookAuthor, index, total, theme }`。

内部按 `kind` 分支处理细节差异：
- `point`：`footer`（evidence）用小字引用块样式（左边一条竖线，参考现有
  Breakdown 帧的副文处理），突出"这是原文依据"
- 其余 kind：`footer` 就是普通小字
- `highlight` 存在时，在 `text` 中原样匹配一次并用 `accent` 色包裹
  （子串匹配失败就整段不高亮，不强行处理——护城河思路和 evidence 一致）

Root.tsx 只注册**一个** `Still id="Card"`；`render_cards` 循环调用
N 次（N = 4 + 论点数），每次单独一个 subprocess，和 `render_covers` 是
同一套安全写法（列表参数、`shell=False`、输出路径 resolve 后校验在
`out_dir` 内）。

### 修改：backend/schema/copy.py

```python
class PlatformCopy(BaseModel):
    douyin: PlatformVariant
    xiaohongshu: PlatformVariant
    shipinhao: PlatformVariant
    gongzhonghao: PlatformVariant   # 新增，body 上限放宽到 1200 字
```

### 修改：backend/core/copywrite.py

`build_copy_prompt` 额外传入 `build_card_specs(script)` 算出的
`(index, label)` 列表；`COPY_SYSTEM_PROMPT` 新增公众号规则：

- `gongzhonghao.body` 500~800 字，是一篇能独立读完的文章（不是短文案），
  结构大致是"引子（可用 quote）→ 拆解（用 breakdown 论点）→ 我的想法 → 收尾提问"
- 配图占位符格式固定为 `[图: 卡{i} {label}]`，`i` 从传入的卡片列表里选，
  不能编号超出实际卡片数量，也不能跳过某一张不给
- 其余通用规则（数字照抄、不编造、不写"点赞关注"）与现有三平台一致

## 流水线接线

挂在 `run_rendering` 阶段，紧跟 `make_covers` 之后：

```python
try:
    cards = make_cards(script, work_dir / "cards")
except Exception as exc:
    cards = {}
    job.error = f"图文卡片生成失败（视频正常）：{type(exc).__name__}: {exc}"[:1000]
for index, path in cards.items():
    session.add(Asset(job_id=job.id, kind=f"card:{index}", path=str(path), version=version))
```

独立 try/except，不影响封面和视频——三者都是"失败不影响出片"的附加产物，
互不连带。

`run_copywriting` 阶段调 `build_copy_prompt` 时，多传一份
`build_card_specs(script)` 的 `(index, label)` 列表（不查 Asset 表，
直接从 script 算，因为这个列表本就是 script 的纯函数）。

## 接口与前端

### 新增下载接口

`GET /api/jobs/{job_id}/card/{index}`

- `index` 只做整型校验 + 查 DB 是否存在这个 `kind=f"card:{index}"` 的
  Asset 行，不存在就 404——不直接拼文件路径，路径始终来自 DB 里存的
  `Asset.path`，和现有 `/cover/{ratio}` 接口同一套安全模式
- 支持 `?version=` 查历史版本，逻辑照抄 `download_cover`

### JobOut 新增字段

```python
card_count: int = 0   # 已产出的卡片总数，前端据此生成下载链接列表
```

### 前端改动

- `web/src/api.ts`：加 `card_count` 字段、`downloadCardUrl(jobId, index)` helper
- `web/src/components/JobPanel.tsx`：
  - "封面"区块下面加"图文卡片"区块，横向平铺卡片下载入口（复用封面
    区块现有样式，不新起一套 UI）
  - 文案编辑区的标签导航（douyin/xiaohongshu/shipinhao）加第四个
    "公众号" 标签，复用现有 `PlatformVariant` 编辑表单组件

## 验证方式

1. 用真实脚本（含 2 个论点和 3 个论点两种情况）各跑一次，确认图集
   张数分别是 6 张和 7 张，且顺序是 hook→quote→point1→point2→(point3)→
   my_take→outro
2. 肉眼抽检 point 卡的 evidence 为 `None` 时，footer 区域不留空占位
   （和 Breakdown 帧现有的处理方式一致）
3. 公众号长文里的每一个 `[图: 卡i ...]` 标记，`i` 都能在当次生成的卡片
   里找到对应文件——写一个简单断言：解析文案里的标记编号集合，必须是
   实际卡片 index 集合的子集
4. 故意造一个 evidence 里含特殊字符（引号、换行）的论点，确认 Card.tsx
   的子串高亮匹配失败时优雅降级（不高亮，不报错，不崩渲染）
5. 图集卡片和公众号长文各自的生成失败，都不能导致 job 整体失败
   （video 和 copy_json 仍应正常产出）

## 风险

- **公众号占位标记的编号和实际卡片对不上**：如果 AI 没照着传入的卡片
  列表编号，会生成引用不存在卡片的标记。缓解：prompt 里把可用编号列表
  写死给它选，而不是让它自己数；验证方式第 3 条兜底检测这个问题，
  长期看如果实测频繁出错，需要在代码层做一次后处理校验（类似 evidence
  的子串校验思路），本次先不做，等有真实失败样本再决定要不要加。
- **卡片张数随论点数浮动，小红书图集张数体验不统一**：2 个论点是 6 张，
  3 个论点是 7 张。已接受——张数跟着内容走比强行拉齐更符合"不编造"的
  既有原则。
- **`highlight` 子串匹配失败**（AI 给的 highlight 不是 text 的严格子串）：
  和现有 hook 帧的 `check_highlight` 是同一类问题，选择整段不高亮而不是
  报错，风险可控，观感上只是少一处强调色。
