import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    // 测试文件位置
    include: ['tests/unit/**/*.test.ts'],
    // 不依赖浏览器 API 的纯模块可以在这里跑
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // 测试中引用 @/lib/types 时能正确解析
    },
  },
});
