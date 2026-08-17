import { ExecutionTrace as ExecutionTraceSchema, type ExecutionTrace } from '@legirag/shared';
import { createDatabaseClient } from './pg-client.js';

interface TraceRow {
  trace_id: string;
  question: string;
  date_reference: string;
  codes: string[] | null;
  steps: unknown;
  token_usage: unknown;
  total_duration_ms: number;
  created_at: string;
}

// Écriture directe via la connexion privilégiée DATABASE_URL (propriétaire
// de la table, contourne la RLS) - même schéma que les scripts d'ingestion
// qui écrivent déjà dans articles/chunks (RLS activée) sans policy d'insert
// dédiée. Pas de set_config/SET LOCAL ROLE ici : cette écriture n'est pas
// filtrée par date/état/code, contrairement aux lectures RLS-scopées
// ailleurs dans ce fichier voisin (fetch-articles-for-citation.ts).
export async function persistTrace(trace: ExecutionTrace): Promise<void> {
  const client = createDatabaseClient();
  await client.connect();
  try {
    await client.query(
      `insert into traces (trace_id, question, date_reference, codes, steps, token_usage, total_duration_ms, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        trace.traceId,
        trace.question,
        trace.dateReference,
        trace.codes ?? null,
        JSON.stringify(trace.steps),
        trace.tokenUsage !== undefined ? JSON.stringify(trace.tokenUsage) : null,
        trace.totalDurationMs,
        trace.createdAt,
      ],
    );
  } finally {
    try {
      await client.end();
    } catch (endError) {
      console.error('persistTrace : la fermeture de la connexion a échoué.', endError);
    }
  }
}

// undefined = trace_id inconnu (cas normal, 404 côté API). Une ligne trouvée
// qui échoue ExecutionTrace.parse est une vraie incohérence (colonne jsonb
// corrompue) plutôt qu'un "non trouvé" - elle remonte comme une erreur au
// lieu d'être confondue avec le cas normal.
export async function fetchTrace(traceId: string): Promise<ExecutionTrace | undefined> {
  const client = createDatabaseClient();
  await client.connect();
  try {
    const { rows } = await client.query<TraceRow>(
      `select trace_id, question, date_reference, codes, steps, token_usage, total_duration_ms, created_at
       from traces
       where trace_id = $1`,
      [traceId],
    );
    const row = rows[0];
    if (row === undefined) return undefined;

    return ExecutionTraceSchema.parse({
      traceId: row.trace_id,
      question: row.question,
      dateReference: row.date_reference,
      ...(row.codes !== null ? { codes: row.codes } : {}),
      steps: row.steps,
      ...(row.token_usage !== null ? { tokenUsage: row.token_usage } : {}),
      totalDurationMs: row.total_duration_ms,
      createdAt: row.created_at,
    });
  } finally {
    try {
      await client.end();
    } catch (endError) {
      console.error('fetchTrace : la fermeture de la connexion a échoué.', endError);
    }
  }
}
