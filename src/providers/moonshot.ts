import { OpenAIBaseProvider } from './base/openai-base';

export class MoonshotProvider extends OpenAIBaseProvider {
  constructor() {
    super({
      id: 'moonshot',
      name: 'Moonshot AI',
      baseUrl: 'https://api.moonshot.cn/v1',
      defaultTestModel: 'moonshot-v1-8k',
      models: [
        { id: 'moonshot-v1-8k', name: 'Moonshot v1 8k' },
        { id: 'moonshot-v1-32k', name: 'Moonshot v1 32k' },
        { id: 'moonshot-v1-128k', name: 'Moonshot v1 128k' },
      ],
    });
  }
}
