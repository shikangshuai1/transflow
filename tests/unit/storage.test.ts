// ============================================================
// TransFlow — Storage Unit Tests
// Mock browser.storage API
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================
// Mock browser.storage.local
// ============================================================

let store: Record<string, unknown> = {};

const mockStorageLocal = {
  get: vi.fn(async (keys: string | string[] | null) => {
    if (keys === null) return { ...store };
    if (typeof keys === 'string') return { [keys]: store[keys] ?? null };
    const result: Record<string, unknown> = {};
    for (const k of keys) {
      result[k] = store[k] ?? null;
    }
    return result;
  }),
  set: vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(store, items);
  }),
  remove: vi.fn(async (keys: string | string[]) => {
    const list = typeof keys === 'string' ? [keys] : keys;
    for (const k of list) delete store[k];
  }),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).browser = {
  storage: { local: mockStorageLocal },
};

import {
  loadSettings,
  saveSettings,
  updateSettings,
  getApiKey,
  setApiKey,
  removeApiKey,
  getAllApiKeys,
} from '../../src/lib/storage';
import { DEFAULT_SETTINGS, type UserSettings } from '../../src/lib/types';

describe('Settings', () => {
  beforeEach(() => {
    store = {};
    vi.clearAllMocks();
  });

  it('loadSettings 无存储时返回默认值', async () => {
    const s = await loadSettings();
    expect(s).toEqual(DEFAULT_SETTINGS);
  });

  it('loadSettings 合并已存储的值', async () => {
    store['transflow_settings'] = { targetLang: 'ja' };
    const s = await loadSettings();
    expect(s.targetLang).toBe('ja');
    // 未存储的 key 保持默认
    expect(s.primaryEngine).toBe(DEFAULT_SETTINGS.primaryEngine);
  });

  it('saveSettings + loadSettings 往返', async () => {
    const modified: UserSettings = {
      ...DEFAULT_SETTINGS,
      targetLang: 'fr',
      primaryEngine: 'claude',
    };
    await saveSettings(modified);

    const loaded = await loadSettings();
    expect(loaded.targetLang).toBe('fr');
    expect(loaded.primaryEngine).toBe('claude');
  });

  it('updateSettings 部分更新不丢失其他键', async () => {
    // 先保存完整设置
    const initial: UserSettings = {
      ...DEFAULT_SETTINGS,
      targetLang: 'ja',
      primaryEngine: 'deepseek',
    };
    store['transflow_settings'] = initial;

    // 只更新 targetLang
    const updated = await updateSettings({ targetLang: 'ko' });

    expect(updated.targetLang).toBe('ko');
    // 其他设置保留
    expect(updated.primaryEngine).toBe('deepseek');
    expect(updated.bilingualMode).toBe(DEFAULT_SETTINGS.bilingualMode);
  });
});

describe('API Keys', () => {
  beforeEach(() => {
    store = {};
    vi.clearAllMocks();
  });

  it('getApiKey 未设置时返回 null', async () => {
    const key = await getApiKey('deepseek');
    expect(key).toBeNull();
  });

  it('setApiKey + getApiKey 往返', async () => {
    await setApiKey('deepseek', 'sk-test-123');
    const key = await getApiKey('deepseek');
    expect(key).toBe('sk-test-123');
  });

  it('不同引擎的 Key 隔离', async () => {
    await setApiKey('deepseek', 'sk-ds');
    await setApiKey('openai', 'sk-oai');

    expect(await getApiKey('deepseek')).toBe('sk-ds');
    expect(await getApiKey('openai')).toBe('sk-oai');
  });

  it('setApiKey 覆盖已有 Key', async () => {
    await setApiKey('deepseek', 'old-key');
    await setApiKey('deepseek', 'new-key');
    expect(await getApiKey('deepseek')).toBe('new-key');
  });

  it('removeApiKey 删除 Key', async () => {
    await setApiKey('deepseek', 'sk-test');
    await removeApiKey('deepseek');
    expect(await getApiKey('deepseek')).toBeNull();
  });

  it('getAllApiKeys 返回全部 Key', async () => {
    await setApiKey('deepseek', 'sk-ds');
    await setApiKey('claude', 'sk-cl');

    const all = await getAllApiKeys();
    expect(all).toEqual({ deepseek: 'sk-ds', claude: 'sk-cl' });
  });

  it('removeApiKey 不影响其他 Key', async () => {
    await setApiKey('deepseek', 'sk-ds');
    await setApiKey('openai', 'sk-oai');

    await removeApiKey('deepseek');

    expect(await getApiKey('openai')).toBe('sk-oai');
    expect(await getApiKey('deepseek')).toBeNull();
  });

  it('API Key 明文存储（确认不加密）', async () => {
    await setApiKey('deepseek', 'sk-plain-text');
    const raw = store['transflow_apikeys'] as Record<string, string>;
    expect(raw.deepseek).toBe('sk-plain-text');
  });
});
