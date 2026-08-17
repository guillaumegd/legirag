import type { Client } from 'pg';
import type { Article, Etat, Subdivision } from '@legirag/shared';
import { createDatabaseClient } from './pg-client.js';
import { formatDateReference } from './query-params.js';

interface ArticleRow {
  article_identifier: string;
  article_num: string;
  code: string;
  code_slug: string;
  etat: Etat;
  date_debut: string;
  date_fin: string;
  section_path: string[];
  contenu_text: string;
  contenu_markdown: string | null;
  palier: 'largeur' | 'profondeur';
  idcc: string | null;
  updated_at: string;
}

interface SubdivisionRow {
  id: number;
  article_identifier: string;
  label: string;
  ordre: number;
  contenu: string;
}

function toArticle(row: ArticleRow): Article {
  return {
    articleIdentifier: row.article_identifier,
    articleNum: row.article_num,
    code: row.code,
    codeSlug: row.code_slug,
    etat: row.etat,
    dateDebut: row.date_debut,
    dateFin: row.date_fin,
    sectionPath: row.section_path,
    contenuText: row.contenu_text,
    ...(row.contenu_markdown !== null ? { contenuMarkdown: row.contenu_markdown } : {}),
    palier: row.palier,
    ...(row.idcc !== null ? { idcc: row.idcc } : {}),
    updatedAt: row.updated_at,
  };
}

function toSubdivision(row: SubdivisionRow): Subdivision {
  return {
    id: row.id,
    articleIdentifier: row.article_identifier,
    label: row.label,
    ordre: row.ordre,
    contenu: row.contenu,
  };
}

// Même garde-fou que fetchArticlesForCitation : correct uniquement si
// `client` a déjà exécuté set_config('app.date_reference', ...) ET
// SET LOCAL ROLE anon dans la même transaction.
async function fetchArticleRowUnderActiveRlsSession(client: Client, articleIdentifier: string): Promise<ArticleRow | undefined> {
  const { rows } = await client.query<ArticleRow>(
    `select article_identifier, article_num, code, code_slug, etat, date_debut, date_fin,
            section_path, contenu_text, contenu_markdown, palier, idcc, updated_at
     from articles
     where article_identifier = $1`,
    [articleIdentifier],
  );
  return rows[0];
}

// id::int (même correctif que le F-02 sur chunks.id, 7b) : subdivisions.id
// est un bigint identity - pg le renverrait sinon en chaîne, ce qui
// violerait silencieusement Subdivision.id: number.
async function fetchSubdivisionRowsUnderActiveRlsSession(client: Client, articleIdentifier: string): Promise<SubdivisionRow[]> {
  const { rows } = await client.query<SubdivisionRow>(
    `select id::int, article_identifier, label, ordre, contenu
     from subdivisions
     where article_identifier = $1
     order by ordre`,
    [articleIdentifier],
  );
  return rows;
}

// Un article masqué par la RLS (état ABROGE, hors date) revient undefined -
// même contrat que fetchArticlesForCitation/suivreRenvoi/SupabaseRetriever :
// jamais d'erreur, jamais de ligne partielle ou non filtrée.
export async function fetchArticleByIdentifier(
  articleIdentifier: string,
  dateReference: Date,
): Promise<{ article: Article; subdivisions: Subdivision[] } | undefined> {
  const client = createDatabaseClient();
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`select set_config('app.date_reference', $1, true)`, [formatDateReference(dateReference)]);
    // app.codes/app.idcc volontairement non définis : une consultation
    // directe par identifiant n'est pas restreinte par le périmètre du
    // routeur (même raisonnement que fetchArticlesForCitation).
    await client.query('SET LOCAL ROLE anon');

    const articleRow = await fetchArticleRowUnderActiveRlsSession(client, articleIdentifier);
    if (articleRow === undefined) {
      await client.query('COMMIT');
      return undefined;
    }

    const subdivisionRows = await fetchSubdivisionRowsUnderActiveRlsSession(client, articleIdentifier);
    await client.query('COMMIT');

    return { article: toArticle(articleRow), subdivisions: subdivisionRows.map(toSubdivision) };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('fetchArticleByIdentifier : ROLLBACK a échoué après une erreur.', rollbackError);
    }
    throw error;
  } finally {
    try {
      await client.end();
    } catch (endError) {
      console.error('fetchArticleByIdentifier : la fermeture de la connexion a échoué.', endError);
    }
  }
}
