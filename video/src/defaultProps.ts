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
      "durationInFrames": 90,
      "data": {
        "narration": "",
        "lines": [
          "你不是",
          "不够自律"
        ],
        "highlight": "只是环境太顺手",
        "book_title": "原子习惯",
        "book_author": "James Clear",
        "book_index": 7,
        "year": 2026
      },
      "audioSrc": null,
      "captions": []
    },
    {
      "kind": "quote",
      "durationInFrames": 140,
      "data": {
        "narration": "环境，是塑造人类行为看不见的手。",
        "text": "环境是塑造人类行为看不见的手。",
        "chapter": "第 12 章",
        "highlighted_at": "2026-08-01",
        "progress": 43,
        "book_title": "原子习惯",
        "book_author": "James Clear",
        "book_index": 7,
        "year": 2026
      },
      "audioSrc": null,
      "captions": [
        {
          "text": "环境",
          "startS": 0.1,
          "endS": 0.6857142857142857
        },
        {
          "text": "是塑造人类行为看不见的手",
          "startS": 0.6857142857142857,
          "endS": 4.2
        }
      ]
    },
    {
      "kind": "breakdown",
      "durationInFrames": 299,
      "data": {
        "narration": "作者的核心主张是，意志力是消耗品，环境才是常量。",
        "kicker": "作者的意思是",
        "points": [
          "意志力是消耗品，环境是常量",
          "把手机放进抽屉，比下决心有效"
        ],
        "book_title": "原子习惯",
        "book_author": "James Clear",
        "book_index": 7,
        "year": 2026
      },
      "audioSrc": null,
      "captions": [
        {
          "text": "作者的核心主张是",
          "startS": 0.1,
          "endS": 3.680952380952381
        },
        {
          "text": "意志力是消耗品",
          "startS": 3.680952380952381,
          "endS": 6.814285714285715
        },
        {
          "text": "环境才是常量",
          "startS": 6.814285714285715,
          "endS": 9.5
        }
      ]
    },
    {
      "kind": "my_take",
      "durationInFrames": 284,
      "data": {
        "narration": "但我觉得环境论有个漏洞，改环境本身也要意志力。",
        "kicker": "但我不完全同意",
        "text": "改环境本身也要意志力。我试过把手机锁进抽屉，第三天就自己拿出来了。",
        "book_title": "原子习惯",
        "book_author": "James Clear",
        "book_index": 7,
        "year": 2026
      },
      "audioSrc": null,
      "captions": [
        {
          "text": "但我觉得环境论有个漏洞",
          "startS": 0.1,
          "endS": 4.761904761904762
        },
        {
          "text": "改环境本身也要意志力",
          "startS": 4.761904761904762,
          "endS": 9.0
        }
      ]
    },
    {
      "kind": "outro",
      "durationInFrames": 110,
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
      "audioSrc": null,
      "captions": [
        {
          "text": "你有过改环境失败的时刻吗",
          "startS": 0.1,
          "endS": 3.2
        }
      ]
    }
  ],
  "bgmSrc": null,
  "bgmVolume": 0.12
};
