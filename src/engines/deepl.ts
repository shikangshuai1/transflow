// ============================================================
// TransFlow — DeepL API Engine
// API 文档: https://www.deepl.com/docs-api
// DeepL 有免费额度（500,000 字符/月），需注册获取 API Key
// ============================================================

import type { ApiKey, TranslateRequest, TranslateResult, TranslationEngine } from '../lib/types';

/** DeepL 语言代码映射 */
const DEEPL_LANG_MAP: Record<string, string> = {
  'en': 'EN',
  'zh-CN': 'ZH',
  'ja': 'JA',
  'ko': 'KO',
  'fr': 'FR',
  'de': 'DE',
  'es': 'ES',
  'ru': 'RU',
  'pt': 'PT',
  'it': 'IT',
  // DeepL 不支持: zh-TW, ar, th, vi, id
};

export class DeepLEngine implements TranslationEngine {
  readonly id = 'deepl';
  readonly name = 'DeepL';
  readonly requiresApiKey = true;

  /** DeepL 只支持约 30 种语言，这里列出我们 Phase 1 支持的 */
  readonly supportedLanguages = [
    'en', 'zh-CN', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'pt', 'it',
  ];

  supportsLanguage(code: string): boolean {
    return code in DEEPL_LANG_MAP;
  }

  async translate(
    req: TranslateRequest,
    apiKey?: ApiKey,
  ): Promise<TranslateResult> {
    if (!apiKey) {
      throw new Error('DeepL requires an API Key');
    }

    const startTime = performance.now();

    const targetLang = DEEPL_LANG_MAP[req.targetLang] ?? req.targetLang.toUpperCase();

    // DeepL 支持批量翻译：texts 参数
    const texts = req.fragments.map((f) => f.text);

    const body: Record<string, unknown> = {
      text: texts,
      target_lang: targetLang,
    };

    // DeepL 不支持 auto 检测，但可以不传 source_lang 让它自动检测
    if (req.sourceLang !== 'auto' && req.sourceLang in DEEPL_LANG_MAP) {
      body.source_lang = DEEPL_LANG_MAP[req.sourceLang];
    }

    // DeepL 支持的 formality 参数
    if (req.strategy.tone === 'literary') {
      body.formality = 'prefer_more';
    } else if (req.strategy.tone === 'casual' || req.strategy.tone === 'precise') {
      body.formality = 'prefer_less';
    }
    // default: 由 DeepL 自动判断

    // 根据 API Key 判断是免费版还是付费版
    const isFreeKey = apiKey.endsWith(':fx');
    const baseUrl = isFreeKey
      ? 'https://api-free.deepl.com/v2'
      : 'https://api.deepl.com/v2';

    const response = await fetch(`${baseUrl}/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const latencyMs = Math.round(performance.now() - startTime);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`DeepL API error ${response.status}: ${text.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      translations: Array<{ text: string; detected_source_language?: string }>;
    };

    const translations = data.translations.map((t) => t.text);
    const detectedLang = data.translations[0]?.detected_source_language
      ?.toLowerCase();

    // 补齐
    while (translations.length < req.fragments.length) {
      translations.push(req.fragments[translations.length].text);
    }

    return {
      translations: translations.slice(0, req.fragments.length),
      engine: this.id,
      sourceLangDetected: detectedLang,
      fromCache: false,
      latencyMs,
      strategyUsed: req.strategy,
    };
  }

  async validateApiKey(key: string): Promise<boolean> {
    try {
      const isFreeKey = key.endsWith(':fx');
      const baseUrl = isFreeKey
        ? 'https://api-free.deepl.com/v2'
        : 'https://api.deepl.com/v2';

      const response = await fetch(`${baseUrl}/usage`, {
        headers: { 'Authorization': `DeepL-Auth-Key ${key}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
