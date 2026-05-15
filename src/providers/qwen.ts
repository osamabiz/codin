import { OpenAIBaseProvider } from './base/openai-base';

// Qwen uses Alibaba Cloud's DashScope, which exposes an OpenAI-compatible mode.
export class QwenProvider extends OpenAIBaseProvider {
  constructor() {
    super({
      id: 'qwen',
      name: 'Qwen (Alibaba Cloud)',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      defaultTestModel: 'qwen-turbo',
      models: [
        { id: 'qwen-max', name: 'Qwen Max' },
        { id: 'qwen-plus', name: 'Qwen Plus' },
        { id: 'qwen-turbo', name: 'Qwen Turbo' },
        { id: 'qwen-coder-plus', name: 'Qwen Coder Plus' },
      ],
    });
  }
}
