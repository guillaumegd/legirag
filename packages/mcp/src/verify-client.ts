// Script de vérification manuelle (étape 4 de 7a) : se connecte au serveur MCP
// en cours d'exécution comme le ferait un agent tiers, liste ses outils, puis
// appelle chercher_droit sur une question de fumée connue. Pas branché sur
// index.ts - à lancer séparément, serveur déjà démarré (`pnpm --filter
// @legirag/mcp dev`), via `pnpm --filter @legirag/mcp verify-client`.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

const DEFAULT_PORT = 3333;
const SMOKE_QUESTION = 'vitesse maximale autorisée en agglomération';

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

  await client.close();
}

main().catch((error: unknown) => {
  console.error('Échec de la vérification :', error);
  process.exitCode = 1;
});
