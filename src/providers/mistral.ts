import { OpenAIBaseProvider } from './base/openai-base';

export class MistralProvider extends OpenAIBaseProvider {
  constructor() {
    super({
      id: 'mistral',
      name: 'Mistral AI',
      baseUrl: 'https://api.mistral.ai/v1',
      defaultTestModel: 'mistral-small-latest',
      models: [
        { id: 'codestral-latest', name: 'Codestral (best for code)' },
        { id: 'mistral-large-latest', name: 'Mistral Large' },
        { id: 'mistral-small-latest', name: 'Mistral Small' },
      ],
    });
  }
}
