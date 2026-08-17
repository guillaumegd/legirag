import type { Client } from 'pg';
import type { Renvoi } from '@legirag/shared';
import { formatDateReference } from '@legirag/retrieval';
import { createDatabaseClient } from './pg-client.js';

// cibleVisible vient du LEFT JOIN articles (Step 3) sous RLS - un signal
// interne à la requête, jamais exposé sur Renvoi lui-même.
export interface RenvoiRow extends Renvoi {
  cibleVisible: boolean;
}

export interface SplitRenvois {
  renvois: Renvoi[];
  nonResolus: string[];
}

// resolu (extrait) ET cibleVisible (RLS, aujourd'hui) doivent être vrais pour
// qu'un renvoi soit réellement suivable - "résolu mais caché" et "jamais
// résolu" sont le même résultat pour l'appelant : non exploitable maintenant.
export function splitRenvois(rows: RenvoiRow[]): SplitRenvois {
  const renvois: Renvoi[] = [];
  const nonResolus: string[] = [];

  for (const { cibleVisible, ...renvoi } of rows) {
    if (renvoi.resolu && cibleVisible) {
      renvois.push(renvoi);
    } else {
      nonResolus.push(formatNonResolu(renvoi));
    }
  }

  return { renvois, nonResolus };
}

function formatNonResolu(renvoi: Renvoi): string {
  return renvoi.cibleCode ? `${renvoi.cibleArticleNum} (${renvoi.cibleCode})` : renvoi.cibleArticleNum;
}

interface RenvoiDbRow {
  id: number;
  source_article: string;
  cible_article_num: string;
  cible_code: string | null;
  cible_article_id: string | null;
  cible_subdivision: string | null;
  forme: Renvoi['forme'];
  inter_code: boolean;
  offset_debut: number | null;
  offset_fin: number | null;
  resolu: boolean;
  cible_visible: boolean;
}

function toRenvoiRow(row: RenvoiDbRow): RenvoiRow {
  return {
    id: row.id,
    sourceArticle: row.source_article,
    cibleArticleNum: row.cible_article_num,
    forme: row.forme,
    interCode: row.inter_code,
    resolu: row.resolu,
    cibleVisible: row.cible_visible,
    ...(row.cible_code !== null ? { cibleCode: row.cible_code } : {}),
    ...(row.cible_article_id !== null ? { cibleArticleId: row.cible_article_id } : {}),
    ...(row.cible_subdivision !== null ? { cibleSubdivision: row.cible_subdivision } : {}),
    ...(row.offset_debut !== null ? { offsetDebut: row.offset_debut } : {}),
    ...(row.offset_fin !== null ? { offsetFin: row.offset_fin } : {}),
  };
}

// Le LEFT JOIN vers articles n'est visible que sous RLS (role anon) - une
// cible ABROGE, hors date, ou d'un autre périmètre invisible aujourd'hui ne
// remonte tout simplement pas, exactement le même mécanisme que
// SupabaseRetriever.search() pour chercher_droit (4c/4d).
// r.id::int : renvois.id est un bigint (identity) - pg le renverrait sinon
// en chaîne (pour ne pas perdre de précision au-delà de Number.MAX_SAFE_
// INTEGER), ce qui violerait silencieusement Renvoi.id: number. Un id de
// renvoi ne s'approchera jamais de la limite d'un int4, donc le cast est sûr.
const RENVOIS_SQL = `
  select
    r.id::int, r.source_article, r.cible_article_num, r.cible_code,
    r.cible_article_id, r.cible_subdivision, r.forme, r.inter_code,
    r.offset_debut, r.offset_fin, r.resolu,
    (a.article_identifier is not null) as cible_visible
  from renvois r
  left join articles a on a.article_identifier = r.cible_article_id
  where r.source_article = $1
`;

// ATTENTION (F-01) : cibleVisible n'est correct que si `client` a déjà,
// dans la même transaction, exécuté set_config('app.date_reference', ...)
// ET SET LOCAL ROLE anon (voir suivreRenvoi ci-dessous). Sans ça, cette
// fonction renvoie silencieusement cibleVisible: true pour tout le monde -
// exactement l'inverse de la règle "un article caché ne remonte jamais"
// que cette fonctionnalité existe pour appliquer. Le nom porte
// délibérément cette exigence pour qu'un futur appel direct (7c/7d, item 8)
// ne puisse pas la manquer. Exportée uniquement parce que verify-client.ts
// (Step 5) en a besoin pour isoler le filtre par cible du garde-fou sur la
// source, qui utilise la même dateReference et bloquerait ce test-là (le
// corpus n'a aucune ligne ABROGE/historique aujourd'hui, donc une
// dateReference ancienne rend la source invisible elle aussi).
export async function fetchRenvoiRowsUnderActiveRlsSession(client: Client, articleId: string): Promise<RenvoiRow[]> {
  const { rows } = await client.query<RenvoiDbRow>(RENVOIS_SQL, [articleId]);
  return rows.map(toRenvoiRow);
}

// now est injectable (comme toRequeteRecherche en 7a), utile pour les tests
// d'intégration futurs même si l'outil MCP exposé n'accepte pas de date -
// le contrat verrouillé de suivre_renvoi n'en prend pas.
export async function suivreRenvoi(articleId: string, now: Date = new Date()): Promise<SplitRenvois> {
  const client = createDatabaseClient();
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`select set_config('app.date_reference', $1, true)`, [formatDateReference(now)]);
    // app.codes volontairement non défini : un renvoi peut légitimement
    // pointer vers n'importe quel code, contrairement à chercher_droit qui
    // filtre sur le périmètre choisi par le routeur.
    await client.query('SET LOCAL ROLE anon');

    const { rows: sourceRows } = await client.query('select 1 from articles where article_identifier = $1', [
      articleId,
    ]);
    if (sourceRows.length === 0) {
      throw new Error(`Article ${articleId} introuvable ou non en vigueur à la date de référence.`);
    }

    const rows = await fetchRenvoiRowsUnderActiveRlsSession(client, articleId);
    await client.query('COMMIT');
    return splitRenvois(rows);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('suivreRenvoi : ROLLBACK a échoué après une erreur.', rollbackError);
    }
    throw error;
  } finally {
    try {
      await client.end();
    } catch (endError) {
      console.error('suivreRenvoi : la fermeture de la connexion a échoué.', endError);
    }
  }
}
