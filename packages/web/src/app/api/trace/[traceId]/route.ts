import type { NextRequest } from 'next/server';
import { proxyToApiFromRequest } from '../../../../lib/api-proxy';
import { isMockBackendEnabled } from '../../../../lib/mock-backend';
import { mockTraceFor } from '../../../../lib/mock-fixtures';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ traceId: string }> },
): Promise<Response> {
  const { traceId } = await params;

  if (isMockBackendEnabled()) {
    const trace = mockTraceFor(traceId);
    return trace === undefined ? new Response(null, { status: 404 }) : Response.json(trace);
  }

  return proxyToApiFromRequest(`/trace/${encodeURIComponent(traceId)}`, request);
}
