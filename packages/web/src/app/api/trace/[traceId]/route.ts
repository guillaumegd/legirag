import type { NextRequest } from 'next/server';
import { proxyToApiFromRequest } from '../../../../lib/api-proxy';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ traceId: string }> },
): Promise<Response> {
  const { traceId } = await params;
  return proxyToApiFromRequest(`/trace/${encodeURIComponent(traceId)}`, request);
}
