import { LocalBaseProvider } from './base/local-base';

export class LMStudioProvider extends LocalBaseProvider {
  constructor() {
    super({
      id: 'lmstudio',
      name: 'LM Studio',
      baseUrl: 'http://localhost:1234/v1',
      models: [
        { id: 'local-model', name: 'Loaded model (detect to refresh)' },
      ],
    });
  }
}
