from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """全部配置。密钥只从环境变量读，代码里没有任何默认值。"""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    deepseek_api_key: SecretStr
    deepseek_base_url: str = "https://api.deepseek.com"
    # 可用模型见 GET /models。deepseek-v4-flash 快且便宜，pro 更强更贵。
    deepseek_model: str = "deepseek-v4-flash"

    # 配音音色。可用的中文音色只有 8 个，实测人格标签：
    #   YunyangNeural  男 Professional/Reliable —— 播报腔，浑厚稳重
    #   XiaoxiaoNeural 女 Warm                 —— 温暖，主流书评女声
    #   YunxiNeural    男 Lively/Sunshine      —— 活泼少年音，念读书感悟违和
    # 换音色跑 `.venv/bin/python scripts/preview_voice.py` 先试听。
    tts_voice: str = "zh-CN-YunyangNeural"

    # ---- 背景音乐 ----
    # 相对 video/public/ 的路径，由 scripts/make_bgm.py 合成。
    # 刻意不用现成音乐：音乐版权是短视频平台自动检测的重点，
    # 会直接消音或限流，风险比引用书籍原文高得多。
    bgm_src: str | None = "bgm/ink.mp3"
    # 有人声时的音量。0.10 约等于 -20dB，人声之下清晰可辨但不抢。
    bgm_volume: float = 0.10
    # 无人声帧（钩子）的音量。没人声时音乐要撑住画面，否则开头发空。
    bgm_volume_solo: float = 0.26

    fps: int = 30
    # 每帧配音结束后的留白，避免切帧太急
    frame_padding_s: float = 0.45
    # 无配音帧（钩子）的固定时长
    silent_frame_s: float = 3.0

    storage_dir: Path = PROJECT_ROOT / "storage"
    video_dir: Path = PROJECT_ROOT / "video"

    # v1 单用户，固定 1；表结构已预留多用户
    default_user_id: int = 1

    # 素材文本长度上限，防止超长输入打爆 AI 调用与渲染
    max_material_chars: int = 4000

    render_timeout_s: int = 600
    # 单张封面的渲染超时。静图比视频快得多，给 120 秒足够。
    cover_timeout_s: int = 120

    # ---- EPUB 上传 ----
    # EPUB 是用户上传的不可信 ZIP，下面几个上限用来防 zip bomb。
    max_epub_bytes: int = 80 * 1024 * 1024
    max_epub_entries: int = 5000
    max_epub_uncompressed_bytes: int = 400 * 1024 * 1024

    @property
    def epub_dir(self) -> Path:
        return self.storage_dir / "epubs"

    @property
    def cover_dir(self) -> Path:
        return self.storage_dir / "covers"


@lru_cache
def get_settings() -> Settings:
    return Settings()
