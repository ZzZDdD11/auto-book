import pytest
from pydantic import ValidationError

from backend.settings import Settings


def test_settings_requires_api_key(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_settings_reads_api_key_from_env(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test-123")
    s = Settings(_env_file=None)
    assert s.deepseek_api_key.get_secret_value() == "sk-test-123"
    # 密钥不能出现在 repr / str 里，防止日志泄露
    assert "sk-test-123" not in repr(s)


def test_storage_paths_are_absolute(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test-123")
    s = Settings(_env_file=None)
    assert s.storage_dir.is_absolute()
    assert s.video_dir.is_absolute()
