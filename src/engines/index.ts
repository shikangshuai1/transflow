// ============================================================
// TransFlow — Engine Registry & Router
// 引擎注册、能力查询、故障切换
// ============================================================

import type { TranslationEngine, TranslateRequest, TranslateResult, ApiKey } from '../lib/types';
import { DeepSeekEngine } from './deepseek';
import { OpenAIEngine } from './openai';
import { ClaudeEngine } from './claude';
import { GoogleTranslateEngine } from './google';
import { DeepLEngine } from './deepl';

/** 所有已注册的引擎 */
const registry: Map<string, TranslationEngine> = new Map();

/** 初始化并注册所有引擎（幂等：只在首次调用时注册） */
export function initEngines(): void {
  if (registry.size > 0) return; // 已初始化，跳过

  registerEngine(new DeepSeekEngine());
  registerEngine(new OpenAIEngine());
  registerEngine(new ClaudeEngine());
  registerEngine(new GoogleTranslateEngine());
  registerEngine(new DeepLEngine());
}

/** 注册一个引擎（幂等：已存在则跳过） */
export function registerEngine(engine: TranslationEngine): void {
  if (!registry.has(engine.id)) {
    registry.set(engine.id, engine);
  }
}

/** 获取所有已注册引擎 */
export function getAllEngines(): TranslationEngine[] {
  return Array.from(registry.values());
}

/** 获取支持该语言对的引擎 */
export function getCapableEngines(
  sourceLang: string,
  targetLang: string,
): TranslationEngine[] {
  return getAllEngines().filter((e) => {
    if (sourceLang === 'auto') return e.supportsLanguage(targetLang);
    return e.supportsLanguage(sourceLang) && e.supportsLanguage(targetLang);
  });
}

/** 获取加载了 API Key 的引擎 */
export function getConfiguredEngines(
  apiKeys: Record<string, string>,
): TranslationEngine[] {
  return getAllEngines().filter((e) => {
    if (!e.requiresApiKey) return true;
    return !!apiKeys[e.id];
  });
}

/**
 * 引擎路由：按优先级尝试翻译
 * 主力引擎 → 备用引擎 → 免费引擎
 * getApiKey 可以是异步的（从 storage 读取）
 */
export async function routeTranslation(
  req: TranslateRequest,
  getApiKey: (engineId: string) => Promise<ApiKey | undefined> | ApiKey | undefined,
  primaryId: string,
  fallbackIds: string[],
): Promise<TranslateResult> {
  const order = [primaryId, ...fallbackIds];

  // 过滤出已配置且支持该语言的引擎
  const capable = getCapableEngines(req.sourceLang, req.targetLang);
  const capableIds = new Set(capable.map((e) => e.id));

  const orderedIds = order.filter((id) => capableIds.has(id));

  if (orderedIds.length === 0) {
    throw new Error(
      `No engine supports translation from ${req.sourceLang} to ${req.targetLang}`,
    );
  }

  let lastError: Error | undefined;

  for (const engineId of orderedIds) {
    const engine = registry.get(engineId);
    if (!engine) continue;

    const apiKey = engine.requiresApiKey ? await getApiKey(engineId) : undefined;

    if (engine.requiresApiKey && !apiKey) {
      // 跳过未配置 Key 的引擎
      continue;
    }

    try {
      return await engine.translate(req, apiKey);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // 继续尝试下一个引擎
    }
  }

  throw lastError ?? new Error('All engines failed');
}
