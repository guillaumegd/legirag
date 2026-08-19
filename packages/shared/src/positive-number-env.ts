// Pendant de requireEnv pour la famille "seuil numérique optionnel" : pas
// de config requise ici, une valeur de repli sûre a plus de sens qu'un
// échec au démarrage (ex. MAX_DAILY_TOKENS, RATE_LIMIT_PER_MINUTE_PER_IP) -
// extrait après que packages/api/src/question/cost-guard.service.ts et
// packages/retrieval/src/rate-limit.ts aient chacun réimplémenté le même
// pattern (fix, 2026-08-19, F-12).
export function readPositiveNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
