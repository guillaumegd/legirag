import { describe, expect, it } from 'vitest';
import type { ArticleForCitation } from '@legirag/retrieval';
import { SUBDIVISION_ARTICLE_ENTIER, toCitation } from './citation.js';

const ARTICLE_AVEC_SUBDIVISION: ArticleForCitation = {
  articleIdentifier: 'LEGIARTI000028436426',
  articleNum: 'R413-8',
  code: 'Code de la route',
  etat: 'VIGUEUR',
  dateDebut: '2014-01-10',
  texteExact: '50 km/h en agglomération.',
  subdivisionLabel: '4°',
};

const ARTICLE_ENTIER: ArticleForCitation = {
  articleIdentifier: 'LEGIARTI000028436430',
  articleNum: 'R413-3',
  code: 'Code de la route',
  etat: 'VIGUEUR',
  dateDebut: '2014-01-10',
  texteExact: 'En agglomération, la vitesse des véhicules est limitée à 50 km/h.',
};

describe('toCitation', () => {
  it('reprend le libellé de subdivision quand il existe', () => {
    const citation = toCitation(ARTICLE_AVEC_SUBDIVISION);
    expect(citation.subdivision).toBe('4°');
    expect(citation.texte_exact).toBe('50 km/h en agglomération.');
  });

  it("retombe sur 'article entier' quand aucune subdivision n'a été demandée", () => {
    const citation = toCitation(ARTICLE_ENTIER);
    expect(citation.subdivision).toBe(SUBDIVISION_ARTICLE_ENTIER);
  });

  it('construit url_legifrance à partir de article_identifier', () => {
    const citation = toCitation(ARTICLE_ENTIER);
    expect(citation.url_legifrance).toBe('https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000028436430');
  });

  it('reprend code, etat et date_debut tels quels', () => {
    const citation = toCitation(ARTICLE_ENTIER);
    expect(citation.code).toBe('Code de la route');
    expect(citation.etat).toBe('VIGUEUR');
    expect(citation.date_debut).toBe('2014-01-10');
  });

  it('reprend article_num tel quel', () => {
    expect(toCitation(ARTICLE_ENTIER).article_num).toBe('R413-3');
  });
});
