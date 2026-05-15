import { OpenAIBaseProvider } from './base/openai-base';

export class OpenAIProvider extends OpenAIBaseProvider {
  constructor() {
    super({
      id: 'openai',
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      defaultTestModel: 'gpt-4o-mini',
      models: [
        { id: 'gpt-4o', name: 'GPT-4o' },
        { id: 'gpt-4o-mini', name: 'GPT-4o mini' },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      ],
    });
  }
}
