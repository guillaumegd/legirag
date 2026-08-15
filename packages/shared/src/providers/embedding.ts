import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { z } from 'zod';
import { requireEnv } from '../env.js';

// @ai-sdk/amazon-bedrock (2.2.12, la version installée) n'implémente que le
// format de requête Titan pour l'embedding (inputText/dimensions/normalize),
// quel que soit le modèle passé - les IDs Cohere ne figurent que dans son
// typage TypeScript, jamais dans la requête réellement construite. Cohere
// Embed v4 attend { texts, input_type, output_dimension }, pas la forme
// Titan. D'où l'appel direct à InvokeModel plutôt que bedrock.embedding().
const MAX_TEXTS_PER_CALL = 96; // limite documentée de Cohere Embed v4 sur Bedrock

// Réponse réelle vérifiée par appel direct (2026-08-15) : `embeddings` est
// toujours { float: number[][] }, jamais un tableau nu - contrairement à
// l'exemple "float par défaut" de la doc AWS
// (docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-embed-v4.html),
// qui ne correspond pas au comportement observé sans `embedding_types` explicite.
const EmbedResponse = z.object({
  embeddings: z.object({ float: z.array(z.array(z.number())) }),
});

async function embedBatch(texts: string[], inputType: 'search_document' | 'search_query'): Promise<number[][]> {
  // Un client neuf par lot plutôt qu'un singleton mémoïsé : ce script traite
  // au plus quelques centaines de lots, le coût de construction est
  // négligeable, et ça évite un état de module partagé entre tests.
  const client = new BedrockRuntimeClient({
    region: requireEnv('AWS_REGION'),
    credentials: {
      accessKeyId: requireEnv('AWS_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('AWS_SECRET_ACCESS_KEY'),
    },
  });
  const response = await client.send(
    new InvokeModelCommand({
      modelId: requireEnv('MODEL_EMBEDDING'),
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        texts,
        input_type: inputType,
        output_dimension: 1024, // fixe le vector(1024) verrouillé par le schéma, Cohere défaut à 1536
      }),
    }),
  );
  const body: unknown = JSON.parse(new TextDecoder().decode(response.body));
  return EmbedResponse.parse(body).embeddings.float;
}

// § 6 - même règle que bedrock.ts : le modèle est une variable
// d'environnement, jamais en dur. Cohere embed-v4 via Bedrock (§4.2).
export async function embedTexts(
  texts: string[],
  inputType: 'search_document' | 'search_query',
): Promise<number[][]> {
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += MAX_TEXTS_PER_CALL) {
    const batch = texts.slice(i, i + MAX_TEXTS_PER_CALL);
    results.push(...(await embedBatch(batch, inputType)));
  }
  return results;
}
