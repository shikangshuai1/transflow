// ============================================================
// TransFlow — Claude API Engine
// API 文档: https://docs.anthropic.com/en/api
// ============================================================

import type { ApiKey, TextFragment, PageContext, TranslationStrategy, TranslateRequest, TranslateResult } from '../lib/types';
import { AIEngine } from './base';

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

export class ClaudeEngine extends AIEngine {
  id = 'claude';
  name = 'Claude API';
  requiresApiKey = true;

  readonly supportedLanguages = [
    'en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'fr', 'de', 'es',
    'ru', 'pt', 'it', 'ar', 'th', 'vi', 'id',
  ];

  // ============================================================
  // System Prompt
  // ============================================================

  protected buildSystemPrompt(
    strategy: TranslationStrategy,
    _ctx: PageContext,
  ): string {
    let prompt =
      'You are a professional translator. Translate the following texts accurately. ' +
      'You MUST return ONLY a valid JSON object with this exact structure:\n' +
      '{"translations": ["translated text 1", "translated text 2"]}\n' +
      'The "translations" array must have exactly the same number of elements as the input texts. ' +
      'Do not include any other text, explanations, or markdown formatting.';

    const toneHint = TONE_PROMPTS[strategy.tone];
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
      prompt += ` Use these term translations: ${terms}.`;
    }

    return prompt;
  }

  // ============================================================
  // User Message
  // ============================================================

  protected buildUserMessage(
    fragments: TextFragment[],
    targetLang: string,
  ): string {
    const lines = fragments.map((f, i) => {
      const tag = f.meta.tagName === 'SPAN' ? 'text' : f.meta.tagName.toLowerCase();
      return `[${i}|${tag}] ${f.text}`;
    });
    return `Translate to ${targetLang}. The "[index|tag]" prefix on each line is METADATA — do NOT include it in your translations. Translate ONLY the text after the "] ":\n${lines.join('\n')}`;
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

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
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
      content: Array<{ type: string; text: string }>;
    };

    const rawText = data.content
      ?.filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('');

    if (!rawText) {
      throw new Error(`${this.name} returned empty response`);
    }

    // 解析 JSON
    let translations: string[];
    try {
      const parsed = JSON.parse(rawText);
      if (Array.isArray(parsed.translations)) {
        translations = parsed.translations.map(String);
      } else if (Array.isArray(parsed)) {
        translations = parsed.map(String);
      } else {
        throw new Error('Unexpected response format');
      }
    } catch {
      translations = rawText
        .split('\n')
        .map((l: string) => l.replace(/^\[\d+\]\s*/, ''))
        .filter(Boolean);
    }

    // 清理 [TAG] 前缀
    translations = translations.map((t) => t.replace(/^\s*\[\w+\]\s*/, ''));

    // 补齐/截断
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
