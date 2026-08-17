import type { Chunk, Retriever, RequeteRecherche } from '@legirag/shared';
import { embedTexts } from '@legirag/shared';
import { createDatabaseClient } from './pg-client.js';
import { formatCodesFilter, formatDateReference } from './query-params.js';

const RRF_K = 60; // constante standard (Cormack et al.), non ajustée ici - le tuning est l'affaire de l'item 6
const PRE_FUSION_LIMIT = 50; // top 50 de chaque liste avant fusion, indépendant de RequeteRecherche.topK

// vector_search et keyword_search interrogent chunks directement, donc la
// RLS de 4c (chunks_search_read) s'applique déjà dans les deux CTE - le
// join final vers chunks est redondant mais sans risque.
// c.id::int (F-02, trouvé en 7b) : chunks.id est un bigint (identity) - pg
// le renverrait sinon en chaîne (précision au-delà de Number.MAX_SAFE_
// INTEGER), ce qui violerait silencieusement Chunk.id: number. Un id de
// chunk ne s'approchera jamais de la limite d'un int4.
const HYBRID_SEARCH_SQL = `
  with vector_search as (
    select id, row_number() over (order by embedding <=> $1::extensions.vector) as rank
    from chunks
    where embedding is not null
    order by embedding <=> $1::extensions.vector
    limit ${PRE_FUSION_LIMIT}
  ),
  keyword_search as (
    select id, row_number() over (order by ts_rank_cd(tsv, websearch_to_tsquery('french', $2)) desc) as rank
    from chunks
    where tsv @@ websearch_to_tsquery('french', $2)
    limit ${PRE_FUSION_LIMIT}
  ),
  fused as (
    select
      coalesce(v.id, k.id) as id,
      coalesce(1.0 / (${RRF_K} + v.rank), 0.0) + coalesce(1.0 / (${RRF_K} + k.rank), 0.0) as score
    from vector_search v
    full outer join keyword_search k on v.id = k.id
  )
  select c.id::int, c.article_identifier, c.subdivision_label, c.contenu, fused.score
  from fused join chunks c on c.id = fused.id
  order by fused.score desc
  limit $3
`;

interface HybridRow {
  id: number;
  article_identifier: string;
  subdivision_label: string | null;
  contenu: string;
  score: number;
}

// Miroir de toPgVector dans packages/ingest/src/cold/load-chunks.ts - pg n'a
// pas de type vector natif, donc l'embedding voyage en paramètre texte casté
// côté SQL ($1::extensions.vector). Trop petit pour justifier un import
// cross-package.
function toPgVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

// Le score RRF ne fait qu'ordonner le tableau retourné - Chunk n'est pas
// modifié par cette fonctionnalité (voir current-feature.md, Data / contracts).
function toChunk(row: HybridRow): Chunk {
  return {
    id: row.id,
    articleIdentifier: row.article_identifier,
    contenu: row.contenu,
    ...(row.subdivision_label !== null ? { subdivisionLabel: row.subdivision_label } : {}),
  };
}

// Première implémentation concrète de Retriever (packages/shared/src/interfaces.ts).
export class SupabaseRetriever implements Retriever {
  async search(q: RequeteRecherche): Promise<Chunk[]> {
    const [embedding] = await embedTexts([q.texte], 'search_query');
    if (!embedding) throw new Error('embedTexts a renvoyé un résultat vide pour la requête.');

    const client = createDatabaseClient();
    await client.connect();
    try {
      await client.query('BEGIN');
      // set_config(..., true) = SET LOCAL, donc ces GUC ne vivent que le
      // temps de cette transaction - contrat verrouillé par 4c.
      await client.query(`select set_config('app.date_reference', $1, true)`, [
        formatDateReference(q.dateReference),
      ]);
      await client.query(`select set_config('app.codes', $1, true)`, [formatCodesFilter(q.codes)]);
      // Bascule vers le rôle réellement soumis à la RLS - postgres (DATABASE_URL)
      // en est exempté par défaut, comme pour tous les scripts de chargement.
      await client.query('SET LOCAL ROLE anon');

      const { rows } = await client.query<HybridRow>(HYBRID_SEARCH_SQL, [
        toPgVector(embedding),
        q.texte,
        q.topK,
      ]);

      await client.query('COMMIT');
      return rows.map(toChunk);
    } catch (error) {
      // Le ROLLBACK (ou end() ci-dessous) peut lui-même échouer si la
      // connexion est tombée - on avale cette erreur secondaire pour ne
      // jamais masquer error, la cause réelle de l'échec de la recherche.
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('SupabaseRetriever : ROLLBACK a échoué après une erreur de recherche.', rollbackError);
      }
      throw error;
    } finally {
      try {
        await client.end();
      } catch (endError) {
        console.error('SupabaseRetriever : la fermeture de la connexion a échoué.', endError);
      }
    }
  }
}
