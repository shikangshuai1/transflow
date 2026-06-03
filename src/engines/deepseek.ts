// ============================================================
// TransFlow — DeepSeek API Engine
// 继承 OpenAI 兼容逻辑，仅替换 baseURL + 模型名
// DeepSeek API 文档: https://platform.deepseek.com/api-docs
// ============================================================

import { OpenAIEngine } from './openai';

export class DeepSeekEngine extends OpenAIEngine {
  readonly id = 'deepseek';
  readonly name = 'DeepSeek';

  // deepseek-chat 是 DeepSeek 的别名，始终指向最新模型（当前为 V4）

  protected override get baseURL(): string {
    return 'https://api.deepseek.com/v1';
  }

  protected override get modelName(): string {
    return 'deepseek-chat';
  }
}
