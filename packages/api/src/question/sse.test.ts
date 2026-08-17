import { describe, expect, it } from 'vitest';
import { formatSseEvent } from './sse.js';

describe('formatSseEvent', () => {
  it('formate un événement nommé avec des données JSON sur une seule ligne data:', () => {
    const formatted = formatSseEvent('search', { citations: [] });
    expect(formatted).toBe('event: search\ndata: {"citations":[]}\n\n');
  });

  it('termine toujours par une ligne vide (double saut de ligne)', () => {
    const formatted = formatSseEvent('done', { ok: true });
    expect(formatted.endsWith('\n\n')).toBe(true);
  });

  it('sérialise correctement des données imbriquées', () => {
    const formatted = formatSseEvent('draft', { citations: [{ code: 'code-de-la-route' }], draftAttempts: 1 });
    expect(formatted).toContain('"code":"code-de-la-route"');
    expect(formatted.startsWith('event: draft\ndata: ')).toBe(true);
  });
});
