// ============================================================
// TransFlow — Storage Abstraction
// chrome.storage.local + session 的类型安全封装
// ============================================================

import type { UserSettings, ApiKey } from './types';
import { DEFAULT_SETTINGS } from './types';

// ============================================================
// 设置存取
// ============================================================

const SETTINGS_KEY = 'transflow_settings';

/** 加载用户设置（与默认值合并） */
export async function loadSettings(): Promise<UserSettings> {
  try {
    const result = await browser.storage.local.get(SETTINGS_KEY);
    const stored = result[SETTINGS_KEY] as Partial<UserSettings> | undefined;
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...stored };
    }
  } catch {
    // 读取失败，用默认值
  }
  return { ...DEFAULT_SETTINGS };
}

/** 保存用户设置 */
export async function saveSettings(
  settings: UserSettings,
): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}

/** 更新部分设置 */
export async function updateSettings(
  partial: Partial<UserSettings>,
): Promise<UserSettings> {
  const current = await loadSettings();
  const merged = { ...current, ...partial };
  await saveSettings(merged);
  return merged;
}

// ============================================================
// API Key 存取
// ============================================================

const APIKEYS_KEY = 'transflow_apikeys';

/** 获取某个引擎的 API Key */
export async function getApiKey(engineId: string): Promise<string | null> {
  try {
    const result = await browser.storage.local.get(APIKEYS_KEY);
    const keys = result[APIKEYS_KEY] as Record<string, string> | undefined;
    return keys?.[engineId] ?? null;
  } catch {
    return null;
  }
}

/** 获取所有 API Key */
export async function getAllApiKeys(): Promise<Record<string, string>> {
  try {
    const result = await browser.storage.local.get(APIKEYS_KEY);
    return (result[APIKEYS_KEY] as Record<string, string>) ?? {};
  } catch {
    return {};
  }
}

/** 设置某个引擎的 API Key */
export async function setApiKey(
  engineId: string,
  key: string,
): Promise<void> {
  const allKeys = await getAllApiKeys();
  allKeys[engineId] = key;
  await browser.storage.local.set({ [APIKEYS_KEY]: allKeys });
}

/** 删除某个引擎的 API Key */
export async function removeApiKey(engineId: string): Promise<void> {
  const allKeys = await getAllApiKeys();
  delete allKeys[engineId];
  await browser.storage.local.set({ [APIKEYS_KEY]: allKeys });
}

/** 构造 ApiKey opaque type（仅在 Background 中调用） */
export function toApiKey(key: string): ApiKey {
  return key as ApiKey;
}
