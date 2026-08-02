/* 由 scripts/gen_types.py 生成，不要手改 */

import type { CoverProps } from "./Cover";
import type { RenderPayload } from "./types";

/** 供 remotion studio 预览用的假数据。渲染时会被 --props 覆盖。 */
export const defaultProps: RenderPayload = {
  "fps": 30,
  "width": 1080,
  "height": 1920,
  "theme": {
    "ink": "#12100e",
    "paper": "#f4f1ec",
    "accent": "#e8b84b",
    "takeBg": "#0f2a24",
    "takeAccent": "#4fd1a5"
  },
  "frames": [
    {
      "kind": "hook",
      "durationInFrames": 104,
      "data": {
        "narration": "",
        "lines": [
          "你不是",
          "不够自律"
        ],
        "highlight": "不够自律",
        "book_title": "原子习惯",
        "book_author": "James Clear",
        "book_index": 7,
        "year": 2026
      },
      "index": 0,
      "total": 5,
      "audioSrc": null,
      "captions": []
    },
    {
      "kind": "quote",
      "durationInFrames": 104,
      "data": {
        "narration": "环境，是塑造人类行为看不见的手。",
        "text": "环境是塑造人类行为看不见的手。",
        "chapter": "第 12 章",
        "highlighted_at": "2026-08-02",
        "progress": 43,
        "book_title": "原子习惯",
        "book_author": "James Clear",
        "book_index": 7,
        "year": 2026
      },
      "index": 1,
      "total": 5,
      "audioSrc": null,
      "captions": []
    },
    {
      "kind": "breakdown",
      "durationInFrames": 104,
      "data": {
        "narration": "作者的核心主张是，意志力是消耗品，环境才是常量。",
        "kicker": "作者的意思是",
        "points": [
          {
            "text": "意志力是消耗品，环境是常量",
            "evidence": "环境是塑造人类行为看不见的手"
          },
          {
            "text": "把手机放进抽屉，比下决心有效",
            "evidence": null
          }
        ],
        "book_title": "原子习惯",
        "book_author": "James Clear",
        "book_index": 7,
        "year": 2026
      },
      "index": 2,
      "total": 5,
      "audioSrc": null,
      "captions": []
    },
    {
      "kind": "my_take",
      "durationInFrames": 104,
      "data": {
        "narration": "但我觉得环境论有个漏洞，改环境本身也要意志力。",
        "kicker": "但我不完全同意",
        "text": "改环境本身也要意志力。我试过把手机锁进抽屉，第三天就自己拿出来了。",
        "book_title": "原子习惯",
        "book_author": "James Clear",
        "book_index": 7,
        "year": 2026
      },
      "index": 3,
      "total": 5,
      "audioSrc": null,
      "captions": []
    },
    {
      "kind": "outro",
      "durationInFrames": 104,
      "data": {
        "narration": "你有过改环境失败的时刻吗？",
        "question": "你有过改环境失败的时刻吗？",
        "footer_lines": [
          "我在读第 7 本书",
          "把想法记下来，做成视频"
        ],
        "book_title": "原子习惯",
        "book_author": "James Clear",
        "book_index": 7,
        "year": 2026
      },
      "index": 4,
      "total": 5,
      "audioSrc": null,
      "captions": []
    }
  ],
  "bgmSrc": null,
  "bgmVolume": 0.1,
  "bgmVolumeSolo": 0.26,
  "bgmFadeOutS": 2.0
};

/** 封面预览假数据。 */
export const coverDefaultProps: CoverProps = {
  "lines": [
    "你不是",
    "不够自律"
  ],
  "highlight": "不够自律",
  "bookTitle": "原子习惯",
  "bookAuthor": "James Clear",
  "bookIndex": 7,
  "year": 2026,
  "progress": 43
};
