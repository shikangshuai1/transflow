// ============================================================
// TransFlow — Cache Layer Unit Tests
// 纯函数，不需要浏览器 API mock
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  hashKey,
  L1Cache,
  type CacheEntry,
} from '../../src/lib/cache';
import { L1_MAX_ENTRIES } from '../../src/lib/constants';

// ============================================================
// 1. CacheKey Hash
// ============================================================

describe('hashKey', () => {
  it('相同原文+语言+引擎 → 相同 hash', () => {
    const a = hashKey('Hello world', 'en', 'zh-CN', 'deepseek');
    const b = hashKey('Hello world', 'en', 'zh-CN', 'deepseek');
    expect(a).toBe(b);
  });

  it('不同原文 → 不同 hash', () => {
    const a = hashKey('Hello', 'en', 'zh-CN', 'deepseek');
    const b = hashKey('World', 'en', 'zh-CN', 'deepseek');
    expect(a).not.toBe(b);
  });

  it('不同目标语言 → 不同 hash', () => {
    const a = hashKey('Hello', 'en', 'zh-CN', 'deepseek');
    const b = hashKey('Hello', 'en', 'ja', 'deepseek');
    expect(a).not.toBe(b);
  });

  it('不同引擎 → 不同 hash', () => {
    const a = hashKey('Hello', 'en', 'zh-CN', 'deepseek');
    const b = hashKey('Hello', 'en', 'zh-CN', 'claude');
    expect(a).not.toBe(b);
  });

  it('相同内容不同源语言 → 不同 hash', () => {
    const a = hashKey('chat', 'en', 'zh-CN', 'deepseek');
    const b = hashKey('chat', 'fr', 'zh-CN', 'deepseek');
    expect(a).not.toBe(b);
  });

  it('emit 空字符串也能正常 hash', () => {
    const result = hashKey('', 'en', 'zh-CN', 'deepseek');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 2. L1Cache — in-memory Map with LRU
// ============================================================

function makeEntry(
  original: string,
  key?: string,
  engine = 'deepseek',
): CacheEntry {
  return {
    key: key ?? hashKey(original, 'en', 'zh-CN', engine),
    original,
    translation: `[译] ${original}`,
    engine,
    timestamp: Date.now(),
    hitCount: 0,
  };
}

describe('L1Cache', () => {
  let l1: L1Cache;

  beforeEach(() => {
    l1 = new L1Cache(L1_MAX_ENTRIES);
  });

  // -- basic ops --

  it('set + get 命中', () => {
    const entry = makeEntry('hello');
    l1.set(entry.key, entry);
    expect(l1.get(entry.key)).toEqual(entry);
  });

  it('未命中返回 undefined', () => {
    expect(l1.get('nonexistent')).toBeUndefined();
  });

  it('同 key 覆盖写入', () => {
    const key = hashKey('hello', 'en', 'zh-CN', 'deepseek');
    const e1 = makeEntry('hello', key);
    const e2 = makeEntry('hello', key);
    e2.translation = '[新译文]';

    l1.set(key, e1);
    l1.set(key, e2);
    expect(l1.get(key)?.translation).toBe('[新译文]');
  });

  it('has 检测 key 是否存在', () => {
    const entry = makeEntry('test');
    expect(l1.has(entry.key)).toBe(false);
    l1.set(entry.key, entry);
    expect(l1.has(entry.key)).toBe(true);
  });

  it('delete 删除条目', () => {
    const entry = makeEntry('test');
    l1.set(entry.key, entry);
    l1.delete(entry.key);
    expect(l1.get(entry.key)).toBeUndefined();
  });

  it('size 返回条目数量', () => {
    expect(l1.size).toBe(0);
    l1.set(hashKey('a', 'en', 'zh-CN', 'ds'), makeEntry('a'));
    l1.set(hashKey('b', 'en', 'zh-CN', 'ds'), makeEntry('b'));
    expect(l1.size).toBe(2);
  });

  it('clear 清空所有条目', () => {
    l1.set(hashKey('a', 'en', 'zh-CN', 'ds'), makeEntry('a'));
    l1.clear();
    expect(l1.size).toBe(0);
  });

  // -- batch performance --

  it('批量 get: 200 条 < 5ms（同步 Map 性能要求）', () => {
    const entries = Array.from({ length: 200 }, (_, i) => {
      const entry = makeEntry(`text-${i}`);
      l1.set(entry.key, entry);
      return entry.key;
    });

    const start = performance.now();
    for (const key of entries) {
      expect(l1.get(key)).toBeDefined();
    }
    const elapsed = performance.now() - start;

    // 200 次同步 Map.get() 应该 < 5ms
    expect(elapsed).toBeLessThan(5);
  });

  // -- LRU eviction --

  it('超过 maxSize 时淘汰最久未使用的条目', () => {
    const tiny = new L1Cache(3); // 只容纳 3 条

    const e1 = makeEntry('text-1');
    const e2 = makeEntry('text-2');
    const e3 = makeEntry('text-3');
    const e4 = makeEntry('text-4');

    tiny.set(e1.key, e1);
    tiny.set(e2.key, e2);
    tiny.set(e3.key, e3);

    // 访问 e1 让它变"新"
    tiny.get(e1.key);

    // 插入第 4 条，应淘汰 e2（最久未使用）
    tiny.set(e4.key, e4);

    expect(tiny.has(e1.key)).toBe(true);  // 被访问过，保留
    expect(tiny.has(e2.key)).toBe(false); // 最久未使用，被淘汰
    expect(tiny.has(e3.key)).toBe(true);  // 刚插入不久
    expect(tiny.has(e4.key)).toBe(true);  // 新插入
  });

  it('get 命中刷新访问时间戳', () => {
    const tiny = new L1Cache(2);

    tiny.set(hashKey('a', 'en', 'zh-CN', 'ds'), makeEntry('a'));
    tiny.set(hashKey('b', 'en', 'zh-CN', 'ds'), makeEntry('b'));

    // 访问 a
    tiny.get(hashKey('a', 'en', 'zh-CN', 'ds'));

    // 插入 c 挤掉 b
    tiny.set(hashKey('c', 'en', 'zh-CN', 'ds'), makeEntry('c'));

    expect(tiny.has(hashKey('a', 'en', 'zh-CN', 'ds'))).toBe(true);
    expect(tiny.has(hashKey('b', 'en', 'zh-CN', 'ds'))).toBe(false);
  });

  it('淘汰时返回被淘汰的 key 列表', () => {
    const tiny = new L1Cache(2);
    const keyA = hashKey('a', 'en', 'zh-CN', 'ds');
    const keyB = hashKey('b', 'en', 'zh-CN', 'ds');
    const keyC = hashKey('c', 'en', 'zh-CN', 'ds');

    tiny.set(keyA, { key: keyA, original: 'a', translation: '[译] a', engine: 'ds', timestamp: Date.now(), hitCount: 0 });
    tiny.set(keyB, { key: keyB, original: 'b', translation: '[译] b', engine: 'ds', timestamp: Date.now(), hitCount: 0 });

    const evicted = tiny.set(keyC,
      { key: keyC, original: 'c', translation: '[译] c', engine: 'ds', timestamp: Date.now(), hitCount: 0 },
    );

    expect(evicted).not.toBeNull();
    expect(evicted!.key).toBe(keyA);
  });

  // -- capacity guard --

  it('estimateBytes 估算条目占用字节数', () => {
    const entry = makeEntry('hello world this is a test text');
    const bytes = l1.estimateBytes(entry);
    // 大约是 original + translation + overhead
    expect(bytes).toBeGreaterThan(0);
    expect(typeof bytes).toBe('number');
  });

  it('totalBytes 追踪总字节数', () => {
    const e1 = makeEntry('hello');
    l1.set(e1.key, e1);
    expect(l1.totalBytes).toBeGreaterThan(0);

    const e2 = makeEntry('world');
    l1.set(e2.key, e2);
    expect(l1.totalBytes).toBeGreaterThan(l1.estimateBytes(e1));
  });

  it('evictByBytes 按字节数淘汰到目标以下', () => {
    const cache = new L1Cache(1000);
    // 插入大量数据
    for (let i = 0; i < 50; i++) {
      cache.set(
        hashKey(`text-${i}`, 'en', 'zh-CN', 'ds'),
        makeEntry(`this is translation text number ${i} with some content to make it larger`),
      );
    }

    const initialSize = cache.size;
    const targetBytes = Math.floor(cache.totalBytes * 0.5);

    const evicted = cache.evictByBytes(targetBytes);

    expect(cache.size).toBeLessThan(initialSize);
    expect(evicted.length).toBeGreaterThan(0);

    // 淘汰后总字节数应在目标以下
    if (cache.size > 0) {
      expect(cache.totalBytes).toBeLessThanOrEqual(targetBytes + 200); // 允许一点余量
    }
  });

  it('空闲的 cache totalBytes 为 0', () => {
    expect(l1.totalBytes).toBe(0);
    expect(l1.size).toBe(0);
  });

  // -- export for rebuild --

  it('toEntries 导出所有条目用于 rebuild', () => {
    const e1 = makeEntry('hello');
    const e2 = makeEntry('world');
    l1.set(e1.key, e1);
    l1.set(e2.key, e2);

    const entries = l1.toEntries();
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.key).sort()).toEqual([e1.key, e2.key].sort());
  });

  it('从 entries 重建 L1Cache', () => {
    const e1 = makeEntry('hello');
    const e2 = makeEntry('world');
    l1.set(e1.key, e1);
    l1.set(e2.key, e2);

    const exported = l1.toEntries();

    const rebuilt = L1Cache.fromEntries(exported, L1_MAX_ENTRIES);
    expect(rebuilt.size).toBe(2);
    expect(rebuilt.get(e1.key)).toEqual(e1);
    expect(rebuilt.get(e2.key)).toEqual(e2);
  });
});
