# 🌐 TransFlow

**开源多引擎浏览器翻译插件 — 数据不经过第三方服务器。**

[![MIT License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![Chrome](https://img.shields.io/badge/Chrome-88%2B-blue)](https://github.com/shikangshuai1/transflow)
[![Firefox](https://img.shields.io/badge/Firefox-128%2B-orange)](https://github.com/shikangshuai1/transflow)
[![Edge](https://img.shields.io/badge/Edge-88%2B-00b8ff)](https://github.com/shikangshuai1/transflow)

---

## 这是什么

TransFlow 是你浏览器里的翻译助手。选中网页上的外文 → 右键翻译 → 译文出现。整页翻译 → 行间双语对照。**你的 API Key 存在浏览器本地，翻译请求直连引擎，不经过任何中间服务器。**

## 和沉浸式翻译有什么区别

| | TransFlow | 沉浸式翻译 |
|---|:---:|:---:|
| 开源 | ✅ MIT | ❌ 闭源 |
| API Key 存储 | 浏览器本地 | ⚠️ 经第三方服务器转发 |
| 会员订阅 | ❌ 永久免费 | ¥69/年 |
| 引擎可拓展 | ✅ 社区可贡献新引擎 | 官方控制 |
| Firefox 支持优先级 | ✅ 首发即支持 | 功能滞后 |
| DeepSeek 翻译 | ✅ 一等支持 | 有限支持 |

## 功能

### 🌐 整页翻译 + 行间双语

点击翻译，译文出现在原文下方，灰字斜体。看英文网页就像读双语书。

### 🔍 划词翻译

选中文字 → 右键「翻译选中文字」→ 弹出译文气泡。可复制、可朗读。

### 🤖 多引擎自由切换

| 引擎 | 需要 Key | 质量 | 特色 |
|------|:---:|:---:|------|
| **DeepSeek** | ✅ | ⭐⭐⭐⭐⭐ | 性价比最高，约 ¥2/百万 token，中文翻译极佳 |
| **Claude** | ✅ | ⭐⭐⭐⭐⭐ | 语境理解最强 |
| **OpenAI** | ✅ | ⭐⭐⭐⭐⭐ | 生态最丰富 |
| **Google Translate** | ❌ | ⭐⭐⭐ | 免费，130+ 语言，无需注册 |
| **DeepL** | ✅ | ⭐⭐⭐⭐ | 欧洲语言质量最高 |

### ⚡ 更多细节

- **智能缓存** — 同一段文字只翻译一次，二次打开页面几乎瞬间显示
- **SPA 页面支持** — MutationObserver 监听动态内容，新出现的文字自动翻译
- **Alt+T 快捷键** — 一键翻译/还原，不用鼠标点
- **右键菜单** — 选中文字直接用右键翻译
- **API Key 测试** — 输入 Key 后点「测试」即可验证是否生效
- **缓存统计** — 实时查看命中率、节省了多少次 API 调用
- **免费引擎降级** — DeepSeek 宕机了？Google Translate 自动顶上

## 截图

> 待补充：翻译前后对比、划词气泡、设置面板

## 已支持的翻译语言

中文（简繁体）、English、日本語、한국어、Français、Deutsch、Español、Русский、Português、Italiano、العربية、ไทย、Tiếng Việt、Bahasa Indonesia — 共 15 种。

## 安装

### Chrome / Edge

1. 下载 `chrome-mv3.zip`（[Releases](https://github.com/shikangshuai1/transflow/releases)）
2. `chrome://extensions` → 打开「开发者模式」→ 加载已解压 → 选择解压后的文件夹
3. Edge 同理：`edge://extensions` → 开发者模式 → 加载
4. 后续也可直接通过 Chrome Web Store / Edge Add-ons 安装（审核中）

### Firefox

1. 下载 `firefox-mv2.zip`（[Releases](https://github.com/shikangshuai1/transflow/releases)）
2. `about:debugging` → 此 Firefox → 临时载入附加组件 → 选择 manifest.json

## 配置

1. 打开 [DeepSeek 开发者平台](https://platform.deepseek.com/api_keys)，注册并获取 API Key
2. 点击浏览器工具栏 TransFlow 图标 → ⚙ 设置
3. 在 DeepSeek 栏输入 API Key → 点「测试」确认有效
4. 返回主页，选择目标语言 → 打开任意英文网页 → 点击「翻译此页面」

> 💰 不配 Key 也能用 —— Google Translate 完全免费，装好即用。

## 开发

```bash
# 环境：Node.js >= 18 + pnpm
npm install -g pnpm    # 如果没有 pnpm

# 安装依赖
pnpm install

# Chrome 开发（HMR 热更新）
pnpm dev

# Firefox 开发
pnpm dev:firefox

# 运行测试
pnpm test              # 一次性运行
pnpm test:watch        # 持续监听

# 构建
pnpm build             # Chrome/Edge
pnpm build:firefox     # Firefox

# 打包提交商店
pnpm zip               # → .output/chrome-mv3.zip
pnpm zip:firefox       # → .output/firefox-mv2.zip
```

## 项目结构

```
src/
├── engines/           # 翻译引擎抽象层（仅 SW 可引用）
│   ├── base.ts        # AIEngine 基类 + 翻译策略推断器
│   ├── deepseek.ts    # DeepSeek — 继承 OpenAI，仅 30 行
│   ├── openai.ts      # OpenAI + 所有兼容协议引擎的基类
│   ├── claude.ts      # Claude (Anthropic 协议)
│   ├── google.ts      # Google Translate（免费，无需 Key）
│   ├── deepl.ts       # DeepL（自动区分免费/付费 Key）
│   └── index.ts       # 引擎注册表 + 路由 + 故障切换
│
├── lib/
│   ├── types.ts       # 全部类型定义 + 消息协议
│   ├── cache.ts       # 三层缓存 (Map → session → local) + 容量守卫
│   ├── storage.ts     # chrome.storage 封装 (API Key + 设置)
│   └── constants.ts   # 语言列表、跳过标签清单、配额常量
│
├── entrypoints/
│   ├── background.ts  # Service Worker — 翻译路由、缓存、快捷键、右键菜单
│   ├── content.ts     # Content Script — DOM 提取、译文注入、SPA 监听、划词
│   ├── popup/         # Popup UI — 主页 + 设置面板 + 统计面板
│   └── options/       # 独立设置页（备用）
│
tests/unit/            # 45 个单元测试
docs/                  # 浏览器兼容记录 + 上架文案
```

## 架构

```
页面 (Content Script)                Service Worker              外部
  │                                       │                       │
  ├─ DOM Walk (TreeWalker)                │                       │
  ├─ 文本提取 + Hash                       │                       │
  └─── sendMessage ────────────────────→  │                       │
                                          ├─ 查缓存 (L1 Map)      │
                                          ├─ 引擎路由              │
                                          ├─ 故障切换              │
                                          └─── fetch ────────────→│ DeepSeek
                                                                    │ Claude
                                          ←─── 译文 ──────────────│ Google
  ←─── sendMessage ────────────────────  │                       │
  ├─ injectByIndex                        │                       │
  └─ 译文注入到 DOM                        │                       │
```

**安全边界：** Content Script 禁止 `fetch()`（ESLint 强制），API Key 只为 Service Worker 持有（TypeScript Opaque 类型），`engines/` 目录仅被 `background.ts` import。

## 技术栈

| | |
|------|------|
| 框架 | WXT（跨浏览器扩展开发） |
| UI | React 19 + TypeScript |
| 状态 | Zustand |
| 样式 | CSS Modules |
| 测试 | Vitest（45 tests, 3 suites） |
| 构建 | Vite |
| 包管理 | pnpm |

## 贡献

欢迎提交 PR！请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解代码约束和安全要求。

### 添加新翻译引擎

参考 `src/engines/deepseek.ts` — 只需 30 行代码：

```typescript
class YourEngine extends OpenAIEngine {
  id = 'your-engine';
  name = '你的引擎';

  protected get baseURL() { return 'https://your.api/v1'; }
  protected get modelName() { return 'your-model'; }
}

// 然后在 engines/index.ts 的 initEngines() 里注册
registerEngine(new YourEngine());
```

## License

MIT © 2026 TransFlow
