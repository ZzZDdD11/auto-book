from pydantic import BaseModel, Field


class PlatformVariant(BaseModel):
    title: str = Field(min_length=1, max_length=60)
    body: str = Field(min_length=1, max_length=1000)
    tags: list[str] = Field(min_length=1, max_length=10)


class PlatformCopy(BaseModel):
    douyin: PlatformVariant
    xiaohongshu: PlatformVariant
    shipinhao: PlatformVariant
