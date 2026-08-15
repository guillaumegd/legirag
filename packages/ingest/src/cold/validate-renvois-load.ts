import { createDatabaseClient } from './pg-client.js';

// Article de référence du cahier des charges technique (plage + énumération
// combinées, confirmé réel lors de 3a) - vérifie que la résolution retrouve
// bien chaque cible attendue, pas seulement qu'elle produit un compte rond.
const EXEMPLE_ARTICLE_IDENTIFIER = 'LEGIARTI000031747801';

async function main(): Promise<void> {
  const client = createDatabaseClient();
  await client.connect();

  try {
    const totaux = await client.query<{ total: string; resolus: string; non_resolus: string }>(
      `select
         count(*) as total,
         count(*) filter (where resolu) as resolus,
         count(*) filter (where not resolu) as non_resolus
       from renvois`,
    );
    console.log('--- Totaux ---');
    console.log(totaux.rows[0]);

    const parForme = await client.query<{ forme: string; total: string; resolus: string; taux: string }>(
      `select
         forme,
         count(*) as total,
         count(*) filter (where resolu) as resolus,
         round(100.0 * count(*) filter (where resolu) / count(*), 1) as taux
       from renvois
       group by forme
       order by forme`,
    );
    console.log('--- Taux de résolution par forme ---');
    console.table(parForme.rows);

    const exemple = await client.query<{
      cible_article_num: string;
      cible_code: string | null;
      resolu: boolean;
      cible_reel_article_num: string | null;
      cible_reel_code: string | null;
    }>(
      `select
         r.cible_article_num,
         r.cible_code,
         r.resolu,
         a.article_num as cible_reel_article_num,
         a.code as cible_reel_code
       from renvois r
       left join articles a on a.article_identifier = r.cible_article_id
       where r.source_article = $1
       order by r.id`,
      [EXEMPLE_ARTICLE_IDENTIFIER],
    );
    console.log(`--- Renvois de ${EXEMPLE_ARTICLE_IDENTIFIER} (Code de l'énergie, R142-11) ---`);
    console.table(exemple.rows);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
