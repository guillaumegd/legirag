import { afterEach, describe, expect, it, vi } from 'vitest';
import { bedrock } from '@ai-sdk/amazon-bedrock';
import { bedrockProvider } from './bedrock.js';

vi.mock('@ai-sdk/amazon-bedrock', () => ({
  bedrock: vi.fn((modelId: string) => ({ modelId })),
}));

afterEach(() => {
  delete process.env.MODEL_VOLUME;
  delete process.env.MODEL_ESCALADE;
  vi.mocked(bedrock).mockClear();
});

describe('bedrockProvider', () => {
  it("volume() lève une erreur explicite quand MODEL_VOLUME est absent", () => {
    expect(() => bedrockProvider.volume()).toThrow(
      "Variable d'environnement manquante : MODEL_VOLUME",
    );
  });

  it("escalade() lève une erreur explicite quand MODEL_ESCALADE est absent", () => {
    expect(() => bedrockProvider.escalade()).toThrow(
      "Variable d'environnement manquante : MODEL_ESCALADE",
    );
  });

  it('volume() appelle bedrock() avec le modèle défini par MODEL_VOLUME', () => {
    process.env.MODEL_VOLUME = 'eu.anthropic.claude-haiku-4-5';
    bedrockProvider.volume();
    expect(bedrock).toHaveBeenCalledWith('eu.anthropic.claude-haiku-4-5');
  });

  it('escalade() appelle bedrock() avec le modèle défini par MODEL_ESCALADE', () => {
    process.env.MODEL_ESCALADE = 'eu.anthropic.claude-sonnet-5';
    bedrockProvider.escalade();
    expect(bedrock).toHaveBeenCalledWith('eu.anthropic.claude-sonnet-5');
  });
});
