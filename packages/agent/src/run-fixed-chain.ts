// Script de vérification manuelle (8a Step 6, étendu par 8b Step 3) : lance
// la chaîne fixe (buildFixedChainGraph) contre les vrais backends Supabase et
// Bedrock, sur une question connue (citation réelle attendue), une question
// clairement hors périmètre (abstention attendue), et une question
// multi-codes (routage attendu vers plusieurs codes). Même convention que
// packages/mcp/src/verify-client.ts et les scripts run-*.ts de
// packages/eval : `pnpm --filter @legirag/agent fixed-chain`.
import { randomUUID } from 'node:crypto';
import { buildFixedChainGraph } from './graph.js';

const QUESTION_CONNUE = 'vitesse maximale autorisée en agglomération';
const QUESTION_HORS_PERIMETRE = "quelle est la recette du cassoulet toulousain ?";
// Même question que packages/mcp/src/verify-client.ts (7c) - censée toucher
// à la fois code-de-la-route (vitesse autorisée) et code-penal (le grand
// excès de vitesse peut être un délit).
const QUESTION_MULTI_CODES = 'je roule à 140 km/h sur autoroute, qu’est-ce que je risque ?';

async function poser(question: string): Promise<void> {
  const graph = buildFixedChainGraph();
  const result = await graph.invoke({
    question,
    dateReference: new Date(),
    codes: undefined,
    traceId: randomUUID(),
    reponse: undefined,
  });
  console.log(`\nQuestion : "${question}"`);
  console.log(`Codes routés : ${JSON.stringify(result.codes)}`);
  console.log(`Citations finales : ${result.citations.length}, itérations de suivi de renvois : ${result.renvoiIterations}`);
  console.log(JSON.stringify(result.reponse, null, 2));
}

async function main(): Promise<void> {
  await poser(QUESTION_CONNUE);
  await poser(QUESTION_HORS_PERIMETRE);
  await poser(QUESTION_MULTI_CODES);
}

main().catch((error: unknown) => {
  console.error('Échec de la chaîne fixe :', error);
  process.exitCode = 1;
});
