// ============================================================
// TransFlow — Translation Engine Base Class
// 所有 AI 引擎（DeepSeek/Claude/OpenAI）的抽象基类
// Phase 1: 硬编码 system prompt（够好但不完美）
// Phase 2: 用户自定义 prompt 模板覆盖
// ============================================================

import type {
  ApiKey,
  TextFragment,
  PageContext,
  TranslationStrategy,
  TranslateRequest,
  TranslateResult,
  TranslationEngine,
} from '../lib/types';

// ============================================================
// 策略推断器（Phase 1 核心 — 规则驱动，零配置）
// ============================================================

export function inferStrategy(
  fragments: TextFragment[],
  ctx: PageContext,
): TranslationStrategy {
  const hasCode = fragments.some((f) => f.meta.containsCode);
  const isShortUI = fragments.every(
    (f) =>
      ['BUTTON', 'INPUT', 'A', 'SPAN', 'LABEL', 'OPTION'].includes(f.meta.tagName) &&
      f.meta.textLength < 30,
  );

  // 规则 1: 全部是短 UI 文本 → precise
  if (isShortUI) {
    return { tone: 'precise', preserveFormatting: false };
  }

  // 规则 2: URL 含文档路径 → technical
  if (/\/docs\/|\/api\/|\/reference\/|\/documentation\//i.test(ctx.url)) {
    return { tone: 'technical', preserveFormatting: true };
  }

  // 规则 3: 含代码片段 → technical
  if (hasCode) {
    return { tone: 'technical', preserveFormatting: true };
  }

  // 规则 4: 默认 → auto（交给引擎自己判断）
  return { tone: 'auto', preserveFormatting: true };
}

// ============================================================
// AI 引擎抽象基类
// ============================================================

export abstract class AIEngine implements TranslationEngine {
  abstract id: string;
  abstract name: string;
  abstract requiresApiKey: boolean;
  abstract supportedLanguages: string[];

  // 子类必须实现：发起 HTTP 请求
  protected abstract callAPI(
    req: TranslateRequest,
    apiKey: ApiKey,
  ): Promise<Omit<TranslateResult, 'fromCache' | 'strategyUsed'>>;

  // 子类必须实现：构建 API 请求的 system prompt
  protected abstract buildSystemPrompt(
    strategy: TranslationStrategy,
    ctx: PageContext,
  ): string;

  // 子类必须实现：构建 API 请求的 user message
  protected abstract buildUserMessage(
    fragments: TextFragment[],
    targetLang: string,
  ): string;

  // ---------- 公共接口 ----------

  async translate(
    req: TranslateRequest,
    apiKey?: ApiKey,
  ): Promise<TranslateResult> {
    const strategy = req.strategy.tone === 'auto'
      ? inferStrategy(req.fragments, req.pageContext)
      : req.strategy;

    const effectiveReq: TranslateRequest = { ...req, strategy };

    if (!apiKey) {
      throw new Error(`Engine "${this.name}" requires an API Key`);
    }

    const result = await this.callAPI(effectiveReq, apiKey);
    return {
      ...result,
      fromCache: false,
      strategyUsed: effectiveReq.strategy,
    };
  }

  async validateApiKey(key: string): Promise<boolean> {
    try {
      // 发送一个最小请求验证 key 有效性
      const testReq: TranslateRequest = {
        fragments: [{ text: 'Hello', meta: { tagName: 'SPAN', isPlaceholder: false, isLink: false, ancestorChain: 'TEST', textLength: 5, containsCode: false }}],
        sourceLang: 'en',
        targetLang: 'zh-CN',
        pageContext: { url: 'test://validate', title: 'test' },
        strategy: { tone: 'auto', preserveFormatting: false },
      };
      await this.callAPI(testReq, key as ApiKey);
      return true;
    } catch {
      return false;
    }
  }

  supportsLanguage(code: string): boolean {
    return this.supportedLanguages.includes(code);
  }
}
