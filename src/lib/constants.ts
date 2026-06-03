// ============================================================
// TransFlow — Constants
// ============================================================

import type { Language, ToneHint } from './types';

// ---------- 核心语言列表（Phase 1: 15 种）----------
// 按「中国用户常见场景」排序

export const LANGUAGES: Language[] = [
  { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '中文（简体）' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', nativeName: '中文（繁體）' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
];

/** 自动检测的虚拟语言代码 */
export const AUTO_DETECT = 'auto';

/** 从语言列表中获取 code → Language 的映射 */
export function getLanguageByCode(code: string): Language | undefined {
  return LANGUAGES.find((l) => l.code === code);
}

/** 快捷目标语言（弹窗中放按钮的） */
export const QUICK_TARGET_LANGS = ['zh-CN', 'en', 'ja'];

// ---------- 翻译语气标签 ----------

export const TONE_LABELS: Record<ToneHint, string> = {
  auto: '自动判断',
  technical: '技术文档',
  literary: '文学内容',
  casual: '日常对话',
  precise: 'UI 文本',
};

// ---------- TreeWalker 跳过清单（穷举，不写「等」字）----------

/** 代码相关 — 不应翻译 */
export const SKIP_CODE_TAGS = new Set(['CODE', 'PRE', 'KBD', 'SAMP', 'VAR']);

/** 表单 — 翻译会篡改用户输入 */
export const SKIP_FORM_TAGS = new Set(['INPUT', 'TEXTAREA']);

/** 媒体 — 无自然语言文本或翻译会破坏渲染 */
export const SKIP_MEDIA_TAGS = new Set(['SVG', 'MATH', 'CANVAS']);

/** 元数据 — 非用户可见内容 */
export const SKIP_META_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);

/** 所有应该跳过的标签 */
export const ALL_SKIP_TAGS = new Set([
  ...SKIP_CODE_TAGS,
  ...SKIP_FORM_TAGS,
  ...SKIP_MEDIA_TAGS,
  ...SKIP_META_TAGS,
]);

/** 判断标签是否应该跳过 */
export function isSkippableTag(tagName: string): boolean {
  return ALL_SKIP_TAGS.has(tagName.toUpperCase());
}

// ---------- 缓存配额 ----------

/** chrome.storage.session 配额上限 */
export const SESSION_QUOTA = 10 * 1024 * 1024; // 10MB

/** 触发 LRU 淘汰的高水位（80%） */
export const SESSION_HIGH_WATER = 0.8;

/** L1 Map 最大条目数 */
export const L1_MAX_ENTRIES = 5_000;

/** 缓存过期天数 */
export const CACHE_TTL_DAYS = 30;
