// ============================================================
// TransFlow — Strategy Inferrer Unit Tests
// ============================================================

import { describe, it, expect } from 'vitest';
import { inferStrategy } from '../../src/engines/base';
import type { TextFragment, PageContext } from '../../src/lib/types';

function makeFrag(
  text: string,
  tagName = 'SPAN',
  textLength?: number,
): TextFragment {
  return {
    text,
    meta: {
      tagName,
      isPlaceholder: false,
      isLink: tagName === 'A',
      ancestorChain: `BODY > DIV > ${tagName}`,
      textLength: textLength ?? text.length,
      containsCode: false,
    },
  };
}

function makePageCtx(overrides: Partial<PageContext> = {}): PageContext {
  return {
    url: 'https://example.com',
    title: 'Test Page',
    ...overrides,
  };
}

describe('inferStrategy', () => {
  // ---------- Precise (UI 短文本) ----------

  it('全 BUTTON 短文本 → precise', () => {
    const frags = [
      makeFrag('Submit', 'BUTTON'),
      makeFrag('Cancel', 'BUTTON'),
    ];
    const s = inferStrategy(frags, makePageCtx());
    expect(s.tone).toBe('precise');
  });

  it('全 INPUT + 短文本 → precise', () => {
    const frags = [
      makeFrag('Enter your name', 'INPUT', 16),
      makeFrag('Password', 'INPUT', 8),
    ];
    // INPUT 的 isPlaceholder 可能为 true
    const fragsWithMeta = frags.map((f) => ({
      ...f,
      meta: { ...f.meta, isPlaceholder: true },
    }));
    const s = inferStrategy(fragsWithMeta, makePageCtx());
    expect(s.tone).toBe('precise');
  });

  it('A 标签 + 短文本 → precise', () => {
    const frags = [makeFrag('Click here', 'A')];
    const s = inferStrategy(frags, makePageCtx());
    expect(s.tone).toBe('precise');
  });

  // ---------- Technical ----------

  it('URL 含 /docs/ → technical', () => {
    const frags = [makeFrag('This is a long paragraph about how the API works.', 'P', 50)];
    const s = inferStrategy(frags, makePageCtx({ url: 'https://example.com/docs/api-reference' }));
    expect(s.tone).toBe('technical');
    expect(s.preserveFormatting).toBe(true);
  });

  it('URL 含 /api/ → technical', () => {
    const frags = [makeFrag('GET /v1/users', 'CODE')];
    const s = inferStrategy(frags, makePageCtx({ url: 'https://example.com/api/v1' }));
    expect(s.tone).toBe('technical');
  });

  it('含代码片段 → technical', () => {
    const frags = [
      { text: 'const x = 1;', meta: { tagName: 'CODE', isPlaceholder: false, isLink: false, ancestorChain: 'BODY > PRE > CODE', textLength: 12, containsCode: true }},
    ];
    const s = inferStrategy(frags, makePageCtx());
    expect(s.tone).toBe('technical');
    expect(s.preserveFormatting).toBe(true);
  });

  // ---------- Auto（默认）----------

  it('普通 P 段落 + 通用 URL → auto', () => {
    const frags = [makeFrag('This is a blog post about cooking.', 'P', 40)];
    const s = inferStrategy(frags, makePageCtx());
    expect(s.tone).toBe('auto');
  });

  it('混合标签 + 通用 URL → auto', () => {
    const frags = [
      makeFrag('Welcome to my site', 'H1', 20),
      makeFrag('This is the first paragraph.', 'P', 30),
      makeFrag('Read more', 'A', 8),
    ];
    // 有 A 但不是"全部短 UI"（有 H1 和 P），应 fallback
    const s = inferStrategy(frags, makePageCtx());
    expect(s.tone).toBe('auto');
  });

  // ---------- preserveFormatting ----------

  it('precise 不保留格式', () => {
    const frags = [makeFrag('OK', 'BUTTON')];
    const s = inferStrategy(frags, makePageCtx());
    expect(s.preserveFormatting).toBe(false);
  });

  it('auto 保留格式', () => {
    const frags = [makeFrag('Hello world', 'P', 15)];
    const s = inferStrategy(frags, makePageCtx());
    expect(s.preserveFormatting).toBe(true);
  });
});
