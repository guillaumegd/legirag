import { generateObject } from 'ai';
import type { LanguageModel } from 'ai';
import type { Client } from 'pg';
import { bedrockProvider } from '@legirag/shared';
import { formatDateReference } from '@legirag/retrieval';
import { createDatabaseClient } from './pg-client.js';
import { RouterQuestionOutput } from './schema.js';

export interface CodeDisponible {
  codeSlug: string;
  code: string;
}

// F-01 : mirroir de packages/eval/src/build-naive-cache.ts's loadCodeSlugs,
// étendu avec le titre complet du code pour le prompt du routeur - mais,
// contrairement à ce script d'ingestion hors ligne, cette fonction sert un
// outil MCP live au même titre que chercher_droit/suivre_renvoi, donc elle
// porte la même exigence qu'eux : `client` doit déjà être sous
// SET LOCAL ROLE anon (voir routerQuestion ci-dessous) au moment de l'appel,
// sans quoi elle interroge articles sous le rôle postgres/DATABASE_URL,
// exempté de RLS - un code dont plus aucun article ne serait visible
// resterait alors proposé comme cible de routage. Le nom porte
// délibérément cette exigence, même motif que fetchRenvoiRowsUnderActiveRlsSession
// (suivre-renvoi.ts).
export async function fetchAvailableCodesUnderActiveRlsSession(client: Client): Promise<CodeDisponible[]> {
  const { rows } = await client.query<{ code_slug: string; code: string }>(
    'select distinct code_slug, code from articles order by code',
  );
  return rows.map((row) => ({ codeSlug: row.code_slug, code: row.code }));
}

export function buildRouterPrompt(question: string, available: CodeDisponible[]): string {
  const liste = available.map((c) => `- ${c.codeSlug} (${c.code})`).join('\n');
  return [
    `Question : "${question}"`,
    '',
    'Codes juridiques disponibles :',
    liste,
    '',
    'Identifie le ou les codes pertinents pour répondre à cette question.',
    "Une question peut relever de plusieurs codes à la fois (par exemple un grand excès de vitesse relève à la fois du code de la route et du code pénal) - retourne tous les codes concernés, pas seulement le premier.",
    'Réponds uniquement avec des codeSlug tirés de la liste ci-dessus.',
  ].join('\n');
}

// Le routeur ne doit jamais faire remonter un code que le modèle a inventé -
// même principe que "ne jamais citer un article non sourcé" ailleurs dans le
// projet, appliqué ici au choix de code plutôt qu'à une citation.
export function filterKnownCodes(modelCodes: string[], available: CodeDisponible[]): string[] {
  const known = new Set(available.map((c) => c.codeSlug));
  return modelCodes.filter((code) => known.has(code));
}

export async function routerQuestion(
  question: string,
  model: LanguageModel = bedrockProvider.volume(),
  now: Date = new Date(),
): Promise<RouterQuestionOutput> {
  const client = createDatabaseClient();
  await client.connect();
  let available: CodeDisponible[];
  try {
    await client.query('BEGIN');
    await client.query(`select set_config('app.date_reference', $1, true)`, [formatDateReference(now)]);
    // app.codes volontairement non défini, comme suivreRenvoi : cet outil
    // décide justement du périmètre, il ne doit pas déjà en recevoir un.
    await client.query('SET LOCAL ROLE anon');
    available = await fetchAvailableCodesUnderActiveRlsSession(client);
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('routerQuestion : ROLLBACK a échoué après une erreur.', rollbackError);
    }
    throw error;
  } finally {
    // La connexion n'est utile que pour la liste des codes - fermée avant
    // l'appel modèle (potentiellement lent) plutôt que gardée ouverte pendant.
    try {
      await client.end();
    } catch (endError) {
      console.error('routerQuestion : la fermeture de la connexion a échoué.', endError);
    }
  }

  const { object } = await generateObject({ model, schema: RouterQuestionOutput, prompt: buildRouterPrompt(question, available) });
  const codes = filterKnownCodes(object.codes, available);

  // Le modèle a proposé au moins un code, mais aucun ne correspond à la liste
  // connue - même logique que le rejet d'une affirmation non sourcée
  // ailleurs dans le projet : mieux vaut une confiance nulle explicite qu'un
  // code inventé qui passe inaperçu.
  if (codes.length === 0 && object.codes.length > 0) {
    return {
      codes: [],
      confiance: 0,
      raisonnement: `${object.raisonnement} (aucun code proposé par le modèle ne correspond à un code connu)`,
    };
  }

  return { ...object, codes };
}
