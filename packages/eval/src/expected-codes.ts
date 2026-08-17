import type { Client } from 'pg';

// Pas de codesAttendus dans EvaluationQuestion (schema.ts) - les codes
// attendus se dérivent des articlesAttendus déjà annotés plutôt que d'être
// dupliqués dans eval/questions.json.
export function codesForArticles(articleIds: string[], codeByArticleId: Map<string, string>): string[] {
  const codes: string[] = [];
  const seen = new Set<string>();
  for (const articleId of articleIds) {
    const code = codeByArticleId.get(articleId);
    if (code === undefined || seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
  }
  return codes;
}

// Requête directe (pas de session RLS) : ces IDs sont des articles de vérité
// terrain déjà connus en vigueur, même convention non-RLS que loadCodeSlugs
// dans build-naive-cache.ts.
export async function fetchCodeSlugsByArticleId(client: Client, articleIds: string[]): Promise<Map<string, string>> {
  const { rows } = await client.query<{ article_identifier: string; code_slug: string }>(
    'select article_identifier, code_slug from articles where article_identifier = any($1)',
    [articleIds],
  );
  return new Map(rows.map((row) => [row.article_identifier, row.code_slug]));
}
