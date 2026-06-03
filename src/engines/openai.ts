// ============================================================
// TransFlow — OpenAI API Engine
// 同时也是所有 OpenAI 兼容协议引擎的基类
// ============================================================

import type { ApiKey, TextFragment, PageContext, TranslationStrategy, TranslateRequest, TranslateResult } from '../lib/types';
import { AIEngine } from './base';

/** 翻译语气 → prompt 提示词映射 */
const TONE_PROMPTS: Record<string, string> = {
  technical:
    'You are a technical translator. Preserve all variable names, code identifiers, URLs, and formatting. Keep technical terms accurate.',
  literary:
    'You are a literary translator. Prioritize elegance and tone. Preserve the emotional nuance and stylistic character of the original.',
  casual:
    'You are translating casual conversation. Use natural, colloquial language. Keep emojis and internet slang where appropriate.',
  precise:
    'You are translating UI strings (buttons, menus, labels). Keep translations short, precise, and action-oriented. Do not add explanations.',
};

export class OpenAIEngine extends AIEngine {
  id = 'openai';
  name = 'OpenAI GPT-4o';
  requiresApiKey = true;

  // OpenAI 支持的语言（与 DeepSeek/Claude 基本相同）
  readonly supportedLanguages = [
    'en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'fr', 'de', 'es',
    'ru', 'pt', 'it', 'ar', 'th', 'vi', 'id',
  ];

  /** 子类可覆盖：API base URL */
  protected get baseURL(): string {
    return 'https://api.openai.com/v1';
  }

  /** 子类可覆盖：模型名 */
  protected get modelName(): string {
    return 'gpt-4o';
  }

  // ============================================================
  // System Prompt 构建
  // ============================================================

  protected buildSystemPrompt(
    strategy: TranslationStrategy,
    _ctx: PageContext,
  ): string {
    const toneHint = TONE_PROMPTS[strategy.tone];

    let prompt =
      'You are a professional translator. ' +
      'Input lines have format "[index|tag] text". The [index|tag] is METADATA — do NOT output it. ' +
      'Return ONLY a JSON array: ["translated1", "translated2"]. ' +
      'Each item must contain ONLY the translated text, never any [tag] prefix. ' +
      'Array length must exactly match input line count.';

    if (toneHint) {
      prompt += ' ' + toneHint;
    }

    if (strategy.preserveFormatting) {
      prompt += ' Preserve all line breaks, indentation, and whitespace.';
    }

    if (strategy.glossary && Object.keys(strategy.glossary).length > 0) {
      const terms = Object.entries(strategy.glossary)
        .map(([k, v]) => `"${k}" → "${v}"`)
        .join(', ');
      prompt += ` Use these specific term translations: ${terms}.`;
    }

    return prompt;
  }

  // ============================================================
  // User Message 构建
  // ============================================================

  protected buildUserMessage(
    fragments: TextFragment[],
    targetLang: string,
  ): string {
    const lines = fragments.map((f, i) => {
      // 把 HTML 标签信息放在行首的元数据区，用 | 和正文隔开，避免引擎把标签 echo 回来
      const tag = f.meta.tagName === 'SPAN' ? 'text' : f.meta.tagName.toLowerCase();
      return `[${i}|${tag}] ${f.text}`;
    });
    return `Translate to ${targetLang}. Each line starts with "[index|html_tag]" — this is METADATA, do NOT include it in your translation. Translate ONLY the text after the "] ":\n${lines.join('\n')}`;
  }

  // ============================================================
  // API 调用
  // ============================================================

  protected async callAPI(
    req: TranslateRequest,
    apiKey: ApiKey,
  ): Promise<Omit<TranslateResult, 'fromCache' | 'strategyUsed'>> {
    const systemPrompt = this.buildSystemPrompt(req.strategy, req.pageContext);
    const userMessage = this.buildUserMessage(req.fragments, req.targetLang);

    const startTime = performance.now();

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1, // 翻译场景：低温度保证一致性
      }),
    });

    const latencyMs = Math.round(performance.now() - startTime);

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `${this.name} API error ${response.status}: ${body.slice(0, 200)}`,
      );
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(`${this.name} returned empty response`);
    }

    // 解析 JSON 数组
    let translations: string[];
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        translations = parsed.map(String);
      } else if (typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).translations)) {
        translations = (parsed as Record<string, string[]>).translations.map(String);
      } else {
        throw new Error('Unexpected response format');
      }
    } catch {
      // JSON 解析失败，回退为单行拆分
      translations = content
        .split('\n')
        .map((l: string) => l.replace(/^\[\d+\]\s*/, ''))
        .filter(Boolean);
    }

    // 清理：去除引擎可能 echo 回来的 [TAG] 前缀
    translations = translations.map((t) => t.replace(/^\s*\[\w+\]\s*/, ''));

    // 补齐/截断到 fragment 数量
    while (translations.length < req.fragments.length) {
      translations.push(req.fragments[translations.length].text);
    }
    translations = translations.slice(0, req.fragments.length);

    return {
      translations,
      engine: this.id,
      sourceLangDetected: undefined,
      latencyMs,
    };
  }
}
