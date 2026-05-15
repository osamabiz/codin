import { LocalBaseProvider } from './base/local-base';

export class JanProvider extends LocalBaseProvider {
  constructor() {
    super({
      id: 'jan',
      name: 'Jan.ai',
      baseUrl: 'http://localhost:1337/v1',
      models: [
        { id: 'local-model', name: 'Loaded model (detect to refresh)' },
      ],
    });
  }
}
