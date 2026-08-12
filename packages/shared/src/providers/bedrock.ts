import { bedrock } from '@ai-sdk/amazon-bedrock';
import type { ModelProvider } from '../interfaces.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
}

// § 6 — le modèle passe par variable d'environnement, jamais en dur.
// Coût zéro aujourd'hui, changement de modèle gratuit plus tard.
export const bedrockProvider: ModelProvider = {
  volume: () => bedrock(requireEnv('MODEL_VOLUME')),
  escalade: () => bedrock(requireEnv('MODEL_ESCALADE')),
};
