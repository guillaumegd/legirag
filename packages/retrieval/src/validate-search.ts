import { createDatabaseClient } from './pg-client.js';
import { SupabaseRetriever } from './supabase-retriever.js';

interface SmokeQuestion {
  texte: string;
  codes?: string[];
}

const SMOKE_QUESTIONS: SmokeQuestion[] = [
  { texte: 'vitesse maximale autorisée en agglomération' },
  { texte: 'délai de rétractation pour un achat en ligne' },
  { texte: 'peine encourue pour un vol simple' },
];

async function runSmokeQuestions(retriever: SupabaseRetriever): Promise<void> {
  console.log('--- Questions de fumée (jugement humain) ---');
  for (const { texte, codes } of SMOKE_QUESTIONS) {
    const results = await retriever.search({ texte, dateReference: new Date(), topK: 5, ...(codes ? { codes } : {}) });
    console.log(`\nQuestion : "${texte}"${codes ? ` (codes: ${codes.join(',')})` : ''}`);
    for (const chunk of results) {
      const apercu = chunk.contenu.slice(0, 150).replace(/\n/g, ' ');
      console.log(`  [${chunk.articleIdentifier}]${chunk.subdivisionLabel ? ` ${chunk.subdivisionLabel}` : ''} ${apercu}`);
    }
    if (results.length === 0) console.log('  (aucun résultat)');
  }
}

async function checkCodesFilter(retriever: SupabaseRetriever): Promise<boolean> {
  const results = await retriever.search({
    texte: "conditions de validité d'un contrat",
    codes: ['code-civil'],
    dateReference: new Date(),
    topK: 10,
  });

  const client = createDatabaseClient();
  await client.connect();
  let ok = true;
  try {
    const { rows } = await client.query<{ code_slug: string }>(
      `select distinct code_slug from articles where article_identifier = any($1)`,
      [results.map((r) => r.articleIdentifier)],
    );
    const strayCodes = rows.map((r) => r.code_slug).filter((slug) => slug !== 'code-civil');
    if (strayCodes.length > 0) {
      console.log(`  ÉCHEC : résultats hors code-civil malgré le filtre codes : ${strayCodes.join(', ')}`);
      ok = false;
    } else {
      console.log(`  OK : ${results.length} résultat(s), tous en code-civil.`);
    }
  } finally {
    await client.end();
  }
  return ok;
}

async function checkDateReferenceFilter(retriever: SupabaseRetriever): Promise<boolean> {
  const texte = 'vitesse maximale autorisée en agglomération';
  const today = await retriever.search({ texte, dateReference: new Date(), topK: 10 });
  const ancient = await retriever.search({ texte, dateReference: new Date('1900-01-01'), topK: 10 });

  if (today.length === 0) {
    console.log("  ÉCHEC : la requête de référence n'a renvoyé aucun résultat avec la date du jour.");
    return false;
  }
  if (ancient.length !== 0) {
    console.log(`  ÉCHEC : ${ancient.length} résultat(s) renvoyé(s) avec dateReference=1900-01-01.`);
    return false;
  }
  console.log(`  OK : ${today.length} résultat(s) avec la date du jour, 0 avec dateReference=1900-01-01.`);
  return true;
}

async function main(): Promise<void> {
  const retriever = new SupabaseRetriever();

  await runSmokeQuestions(retriever);

  console.log('\n--- Vérification automatique : filtre codes ---');
  const codesOk = await checkCodesFilter(retriever);

  console.log('\n--- Vérification automatique : filtre dateReference ---');
  const dateOk = await checkDateReferenceFilter(retriever);

  if (!codesOk || !dateOk) {
    console.error('\nÉCHEC : au moins une vérification automatique a échoué.');
    process.exitCode = 1;
    return;
  }

  console.log('\nOK : filtres codes et dateReference bien appliqués via SupabaseRetriever.');
  console.log("Relire les questions de fumée ci-dessus pour juger de la cohérence des résultats.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
