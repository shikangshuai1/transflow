// ============================================================
// TransFlow — Core Type Definitions
// 接口锁死，所有模块对着这里写
// ============================================================

// ---------- Opaque type for API Key ----------
// 只有 Service Worker 能构造 ApiKey 实例
// Content Script 侧只能看到类型，拿不到实例
declare const API_KEY_BRAND: unique symbol;
export type ApiKey = string & { readonly [API_KEY_BRAND]: never };

// ---------- Content Script → 文本提取的元数据 ----------

export interface TextFragment {
  /** 原始文本内容 */
  text: string;
  /** DOM 元素元数据 */
  meta: TextFragmentMeta;
}

export interface TextFragmentMeta {
  /** HTML 标签名大写：'P' | 'BUTTON' | 'H1' | 'A' | 'SPAN' | 'INPUT' | ... */
  tagName: string;
  /** 是否为 input/textarea placeholder */
  isPlaceholder: boolean;
  /** 是否为 <a> 标签内的文本 */
  isLink: boolean;
  /** 祖先链：'BODY > DIV > ARTICLE > P'，辅助判断上下文 */
  ancestorChain: string;
  /** 文本字符数 */
  textLength: number;
  /** 是否检测到代码片段 */
  containsCode: boolean;
}

// ---------- 页面级上下文（Content Script 自动采集）----------

export interface PageContext {
  /** 当前页面 URL */
  url: string;
  /** <title> 内容 */
  title: string;
  /** <meta name="description"> 内容 */
  metaDescription?: string;
  /** <html lang="..."> 的值 */
  htmlLang?: string;
  /** OG:locale meta */
  ogLocale?: string;
  /** 从 URL/内容推断的领域类型 */
  inferredDomain?: PageDomain;
}

/** 页面领域类型 */
export type PageDomain = 'tech' | 'academic' | 'general';

// ---------- 翻译策略 ----------

/**
 * 翻译语气提示
 * - auto: 由引擎自动判断
 * - technical: 技术文档（保留变量名、不翻译代码块）
 * - literary: 文学内容（追求文采和语气传达）
 * - casual: 日常对话/社交媒体（口语化）
 * - precise: UI 短文本/按钮/菜单（精确、简短）
 */
export type ToneHint = 'auto' | 'technical' | 'literary' | 'casual' | 'precise';

export interface TranslationStrategy {
  /** 翻译语气 */
  tone: ToneHint;
  /** 是否保留 HTML/markdown 空白与换行 */
  preserveFormatting: boolean;
  /** 术语表（Phase 2） */
  glossary?: Record<string, string>;
}

// ---------- 翻译请求 ----------

export interface TranslateRequest {
  /** 待翻译的文本片段（携带元数据） */
  fragments: TextFragment[];
  /** 源语言，'auto' 表示自动检测 */
  sourceLang: string;
  /** 目标语言 */
  targetLang: string;
  /** 页面上下文（Content Script 自动采集） */
  pageContext: PageContext;
  /** 翻译策略 */
  strategy: TranslationStrategy;
}

// ---------- 翻译结果 ----------

export interface TranslateResult {
  /** 译文数组，与 fragments 一一对应 */
  translations: string[];
  /** 使用的引擎 ID */
  engine: string;
  /** 自动检测到的源语言（sourceLang 为 'auto' 时） */
  sourceLangDetected?: string;
  /** 是否来自缓存 */
  fromCache: boolean;
  /** 延迟（毫秒） */
  latencyMs: number;
  /** 实际使用的策略 */
  strategyUsed: TranslationStrategy;
}

// ---------- 翻译引擎接口 ----------

export interface TranslationEngine {
  /** 引擎唯一标识 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 是否需要 API Key */
  requiresApiKey: boolean;
  /** 支持的 ISO 639-1 语言代码列表 */
  readonly supportedLanguages: string[];
  /** 检查是否支持某个语言代码 */
  supportsLanguage(code: string): boolean;
  /** 执行翻译 */
  translate(req: TranslateRequest, apiKey?: ApiKey): Promise<TranslateResult>;
  /** 验证 API Key 是否可用 */
  validateApiKey(key: string): Promise<boolean>;
}

// ---------- 缓存 ----------

export interface CacheEntry {
  /** hash(原文 + sourceLang + targetLang + engineId) */
  key: string;
  /** 原始文本 */
  original: string;
  /** 翻译结果 */
  translation: string;
  /** 使用的引擎 ID */
  engine: string;
  /** 写入时间戳 */
  timestamp: number;
  /** 命中次数 */
  hitCount: number;
}

// ---------- 语言定义 ----------

export interface Language {
  /** ISO 639-1 代码 */
  code: string;
  /** 显示名称 */
  name: string;
  /** 母语名称 */
  nativeName: string;
}

// ---------- 消息协议 ----------

export type MessageType =
  | { type: 'TRANSLATE_FRAGMENTS'; payload: TranslateRequest }
  | { type: 'TRANSLATE_SELECTION'; payload: { text: string; targetLang: string } }
  | { type: 'TRANSLATE_PAGE'; payload: { tabId: number; targetLang: string; strategy?: Partial<TranslationStrategy> } }
  | { type: 'GET_ENGINES' }
  | { type: 'GET_SETTINGS' }
  | { type: 'GET_APIKEYS' }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<UserSettings> }
  | { type: 'SET_APIKEY'; payload: { engineId: string; key: string } }
  | { type: 'GET_CACHE_STATS' }
  | { type: 'TEST_APIKEY'; payload: { engineId: string; key: string } }
  | { type: 'SET_ENGINE'; payload: { engineId: string } }
  | { type: 'REVERT_PAGE'; payload: { tabId: number } }
  | { type: 'UPDATE_PROMPT_TEMPLATE'; payload: { engineId: string; template: string } }; // Phase 2

// ---------- 双语对照 ----------

/** 插入策略 */
export type InsertionStrategy = 'wrap-text' | 'sibling-fallback' | 'sidebar-fallback';

// ---------- 存储 ----------

export interface UserSettings {
  /** 主引擎 ID */
  primaryEngine: string;
  /** 备用引擎 ID 列表（按优先级排序） */
  fallbackEngines: string[];
  /** 默认目标语言 */
  targetLang: string;
  /** 每个引擎的 API Key */
  apiKeys: Record<string, string>;
  /** 双语对照模式 */
  bilingualMode: 'inline' | 'sidebar' | 'off';
  /** 自动翻译开关 */
  autoTranslate: boolean;
  /** 不自动翻译的域名列表 */
  excludeDomains: string[];
  /** Per-engine 自定义 prompt 模板（Phase 2） */
  promptTemplates: Record<string, string>;
  /** 自定义术语表（Phase 2） */
  glossary: Record<string, string>;
}

export const DEFAULT_SETTINGS: UserSettings = {
  primaryEngine: 'deepseek',
  fallbackEngines: ['google'],
  targetLang: 'zh-CN',
  apiKeys: {},
  bilingualMode: 'off',
  autoTranslate: false,
  excludeDomains: [],
  promptTemplates: {},
  glossary: {},
};
