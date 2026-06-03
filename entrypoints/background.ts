// ============================================================
// TransFlow — Service Worker
// 唯一持有 API Key 的模块
// 职责: 翻译请求处理、缓存管理、引擎路由、消息分发
// ============================================================

import { initEngines, getAllEngines, routeTranslation } from '../src/engines/index';
import { L1Cache, hashKey } from '../src/lib/cache';
import { L1_MAX_ENTRIES, SESSION_QUOTA, SESSION_HIGH_WATER } from '../src/lib/constants';
import {
  loadSettings, updateSettings,
  getApiKey, setApiKey as storeSetApiKey, getAllApiKeys, toApiKey,
} from '../src/lib/storage';
import type { UserSettings, TranslateRequest, CacheEntry } from '../src/lib/types';
import { DEFAULT_SETTINGS } from '../src/lib/types';

export default defineBackground(() => {
  // ============================================================
  // 状态（SW 存活期间）
  // ============================================================

  initEngines();
  const l1Cache = new L1Cache(L1_MAX_ENTRIES);
  let settings: UserSettings = { ...DEFAULT_SETTINGS };

  // 缓存统计（SW 存活期间）
  const cacheStats = {
    totalFragments: 0,
    cacheHits: 0,
    apiCalls: 0,
    totalLatencyMs: 0,
  };
  function avgLatency(): number {
    return cacheStats.apiCalls > 0
      ? Math.round(cacheStats.totalLatencyMs / cacheStats.apiCalls)
      : 0;
  }

  // ============================================================
  // 初始化
  // ============================================================

  const init = async () => {
    // 加载设置
    settings = await loadSettings();
    console.log('[TransFlow] Settings loaded, primary engine:', settings.primaryEngine);

    // 注册右键菜单（先删后建，防 SW 重启重复）
    browser.contextMenus.removeAll().then(() => {
      browser.contextMenus.create({
        id: 'translate-selection',
        title: '🌐 翻译选中文字',
        contexts: ['selection'],
      });
    });

    // 从 session storage 重建 L1 缓存
    try {
      const all = await browser.storage.session.get(null);
      const entries: Array<Record<string, unknown>> = Object.values(all).filter(
        (v): v is Record<string, unknown> =>
          typeof v === 'object' && v !== null && 'key' in v,
      );
      if (entries.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rebuilt = L1Cache.fromEntries(entries as any, L1_MAX_ENTRIES);
        for (const entry of rebuilt.toEntries()) {
          l1Cache.set(entry.key, entry);
        }
        console.log(`[Cache] Rebuilt L1: ${l1Cache.size} entries from session`);
      }
    } catch {
      console.log('[Cache] Session storage unavailable, starting cold');
    }
  };

  init();

  // ============================================================
  // 缓存 write-through 辅助
  // ============================================================

  async function writeThroughCache(entry: CacheEntry): Promise<void> {
    // 1. 写 L1（同步）
    l1Cache.set(entry.key, entry);

    // 2. 写 session storage（容量守卫）
    try {
      const bytesUsed = await browser.storage.session.getBytesInUse?.() ?? 0;
      if (bytesUsed > SESSION_QUOTA * SESSION_HIGH_WATER) {
        const evicted = l1Cache.evictByBytes(SESSION_QUOTA * SESSION_HIGH_WATER);
        if (evicted.length > 0) {
          console.log(`[Cache] Evicted ${evicted.length} entries to stay below quota`);
        }
      }

      await browser.storage.session.set({ [entry.key]: entry });
    } catch (e) {
      // 配额错误：激进淘汰 50% 后重试
      if (e instanceof Error && e.message?.includes('QUOTA')) {
        l1Cache.evictByBytes(Math.floor(SESSION_QUOTA * 0.5));
        try {
          await browser.storage.session.set({ [entry.key]: entry });
        } catch {
          // 静默失败：L1 缓存仍然有效
        }
      }
    }
  }

  // ============================================================
  // 翻译请求处理
  // ============================================================

  async function handleTranslateFragments(
    req: TranslateRequest,
  ): Promise<{ translations: string[]; hits: number }> {
    const results: Array<{ index: number; translation: string }> = [];
    const uncachedFragments: Array<{ index: number; text: string; meta: typeof req.fragments[0]['meta'] }> = [];

    // 第一步：查缓存
    for (let i = 0; i < req.fragments.length; i++) {
      const frag = req.fragments[i];
      const key = hashKey(frag.text, req.sourceLang, req.targetLang, settings.primaryEngine);

      const cached = l1Cache.get(key);
      if (cached) {
        results.push({ index: i, translation: cached.translation });
      } else {
        uncachedFragments.push({ index: i, text: frag.text, meta: frag.meta });
      }
    }

    // 第二步：翻译未命中的片段
    let apiLatency = 0;
    if (uncachedFragments.length > 0) {
      const uncachedReq: TranslateRequest = {
        ...req,
        fragments: uncachedFragments.map((f) => ({
          text: f.text,
          meta: f.meta,
        })),
      };

      const result = await routeTranslation(
        uncachedReq,
        async (engineId: string) => {
          const key = await getApiKey(engineId);
          return key ? toApiKey(key) : undefined;
        },
        settings.primaryEngine,
        settings.fallbackEngines,
      );
      apiLatency = result.latencyMs;

      // 第三步：写入缓存
      for (let i = 0; i < result.translations.length; i++) {
        const uncachedIdx = uncachedFragments[i];
        if (uncachedIdx === undefined) continue;

        const key = hashKey(
          uncachedIdx.text,
          req.sourceLang,
          req.targetLang,
          result.engine,
        );

        const entry: CacheEntry = {
          key,
          original: uncachedIdx.text,
          translation: result.translations[i],
          engine: result.engine,
          timestamp: Date.now(),
          hitCount: 1,
        };

        await writeThroughCache(entry);
        results.push({ index: uncachedIdx.index, translation: result.translations[i] });
      }
    }

    // 第四步：按原始顺序排列
    results.sort((a, b) => a.index - b.index);
    const hits = results.length - (uncachedFragments.length > 0 ? uncachedFragments.length : 0);

    // 统计
    cacheStats.totalFragments += req.fragments.length;
    cacheStats.cacheHits += hits;
    if (uncachedFragments.length > 0) {
      cacheStats.apiCalls++;
      cacheStats.totalLatencyMs += apiLatency;
    }

    return {
      translations: results.map((r) => r.translation),
      hits: req.fragments.length - uncachedFragments.length,
    };
  }

  // ============================================================
  // 消息分发
  // ============================================================

  browser.runtime.onMessage.addListener(
    (message: { type: string; payload?: unknown }, _sender) => {
      switch (message.type) {
        // ---------- 引擎列表 ----------
        case 'GET_ENGINES': {
          const engines = getAllEngines().map((e) => ({
            id: e.id,
            name: e.name,
            requiresApiKey: e.requiresApiKey,
            supportedLanguages: e.supportedLanguages,
          }));
          return Promise.resolve({ engines });
        }

        // ---------- 翻译 ----------
        case 'TRANSLATE_FRAGMENTS': {
          const req = message.payload as TranslateRequest;
          return handleTranslateFragments(req);
        }

        case 'TRANSLATE_SELECTION': {
          // 划词翻译：构造单片段请求
          const { text, targetLang } = message.payload as { text: string; targetLang: string };
          const req: TranslateRequest = {
            fragments: [{
              text,
              meta: { tagName: 'SPAN', isPlaceholder: false, isLink: false, ancestorChain: 'SELECTION', textLength: text.length, containsCode: false },
            }],
            sourceLang: 'auto',
            targetLang,
            pageContext: { url: 'selection://', title: '' },
            strategy: { tone: 'auto', preserveFormatting: false },
          };
          return handleTranslateFragments(req);
        }

        // ---------- 设置 ----------
        case 'GET_SETTINGS': {
          return Promise.resolve({ settings });
        }

        case 'UPDATE_SETTINGS': {
          const partial = message.payload as Partial<UserSettings>;
          return updateSettings(partial).then((s) => {
            settings = s;
            return { settings: s };
          });
        }

        case 'SET_APIKEY': {
          const { engineId, key } = message.payload as { engineId: string; key: string };
          return storeSetApiKey(engineId, key).then(() => ({ success: true }));
        }

        case 'TEST_APIKEY': {
          const { engineId, key } = message.payload as { engineId: string; key: string };
          const engine = getAllEngines().find((e) => e.id === engineId);
          if (!engine) return Promise.resolve({ valid: false, error: '引擎未找到' });
          return engine.validateApiKey(key).then((valid) => ({ valid }));
        }

        case 'GET_CACHE_STATS': {
          return Promise.resolve({
            entries: l1Cache.size,
            totalFragments: cacheStats.totalFragments,
            cacheHits: cacheStats.cacheHits,
            hitRate: cacheStats.totalFragments > 0
              ? Math.round((cacheStats.cacheHits / cacheStats.totalFragments) * 100)
              : 0,
            apiCalls: cacheStats.apiCalls,
            avgLatencyMs: avgLatency(),
          });
        }

        case 'GET_APIKEYS': {
          return getAllApiKeys().then((keys) => ({ keys }));
        }

        case 'TOGGLE_BILINGUAL':
          // Phase 2
          return Promise.resolve({ error: 'Not implemented yet' });

        default:
          return undefined;
      }
    },
  );

  // 右键菜单点击 → 通知 content script 弹出翻译气泡
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'translate-selection' && tab?.id) {
      browser.tabs.sendMessage(tab.id, { type: 'SHOW_SELECTION_TRANSLATION' })
        .catch((err: Error) => console.error('[TransFlow] Context menu failed:', err));
    }
  });

  // 快捷键 Alt+T：翻译/还原当前页面
  const translatedTabs = new Set<number>();

  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'toggle-translation') return;

    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    const tabId = tab.id;
    if (translatedTabs.has(tabId)) {
      browser.tabs.sendMessage(tabId, { type: 'REVERT_PAGE' })
        .then(() => translatedTabs.delete(tabId))
        .catch(() => {});
    } else {
      const lang = settings.targetLang || 'zh-CN';
      browser.tabs.sendMessage(tabId, {
        type: 'TRANSLATE_PAGE',
        payload: { targetLang: lang },
      })
        .then(() => translatedTabs.add(tabId))
        .catch(() => {});
    }
  });
});
