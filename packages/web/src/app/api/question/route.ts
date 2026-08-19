import type { NextRequest } from 'next/server';
import { proxyToApiFromRequest } from '../../../lib/api-proxy';

export async function POST(request: NextRequest): Promise<Response> {
  return proxyToApiFromRequest('/question', request, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: await request.text(),
  });
}
