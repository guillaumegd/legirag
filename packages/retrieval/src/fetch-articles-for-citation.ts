import type { Client } from 'pg';
import type { Etat } from '@legirag/shared';
import { createDatabaseClient } from './pg-client.js';
import { formatDateReference } from './query-params.js';

export interface CitationSource {
  articleId: string;
  subdivisionLabel?: string;
}

// texteExact est le texte brut (subdivision ciblée, ou article entier sinon)
// - jamais le Chunk.contenu préfixé par le contexte de recherche (§3.5),
// qui n'est pas ce qu'un lecteur verrait sur Légifrance. subdivisionLabel est
// la source demandée, simplement renvoyée telle quelle - utile à l'appelant
// (toCitation, packages/agent) sans qu'il ait à recorréler avec sa requête.
export interface ArticleForCitation {
  articleIdentifier: string;
  articleNum: string;
  code: string;
  etat: Etat;
  dateDebut: string;
  texteExact: string;
  subdivisionLabel?: string;
}

interface ArticleRow {
  article_identifier: string;
  article_num: string;
  code: string;
  etat: Etat;
  date_debut: string;
  contenu_text: string;
}

interface SubdivisionRow {
  article_identifier: string;
  label: string;
  contenu: string;
}

// ATTENTION (même garde-fou que fetchRenvoiRowsUnderActiveRlsSession /
// fetchAvailableCodesUnderActiveRlsSession, packages/agent) : correct
// uniquement si `client` a déjà, dans la même transaction, exécuté
// set_config('app.date_reference', ...) ET SET LOCAL ROLE anon - sans ça,
// cette fonction renvoie tous les articles demandés, visibles ou non.
async function fetchArticleRowsUnderActiveRlsSession(client: Client, articleIds: string[]): Promise<ArticleRow[]> {
  const { rows } = await client.query<ArticleRow>(
    `select article_identifier, article_num, code, etat, date_debut, contenu_text
     from articles
     where article_identifier = any($1)`,
    [articleIds],
  );
  return rows;
}

// unnest($1, $2) avec deux tableaux de même longueur produit des lignes
// appariées (article_identifier[i], label[i]) - la RLS de subdivisions ne
// fait que vérifier que l'article parent est visible (add_search_rls.sql),
// donc les mêmes garanties que ci-dessus s'appliquent.
async function fetchSubdivisionContentUnderActiveRlsSession(
  client: Client,
  sources: Required<CitationSource>[],
): Promise<SubdivisionRow[]> {
  if (sources.length === 0) return [];
  const { rows } = await client.query<SubdivisionRow>(
    `select s.article_identifier, s.label, s.contenu
     from subdivisions s
     join unnest($1::text[], $2::text[]) as pairs(article_identifier, label)
       on s.article_identifier = pairs.article_identifier and s.label = pairs.label`,
    [sources.map((s) => s.articleId), sources.map((s) => s.subdivisionLabel)],
  );
  return rows;
}

// Une source dont l'article est masqué par la RLS (état ABROGE, hors date,
// etc.) est simplement absente du résultat - même contrat que suivreRenvoi
// et SupabaseRetriever.search : un article caché ne devient jamais une
// citation, il ne lève pas d'erreur non plus.
export async function fetchArticlesForCitation(
  sources: CitationSource[],
  dateReference: Date,
): Promise<ArticleForCitation[]> {
  const uniqueArticleIds = [...new Set(sources.map((s) => s.articleId))];
  const withSubdivision = sources.filter((s): s is Required<CitationSource> => s.subdivisionLabel !== undefined);

  const client = createDatabaseClient();
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`select set_config('app.date_reference', $1, true)`, [formatDateReference(dateReference)]);
    // app.codes volontairement non défini : une citation peut légitimement
    // porter sur un code hors du périmètre routé (même motif que
    // suivreRenvoi/routerQuestion).
    await client.query('SET LOCAL ROLE anon');

    const [articleRows, subdivisionRows] = await Promise.all([
      fetchArticleRowsUnderActiveRlsSession(client, uniqueArticleIds),
      fetchSubdivisionContentUnderActiveRlsSession(client, withSubdivision),
    ]);
    await client.query('COMMIT');

    const articlesById = new Map(articleRows.map((row) => [row.article_identifier, row]));
    const subdivisionByKey = new Map(subdivisionRows.map((row) => [`${row.article_identifier} ${row.label}`, row]));

    const results: ArticleForCitation[] = [];
    for (const source of sources) {
      const article = articlesById.get(source.articleId);
      if (!article) continue; // masqué par la RLS - absent, pas une erreur

      const subdivision =
        source.subdivisionLabel !== undefined
          ? subdivisionByKey.get(`${source.articleId} ${source.subdivisionLabel}`)
          : undefined;

      results.push({
        articleIdentifier: article.article_identifier,
        articleNum: article.article_num,
        code: article.code,
        etat: article.etat,
        dateDebut: article.date_debut,
        texteExact: subdivision?.contenu ?? article.contenu_text,
        ...(source.subdivisionLabel !== undefined ? { subdivisionLabel: source.subdivisionLabel } : {}),
      });
    }
    return results;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('fetchArticlesForCitation : ROLLBACK a échoué après une erreur.', rollbackError);
    }
    throw error;
  } finally {
    try {
      await client.end();
    } catch (endError) {
      console.error('fetchArticlesForCitation : la fermeture de la connexion a échoué.', endError);
    }
  }
}
