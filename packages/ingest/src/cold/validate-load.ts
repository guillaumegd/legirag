import type { Client } from 'pg';
import { createDatabaseClient } from './pg-client.js';

interface Lookup {
  codeSlug: string;
  articleNum: string;
}

interface ArticleRow {
  article_identifier: string;
  code: string;
  section_path: string[];
  contenu_text: string;
}

interface SubdivisionRow {
  label: string;
  ordre: number;
  contenu: string;
}

// Trois cas réels confirmés en base pendant le scoping de cette étape :
// subdivisions imbriquées (I. -> 1°/2°), subdivisions à plat (1°/2°/3°), et
// un article sans aucune subdivision - la majorité du corpus (2c : ~75%).
const LOOKUPS: Lookup[] = [
  { codeSlug: 'code-de-l-action-sociale-et-des-familles', articleNum: 'L232-21-3' },
  { codeSlug: 'code-de-l-urbanisme', articleNum: 'R111-42' },
  { codeSlug: 'code-de-la-route', articleNum: 'L444-1' },
];

async function runLookups(client: Client): Promise<number> {
  let failures = 0;

  for (const lookup of LOOKUPS) {
    console.log(`--- ${lookup.codeSlug} / ${lookup.articleNum} ---`);

    const { rows } = await client.query<ArticleRow>(
      `select article_identifier, code, section_path, contenu_text
       from articles where code_slug = $1 and article_num = $2`,
      [lookup.codeSlug, lookup.articleNum],
    );
    const article = rows[0];

    if (!article) {
      console.error('ÉCHEC : aucun article trouvé pour cette recherche.');
      failures++;
      continue;
    }

    console.log(`Identifiant : ${article.article_identifier}`);
    console.log(`Code : ${article.code}`);
    console.log(`Chemin hiérarchique : ${article.section_path.join(' > ')}`);
    console.log(`Texte : ${article.contenu_text}`);

    const { rows: subdivisions } = await client.query<SubdivisionRow>(
      `select label, ordre, contenu from subdivisions
       where article_identifier = $1 order by ordre`,
      [article.article_identifier],
    );

    if (subdivisions.length === 0) {
      console.log('Subdivisions : aucune');
    } else {
      console.log('Subdivisions :');
      for (const subdivision of subdivisions) {
        const apercu =
          subdivision.contenu.length > 80 ? `${subdivision.contenu.slice(0, 80)}...` : subdivision.contenu;
        console.log(`  [${subdivision.ordre}] ${subdivision.label} : ${apercu}`);
      }
    }
    console.log('');
  }

  return failures;
}

// Le vrai test de non-collision de slugifyCode : contre ce qui est réellement
// chargé, pas contre le fichier brut (2c/2d s'accordent sur ce principe : les
// vérifications à l'échelle du corpus réel vivent dans un script, jamais dans
// un test unitaire).
async function checkSlugCollisions(client: Client): Promise<number> {
  let failures = 0;

  const { rows: codeEclate } = await client.query<{ code: string; slug_count: string }>(
    `select code, count(distinct code_slug) as slug_count
     from articles group by code having count(distinct code_slug) > 1`,
  );
  if (codeEclate.length > 0) {
    console.error(`ÉCHEC : ${codeEclate.length} code(s) éclaté(s) sur plusieurs slugs :`, codeEclate);
    failures++;
  }

  const { rows: slugPartage } = await client.query<{ code_slug: string; code_count: string }>(
    `select code_slug, count(distinct code) as code_count
     from articles group by code_slug having count(distinct code) > 1`,
  );
  if (slugPartage.length > 0) {
    console.error(`ÉCHEC : ${slugPartage.length} slug(s) partagé(s) par plusieurs codes distincts :`, slugPartage);
    failures++;
  }

  return failures;
}

async function main(): Promise<void> {
  const client = createDatabaseClient();
  await client.connect();

  let failures = 0;
  try {
    failures += await runLookups(client);
    failures += await checkSlugCollisions(client);
  } finally {
    await client.end();
  }

  if (failures > 0) {
    process.exitCode = 1;
    return;
  }
  console.log('OK : toutes les recherches ont abouti, aucune collision de code_slug.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
