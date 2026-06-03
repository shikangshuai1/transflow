// ============================================================
// TransFlow — Content Script (ISOLATED world)
// 职责: DOM 文本提取、译文注入、接收 SW 指令
// ⚠️ 不持有 API Key、不直接 fetch、不 import engines/
// ============================================================

import { isSkippableTag } from '../src/lib/constants';
import type { TextFragment, PageContext, TranslateRequest } from '../src/lib/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  async main() {
    console.log('[TransFlow] Content script loaded');

    // 注入样式
    const style = document.createElement('style');
    style.textContent = `
      transflow-unit { display: contents; }
      .tf-original { display: inline; }
      .tf-translation {
        display: block;
        color: #666;
        font-size: 0.9em;
        font-style: italic;
        user-select: none;
      }
    `;
    document.head.appendChild(style);

    // 预加载 TTS 语音列表（异步加载，首次 getVoices() 可能空）
    let cachedVoices: SpeechSynthesisVoice[] = [];
    speechSynthesis.getVoices(); // 触发加载
    speechSynthesis.onvoiceschanged = () => {
      cachedVoices = speechSynthesis.getVoices();
    };

    // ============================================================
    // 辅助
    // ============================================================

    function getAncestorChain(el: Element, maxDepth = 5): string {
      const parts: string[] = [];
      let cur: Element | null = el;
      let d = 0;
      while (cur && d < maxDepth && cur !== document.body) {
        parts.unshift(cur.tagName);
        cur = cur.parentElement;
        d++;
      }
      return parts.join(' > ');
    }

    // ============================================================
    // 页面上下文
    // ============================================================

    function collectPageContext(): PageContext {
      const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') ?? undefined;
      const htmlLang = document.documentElement.lang || undefined;
      const ogLocale = document.querySelector('meta[property="og:locale"]')?.getAttribute('content') ?? undefined;

      let inferredDomain: 'tech' | 'academic' | 'general' | undefined;
      const url = location.href.toLowerCase();
      if (/\/docs\/|\/api\/|\/reference\/|\/documentation\/|github\.com|stackoverflow\.com/.test(url)) {
        inferredDomain = 'tech';
      } else if (/\.edu\/|scholar\.google|arxiv\.org|researchgate\.net/.test(url)) {
        inferredDomain = 'academic';
      }
      return { url: location.href, title: document.title, metaDescription: metaDesc, htmlLang, ogLocale, inferredDomain };
    }

    // ============================================================
    // 过滤函数
    // ============================================================

    function acceptNode(node: Text): number {
      const text = node.textContent?.trim();
      if (!text) return NodeFilter.FILTER_REJECT;

      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (isSkippableTag(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (parent.closest('iframe, transflow-unit')) return NodeFilter.FILTER_REJECT;
      if (parent.hasAttribute('data-translated')) return NodeFilter.FILTER_REJECT;

      return NodeFilter.FILTER_ACCEPT;
    }

    // ============================================================
    // 提取文本 + 保留节点引用
    // ============================================================

    interface ExtractionResult {
      fragment: TextFragment;
      node: Text;
    }

    function extractWithNodes(root: Node = document.body): ExtractionResult[] {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode });
      const results: ExtractionResult[] = [];
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) {
        const text = node.textContent?.trim();
        if (!text) continue;
        const parent = node.parentElement!;
        results.push({
          fragment: {
            text,
            meta: {
              tagName: parent.tagName,
              isPlaceholder: parent.tagName === 'INPUT' || parent.tagName === 'TEXTAREA',
              isLink: parent.tagName === 'A',
              ancestorChain: getAncestorChain(parent),
              textLength: text.length,
              containsCode: parent.tagName === 'CODE' || !!parent.closest('pre, code, kbd, samp, var'),
            },
          },
          node,
        });
      }
      return results;
    }

    // ============================================================
    // 译文注入 - 用 <transflow-unit> 包裹，一步还原
    // ============================================================

    function injectByIndex(extracted: ExtractionResult[], translations: string[]): void {
      const ops: Array<{ parent: Element; origNode: Text; origText: string; translation: string }> = [];

      for (let i = 0; i < extracted.length; i++) {
        const { fragment, node } = extracted[i];
        const tr = translations[i];
        if (!tr || tr === fragment.text) continue;
        if (!node.parentElement) continue;

        ops.push({
          parent: node.parentElement,
          origNode: node,
          origText: fragment.text,
          translation: tr,
        });
      }

      for (const { origNode, origText, translation } of ops) {
        if (!origNode.parentElement) continue;

        const unit = document.createElement('transflow-unit');

        const origSpan = document.createElement('span');
        origSpan.className = 'tf-original';
        origSpan.textContent = origText;

        const trSpan = document.createElement('span');
        trSpan.className = 'tf-translation';
        trSpan.textContent = translation;
        trSpan.setAttribute('aria-hidden', 'true');
        trSpan.setAttribute('role', 'presentation');
        trSpan.setAttribute('tabindex', '-1');

        unit.appendChild(origSpan);
        unit.appendChild(document.createElement('br'));
        unit.appendChild(trSpan);

        // 用 unit 替换原始 TextNode（先保存父节点引用，replaceChild 后 origNode 会从 DOM 脱离）
        const parent = origNode.parentElement!;
        parent.replaceChild(unit, origNode);
        parent.setAttribute('data-translated', 'true');
      }

      console.log(`[TransFlow] Injected ${ops.length} translations`);
    }

    // ============================================================
    // 翻译页面 — 分批并行 + 逐批渲染
    // ============================================================

    const BATCH_SIZE = 30;
    const OBSERVER_DEBOUNCE = 800; // ms — 等 DOM 变化停歇后再翻译

    let currentTargetLang = 'zh-CN';
    let mutationObserver: MutationObserver | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const pendingRoots = new Set<Node>();

    // ============================================================
    // SPA 增量翻译 — MutationObserver
    // ============================================================

    function startObserving(): void {
      if (mutationObserver) return;

      mutationObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            pendingRoots.add(node);
          }
        }

        // 防抖：等 DOM 稳定后再翻译
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          const roots = [...pendingRoots];
          pendingRoots.clear();

          const newNodes: ExtractionResult[] = [];
          for (const root of roots) {
            // 只处理元素节点，跳过文本/注释等
            if (root.nodeType === Node.ELEMENT_NODE || root.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
              newNodes.push(...extractWithNodes(root));
            }
          }

          if (newNodes.length === 0) return;

          console.log(`[TransFlow] SPA: translating ${newNodes.length} new fragments`);

          const pageContext = collectPageContext();
          const batches: ExtractionResult[][] = [];
          for (let i = 0; i < newNodes.length; i += BATCH_SIZE) {
            batches.push(newNodes.slice(i, i + BATCH_SIZE));
          }

          await Promise.all(batches.map(async (batch) => {
            const req: TranslateRequest = {
              fragments: batch.map((e) => e.fragment),
              sourceLang: 'auto',
              targetLang: currentTargetLang,
              pageContext,
              strategy: { tone: 'auto', preserveFormatting: true },
            };
            const res = await browser.runtime.sendMessage({
              type: 'TRANSLATE_FRAGMENTS',
              payload: req,
            }) as { translations: string[]; hits: number };
            if (res?.translations) {
              injectByIndex(batch, res.translations);
            }
          }));
        }, OBSERVER_DEBOUNCE);
      });

      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });

      console.log('[TransFlow] MutationObserver started for SPA content');
    }

    function stopObserving(): void {
      if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
      if (mutationObserver) { mutationObserver.disconnect(); mutationObserver = null; }
      pendingRoots.clear();
    }

    // ============================================================
    // 翻译页面 — 分批并行 + 逐批渲染
    // ============================================================

    async function translatePage(targetLang: string): Promise<void> {
      console.log('[TransFlow] Translating page to', targetLang);

      stopObserving();
      revertTranslations();
      currentTargetLang = targetLang;

      const allNodes = extractWithNodes();
      if (allNodes.length === 0) {
        console.log('[TransFlow] No translatable text found');
        startObserving(); // 虽然没翻译内容，但用户可能后续交互出现内容
        return;
      }
      console.log(`[TransFlow] Extracted ${allNodes.length} fragments, batching by ${BATCH_SIZE}`);

      const pageContext = collectPageContext();

      // 分批
      const batches: ExtractionResult[][] = [];
      for (let i = 0; i < allNodes.length; i += BATCH_SIZE) {
        batches.push(allNodes.slice(i, i + BATCH_SIZE));
      }

      let done = 0;

      // 并行发所有批次，每个批次完成立即注入
      await Promise.all(batches.map(async (batch, idx) => {
        const req: TranslateRequest = {
          fragments: batch.map((e) => e.fragment),
          sourceLang: 'auto',
          targetLang,
          pageContext,
          strategy: { tone: 'auto', preserveFormatting: true },
        };

        const res = await browser.runtime.sendMessage({
          type: 'TRANSLATE_FRAGMENTS',
          payload: req,
        }) as { translations: string[]; hits: number };

        if (res?.translations) {
          injectByIndex(batch, res.translations);
          done += batch.length;
          console.log(`[TransFlow] Batch ${idx + 1}/${batches.length} done (${done}/${allNodes.length} total)`);
        }
      }));

      console.log(`[TransFlow] All done — ${done} translations`);

      // 启动 SPA 增量监听
      startObserving();
    }

    // ============================================================
    // 还原 — 只需删除所有 transflow-unit
    // ============================================================

    function revertTranslations(): void {
      stopObserving();

      document.querySelectorAll('transflow-unit').forEach((unit) => {
        // 从 .tf-original 取出原文，替换整个 unit
        const orig = unit.querySelector('.tf-original');
        const text = orig?.textContent ?? unit.textContent ?? '';
        unit.parentElement?.replaceChild(document.createTextNode(text), unit);
      });
      document.querySelectorAll('[data-translated]').forEach((el) => {
        el.removeAttribute('data-translated');
      });
      console.log('[TransFlow] Translations reverted');
    }

    // ============================================================
    // 划词翻译
    // ============================================================

    let bubble: HTMLDivElement | null = null;

    function createBubble(): HTMLDivElement {
      const el = document.createElement('div');
      el.id = 'tf-selection-bubble';
      el.style.cssText = `
        position: fixed; z-index: 2147483647; display: none;
        max-width: 400px; background: #fff; border: 1px solid #e0e0e0;
        border-radius: 10px; box-shadow: 0 4px 24px rgba(0,0,0,0.12);
        padding: 14px; font-family: system-ui, sans-serif; font-size: 13px;
      `;

      const close = document.createElement('button');
      close.textContent = '✕';
      close.style.cssText =
        'position:absolute;top:6px;right:10px;border:none;background:none;cursor:pointer;font-size:14px;color:#999;padding:2px;';
      close.onclick = () => { hideBubble(); };
      el.appendChild(close);

      el.addEventListener('click', (e) => e.stopPropagation());
      document.addEventListener('click', hideBubble, { once: true });
      document.addEventListener('scroll', hideBubble, { once: true });

      return el;
    }

    function hideBubble() {
      if (bubble) { bubble.style.display = 'none'; }
    }

    function showBubble(rect: DOMRect) {
      if (!bubble) {
        bubble = createBubble();
        document.body.appendChild(bubble);
      }

      // 定位：优先在选中文字下方，避让视口边缘
      let top = rect.bottom + 8;
      let left = rect.left;

      // 水平溢出 → 靠右对齐
      if (left + 400 > window.innerWidth - 8) {
        left = window.innerWidth - 408;
      }
      if (left < 8) left = 8;

      // 垂直溢出 → 放上方
      if (top + 200 > window.innerHeight - 8) {
        top = rect.top - 208;
      }
      if (top < 8) top = 8;

      bubble.style.top = top + 'px';
      bubble.style.left = left + 'px';
      bubble.style.display = 'block';
    }

    function setBubbleLoading() {
      if (!bubble) return;
      bubble.innerHTML = '<span style="color:#999;">翻译中...</span>';
      const close = document.createElement('button');
      close.textContent = '✕';
      close.style.cssText =
        'position:absolute;top:6px;right:10px;border:none;background:none;cursor:pointer;font-size:14px;color:#999;padding:2px;';
      close.onclick = () => { hideBubble(); };
      bubble.appendChild(close);
    }

    function setBubbleContent(original: string, translation: string) {
      if (!bubble) return;

      const trDiv = document.createElement('div');
      trDiv.style.cssText = 'font-weight:600;color:#1a1a2e;margin-bottom:6px;line-height:1.5;';
      trDiv.textContent = translation;

      const sep = document.createElement('div');
      sep.style.cssText = 'border-top:1px solid #eee;margin:6px 0;';

      const origDiv = document.createElement('div');
      origDiv.style.cssText = 'font-size:12px;color:#999;line-height:1.4;';
      origDiv.textContent = original;

      const actions = document.createElement('div');
      actions.style.cssText = 'margin-top:8px;display:flex;gap:8px;';

      const copyBtn = document.createElement('button');
      copyBtn.textContent = '📋 复制';
      copyBtn.style.cssText =
        'font-size:11px;padding:3px 10px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;';
      copyBtn.onclick = async () => {
        await navigator.clipboard.writeText(translation);
        copyBtn.textContent = '✅ 已复制';
        setTimeout(() => (copyBtn.textContent = '📋 复制'), 1500);
      };

      const speakBtn = document.createElement('button');
      speakBtn.textContent = '🔊 朗读';
      speakBtn.style.cssText = copyBtn.style.cssText;
      speakBtn.onclick = () => {
        const u = new SpeechSynthesisUtterance(translation);
        u.lang = currentTargetLang;
        u.rate = 0.9;
        u.pitch = 1.0;

        // 选最优语音：目标语言原生语音 > 同语系语音 > 系统默认
        const voices = cachedVoices.length > 0 ? cachedVoices : speechSynthesis.getVoices();
        if (voices.length > 0) {
          const langPrefix = currentTargetLang.split('-')[0];
          // 优先精确匹配（如 zh-CN），其次前缀匹配（如 zh），最后用默认
          const best =
            [...voices].reverse().find((v) => v.lang === currentTargetLang) ??
            [...voices].reverse().find((v) => v.lang.startsWith(langPrefix)) ??
            voices.find((v) => v.default);

          if (best) u.voice = best;
        }

        speechSynthesis.speak(u);
      };

      const close = document.createElement('button');
      close.textContent = '✕';
      close.style.cssText =
        'position:absolute;top:6px;right:10px;border:none;background:none;cursor:pointer;font-size:14px;color:#999;padding:2px;';
      close.onclick = () => { hideBubble(); };

      actions.appendChild(copyBtn);
      actions.appendChild(speakBtn);

      bubble.innerHTML = '';
      bubble.appendChild(close);
      bubble.appendChild(trDiv);
      bubble.appendChild(sep);
      bubble.appendChild(origDiv);
      bubble.appendChild(actions);
    }

    async function handleSelection(): Promise<void> {
      // 不跟已翻译的译文气泡交互
      if (bubble && bubble.style.display === 'block') return;

      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) return;

      const text = sel.toString().trim();
      if (text.length < 2 || text.length > 5000) return;

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) return;

      setBubbleLoading();
      showBubble(rect);

      try {
        const req = {
          type: 'TRANSLATE_SELECTION',
          payload: { text, targetLang: currentTargetLang },
        };
        const res = await browser.runtime.sendMessage(req) as {
          translations: string[];
        };
        if (res?.translations?.[0]) {
          setBubbleContent(text, res.translations[0]);
        } else {
          hideBubble();
        }
      } catch {
        hideBubble();
      }
    }

    // 右键菜单触发（不再自动弹出）
    // SW 注册 context menu，用户右键选择"翻译选中文字"后发此消息

    // ============================================================
    // 消息监听
    // ============================================================

    browser.runtime.onMessage.addListener(
      (message: { type: string; payload?: unknown }) => {
        switch (message.type) {
          case 'TRANSLATE_PAGE': {
            const { targetLang } = message.payload as { targetLang: string };
            return translatePage(targetLang).then(() => ({ success: true }));
          }

          case 'REVERT_PAGE': {
            revertTranslations();
            return Promise.resolve({ success: true });
          }

          case 'SHOW_SELECTION_TRANSLATION': {
            handleSelection();
            return Promise.resolve({ success: true });
          }

          default:
            return undefined;
        }
      },
    );
  },
});
