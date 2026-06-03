# 🌐 TransFlow

开源多引擎浏览器翻译插件 — 数据不经过第三方服务器。

[![MIT License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
![Chrome](https://img.shields.io/badge/Chrome-88%2B-blue)
![Firefox](https://img.shields.io/badge/Firefox-128%2B-orange)

## 核心特性

- 🔒 **隐私优先** — API Key 仅存浏览器本地，翻译请求直连引擎 API
- 🤖 **5 引擎** — DeepSeek / Claude / OpenAI / Google Translate / DeepL
- 📖 **行间双语** — 译文插入原文下方，不用切换窗口
- 🔍 **划词翻译** — 右键 → 翻译选中文字，气泡显示
- 💾 **智能缓存** — 二次翻译零延迟，节省 API 费用
- 🆓 **永久免费** — MIT 开源，无订阅

## 快速开始

```bash
# 安装依赖
pnpm install

# 开发（Chrome）
pnpm dev

# 开发（Firefox）
pnpm dev:firefox

# 构建
pnpm build

# 测试
pnpm test
```

## 安装

### Chrome
1. `pnpm build`
2. `chrome://extensions` → 开发者模式 → 加载已解压 → 选择 `.output/chrome-mv3`

### Firefox
1. `pnpm build:firefox`
2. `about:debugging` → 此 Firefox → 临时载入附加组件 → 选择 `.output/firefox-mv2/manifest.json`

## 配置 API Key

打开插件 Popup → ⚙ 设置 → 输入 DeepSeek API Key → 点「测试」

[获取 DeepSeek API Key](https://platform.deepseek.com/api_keys)

## 质量门禁

```
✅ TypeScript    零错误
✅ ESLint        零错误
✅ 45 unit tests 全绿
✅ Chrome Build  250 KB
✅ Firefox Build 250 KB
```

## 技术栈

WXT · React 19 · TypeScript · Zustand · Vitest

## 项目结构

```
src/engines/      — 5 翻译引擎 + 基类 + 路由
src/lib/          — 类型定义、缓存、存储、常量
entrypoints/      — SW、Content Script、Popup、Options
tests/unit/       — 45 个单元测试
docs/             — 兼容性文档、上架物料
```

## License

MIT
