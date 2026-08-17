import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { requireEnv } from '@legirag/shared';
import { SupabaseRetriever } from '@legirag/retrieval';
import { calculer } from './calculer.js';
import { toRequeteRecherche, toToolContent } from './chercher-droit.js';
import { calculerDescription } from './descriptions/calculer.js';
import { chercherDroitDescription } from './descriptions/chercher-droit.js';
import { demanderALHumainDescription } from './descriptions/demander-a-l-humain.js';
import { routerQuestionDescription } from './descriptions/router-question.js';
import { suivreRenvoiDescription } from './descriptions/suivre-renvoi.js';
import { demanderALHumain } from './demander-a-l-humain.js';
import { routerQuestion } from './router-question.js';
import {
  CalculerInput,
  ChercherDroitInput,
  DemanderALHumainInput,
  RouterQuestionInput,
  SuivreRenvoiInput,
} from './schema.js';
import { suivreRenvoi } from './suivre-renvoi.js';

const DEFAULT_PORT = 3333;

export function createLegiragMcpServer(): McpServer {
  const server = new McpServer({ name: 'legirag', version: '0.0.0' });
  const retriever = new SupabaseRetriever();

  server.registerTool(
    chercherDroitDescription.name,
    { description: chercherDroitDescription.description, inputSchema: ChercherDroitInput.shape },
    async (input) => {
      const chunks = await retriever.search(toRequeteRecherche(input));
      return { content: toToolContent(chunks) };
    },
  );

  server.registerTool(
    suivreRenvoiDescription.name,
    { description: suivreRenvoiDescription.description, inputSchema: SuivreRenvoiInput.shape },
    async (input) => {
      const result = await suivreRenvoi(input.articleId);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    demanderALHumainDescription.name,
    { description: demanderALHumainDescription.description, inputSchema: DemanderALHumainInput.shape },
    (input) => {
      const result = demanderALHumain(input);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  // CalculerInput est une union discriminante (pas un ZodObject), donc pas de
  // .shape ici : on passe le schéma complet, accepté par registerTool comme
  // AnySchema (voir @modelcontextprotocol/sdk/server/zod-compat.js).
  server.registerTool(
    calculerDescription.name,
    { description: calculerDescription.description, inputSchema: CalculerInput },
    (input) => {
      const result = calculer(input);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    routerQuestionDescription.name,
    { description: routerQuestionDescription.description, inputSchema: RouterQuestionInput.shape },
    async (input) => {
      const result = await routerQuestion(input.question);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  return server;
}

export async function startServer(port = Number(process.env.MCP_PORT ?? DEFAULT_PORT)): Promise<void> {
  // Échoue vite (F-03) : SupabaseRetriever ne lit DATABASE_URL que lors du
  // premier vrai appel de chercher_droit (dans search()), donc sans ce
  // contrôle explicite ici, un serveur mal configuré se dit "à l'écoute" et
  // ne révèle le problème qu'à la première question posée.
  requireEnv('DATABASE_URL');

  // Mode sans état (pas de sessionIdGenerator) : une requête HTTP = un
  // échange complet, aucune session à tenir. Le SDK impose en retour qu'un
  // McpServer/transport sans état ne serve qu'UNE seule requête HTTP (voir son
  // exemple officiel simpleStatelessStreamableHttp.js) - donc on recrée les
  // deux à chaque requête plutôt que de les partager entre appels, sans quoi
  // le deuxième message JSON-RPC d'une même connexion (ex. notifications/
  // initialized juste après initialize) échoue en 500.
  const httpServer = createServer((req, res) => {
    void handleMcpRequest(req, res);
  });

  await new Promise<void>((resolve) => httpServer.listen(port, resolve));
  console.log(`Serveur MCP legirag à l'écoute sur http://localhost:${port}`);
}

async function handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const mcpServer = createLegiragMcpServer();
    // Mode sans état : ne pas passer sessionIdGenerator du tout (au lieu de
    // `{ sessionIdGenerator: undefined }`, rejeté par exactOptionalPropertyTypes)
    // - même comportement runtime, le SDK lit `options.sessionIdGenerator`
    // sur un objet par défaut `{}` de toute façon.
    const transport = new StreamableHTTPServerTransport();
    // F-04 : .catch(...) plutôt que void, comme supabase-retriever.ts pour
    // le même cas (un échec de nettoyage secondaire ne doit ni être masqué
    // ni remonter en rejet de promesse non intercepté).
    res.on('close', () => {
      transport.close().catch((error: unknown) => {
        console.error('Erreur lors de la fermeture du transport MCP :', error);
      });
      mcpServer.close().catch((error: unknown) => {
        console.error('Erreur lors de la fermeture du serveur MCP :', error);
      });
    });
    // Cast nécessaire : les setters onclose/onerror/onmessage de
    // StreamableHTTPServerTransport acceptent explicitement `undefined`, ce que
    // exactOptionalPropertyTypes refuse pour les champs optionnels de l'interface
    // Transport du SDK - un défaut de typage du SDK, pas un problème runtime.
    await mcpServer.connect(transport as unknown as Transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('Erreur MCP :', error);
    if (!res.headersSent) res.writeHead(500).end();
  }
}
