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

    tts_voice: str = "zh-CN-YunxiNeural"

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
