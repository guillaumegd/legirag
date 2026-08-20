import type { NextRequest } from 'next/server';
import { proxyToApiFromRequest } from '../../../../lib/api-proxy';
import { isMockBackendEnabled } from '../../../../lib/mock-backend';
import { mockArticleFor } from '../../../../lib/mock-fixtures';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ articleIdentifier: string }> },
): Promise<Response> {
  const { articleIdentifier } = await params;

  if (isMockBackendEnabled()) {
    const result = mockArticleFor(articleIdentifier);
    return result === undefined ? new Response(null, { status: 404 }) : Response.json(result);
  }

  return proxyToApiFromRequest(`/article/${encodeURIComponent(articleIdentifier)}${request.nextUrl.search}`, request);
}
