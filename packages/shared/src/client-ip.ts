interface LambdaHttpRequestContext {
  http?: { sourceIp?: string };
}

function parseAmznRequestContext(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  try {
    const parsed = JSON.parse(header) as LambdaHttpRequestContext;
    return parsed.http?.sourceIp;
  } catch {
    return undefined;
  }
}

function firstHeaderValue(header: string | string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  return value !== undefined && value !== '' ? value : undefined;
}

// L'en-tête X-Legirag-Client-Ip du nom TRUSTED_CLIENT_IP_HEADER (minuscules,
// Node normalise tous les noms d'en-têtes) - posé par le proxy Next.js
// (packages/web/src/lib/api-proxy.ts, fix 2026-08-19) avec l'IP réelle du
// visiteur (x-forwarded-for côté Vercel, fiable), sinon x-amzn-request-context
// verrait toujours l'IP du serveur Vercel plutôt que celle du visiteur -
// tous les visiteurs partageraient le même quota par IP une fois le trafic
// passé par le proxy. Ne pas retirer le contrôle du token en amont : cet
// en-tête n'est fiable QUE parce qu'extractClientIp n'est jamais appelé
// avant que verifyAccessToken ait déjà validé l'appelant (AccessTokenGuard
// avant PersistentRateLimitGuard côté API, même ordre séquentiel explicite
// dans handleMcpRequest côté MCP) - sans cette garantie, n'importe quel
// appelant non authentifié pourrait usurper l'IP de son choix.
export const TRUSTED_CLIENT_IP_HEADER = 'x-legirag-client-ip';

// Partagé par packages/api et packages/mcp (fix, 2026-08-19) pour le
// rate-limit par IP. x-amzn-request-context vient d'AWS Lambda Web Adapter
// (infra/lambda.tf), qui le reconstruit lui-même à partir du vrai évènement
// Lambda (requestContext.http.sourceIp d'une Function URL) - jamais depuis
// un en-tête envoyé par l'appelant, donc non falsifiable, contrairement à
// x-forwarded-for (sur une Function URL Lambda, peut contenir ce que le
// client a lui-même fourni). Absent en local (pas d'adaptateur devant le
// process Node en dev) : on retombe alors sur l'IP de la socket TCP.
//
// Type des headers aligné sur Node IncomingHttpHeaders (string | string[] |
// undefined) pour que packages/api (Express) et packages/mcp (http.IncomingMessage
// brut) passent tous les deux `req.headers` directement, sans caster.
export function extractClientIp(
  headers: Record<string, string | string[] | undefined>,
  socketRemoteAddress: string | undefined,
): string {
  const trusted = firstHeaderValue(headers[TRUSTED_CLIENT_IP_HEADER]);
  if (trusted !== undefined) return trusted;

  const raw = firstHeaderValue(headers['x-amzn-request-context']);
  return parseAmznRequestContext(raw) ?? socketRemoteAddress ?? 'unknown';
}
