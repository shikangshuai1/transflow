// ============================================================
// TransFlow — ESLint Configuration
// 强制执行安全约束与代码规范
// ============================================================

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  {
    // 全局规则
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off', // 插件开发需要 console.log 调试
    },
  },

  // ============================================================
  // Content Script 文件 — 安全约束（不可违反）
  // ============================================================
  {
    files: [
      'src/entrypoints/content.ts',
      'src/entrypoints/content-main.ts',
    ],
    rules: {
      // 禁止在 Content Script 中直接使用 fetch / XMLHttpRequest
      // 翻译请求必须通过 sendMessage 转发到 Service Worker
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message: '❌ Content Script 禁止直接 fetch()，请通过 sendMessage 转发翻译请求到 Service Worker',
        },
        {
          name: 'XMLHttpRequest',
          message: '❌ Content Script 禁止直接 XMLHttpRequest，请通过 sendMessage 转发翻译请求到 Service Worker',
        },
      ],

      // 禁止 Content Script import 引擎/缓存/存储模块
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../engines/**'],
              message: '❌ Content Script 禁止直接访问引擎模块（engines/ 仅被 background.ts import）',
            },
            {
              group: ['../lib/cache'],
              message: '❌ Content Script 禁止直接访问缓存模块',
            },
            {
              group: ['../lib/storage'],
              message: '❌ Content Script 禁止直接访问存储模块',
            },
          ],
        },
      ],
    },
  },
);
