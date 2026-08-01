import os

# settings 用了 lru_cache，必须在任何 backend 模块被 import 之前设好，
# 否则第一次 get_settings() 会因为缺少密钥直接抛错。
os.environ.setdefault("DEEPSEEK_API_KEY", "sk-test-placeholder")
