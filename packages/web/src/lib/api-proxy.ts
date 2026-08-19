import { headers } from 'next/headers';
import type { ExecutionTrace } from '@legirag/shared/schema';
import { requireEnv, TRUSTED_CLIENT_IP_HEADER } from '@legirag/shared';
import { parseTraceResponse } from './api-client';

// x-forwarded-for est posé par le réseau de périphérie de Vercel (fiable,
// non falsifiable par le client), pas par le navigateur - le premier
// segment est l'IP d'origine, les suivants d'éventuels sauts internes.
export function realClientIp(requestHeaders: Headers): string | undefined {
  const forwarded = requestHeaders.get('x-forwarded-for');
  if (forwarded === null) return undefined;
  const first = forwarded.split(',')[0]?.trim();
  return first !== undefined && first !== '' ? first : undefined;
}

// Le navigateur n'appelle plus jamais l'API directement (fix, 2026-08-19) :
// les routes serveur sous app/api/* sont le seul endroit où
// LEGIRAG_ACCESS_TOKEN existe côté front, jamais envoyé au client
// (contrairement à un NEXT_PUBLIC_*, visible en clair dans le bundle).
//
// clientIp est transmis via TRUSTED_CLIENT_IP_HEADER pour que le rate-limit
// par IP côté API (packages/shared/src/client-ip.ts) compte le vrai
// visiteur plutôt que le serveur Vercel lui-même - sans ça, tous les
// visiteurs partageraient le même quota une fois passés par ce proxy.
export async function proxyToApi(path: string, init?: RequestInit, clientIp?: string): Promise<Response> {
  const apiUrl = requireEnv('LEGIRAG_API_URL');
  const token = requireEnv('LEGIRAG_ACCESS_TOKEN');

  const upstream = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
      ...(clientIp !== undefined ? { [TRUSTED_CLIENT_IP_HEADER]: clientIp } : {}),
    },
  });

  // Ne recopie que Content-Type, pas l'ensemble des en-têtes amont : des
  // en-têtes comme content-length/transfer-encoding décriraient
  // l'encodage de la réponse amont, pas celui que ce Response va produire
  // en re-streamant upstream.body.
  const contentType = upstream.headers.get('Content-Type');
  return new Response(upstream.body, {
    status: upstream.status,
    headers: contentType !== null ? { 'Content-Type': contentType } : {},
  });
}

// Variante pour les routes app/api/* (Route Handlers), qui reçoivent la
// requête entrante et peuvent donc lire x-forwarded-for directement.
export async function proxyToApiFromRequest(path: string, request: Request, init?: RequestInit): Promise<Response> {
  return proxyToApi(path, init, realClientIp(request.headers));
}

// Pour les Server Components (ex. app/trace/[traceId]/page.tsx), qui ne
// peuvent pas appeler fetchTrace de api-client.ts : un chemin relatif
// ('/api/trace/...') ne se résout pas en URL absolue depuis le serveur lui-
// même, contrairement à un navigateur. Appelle donc l'API réelle
// directement plutôt que de faire un aller-retour HTTP vers sa propre route
// app/api/trace/[traceId]/route.ts. Même convention 404 -> undefined que
// fetchTrace (api-client.ts), utilisé lui par les composants client.
export async function fetchTraceServer(traceId: string): Promise<ExecutionTrace | undefined> {
  const incomingHeaders = await headers();
  const response = await proxyToApi(`/trace/${encodeURIComponent(traceId)}`, undefined, realClientIp(incomingHeaders));
  return parseTraceResponse(response);
}
