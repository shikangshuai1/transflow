import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],

  manifest: {
    name: 'TransFlow',
    description: '开源多引擎浏览器翻译插件 — 数据不经过第三方服务器',
    permissions: [
      'storage',
      'activeTab',
      'contextMenus',
    ],
    host_permissions: [
      'https://api.deepseek.com/*',
      'https://api.anthropic.com/*',
      'https://api.openai.com/*',
      'https://api-free.deepl.com/*',
      'https://api.deepl.com/*',
      'https://translate.googleapis.com/*',
    ],
    commands: {
      'toggle-translation': {
        suggested_key: { default: 'Alt+T' },
        description: '翻译/还原当前页面',
      },
    },
  },

  // 静默 Firefox 数据收集警告（我们不收集数据）
  suppressWarnings: {
    firefoxDataCollection: true,
  },
});
