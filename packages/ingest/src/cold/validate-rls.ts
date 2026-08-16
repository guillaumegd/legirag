import type { Client } from 'pg';
import { createDatabaseClient } from './pg-client.js';

// Préfixe unique - permet de vérifier après coup qu'aucune trace ne subsiste,
// et exclut toute collision avec le vrai corpus.
const PREFIX = 'TEST-RLS';

function joursDepuisAujourdhui(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const ARTICLE_VIGUEUR = `${PREFIX}-VIGUEUR`;
const ARTICLE_ABROGE = `${PREFIX}-ABROGE`;
const ARTICLE_FUTUR = `${PREFIX}-FUTUR`;
const ARTICLE_AUTRE_CODE = `${PREFIX}-AUTRECODE`;

const DATE_DEBUT_FUTUR = joursDepuisAujourdhui(30);
const DATE_REFERENCE_DANS_LE_FUTUR = joursDepuisAujourdhui(45);

interface Resultat {
  nom: string;
  reussi: boolean;
  detail: string;
}

const resultats: Resultat[] = [];

async function verifier(client: Client, nom: string, sql: string, params: unknown[], lignesAttendues: number): Promise<void> {
  const { rows } = await client.query<Record<string, unknown>>(sql, params);
  const reussi = rows.length === lignesAttendues;
  resultats.push({
    nom,
    reussi,
    detail: reussi ? `${rows.length} ligne(s), comme attendu` : `${rows.length} ligne(s), attendu ${lignesAttendues}`,
  });
}

async function inserted(client: Client): Promise<void> {
  await client.query(
    `insert into articles
       (article_identifier, article_num, code, code_slug, etat, date_debut, date_fin, contenu_text, palier)
     values
       ($1, $2, 'Code civil', 'code-civil', 'VIGUEUR', $3, '2999-01-01', 'Texte de test en vigueur.', 'largeur'),
       ($4, $5, 'Code civil', 'code-civil', 'ABROGE',  $6, $7,           'Texte de test abrogé.',    'largeur'),
       ($8, $9, 'Code civil', 'code-civil', 'VIGUEUR', $10, '2999-01-01', 'Texte de test pas encore en vigueur.', 'largeur'),
       ($11, $12, 'Code pénal', 'code-penal', 'VIGUEUR', $13, '2999-01-01', 'Texte de test autre code.', 'largeur')`,
    [
      ARTICLE_VIGUEUR,
      `${PREFIX}-VIGUEUR-NUM`,
      joursDepuisAujourdhui(-30),
      ARTICLE_ABROGE,
      `${PREFIX}-ABROGE-NUM`,
      joursDepuisAujourdhui(-365),
      joursDepuisAujourdhui(365), // la plage couvrirait aujourd'hui si seule la date filtrait - c'est etat qui doit bloquer
      ARTICLE_FUTUR,
      `${PREFIX}-FUTUR-NUM`,
      DATE_DEBUT_FUTUR,
      ARTICLE_AUTRE_CODE,
      `${PREFIX}-AUTRECODE-NUM`,
      joursDepuisAujourdhui(-30),
    ],
  );

  await client.query(
    `insert into chunks (article_identifier, contenu) values ($1, 'chunk de test en vigueur'), ($2, 'chunk de test abrogé')`,
    [ARTICLE_VIGUEUR, ARTICLE_ABROGE],
  );

  await client.query(`insert into subdivisions (article_identifier, label, ordre, contenu) values ($1, 'I', 1, 'subdivision de test abrogée')`, [
    ARTICLE_ABROGE,
  ]);
}

async function main(): Promise<void> {
  const client = createDatabaseClient();
  await client.connect();

  try {
    await client.query('BEGIN');
    await inserted(client);

    // RLS ne s'applique pas à postgres (propriétaire des tables, comme tous
    // les load-*.ts existants) - on bascule sur le rôle qu'un vrai client
    // public utiliserait, toujours dans la même transaction donc les
    // fixtures non validées restent visibles.
    await client.query('SET LOCAL ROLE anon');

    // Phase A - valeurs par défaut, aucune variable de session posée.
    await verifier(
      client,
      "Titre : un article ABROGE demandé explicitement par son numéro ne revient jamais",
      `select article_identifier from articles where article_num = $1`,
      [`${PREFIX}-ABROGE-NUM`],
      0,
    );
    await verifier(
      client,
      'Article en vigueur visible par défaut',
      `select article_identifier from articles where article_identifier = $1`,
      [ARTICLE_VIGUEUR],
      1,
    );
    await verifier(
      client,
      "Chunk de l'article en vigueur visible par défaut",
      `select id from chunks where article_identifier = $1`,
      [ARTICLE_VIGUEUR],
      1,
    );
    await verifier(client, "Chunk de l'article ABROGE invisible par défaut", `select id from chunks where article_identifier = $1`, [ARTICLE_ABROGE], 0);
    await verifier(
      client,
      "Subdivision de l'article ABROGE invisible par défaut",
      `select id from subdivisions where article_identifier = $1`,
      [ARTICLE_ABROGE],
      0,
    );
    await verifier(
      client,
      'Article pas encore en vigueur invisible par défaut (date de référence = aujourd’hui)',
      `select article_identifier from articles where article_identifier = $1`,
      [ARTICLE_FUTUR],
      0,
    );
    await verifier(
      client,
      "Article d'un autre code visible par défaut (aucun filtre app.codes posé)",
      `select article_identifier from articles where article_identifier = $1`,
      [ARTICLE_AUTRE_CODE],
      1,
    );

    // Phase B - app.date_reference pointe dans la plage de validité du
    // contrôle "pas encore en vigueur".
    await client.query('select set_config($1, $2, true)', ['app.date_reference', DATE_REFERENCE_DANS_LE_FUTUR]);
    await verifier(
      client,
      'Article pas encore en vigueur devient visible avec une date de référence dans sa plage',
      `select article_identifier from articles where article_identifier = $1`,
      [ARTICLE_FUTUR],
      1,
    );

    // Phase C - app.codes restreint à code-civil.
    await client.query('select set_config($1, $2, true)', ['app.codes', 'code-civil']);
    await verifier(
      client,
      "Article d'un autre code invisible une fois app.codes restreint à code-civil",
      `select article_identifier from articles where article_identifier = $1`,
      [ARTICLE_AUTRE_CODE],
      0,
    );
    await verifier(
      client,
      'Article code-civil toujours visible quand app.codes le contient',
      `select article_identifier from articles where article_identifier = $1`,
      [ARTICLE_VIGUEUR],
      1,
    );
  } finally {
    await client.query('ROLLBACK');

    // Après ROLLBACK, le rôle et les variables de session repassent à leur
    // état d'avant transaction (postgres, RLS non appliquée) - un compte à
    // zéro ici prouve qu'aucune fixture n'a survécu, succès ou échec confondus.
    const { rows } = await client.query<{ total: string }>(`select count(*) as total from articles where article_num like $1`, [`${PREFIX}%`]);
    const traceResiduelle = Number(rows[0]?.total ?? '1');
    resultats.push({
      nom: 'Aucune trace laissée après ROLLBACK',
      reussi: traceResiduelle === 0,
      detail: `${traceResiduelle} ligne(s) de test restante(s)`,
    });

    await client.end();
  }

  console.log('--- Résultats ---');
  for (const r of resultats) {
    console.log(`${r.reussi ? 'OK  ' : 'ÉCHEC'} - ${r.nom} (${r.detail})`);
  }

  const echecs = resultats.filter((r) => !r.reussi);
  if (echecs.length > 0) {
    console.error(`\n${echecs.length}/${resultats.length} scénario(s) en échec.`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nOK : ${resultats.length}/${resultats.length} scénarios passés.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
