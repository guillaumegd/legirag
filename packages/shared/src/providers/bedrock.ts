import { bedrock } from '@ai-sdk/amazon-bedrock';
import { requireEnv } from '../env.js';
import type { ModelProvider } from '../interfaces.js';

// § 6 - le modèle passe par variable d'environnement, jamais en dur.
// Coût zéro aujourd'hui, changement de modèle gratuit plus tard.
export const bedrockProvider: ModelProvider = {
  volume: () => bedrock(requireEnv('MODEL_VOLUME')),
  escalade: () => bedrock(requireEnv('MODEL_ESCALADE')),
};
