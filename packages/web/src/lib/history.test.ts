import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReponseStructuree } from '@legirag/shared/schema';
import { MAX_HISTORY_ENTRIES, clearHistory, listHistoryEntries, removeHistoryEntry, saveHistoryEntry } from './history.js';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

function buildReponse(overrides: Partial<ReponseStructuree> = {}): ReponseStructuree {
  return {
    verdict: 'Verdict de test',
    regle_principale: {
      article_identifier: 'LEGIARTI000001',
      article_num: 'L1',
      subdivision: 'I',
      code: 'Code de test',
      texte_exact: 'Texte de test',
      date_debut: '2020-01-01',
      etat: 'VIGUEUR',
      url_legifrance: 'https://legifrance.gouv.fr/test',
    },
    textes_complementaires: [],
    hors_perimetre: ['non couvert'],
    confiance: 'elevee',
    date_reference: '2026-08-20',
    trace_id: overrides.trace_id ?? 'trc_default',
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('history storage', () => {
  it('returns an empty list when nothing was saved', () => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    expect(listHistoryEntries()).toEqual([]);
  });

  it('saves and lists an entry, newest first', () => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    saveHistoryEntry({ id: 'trc_a', question: 'Première question', reponse: buildReponse({ trace_id: 'trc_a' }), askedAt: '2026-08-19T10:00:00.000Z' });
    saveHistoryEntry({ id: 'trc_b', question: 'Seconde question', reponse: buildReponse({ trace_id: 'trc_b' }), askedAt: '2026-08-20T10:00:00.000Z' });

    expect(listHistoryEntries().map((entry) => entry.id)).toEqual(['trc_b', 'trc_a']);
  });

  it('caps the list at MAX_HISTORY_ENTRIES, dropping the oldest entry', () => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    for (let i = 0; i < MAX_HISTORY_ENTRIES + 1; i += 1) {
      saveHistoryEntry({ id: `trc_${i}`, question: `Question ${i}`, reponse: buildReponse({ trace_id: `trc_${i}` }), askedAt: new Date(2026, 0, i + 1).toISOString() });
    }

    const ids = listHistoryEntries().map((entry) => entry.id);
    expect(ids).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(ids).not.toContain('trc_0');
    expect(ids[0]).toBe(`trc_${MAX_HISTORY_ENTRIES}`);
  });

  it('removes a single entry by id', () => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    saveHistoryEntry({ id: 'trc_a', question: 'A', reponse: buildReponse({ trace_id: 'trc_a' }), askedAt: '2026-08-19T10:00:00.000Z' });
    saveHistoryEntry({ id: 'trc_b', question: 'B', reponse: buildReponse({ trace_id: 'trc_b' }), askedAt: '2026-08-20T10:00:00.000Z' });

    removeHistoryEntry('trc_a');

    expect(listHistoryEntries().map((entry) => entry.id)).toEqual(['trc_b']);
  });

  it('clears the whole history', () => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    saveHistoryEntry({ id: 'trc_a', question: 'A', reponse: buildReponse({ trace_id: 'trc_a' }), askedAt: '2026-08-19T10:00:00.000Z' });

    clearHistory();

    expect(listHistoryEntries()).toEqual([]);
  });

  it('returns an empty list instead of throwing when the stored JSON is corrupted', () => {
    const storage = createMemoryStorage();
    storage.setItem('legirag.history.v1', 'not json{{{');
    vi.stubGlobal('localStorage', storage);

    expect(listHistoryEntries()).toEqual([]);
  });

  it('drops an entry whose stored answer no longer matches the shared schema', () => {
    const storage = createMemoryStorage();
    storage.setItem(
      'legirag.history.v1',
      JSON.stringify([
        { id: 'trc_valid', question: 'Valide', askedAt: '2026-08-20T10:00:00.000Z', reponse: buildReponse({ trace_id: 'trc_valid' }) },
        { id: 'trc_invalid', question: 'Invalide', askedAt: '2026-08-20T09:00:00.000Z', reponse: { verdict: 'incomplet' } },
      ]),
    );
    vi.stubGlobal('localStorage', storage);

    expect(listHistoryEntries().map((entry) => entry.id)).toEqual(['trc_valid']);
  });

  it('does not throw when the underlying storage rejects the write (quota exceeded)', () => {
    const storage = createMemoryStorage();
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    vi.stubGlobal('localStorage', storage);

    expect(() =>
      saveHistoryEntry({ id: 'trc_a', question: 'A', reponse: buildReponse({ trace_id: 'trc_a' }), askedAt: '2026-08-20T10:00:00.000Z' }),
    ).not.toThrow();
  });

  // F-12 : accéder à `localStorage` lui-même (pas seulement `.setItem`) peut
  // lever une SecurityError (iframe sandboxée sans allow-same-origin,
  // stockage bloqué par les réglages de confidentialité) - vi.stubGlobal ne
  // simule pas ça (il fournit une valeur, pas un getter qui échoue), d'où le
  // Object.defineProperty direct ici.
  it('degrades to no history instead of throwing when accessing localStorage itself throws (blocked storage)', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });

    try {
      expect(listHistoryEntries()).toEqual([]);
      expect(() =>
        saveHistoryEntry({ id: 'trc_a', question: 'A', reponse: buildReponse({ trace_id: 'trc_a' }), askedAt: '2026-08-20T10:00:00.000Z' }),
      ).not.toThrow();
    } finally {
      Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });
});
