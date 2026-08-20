import { describe, expect, it } from 'vitest';
import { ExecutionTrace as ExecutionTraceSchema, ReponseStructuree as ReponseStructureeSchema } from '@legirag/shared/schema';
import { createSseParser } from './sse';
import {
  MOCK_TRACE_ID_ABSTENTION,
  MOCK_TRACE_ID_NOMINAL,
  mockArticleFor,
  mockQuestionStream,
  mockTraceFor,
} from './mock-fixtures';

async function collectStream(scenario: 'nominal' | 'abstention' | 'erreur', question = 'Question de test') {
  const reader = mockQuestionStream(scenario, question).getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  const events: { event: string; data: unknown }[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    events.push(...parser.push(decoder.decode(value, { stream: true })));
  }
  return events;
}

describe('mockQuestionStream', () => {
  it('emits node activity events then a done event carrying a valid ReponseStructuree (nominal)', async () => {
    const events = await collectStream('nominal');
    expect(events.map((e) => e.event)).toEqual(['route', 'search', 'draft', 'followRenvois', 'done']);
    const done = events.at(-1);
    expect(() => ReponseStructureeSchema.parse(done?.data)).not.toThrow();
  });

  it('emits a done event carrying a valid abstention ReponseStructuree', async () => {
    const events = await collectStream('abstention');
    expect(events.map((e) => e.event)).toEqual(['route', 'search', 'draft', 'done']);
    const done = events.at(-1);
    const parsed = ReponseStructureeSchema.parse(done?.data);
    expect(parsed.confiance).toBe('abstention');
    expect(parsed.escalade).toBeDefined();
  });

  it('emits an error event with no done event for the erreur scenario', async () => {
    const events = await collectStream('erreur');
    expect(events.map((e) => e.event)).toEqual(['route', 'error']);
    expect(events.at(-1)?.data).toEqual({ message: 'Une erreur interne est survenue pendant le traitement de la question.' });
  });
});

describe('mockTraceFor', () => {
  it('returns a valid ExecutionTrace for the nominal mock trace id', () => {
    const trace = mockTraceFor(MOCK_TRACE_ID_NOMINAL);
    expect(() => ExecutionTraceSchema.parse(trace)).not.toThrow();
  });

  it('returns a valid ExecutionTrace for the abstention mock trace id', () => {
    const trace = mockTraceFor(MOCK_TRACE_ID_ABSTENTION);
    expect(() => ExecutionTraceSchema.parse(trace)).not.toThrow();
  });

  it('returns undefined for an unknown trace id', () => {
    expect(mockTraceFor('does-not-exist')).toBeUndefined();
  });

  // F-12 : sans ça, la page de trace affiche une question fixe sans rapport
  // avec celle réellement posée.
  it('echoes back the question actually asked via mockQuestionStream (nominal)', async () => {
    const question = "Un salarié peut-il être licencié pendant ses congés payés ?";
    await collectStream('nominal', question);
    expect(mockTraceFor(MOCK_TRACE_ID_NOMINAL)?.question).toBe(question);
  });

  it('echoes back the question actually asked via mockQuestionStream (abstention)', async () => {
    const question = 'Quel est le droit applicable sur Mars ? (abstention)';
    await collectStream('abstention', question);
    expect(mockTraceFor(MOCK_TRACE_ID_ABSTENTION)?.question).toBe(question);
  });
});

describe('mockArticleFor', () => {
  it('returns the fixture for each known mock article id', () => {
    expect(mockArticleFor('mock-article-1')?.article.articleNum).toBe('L1226-9');
    expect(mockArticleFor('mock-article-2')?.article.articleNum).toBe('L1226-13');
    expect(mockArticleFor('mock-article-3')?.article.articleNum).toBe('L1234-1');
  });

  it('returns undefined for an unknown article id', () => {
    expect(mockArticleFor('does-not-exist')).toBeUndefined();
  });
});
