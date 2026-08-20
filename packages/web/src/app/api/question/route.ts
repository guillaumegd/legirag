import type { NextRequest } from 'next/server';
import { proxyToApiFromRequest } from '../../../lib/api-proxy';
import { isMockBackendEnabled, selectScenario } from '../../../lib/mock-backend';
import { mockQuestionStream } from '../../../lib/mock-fixtures';

export async function POST(request: NextRequest): Promise<Response> {
  if (isMockBackendEnabled()) {
    const body = (await request.json()) as { question?: unknown };
    const question = typeof body.question === 'string' ? body.question : '';
    return new Response(mockQuestionStream(selectScenario(question), question), {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  return proxyToApiFromRequest('/question', request, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: await request.text(),
  });
}
