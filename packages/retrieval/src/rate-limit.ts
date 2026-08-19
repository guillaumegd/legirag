import type { Client } from 'pg';
import { readPositiveNumberEnv } from '@legirag/shared';
import { createDatabaseClient } from './pg-client.js';

// Clé fixe du verrou avisory (voir plus bas) - hashtext() d'une chaîne
// plutôt qu'un nombre en dur, pour rester lisible. Suffixée par kind au
// moment de l'appel pour que payant et gratuit se sérialisent
// indépendamment (item 17 : une rafale sur les routes gratuites ne doit
// pas ajouter de latence aux vérifications payantes).
const GLOBAL_LOCK_KEY = 'legirag_rate_limit';

// Purge opportuniste (item 17) : ~1 appel sur 100 déclenche un ménage des
// lignes de plus de RATE_LIMIT_RETENTION_DAYS - évite une requête
// supplémentaire à chaque appel tout en gardant la table bornée. Constante
// fixe, pas une variable d'environnement : contrairement aux seuils de
// quota, cette probabilité n'a pas besoin d'être ajustable par déploiement.
const PURGE_PROBABILITY = 0.01;

export type RateLimitKind = 'paid' | 'free';

function readLimits(kind: RateLimitKind): { perMinutePerIp: number; perDayPerIp: number; perDayGlobal: number } {
  if (kind === 'free') {
    return {
      perMinutePerIp: readPositiveNumberEnv('RATE_LIMIT_FREE_PER_MINUTE_PER_IP', 20),
      perDayPerIp: readPositiveNumberEnv('RATE_LIMIT_FREE_PER_DAY_PER_IP', 500),
      perDayGlobal: readPositiveNumberEnv('RATE_LIMIT_FREE_PER_DAY_GLOBAL', 5000),
    };
  }
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

async function purgeOldRequests(client: Client): Promise<void> {
  const retentionDays = readPositiveNumberEnv('RATE_LIMIT_RETENTION_DAYS', 7);
  try {
    await client.query('delete from rate_limit_requests where created_at < now() - make_interval(days => $1)', [
      retentionDays,
    ]);
  } catch (error) {
    // Best-effort : un ménage manqué n'est jamais une raison de faire
    // échouer une vérification de quota réelle.
    console.error('checkRateLimit : purge opportuniste échouée (ignorée, non bloquante).', error);
  }
}

// Utilisé par l'API et le MCP (packages/api, packages/mcp) pour compter les
// requêtes dans une table partagée plutôt qu'en mémoire - une Lambda tourne
// en plusieurs instances à la mémoire isolée, donc un compteur en process ne
// tiendrait pas la limite quotidienne sous charge concurrente (même défaut
// que DailyTokenBudget côté API, laissé tel quel car hors scope de ce fix).
//
// kind (item 17, défaut 'paid') partitionne payant et gratuit dans la même
// table - GET /trace et GET /article passent 'free', tout le reste garde le
// comportement par défaut inchangé.
//
// Réinitialisation manuelle (ex. avant une démo) : voir reset-rate-limits.ts,
// qui vide simplement cette table - tous les compteurs (par IP, globaux, les
// deux kind) en dérivent, donc un seul mécanisme de reset suffit pour tous.
export async function checkRateLimit(ip: string, kind: RateLimitKind = 'paid'): Promise<RateLimitResult> {
  const limits = readLimits(kind);
  const client = createDatabaseClient();
  await client.connect();
  try {
    await client.query('begin');
    // Verrou avisory transactionnel (relâché au commit/rollback) : sérialise
    // toutes les vérifications d'un même kind, pas seulement celles de la
    // même IP - nécessaire pour que le plafond global (per_day_global) soit
    // fiable lui aussi, pas seulement le plafond par IP. Suffixé par kind
    // pour que payant et gratuit ne se bloquent jamais l'un l'autre.
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`${GLOBAL_LOCK_KEY}:${kind}`]);

    const { rows } = await client.query<RateLimitCountsRow>(
      `select
         count(*) filter (where ip = $1 and created_at > now() - interval '1 minute') as per_minute_ip,
         count(*) filter (where ip = $1 and created_at > now() - interval '1 day') as per_day_ip,
         count(*) filter (where created_at > now() - interval '1 day') as per_day_global
       from rate_limit_requests
       where kind = $2`,
      [ip, kind],
    );
    const counts = rows[0];
    const perMinuteIp = counts !== undefined ? Number(counts.per_minute_ip) : 0;
    const perDayIp = counts !== undefined ? Number(counts.per_day_ip) : 0;
    const perDayGlobal = counts !== undefined ? Number(counts.per_day_global) : 0;
    const allowed =
      perMinuteIp < limits.perMinutePerIp && perDayIp < limits.perDayPerIp && perDayGlobal < limits.perDayGlobal;

    if (allowed) {
      await client.query('insert into rate_limit_requests (ip, kind) values ($1, $2)', [ip, kind]);
    }
    await client.query('commit');

    // Hors transaction : un ménage lent ne doit jamais prolonger la durée
    // du verrou avisory ci-dessus.
    if (Math.random() < PURGE_PROBABILITY) {
      await purgeOldRequests(client);
    }

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
