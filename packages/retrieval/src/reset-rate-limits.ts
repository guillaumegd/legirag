import { createDatabaseClient } from './pg-client.js';

// Action manuelle explicite (ex. avant une démo si le plafond du jour est
// déjà atteint) - même traitement que les autres actions opérationnelles de
// ce projet (infra/push-secrets.sh, plafond de facturation AWS) : un humain
// la déclenche volontairement, ce n'est jamais automatique. Vide toute la
// table : les compteurs par IP et global (rate-limit.ts) en dérivent tous
// les deux, donc un seul mécanisme de reset couvre les deux.
async function main(): Promise<void> {
  const client = createDatabaseClient();
  await client.connect();
  try {
    const { rowCount } = await client.query('delete from rate_limit_requests');
    console.log(`Rate-limit réinitialisé : ${rowCount ?? 0} ligne(s) supprimée(s).`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('Échec de la réinitialisation du rate-limit :', error);
  process.exitCode = 1;
});
