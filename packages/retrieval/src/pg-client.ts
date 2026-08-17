import { requireEnv } from '@legirag/shared';
import { Client, types } from 'pg';

// pg convertit date/timestamp/timestamptz en objets Date par défaut - on les
// garde en chaîne ISO brute pour rester fidèle au contrat Article.dateDebut /
// dateFin / updatedAt : string (packages/shared/src/types.ts). Effet de bord
// global au module, comme le fait pg lui-même pour son registre de types.
// createDatabaseClient est exporté (comme formatDateReference ci-dessous)
// pour que packages/agent (8a) le réutilise au lieu d'une troisième copie -
// packages/mcp gardait jusqu'ici sa propre copie assumée en duplication,
// désormais supprimée puisque plus rien dans mcp ne parle à Postgres
// directement une fois les outils relocalisés vers agent.
types.setTypeParser(1082, (value) => value); // date
types.setTypeParser(1114, (value) => value); // timestamp
types.setTypeParser(1184, (value) => value); // timestamptz

export function createDatabaseClient(): Client {
  return new Client({ connectionString: requireEnv('DATABASE_URL') });
}
