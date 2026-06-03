// ============================================================
// TransFlow — Google Translate Engine
// 使用 Google Translate 免费接口（无需 API Key）
// ============================================================

import type { TranslateRequest, TranslateResult, TranslationEngine } from '../lib/types';

export class GoogleTranslateEngine implements TranslationEngine {
  readonly id = 'google';
  readonly name = 'Google Translate';
  readonly requiresApiKey = false;

  // Google Translate 支持 130+ 语言，这里列出核心集合
  readonly supportedLanguages = [
    'en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'fr', 'de', 'es',
    'ru', 'pt', 'it', 'ar', 'th', 'vi', 'id',
  ];

  supportsLanguage(code: string): boolean {
    return this.supportedLanguages.includes(code);
  }

  async translate(req: TranslateRequest): Promise<TranslateResult> {
    const startTime = performance.now();
    const results: string[] = [];

    for (const fragment of req.fragments) {
      const result = await this.translateSingle(
        fragment.text,
        req.sourceLang,
        req.targetLang,
      );
      results.push(result);
    }

    const latencyMs = Math.round(performance.now() - startTime);

    return {
      translations: results,
      engine: this.id,
      sourceLangDetected: req.sourceLang === 'auto' ? undefined : req.sourceLang,
      fromCache: false,
      latencyMs,
      strategyUsed: req.strategy,
    };
  }

  /**
   * 翻译单个文本
   * 使用 Google Translate 免费接口
   */
  private async translateSingle(
    text: string,
    sourceLang: string,
    targetLang: string,
  ): Promise<string> {
    const sl = sourceLang === 'auto' ? 'auto' : sourceLang;
    const tl = mapToGoogleCode(targetLang);

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Google Translate error ${response.status}`,
      );
    }

    // 返回格式: [[["译文", "原文", ...], ...], ...]
    const data = (await response.json()) as Array<Array<Array<string | null>>>;

    const segments: string[] = [];
    if (Array.isArray(data) && Array.isArray(data[0])) {
      for (const item of data[0]) {
        if (Array.isArray(item) && item[0]) {
          segments.push(item[0]);
        }
      }
    }

    return segments.join('') || text;
  }

  async validateApiKey(): Promise<boolean> {
    // Google Translate 免费接口不需要 API Key
    return true;
  }
}

/**
 * 将我们的语言代码映射到 Google Translate 的语言代码
 */
function mapToGoogleCode(code: string): string {
  // 大多数代码与 ISO 639-1 一致
  const mapping: Record<string, string> = {
    'zh-CN': 'zh-CN',
    'zh-TW': 'zh-TW',
  };
  return mapping[code] ?? code;
}
