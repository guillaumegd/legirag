import { describe, expect, it } from 'vitest';
import { describeActivity } from './activity.js';

describe('describeActivity', () => {
  it('describes a route event with codes', () => {
    expect(describeActivity({ event: 'route', data: { codes: ['code-de-la-route', 'code-penal'] } })).toBe(
      'Routé vers Code de la route, Code penal',
    );
  });

  it('describes a route event with no codes as unfiltered', () => {
    expect(describeActivity({ event: 'route', data: { codes: undefined } })).toBe('Recherche non filtrée par code');
  });

  it('describes a search event with citations, singular and plural', () => {
    expect(describeActivity({ event: 'search', data: { citations: [{}] } })).toBe('1 article lu');
    expect(describeActivity({ event: 'search', data: { citations: [{}, {}, {}] } })).toBe('3 articles lus');
  });

  it('describes a search event with no citations', () => {
    expect(describeActivity({ event: 'search', data: { citations: [] } })).toBe('Aucun article trouvé');
  });

  it('describes a draft event', () => {
    expect(describeActivity({ event: 'draft', data: {} })).toBe('Citations vérifiées');
  });

  it('describes a followRenvois event, singular and plural', () => {
    expect(describeActivity({ event: 'followRenvois', data: { newCitationsFound: 1 } })).toBe('1 renvoi suivi');
    expect(describeActivity({ event: 'followRenvois', data: { newCitationsFound: 2 } })).toBe('2 renvois suivis');
    expect(describeActivity({ event: 'followRenvois', data: { newCitationsFound: 0 } })).toBe(
      'Aucun renvoi supplémentaire à suivre',
    );
  });

  it('falls back to the raw node name for an unknown event', () => {
    expect(describeActivity({ event: 'mystere', data: {} })).toBe('mystere');
  });
});
