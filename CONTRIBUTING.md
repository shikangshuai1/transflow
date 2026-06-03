# Contributing to TransFlow

## 安全约束（PR 必须满足）

### API Key 隔离

- [ ] `engines/` 目录仅被 `background.ts` import
- [ ] Content Script（`content.ts`, `content-main.ts`）不 import `engines/`、`cache`、`storage` 中的任何模块
- [ ] Content Script 不使用 `fetch()` 或 `XMLHttpRequest`（已有 ESLint 强制）
- [ ] API Key 的构造只有一个入口点（Service Worker 中的 `getApiKey()`）
- [ ] 不在 `console.log` 中打印 API Key

### DOM 操作（双语对照）

- [ ] 所有译文 DOM 节点设置了 `aria-hidden="true"` 和 `role="presentation"`
- [ ] 优先使用内部包裹策略（不破坏 `p + p` / `:nth-child()` / grid/flex）
- [ ] CSS 使用 `display: contents` 保护 grid/flex 父级布局

### 浏览器兼容

- [ ] 新功能在 Chrome **和** Firefox 上均通过冒烟测试
- [ ] 浏览器差异记录到 `docs/browser-diff.md`
- [ ] 新增的 `chrome.*` API 调用已验证 Firefox 兼容性

### TreeWalker 跳过清单

- [ ] 新增需要跳过的标签时，添加到 `constants.ts` 对应的 `SKIP_*_TAGS` 集合中，并在 `ALL_SKIP_TAGS` 中注册
- [ ] 不要使用「等」字——每个跳过的标签都要有明确的分类和原因注释

### 去重与缓存

- [ ] `data-translated` 仅作为遍历优化标记，**不作为去重依据**
- [ ] 去重的唯一权威来源是 L1 Map（content hash）

## 开发流程

1. 在 `feature/xxx` 分支上开发
2. Chrome 上验证通过 → 立即在 Firefox 上跑冒烟测试
3. 两浏览器均通过后提交 PR
4. PR 标题用中文

## 项目结构

```
src/
├── engines/          ← 仅被 background.ts import（安全边界）
├── lib/              ← 纯函数 / 工具（可被 content.ts import，但 cache/storage 除外）
├── entrypoints/
│   ├── background.ts ← 唯一持有 API Key 的模块
│   ├── content.ts    ← ISOLATED world（默认）
│   ├── content-main.ts ← MAIN world（CSP 降级，仅 postMessage 桥接）
│   ├── popup/        ← 弹出窗口 UI
│   └── options/      ← 设置页面 UI（待实现）
└── components/       ← 共享 UI 组件（待实现）
```

## 行间穿插 ⚠

行间穿插模式不保证在所有网站上完美渲染。已知风险：通过伪元素 `::before`/`::after` 装饰段落的网站可能出现视觉重叠。遇到此类问题时，请引导用户切换到侧栏模式，或提交 issue 附上 URL 以便针对性适配。
