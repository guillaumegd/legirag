import { afterEach, describe, expect, it, vi } from 'vitest';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { embedTexts } from './embedding.js';

const send = vi.fn();

vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: vi.fn(() => ({ send })),
  InvokeModelCommand: vi.fn((input: unknown) => ({ input })),
}));

function jsonResponse(embeddings: number[][]): { body: Uint8Array } {
  return { body: new TextEncoder().encode(JSON.stringify({ embeddings: { float: embeddings } })) };
}

afterEach(() => {
  delete process.env.MODEL_EMBEDDING;
  delete process.env.AWS_REGION;
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;
  send.mockClear();
  vi.mocked(BedrockRuntimeClient).mockClear();
  vi.mocked(InvokeModelCommand).mockClear();
});

function setAwsEnv(): void {
  process.env.AWS_REGION = 'eu-west-1';
  process.env.AWS_ACCESS_KEY_ID = 'test-key';
  process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
}

describe('embedTexts', () => {
  it("lève une erreur explicite quand MODEL_EMBEDDING est absent", async () => {
    setAwsEnv();
    await expect(embedTexts(['texte'], 'search_document')).rejects.toThrow(
      "Variable d'environnement manquante : MODEL_EMBEDDING",
    );
  });

  it("envoie input_type et output_dimension=1024 au modèle défini par MODEL_EMBEDDING", async () => {
    setAwsEnv();
    process.env.MODEL_EMBEDDING = 'cohere.embed-v4:0';
    send.mockResolvedValueOnce(jsonResponse([[0.1, 0.2]]));

    const result = await embedTexts(['un texte'], 'search_query');

    expect(result).toEqual([[0.1, 0.2]]);
    const call = vi.mocked(InvokeModelCommand).mock.calls[0]?.[0] as { modelId: string; body: string };
    expect(call.modelId).toBe('cohere.embed-v4:0');
    const body = JSON.parse(call.body) as Record<string, unknown>;
    expect(body).toMatchObject({ texts: ['un texte'], input_type: 'search_query', output_dimension: 1024 });
  });

  it('découpe un lot de plus de 96 textes en plusieurs appels', async () => {
    setAwsEnv();
    process.env.MODEL_EMBEDDING = 'cohere.embed-v4:0';
    const texts = Array.from({ length: 130 }, (_, i) => `texte ${i}`);
    send
      .mockResolvedValueOnce(jsonResponse(Array.from({ length: 96 }, () => [1])))
      .mockResolvedValueOnce(jsonResponse(Array.from({ length: 34 }, () => [2])));

    const result = await embedTexts(texts, 'search_document');

    expect(send).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(130);
    expect(result[0]).toEqual([1]);
    expect(result[129]).toEqual([2]);
  });
});
