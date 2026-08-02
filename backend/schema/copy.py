from pydantic import BaseModel, Field


class PlatformVariant(BaseModel):
    title: str = Field(min_length=1, max_length=60)
    # 上限放宽到 1200：公众号长文目标 500-800 字，但配图占位标记
    # `[图: 卡i 标签]` 也占字数，留一点余量避免刚好顶到上限被截断。
    body: str = Field(min_length=1, max_length=1200)
    tags: list[str] = Field(min_length=1, max_length=10)


class PlatformCopy(BaseModel):
    douyin: PlatformVariant
    xiaohongshu: PlatformVariant
    shipinhao: PlatformVariant
    gongzhonghao: PlatformVariant
