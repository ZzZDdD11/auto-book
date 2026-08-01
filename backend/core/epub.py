"""EPUB 解包、校验、抽元数据、算字数。纯函数，不依赖 HTTP 层。

安全前提：EPUB 是用户上传的不可信 ZIP 文件。这个模块假定输入是恶意的：
  - 校验 magic bytes，不信任扩展名和 MIME
  - 限制条目数与解压后总体积，防 zip bomb
  - 解析 XML 时禁用外部实体，防 XXE
  - 落盘文件名由 sha256 生成，绝不使用客户端提供的 filename
"""

import hashlib
import zipfile
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
from xml.etree.ElementTree import Element, ParseError

# EPUB 里的 OPF/NCX/XHTML 都是用户可控的 XML，必须用 defusedxml 解析。
# 它会拒绝外部实体、实体展开炸弹、DTD 攻击等一整类问题。
from defusedxml.ElementTree import fromstring as safe_fromstring

from backend.settings import get_settings

# ZIP 的 magic bytes。EPUB 本质是 ZIP。
_ZIP_MAGIC = b"PK\x03\x04"

# EPUB 规范要求第一个条目是 mimetype，内容为固定字符串
_EPUB_MIMETYPE = b"application/epub+zip"

_NS = {
    "opf": "http://www.idpf.org/2007/opf",
    "dc": "http://purl.org/dc/elements/1.1/",
    "container": "urn:oasis:names:tc:opendocument:xmlns:container",
    "ncx": "http://www.daisy.org/z3986/2005/ncx/",
    "xhtml": "http://www.w3.org/1999/xhtml",
    "epub": "http://www.idpf.org/2007/ops",
}


class EpubError(ValueError):
    """EPUB 不合法或超出限制。消息可直接展示给用户。"""


@dataclass(frozen=True)
class Chapter:
    """一个 spine 章节。

    char_offset 是本章第一个字在全书中的累计位置，
    用来把「章节内进度」换算成「全书进度」。
    """

    index: int
    href: str
    title: str
    char_count: int
    char_offset: int


@dataclass(frozen=True)
class EpubMeta:
    title: str
    author: str
    total_chars: int
    chapters: list[Chapter] = field(default_factory=list)
    cover_bytes: bytes | None = None
    cover_ext: str = ".jpg"


def _safe_xml(data: bytes) -> Element:
    """解析 XML。用 defusedxml，外部实体/实体炸弹/DTD 攻击都会被拒。"""
    try:
        return safe_fromstring(data)
    except ParseError as exc:
        raise EpubError(f"XML 解析失败：{exc}") from None
    except Exception as exc:
        # defusedxml 对恶意构造会抛它自己的异常类型（EntitiesForbidden 等）
        raise EpubError(f"XML 不安全或不合法：{type(exc).__name__}") from None


def _strip_tags(html: bytes) -> str:
    """从 XHTML 里取纯文本，只为统计字数，不用于展示。

    展示由前端 react-reader 在 sandbox iframe 里做，
    这里的输出绝不会被当作 HTML 渲染。
    """
    try:
        root = _safe_xml(html)
    except EpubError:
        # 有些 EPUB 的 XHTML 不合规，统计字数时容忍：退化为粗暴去标签
        text = html.decode("utf-8", errors="ignore")
        out: list[str] = []
        depth = 0
        for ch in text:
            if ch == "<":
                depth += 1
            elif ch == ">":
                depth = max(0, depth - 1)
            elif depth == 0:
                out.append(ch)
        return "".join(out)

    return "".join(root.itertext())


def _count_chars(text: str) -> int:
    """统计有效字符数，忽略所有空白。

    忽略空白是因为 EPUB 的 XHTML 缩进差异很大，
    带空白统计会让同一本书在不同排版下字数差出很多。
    """
    return sum(1 for c in text if not c.isspace())


def validate_and_hash(data: bytes) -> str:
    """校验是合法 EPUB 并返回 sha256。不合法则抛 EpubError。"""
    settings = get_settings()

    if len(data) > settings.max_epub_bytes:
        limit_mb = settings.max_epub_bytes // (1024 * 1024)
        raise EpubError(f"文件超过 {limit_mb} MB 上限")
    if not data.startswith(_ZIP_MAGIC):
        raise EpubError("不是有效的 EPUB 文件（缺少 ZIP 头）")

    try:
        with zipfile.ZipFile(BytesIO(data)) as zf:
            infos = zf.infolist()
            if len(infos) > settings.max_epub_entries:
                raise EpubError(f"压缩包条目数超过 {settings.max_epub_entries} 上限")

            total = sum(i.file_size for i in infos)
            if total > settings.max_epub_uncompressed_bytes:
                limit_mb = settings.max_epub_uncompressed_bytes // (1024 * 1024)
                raise EpubError(f"解压后体积超过 {limit_mb} MB 上限")

            names = zf.namelist()
            if "META-INF/container.xml" not in names:
                raise EpubError("缺少 META-INF/container.xml，不是有效的 EPUB")
            if "mimetype" in names:
                mime = zf.read("mimetype").strip()
                if mime and mime != _EPUB_MIMETYPE:
                    raise EpubError(f"mimetype 不是 EPUB：{mime[:40]!r}")
    except zipfile.BadZipFile:
        raise EpubError("压缩包已损坏，无法读取") from None

    return hashlib.sha256(data).hexdigest()


def _resolve(base: str, href: str) -> str:
    """把相对 href 解析成 ZIP 内的绝对路径。"""
    href = href.split("#", 1)[0]
    parts = base.split("/")[:-1] + href.split("/")
    stack: list[str] = []
    for p in parts:
        if p in ("", "."):
            continue
        if p == "..":
            if stack:
                stack.pop()
            continue
        stack.append(p)
    return "/".join(stack)


def _find_opf_path(zf: zipfile.ZipFile) -> str:
    root = _safe_xml(zf.read("META-INF/container.xml"))
    node = root.find(".//container:rootfile", _NS)
    if node is None or not node.get("full-path"):
        raise EpubError("container.xml 里找不到 OPF 路径")
    return node.get("full-path", "")


def _read_toc_titles(
    zf: zipfile.ZipFile, opf_path: str, opf: Element
) -> dict[str, str]:
    """从 NCX 或 nav 文档里取 {章节文件路径: 标题}。"""
    titles: dict[str, str] = {}
    names = set(zf.namelist())

    # EPUB 3 的 nav 文档
    for item in opf.findall(".//opf:manifest/opf:item", _NS):
        props = item.get("properties", "")
        if "nav" not in props.split():
            continue
        nav_path = _resolve(opf_path, item.get("href", ""))
        if nav_path not in names:
            continue
        try:
            nav = _safe_xml(zf.read(nav_path))
        except EpubError:
            continue
        for a in nav.iter():
            if not a.tag.endswith("}a") and a.tag != "a":
                continue
            href = a.get("href", "")
            text = "".join(a.itertext()).strip()
            if href and text:
                titles.setdefault(_resolve(nav_path, href), text)

    # EPUB 2 的 NCX
    if not titles:
        for item in opf.findall(".//opf:manifest/opf:item", _NS):
            if item.get("media-type") != "application/x-dtbncx+xml":
                continue
            ncx_path = _resolve(opf_path, item.get("href", ""))
            if ncx_path not in names:
                continue
            try:
                ncx = _safe_xml(zf.read(ncx_path))
            except EpubError:
                continue
            for nav_point in ncx.findall(".//ncx:navPoint", _NS):
                label = nav_point.find("./ncx:navLabel/ncx:text", _NS)
                content = nav_point.find("./ncx:content", _NS)
                if label is None or content is None:
                    continue
                text = (label.text or "").strip()
                src = content.get("src", "")
                if text and src:
                    titles.setdefault(_resolve(ncx_path, src), text)
    return titles


def _extract_cover(
    zf: zipfile.ZipFile, opf_path: str, opf: Element
) -> tuple[bytes | None, str]:
    names = set(zf.namelist())
    candidates: list[str] = []

    # EPUB 3：properties="cover-image"
    for item in opf.findall(".//opf:manifest/opf:item", _NS):
        if "cover-image" in item.get("properties", "").split():
            candidates.append(item.get("href", ""))

    # EPUB 2：<meta name="cover" content="item-id">
    if not candidates:
        for meta in opf.findall(".//opf:metadata/opf:meta", _NS):
            if meta.get("name") == "cover":
                cover_id = meta.get("content")
                for item in opf.findall(".//opf:manifest/opf:item", _NS):
                    if item.get("id") == cover_id:
                        candidates.append(item.get("href", ""))

    for href in candidates:
        path = _resolve(opf_path, href)
        if path in names:
            ext = Path(path).suffix.lower() or ".jpg"
            if ext in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
                return zf.read(path), ext
    return None, ".jpg"


def parse_epub(data: bytes) -> EpubMeta:
    """解析 EPUB，返回元数据、章节字数表、封面。

    调用前应先用 validate_and_hash 校验。
    """
    try:
        with zipfile.ZipFile(BytesIO(data)) as zf:
            opf_path = _find_opf_path(zf)
            names = set(zf.namelist())
            if opf_path not in names:
                raise EpubError(f"OPF 文件不存在：{opf_path}")
            opf = _safe_xml(zf.read(opf_path))

            title_node = opf.find(".//dc:title", _NS)
            author_node = opf.find(".//dc:creator", _NS)
            title = (title_node.text or "").strip() if title_node is not None else ""
            author = (author_node.text or "").strip() if author_node is not None else ""

            # manifest: id -> href
            id_to_href = {
                item.get("id", ""): item.get("href", "")
                for item in opf.findall(".//opf:manifest/opf:item", _NS)
            }
            toc_titles = _read_toc_titles(zf, opf_path, opf)

            chapters: list[Chapter] = []
            offset = 0
            for i, ref in enumerate(opf.findall(".//opf:spine/opf:itemref", _NS)):
                idref = ref.get("idref", "")
                href = id_to_href.get(idref, "")
                if not href:
                    continue
                path = _resolve(opf_path, href)
                if path not in names:
                    continue
                count = _count_chars(_strip_tags(zf.read(path)))
                chapters.append(
                    Chapter(
                        index=i,
                        href=href,
                        # QuoteFrame.chapter 限 30 字，这里就先截断
                        title=(toc_titles.get(path) or f"第 {i + 1} 节")[:30],
                        char_count=count,
                        char_offset=offset,
                    )
                )
                offset += count

            if not chapters:
                raise EpubError("EPUB 里没有可读章节")

            cover_bytes, cover_ext = _extract_cover(zf, opf_path, opf)

            return EpubMeta(
                title=title or "未命名",
                author=author,
                total_chars=offset,
                chapters=chapters,
                cover_bytes=cover_bytes,
                cover_ext=cover_ext,
            )
    except zipfile.BadZipFile:
        raise EpubError("压缩包已损坏，无法读取") from None


def compute_progress(
    chapters: list[Chapter], total_chars: int, chapter_index: int, fraction: float
) -> int:
    """把「第几章 + 章内比例」换算成全书百分比 0-100。

    epub.js 只能给出章节内的进度（fraction），拿不到全书页码，
    所以全书进度必须这样算出来。
    """
    if total_chars <= 0 or not chapters:
        return 0
    match = next((c for c in chapters if c.index == chapter_index), None)
    if match is None:
        match = chapters[min(max(chapter_index, 0), len(chapters) - 1)]
    fraction = min(max(fraction, 0.0), 1.0)
    absolute = match.char_offset + match.char_count * fraction
    return max(0, min(100, round(absolute / total_chars * 100)))
