"""DeepSeek 客户端。只做一件事：发 prompt，拿回校验过的 JSON。

业务 prompt 不在这里，在 script.py 和 copywrite.py。
"""

import json
import re
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError

T = TypeVar("T", bound=BaseModel)

_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.IGNORECASE)


class DeepSeekError(RuntimeError):
    """调用失败。错误信息里绝不包含密钥。"""


class DeepSeekClient:
    def __init__(self, api_key: str, base_url: str, model: str = "deepseek-chat"):
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._model = model

    async def complete_json(
        self,
        system_prompt: str,
        user_prompt: str,
        model_cls: type[T],
        temperature: float = 0.7,
    ) -> tuple[T, int]:
        """返回 (解析好的模型, 消耗 token 数)。"""
        body = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
            "response_format": {"type": "json_object"},
        }
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(
                    f"{self._base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    json=body,
                )
        except httpx.HTTPError as exc:
            raise DeepSeekError(f"请求 DeepSeek 失败：{type(exc).__name__}") from None

        if resp.status_code != 200:
            # 只带状态码，不回显请求内容，避免密钥或素材进日志
            raise DeepSeekError(f"DeepSeek 返回 {resp.status_code}")

        try:
            payload = resp.json()
            content = payload["choices"][0]["message"]["content"]
            tokens = int(payload.get("usage", {}).get("total_tokens", 0))
        except (KeyError, IndexError, ValueError):
            raise DeepSeekError("DeepSeek 响应结构异常") from None

        cleaned = _FENCE.sub("", content).strip()
        try:
            raw = json.loads(cleaned)
        except json.JSONDecodeError:
            raise DeepSeekError(f"返回内容不是合法 JSON：{cleaned[:120]}") from None

        try:
            return model_cls.model_validate(raw), tokens
        except ValidationError as exc:
            raise DeepSeekError(f"返回内容不符合预期结构：{exc.errors()[:3]}") from None
