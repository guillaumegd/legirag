import { describe, expect, it } from 'vitest';
import { urlLegifrance } from './legifrance.js';

describe('urlLegifrance', () => {
  it('construit une URL codes/article_lc à partir d\'un identifiant', () => {
    expect(urlLegifrance('LEGIARTI000006841540')).toBe(
      'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006841540',
    );
  });

  it('ne modifie pas l\'identifiant fourni', () => {
    const id = 'LEGIARTI000047812345';
    expect(urlLegifrance(id)).toContain(id);
  });
});

// Vérification manuelle restant à faire (1.3) : ouvrir ces cinq URLs dans un navigateur
// et confirmer qu'elles pointent chacune vers le bon article.
// - https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006841540 (code de la route)
// - https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006900876 (code civil)
// - https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006901232 (code pénal)
// - https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006902573 (code du travail)
// - https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006294069 (code de la consommation)
