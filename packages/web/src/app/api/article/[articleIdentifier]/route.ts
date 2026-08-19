import type { NextRequest } from 'next/server';
import { proxyToApiFromRequest } from '../../../../lib/api-proxy';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ articleIdentifier: string }> },
): Promise<Response> {
  const { articleIdentifier } = await params;
  return proxyToApiFromRequest(`/article/${encodeURIComponent(articleIdentifier)}${request.nextUrl.search}`, request);
}
