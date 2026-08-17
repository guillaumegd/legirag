// Script de vérification manuelle (étape 4 de 7a, étendu en étape 5 de 7b) :
// se connecte au serveur MCP en cours d'exécution comme le ferait un agent
// tiers, liste ses outils, puis appelle chercher_droit et suivre_renvoi sur
// des cas de fumée connus. Pas branché sur index.ts - à lancer séparément,
// serveur déjà démarré (`pnpm --filter @legirag/mcp dev`), via
// `pnpm --filter @legirag/mcp verify-client`.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { formatDateReference } from '@legirag/retrieval';
import { createDatabaseClient } from './pg-client.js';
import { fetchRenvoiRowsUnderActiveRlsSession, splitRenvois } from './suivre-renvoi.js';

const DEFAULT_PORT = 3333;
const SMOKE_QUESTION = 'vitesse maximale autorisée en agglomération';
// Article 1840 R du code général des impôts - un seul renvoi, résolu, vers
// l'article 893 (même code). Choisi pour rester lisible dans cette sortie.
const SMOKE_ARTICLE_ID = 'LEGIARTI000006313236';

async function main(): Promise<void> {
  const port = Number(process.env.MCP_PORT ?? DEFAULT_PORT);
  const client = new Client({ name: 'legirag-verify-client', version: '0.0.0' });
  // server.ts route tout sur '/' (pas de routage dédié) - même chemin ici.
  const transport = new StreamableHTTPClientTransport(new URL(`http://localhost:${port}/`));

  // Même contournement de typage documenté dans server.ts : le getter
  // sessionId de StreamableHTTPClientTransport accepte `undefined`, ce
  // qu'exactOptionalPropertyTypes refuse pour l'interface Transport du SDK.
  await client.connect(transport as unknown as Transport);
  console.log(`Connecté au serveur MCP sur le port ${port}.`);

  const { tools } = await client.listTools();
  console.log(`Outils disponibles : ${tools.map((tool) => tool.name).join(', ')}`);

  console.log(`\nAppel de chercher_droit avec : "${SMOKE_QUESTION}"`);
  const result = await client.callTool({ name: 'chercher_droit', arguments: { texte: SMOKE_QUESTION } });
  console.log(JSON.stringify(result, null, 2));

  console.log(`\nAppel de suivre_renvoi avec : "${SMOKE_ARTICLE_ID}"`);
  const renvoiResult = await client.callTool({ name: 'suivre_renvoi', arguments: { articleId: SMOKE_ARTICLE_ID } });
  console.log(JSON.stringify(renvoiResult, null, 2));

  await client.close();

  // Preuve du filtre de visibilité par cible (7b, Step 5) : appel direct de
  // fetchRenvoiRowsUnderActiveRlsSession (pas suivreRenvoi() ni le
  // round-trip MCP) avec une dateReference ancienne - même technique que
  // validate-search.ts pour prouver le filtre dateReference de
  // chercher_droit. Pas suivreRenvoi(), car le corpus n'a aucune ligne
  // ABROGE/historique aujourd'hui : une dateReference ancienne rendrait
  // aussi la SOURCE invisible, et le garde-fou de suivreRenvoi() lèverait
  // une erreur avant même d'atteindre le filtre par cible qu'on veut
  // isoler ici - on recrée donc la même session RLS à la main (voir F-01).
  console.log(`\nPreuve du filtre par cible (dateReference=1900-01-01, hors garde-fou source) :`);
  const rawClient = createDatabaseClient();
  await rawClient.connect();
  try {
    await rawClient.query('BEGIN');
    await rawClient.query(`select set_config('app.date_reference', $1, true)`, [
      formatDateReference(new Date('1900-01-01')),
    ]);
    await rawClient.query('SET LOCAL ROLE anon');
    const ancientRows = await fetchRenvoiRowsUnderActiveRlsSession(rawClient, SMOKE_ARTICLE_ID);
    await rawClient.query('COMMIT');
    console.log(JSON.stringify(splitRenvois(ancientRows), null, 2));
  } finally {
    await rawClient.end();
  }
}

main().catch((error: unknown) => {
  console.error('Échec de la vérification :', error);
  process.exitCode = 1;
});
