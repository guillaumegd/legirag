import { readPositiveNumberEnv } from '@legirag/shared';
import { createDatabaseClient } from './pg-client.js';

// Clé fixe du verrou avisory global (voir plus bas) - hashtext() d'une
// chaîne constante plutôt qu'un nombre en dur, pour rester lisible.
const GLOBAL_LOCK_KEY = 'legirag_rate_limit';

function readLimits(): { perMinutePerIp: number; perDayPerIp: number; perDayGlobal: number } {
  return {
    perMinutePerIp: readPositiveNumberEnv('RATE_LIMIT_PER_MINUTE_PER_IP', 1),
    perDayPerIp: readPositiveNumberEnv('RATE_LIMIT_PER_DAY_PER_IP', 10),
    perDayGlobal: readPositiveNumberEnv('RATE_LIMIT_PER_DAY_GLOBAL', 50),
  };
}

export interface RateLimitResult {
  allowed: boolean;
}

interface RateLimitCountsRow {
  per_minute_ip: string;
  per_day_ip: string;
  per_day_global: string;
}

// Utilisé par l'API et le MCP (packages/api, packages/mcp) pour compter les
// requêtes dans une table partagée plutôt qu'en mémoire - une Lambda tourne
// en plusieurs instances à la mémoire isolée, donc un compteur en process ne
// tiendrait pas la limite quotidienne sous charge concurrente (même défaut
// que DailyTokenBudget côté API, laissé tel quel car hors scope de ce fix).
//
// Réinitialisation manuelle (ex. avant une démo) : voir reset-rate-limits.ts,
// qui vide simplement cette table - les deux compteurs (par IP et global) en
// dérivent, donc un seul mécanisme de reset suffit pour les deux.
export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  const limits = readLimits();
  const client = createDatabaseClient();
  await client.connect();
  try {
    await client.query('begin');
    // Verrou avisory transactionnel global (relâché au commit/rollback) :
    // sérialise TOUTES les vérifications, pas seulement celles de la même
    // IP - nécessaire pour que le plafond global (per_day_global) soit
    // fiable lui aussi, pas seulement le plafond par IP. Le volume visé
    // (50 requêtes/jour au total) rend ce point de sérialisation unique
    // sans impact perceptible ; inutile de le limiter à une seule IP.
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [GLOBAL_LOCK_KEY]);

    const { rows } = await client.query<RateLimitCountsRow>(
      `select
         count(*) filter (where ip = $1 and created_at > now() - interval '1 minute') as per_minute_ip,
         count(*) filter (where ip = $1 and created_at > now() - interval '1 day') as per_day_ip,
         count(*) filter (where created_at > now() - interval '1 day') as per_day_global
       from rate_limit_requests`,
      [ip],
    );
    const counts = rows[0];
    const perMinuteIp = counts !== undefined ? Number(counts.per_minute_ip) : 0;
    const perDayIp = counts !== undefined ? Number(counts.per_day_ip) : 0;
    const perDayGlobal = counts !== undefined ? Number(counts.per_day_global) : 0;
    const allowed =
      perMinuteIp < limits.perMinutePerIp && perDayIp < limits.perDayPerIp && perDayGlobal < limits.perDayGlobal;

    if (allowed) {
      await client.query('insert into rate_limit_requests (ip) values ($1)', [ip]);
    }
    await client.query('commit');
    return { allowed };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    try {
      await client.end();
    } catch (endError) {
      console.error('checkRateLimit : la fermeture de la connexion a échoué.', endError);
    }
  }
}
