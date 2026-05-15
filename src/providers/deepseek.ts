import { OpenAIBaseProvider } from './base/openai-base';

// DeepSeek uses an OpenAI-compatible API — same wire format, different base URL.
export class DeepSeekProvider extends OpenAIBaseProvider {
  constructor() {
    super({
      id: 'deepseek',
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      defaultTestModel: 'deepseek-chat',
      models: [
        { id: 'deepseek-chat', name: 'DeepSeek Chat' },
        { id: 'deepseek-coder', name: 'DeepSeek Coder' },
      ],
    });
  }
}
