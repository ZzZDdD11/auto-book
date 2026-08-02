"""五帧脚本 → 三平台文案。

三个平台不是同一份文案换个字：
  抖音   —— 短、直接、第一句就是钩子
  小红书 —— 有人味、可以碎、话题标签多
  视频号 —— 稳一点、完整句子、少网络用语
"""

from backend.core.deepseek import DeepSeekClient
from backend.schema.copy import PlatformCopy
from backend.schema.frames import Script

COPY_SYSTEM_PROMPT = """你在给一条读书类竖屏短视频写发布文案。同一条视频要发到三个平台，语气不同。

返回一个 JSON 对象，结构如下：

{
  "douyin": {"title": "...", "body": "...", "tags": ["..."]},
  "xiaohongshu": {"title": "...", "body": "...", "tags": ["..."]},
  "shipinhao": {"title": "...", "body": "...", "tags": ["..."]}
}

各平台要求：
- douyin（抖音）：title 不超过 20 字，第一句就要是钩子。body 100 字内，短句为主。tags 3 到 5 个。
- xiaohongshu（小红书）：title 不超过 20 字，可以带一点情绪。body 200 到 400 字，允许分行、允许口语碎句，像在跟朋友说话。tags 6 到 10 个，要包含具体的书名和领域词。
- shipinhao（视频号）：title 不超过 24 字，语气稳重。body 150 字内，完整句子，少用网络流行语和缩写。tags 3 到 5 个。

通用规则：
- tags 不要带 # 号，只写词。
- 全部简体中文。
- **不要编造**视频里没有的内容、数据或引文。文案只能基于给你的脚本。
- **数字必须照抄**。「今年第几本」只能用我给你的那个数，不许自己写「第1本」这类猜测。
  如果不确定，就不要在文案里提第几本。
- 不要写「点赞关注」「双击666」这类拉互动的套话。
- 突出「这是我自己的读书想法」，不要写成书籍推荐或内容摘要。"""


def build_copy_prompt(script: Script) -> str:
    return "\n".join(
        [
            f"书名：{script.book_title}",
            f"作者：{script.book_author or '未提供'}",
            f"这是今年第 {script.book_index} 本",
            "",
            f"视频钩子：{' / '.join(script.hook.lines)}",
            f"原文金句：{script.quote.text}",
            f"作者观点：{'；'.join(p.text for p in script.breakdown.points)}",
            f"我的想法：{script.my_take.text}",
            f"结尾提问：{script.outro.question}",
        ]
    )


async def generate_copy(script: Script, client: DeepSeekClient) -> tuple[PlatformCopy, int]:
    return await client.complete_json(
        COPY_SYSTEM_PROMPT,
        build_copy_prompt(script),
        PlatformCopy,
    )
