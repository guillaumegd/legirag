import { describe, expect, it } from 'vitest';
import { Citation, ReponseStructuree } from './schema.js';

const citationValide = {
  article_identifier: 'LEGIARTI000006841540',
  subdivision: 'I',
  code: 'Code de la route',
  texte_exact: 'Hors agglomération, la vitesse des véhicules est limitée à…',
  date_debut: '2018-07-01',
  etat: 'VIGUEUR' as const,
  url_legifrance: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006841540',
};

const reponseValide = {
  verdict: 'La vitesse est limitée à 110 km/h sur autoroute par temps de pluie.',
  regle_principale: citationValide,
  textes_complementaires: [],
  hors_perimetre: ['Arrêtés préfectoraux de limitation locale'],
  confiance: 'elevee' as const,
  date_reference: '2026-08-11',
  trace_id: 'trace-001',
};

describe('Citation', () => {
  // R1 : garantie par le type, avant même le vérificateur
  it('rejette une citation sans article_identifier', () => {
    const { article_identifier: _omis, ...sansIdentifiant } = citationValide;
    expect(Citation.safeParse(sansIdentifiant).success).toBe(false);
  });

  it('accepte une citation complète', () => {
    expect(Citation.safeParse(citationValide).success).toBe(true);
  });
});

describe('ReponseStructuree', () => {
  it('rejette une réponse dont regle_principale est sans article_identifier', () => {
    const { article_identifier: _omis, ...citationInvalide } = citationValide;
    const invalide = { ...reponseValide, regle_principale: citationInvalide };
    expect(ReponseStructuree.safeParse(invalide).success).toBe(false);
  });

  // R4 : jamais vide
  it('rejette hors_perimetre vide', () => {
    const invalide = { ...reponseValide, hors_perimetre: [] };
    expect(ReponseStructuree.safeParse(invalide).success).toBe(false);
  });

  // R5 + F11
  it('rejette une abstention sans escalade', () => {
    const invalide = { ...reponseValide, confiance: 'abstention' as const, escalade: undefined };
    expect(ReponseStructuree.safeParse(invalide).success).toBe(false);
  });

  it('accepte une abstention avec escalade', () => {
    const valide = {
      ...reponseValide,
      confiance: 'abstention' as const,
      escalade: { motif: 'Source hors périmètre', interlocuteur: 'Un avocat en droit du travail' },
    };
    expect(ReponseStructuree.safeParse(valide).success).toBe(true);
  });

  it('accepte une réponse complète et valide', () => {
    expect(ReponseStructuree.safeParse(reponseValide).success).toBe(true);
  });
});
