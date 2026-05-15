import { MoonshotProvider } from './moonshot';

/**
 * Kimi is Moonshot AI's consumer product — same API endpoint, same models.
 * Provided as a separate entry so users who know the "Kimi" brand name can find it.
 */
export class KimiProvider extends MoonshotProvider {
  // Override id and name only; everything else (endpoint, models) is inherited.
  override readonly id = 'kimi';
  override readonly name = 'Kimi (Moonshot AI)';
}
