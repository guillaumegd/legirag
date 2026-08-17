import { requireEnv } from '@legirag/shared';
import { Client, types } from 'pg';

// pg convertit date/timestamp/timestamptz en objets Date par défaut - on les
// garde en chaîne ISO brute pour rester fidèle au contrat Article.dateDebut /
// dateFin / updatedAt : string (packages/shared/src/types.ts). Effet de bord
// global au module, comme le fait pg lui-même pour son registre de types.
// Copie de packages/retrieval/src/pg-client.ts - duplication assumée, voir
// current-feature.md / Notes de 4d sur pg-client.ts.
types.setTypeParser(1082, (value) => value); // date
types.setTypeParser(1114, (value) => value); // timestamp
types.setTypeParser(1184, (value) => value); // timestamptz

export function createDatabaseClient(): Client {
  return new Client({ connectionString: requireEnv('DATABASE_URL') });
}
