// ============================================================
// TransFlow — 三层缓存实现
// L1: Map（同步 < 1ms）→ L2: session storage → L3: local storage
// ============================================================

import { L1_MAX_ENTRIES } from './constants';
import type { CacheEntry as ICacheEntry } from './types';

export type { CacheEntry } from './types';

// ============================================================
// Hash 函数（纯 JS，无浏览器 API 依赖）
// ============================================================

/**
 * 生成缓存键
 * key = hash(原文 + 源语言 + 目标语言 + 引擎ID)
 * 使用简单的 hash 函数（非加密用途，只求短、快、低碰撞）
 */
export function hashKey(
  original: string,
  sourceLang: string,
  targetLang: string,
  engineId: string,
): string {
  // 拼接键
  const input = `${original}|${sourceLang}|${targetLang}|${engineId}`;

  // FNV-1a hash（快，分布均匀，非加密场景够用）
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36).padStart(7, '0');
}

// ============================================================
// L1Cache — 带 LRU 淘汰的同步 Map
// ============================================================

export class L1Cache {
  private map: Map<string, ICacheEntry>;
  private readonly maxEntries: number;
  private bytes: number;

  constructor(maxEntries: number = L1_MAX_ENTRIES) {
    this.map = new Map();
    this.maxEntries = maxEntries;
    this.bytes = 0;
  }

  /** 获取条目，命中时刷新 LRU 顺序（不改变数据） */
  get(key: string): ICacheEntry | undefined {
    const entry = this.map.get(key);
    if (entry) {
      // LRU 刷新：删除后重新插入（移到末尾）
      this.map.delete(key);
      this.map.set(key, entry);
    }
    return entry;
  }

  /**
   * 设置条目
   * @returns 被淘汰的条目（如果超出 maxEntries）
   */
  set(key: string, entry: ICacheEntry): ICacheEntry | null {
    // 如果 key 已存在，先删除旧的
    if (this.map.has(key)) {
      this.bytes -= this.estimateBytes(this.map.get(key)!);
      this.map.delete(key);
    }

    // 超出容量：淘汰最旧的条目（Map 的迭代顺序即插入顺序，第一个是最旧的）
    let evicted: ICacheEntry | null = null;
    while (this.map.size >= this.maxEntries) {
      const oldestKey = this.map.keys().next().value;
      if (!oldestKey) break;
      const oldEntry = this.map.get(oldestKey);
      if (oldEntry) {
        this.bytes -= this.estimateBytes(oldEntry);
        evicted = oldEntry;
      }
      this.map.delete(oldestKey);
    }

    // 插入新条目
    this.map.set(key, entry);
    this.bytes += this.estimateBytes(entry);

    // 如果淘汰的是自己（插入相同 key），返回 null
    return evicted?.key === key ? null : evicted;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  delete(key: string): void {
    const entry = this.map.get(key);
    if (entry) {
      this.bytes -= this.estimateBytes(entry);
    }
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
    this.bytes = 0;
  }

  get size(): number {
    return this.map.size;
  }

  /** 估算总字节数 */
  get totalBytes(): number {
    return this.bytes;
  }

  /** 估算单个 entry 占用字节数 */
  estimateBytes(entry: ICacheEntry): number {
    // 简单估算：JSON 序列化长度
    return JSON.stringify(entry).length * 2; // UTF-16
  }

  /**
   * 按字节数淘汰，直到 totalBytes <= targetBytes
   * @returns 被淘汰的条目列表（用于降级写入 L3）
   */
  evictByBytes(targetBytes: number): ICacheEntry[] {
    const evictedList: ICacheEntry[] = [];

    while (this.bytes > targetBytes && this.map.size > 0) {
      const oldestKey = this.map.keys().next().value;
      if (!oldestKey) break;
      const entry = this.map.get(oldestKey);
      if (entry) {
        this.bytes -= this.estimateBytes(entry);
        evictedList.push(entry);
      }
      this.map.delete(oldestKey);
    }

    return evictedList;
  }

  /** 导出所有条目（用于 rebuild） */
  toEntries(): ICacheEntry[] {
    return Array.from(this.map.values());
  }

  /** 从条目数组重建（用于 SW 启动时从 session 恢复） */
  static fromEntries(
    entries: ICacheEntry[],
    maxEntries: number,
  ): L1Cache {
    const cache = new L1Cache(maxEntries);
    for (const entry of entries) {
      cache.set(entry.key, entry);
    }
    return cache;
  }
}
