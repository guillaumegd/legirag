import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { requireEnv } from '@legirag/shared';
import { SupabaseRetriever } from '@legirag/retrieval';
import { calculer } from './calculer.js';
import { toRequeteRecherche, toToolContent } from './chercher-droit.js';
import { analyserDocumentDescription } from './descriptions/analyser-document.js';
import { calculerDescription } from './descriptions/calculer.js';
import { chercherDroitDescription } from './descriptions/chercher-droit.js';
import { demanderALHumainDescription } from './descriptions/demander-a-l-humain.js';
import { resoudreConventionDescription } from './descriptions/resoudre-convention.js';
import { routerQuestionDescription } from './descriptions/router-question.js';
import { suivreRenvoiDescription } from './descriptions/suivre-renvoi.js';
import { versionALaDateDescription } from './descriptions/version-a-la-date.js';
import { demanderALHumain } from './demander-a-l-humain.js';
import { routerQuestion } from './router-question.js';
import {
  AnalyserDocumentInput,
  CalculerInput,
  ChercherDroitInput,
  DemanderALHumainInput,
  ResoudreConventionInput,
  RouterQuestionInput,
  SuivreRenvoiInput,
  VersionALaDateInput,
} from './schema.js';
import { stubToolResult } from './stub-tool.js';
import { suivreRenvoi } from './suivre-renvoi.js';

const VERSION_A_LA_DATE_MESSAGE =
  "Non implémenté : nécessite le palier de profondeur (historique complet des textes), prévu à l'item 10 de la feuille de route. Utilise chercher_droit avec une date de référence pour la version actuellement en vigueur, ou demander_a_l_humain si la question porte sur une version passée du texte.";

const RESOUDRE_CONVENTION_MESSAGE =
  "Non implémenté : nécessite l'ingestion du corpus KALI (branche convention collective), non construite. Utilise demander_a_l_humain si la question porte sur une convention collective spécifique.";

const ANALYSER_DOCUMENT_MESSAGE =
  "Non implémenté : le mode d'analyse de document déposé n'est pas construit. Utilise demander_a_l_humain si la question porte sur un document fourni par l'utilisateur.";

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

  server.registerTool(
    versionALaDateDescription.name,
    { description: versionALaDateDescription.description, inputSchema: VersionALaDateInput.shape },
    (_input) => stubToolResult(VERSION_A_LA_DATE_MESSAGE),
  );

  server.registerTool(
    resoudreConventionDescription.name,
    { description: resoudreConventionDescription.description, inputSchema: ResoudreConventionInput.shape },
    (_input) => stubToolResult(RESOUDRE_CONVENTION_MESSAGE),
  );

  server.registerTool(
    analyserDocumentDescription.name,
    { description: analyserDocumentDescription.description, inputSchema: AnalyserDocumentInput.shape },
    (_input) => stubToolResult(ANALYSER_DOCUMENT_MESSAGE),
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
