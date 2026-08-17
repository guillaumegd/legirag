import { describe, expect, it } from 'vitest';
import { calculer } from './calculer.js';

describe('calculer', () => {
  it('delai : additionne des jours', () => {
    const result = calculer({
      type: 'delai',
      params: { dateDepart: '2026-01-15', duree: 14, unite: 'jours', sourceArticle: 'L221-18 C. conso' },
    });
    expect(result).toEqual({
      resultat: '2026-01-29',
      formule: '2026-01-15 + 14 jours',
      sourceArticle: 'L221-18 C. conso',
    });
  });

  it('delai : franchit une frontière de mois/année en unité mois', () => {
    const result = calculer({
      type: 'delai',
      params: { dateDepart: '2026-12-01', duree: 2, unite: 'mois', sourceArticle: 'art. X' },
    });
    expect(result.resultat).toBe('2027-02-01');
  });

  it('delai : additionne des années', () => {
    const result = calculer({
      type: 'delai',
      params: { dateDepart: '2026-08-17', duree: 5, unite: 'annees', sourceArticle: 'art. X' },
    });
    expect(result.resultat).toBe('2031-08-17');
  });

  it('prescription : même moteur que delai', () => {
    const result = calculer({
      type: 'prescription',
      params: { dateDepart: '2020-01-01', duree: 5, unite: 'annees', sourceArticle: 'art. Y' },
    });
    expect(result).toEqual({ resultat: '2025-01-01', formule: '2020-01-01 + 5 annees', sourceArticle: 'art. Y' });
  });

  it('anciennete : compte les jours calendaires entre deux dates', () => {
    const result = calculer({
      type: 'anciennete',
      params: { dateDebut: '2026-01-01', dateReference: '2026-01-11', sourceArticle: 'art. Z' },
    });
    expect(result).toEqual({ resultat: 10, formule: '2026-01-11 - 2026-01-01 (jours calendaires)', sourceArticle: 'art. Z' });
  });

  it('anciennete : même date -> 0 jour', () => {
    const result = calculer({
      type: 'anciennete',
      params: { dateDebut: '2026-06-01', dateReference: '2026-06-01', sourceArticle: 'art. Z' },
    });
    expect(result.resultat).toBe(0);
  });

  it('anciennete : dateReference par défaut = now', () => {
    const now = new Date('2026-08-17T10:00:00.000Z');
    const result = calculer(
      { type: 'anciennete', params: { dateDebut: '2026-08-01', sourceArticle: 'art. Z' } },
      now,
    );
    expect(result.resultat).toBe(16);
  });

  it('seuil : valeur au-dessus -> atteint', () => {
    const result = calculer({ type: 'seuil', params: { valeur: 12, seuil: 11, sourceArticle: 'art. W' } });
    expect(result).toEqual({ resultat: 'atteint', formule: '12 >= 11', sourceArticle: 'art. W' });
  });

  it('seuil : valeur en dessous -> non atteint', () => {
    const result = calculer({ type: 'seuil', params: { valeur: 5, seuil: 11, sourceArticle: 'art. W' } });
    expect(result.resultat).toBe('non atteint');
  });

  it('seuil : valeur égale au seuil -> atteint', () => {
    const result = calculer({ type: 'seuil', params: { valeur: 11, seuil: 11, sourceArticle: 'art. W' } });
    expect(result.resultat).toBe('atteint');
  });
});
