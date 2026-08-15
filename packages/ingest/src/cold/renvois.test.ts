import { describe, expect, it } from 'vitest';
import { expandPlage, extractRenvois, normalizeArticleNum } from './renvois.js';

describe('normalizeArticleNum', () => {
  it('ramène les trois variantes d\'espacement réelles à la même forme', () => {
    expect(normalizeArticleNum('L.631-3')).toBe('L631-3');
    expect(normalizeArticleNum('L. 631-3')).toBe('L631-3');
    expect(normalizeArticleNum('L 631-3')).toBe('L631-3');
  });
});

describe('extractRenvois', () => {
  it('renvoie un tableau vide pour une entrée vide', () => {
    expect(extractRenvois('')).toEqual([]);
  });

  it('renvoie un tableau vide pour un article sans aucune mention "article(s)"', () => {
    // LEGIARTI000031729348, réel : aucun renvoi dans ce texte.
    const texte =
      "Dans le délai maximal de trois mois à compter de la réception du dossier complet, " +
      'le comité informe le candidat, par lettre recommandée avec demande d\'avis de réception.';

    expect(extractRenvois(texte)).toEqual([]);
  });

  it('extrait une énumération de trois cibles', () => {
    const texte = 'les procès-verbaux mentionnés aux articles L. 142-18, L. 631-3 et L. 641-3.';

    const renvois = extractRenvois(texte);

    expect(renvois).toHaveLength(3);
    expect(renvois.map((r) => r.cibleArticleNum)).toEqual(['L. 142-18', 'L. 631-3', 'L. 641-3']);
    expect(renvois.every((r) => r.forme === 'enumeration')).toBe(true);
    expect(renvois.every((r) => r.interCode === false && r.cibleCode === undefined)).toBe(true);
  });

  it('détecte une clause "du code <nom>" comme un renvoi inter-codes', () => {
    // LEGIARTI000031747877, réel.
    const texte = "avoir un contrôle exclusif ou conjoint au sens de l'article L. 233-16 du code de commerce.";

    const renvois = extractRenvois(texte);

    expect(renvois).toEqual([
      expect.objectContaining({
        cibleArticleNum: 'L. 233-16',
        cibleCode: 'code de commerce',
        interCode: true,
        forme: 'simple',
      }),
    ]);
  });

  it('une clause "du présent code" reste un renvoi vers le code courant', () => {
    const texte = "conformément à l'article L. 100-1 du présent code.";

    const renvois = extractRenvois(texte);

    expect(renvois).toEqual([
      expect.objectContaining({
        cibleArticleNum: 'L. 100-1',
        interCode: false,
      }),
    ]);
    expect(renvois[0]).not.toHaveProperty('cibleCode');
  });

  it("l'absence de toute clause vise aussi le code courant", () => {
    const texte = "dans les conditions prévues au b de l'article L. 410-1, le délai...";

    const renvois = extractRenvois(texte);

    expect(renvois).toEqual([
      expect.objectContaining({
        cibleArticleNum: 'L. 410-1',
        interCode: false,
        forme: 'simple',
      }),
    ]);
    expect(renvois[0]).not.toHaveProperty('cibleCode');
  });

  it("extrait une référence sans préfixe L/R/D (numérotation du CGI)", () => {
    // LEGIARTI000031762462, réel : le CGI numérote sans lettre.
    const texte =
      "sans préjudice de l'intérêt de retard prévu à l'article 1727 à compter de la date à laquelle cet impôt aurait dû être acquitté.";

    const renvois = extractRenvois(texte);

    expect(renvois).toEqual([expect.objectContaining({ cibleArticleNum: '1727', forme: 'simple' })]);
  });

  it("exclut une référence vers un article d'ordonnance (pas un article de code)", () => {
    // LEGIARTI000031711355, réel.
    const texte =
      "Conformément à l'article 8 de l'ordonnance n° 2015-1781 du 28 décembre 2015, les dispositions...";

    expect(extractRenvois(texte)).toEqual([]);
  });

  it("exclut une référence vers un article de loi, même avec un repère de paragraphe intercalé", () => {
    // LEGIARTI000031781860, réel : "107 III B" avant la clause d'exclusion.
    const texte =
      "Conformément à l'article 107 III B de la loi n° 2015-1785 du 29 décembre 2015, les présentes dispositions...";

    expect(extractRenvois(texte)).toEqual([]);
  });

  it("l'exemple du cahier des charges - plage puis énumération - produit 10 renvois", () => {
    // LEGIARTI000031747801, Code de l'énergie R142-11, réel.
    const texte =
      "les personnes habilitées, sur l'ensemble du territoire français, à procéder aux " +
      "constatations et à établir les procès-verbaux mentionnés aux articles L. 142-10 à " +
      'L. 142-16, L. 142-18, L. 631-3 et L. 641-3.';

    const renvois = extractRenvois(texte);

    expect(renvois).toHaveLength(10);
    const plage = renvois.filter((r) => r.forme === 'plage');
    const enumeration = renvois.filter((r) => r.forme === 'enumeration');
    expect(plage.map((r) => r.cibleArticleNum)).toEqual([
      'L142-10',
      'L142-11',
      'L142-12',
      'L142-13',
      'L142-14',
      'L142-15',
      'L142-16',
    ]);
    expect(enumeration.map((r) => r.cibleArticleNum)).toEqual(['L. 142-18', 'L. 631-3', 'L. 641-3']);
  });

  it('une plage à préfixes incompatibles retombe sur un renvoi simple non développé', () => {
    const texte = 'dans les conditions prévues aux articles L. 121-5 à R. 121-40.';

    const renvois = extractRenvois(texte);

    expect(renvois).toEqual([expect.objectContaining({ cibleArticleNum: 'L. 121-5', forme: 'plage' })]);
  });

  it('une plage dont une borne porte un suffixe "bis" retombe sur un renvoi simple non développé', () => {
    const texte = "prévue aux articles L. 142-10 bis à L. 142-16.";

    const renvois = extractRenvois(texte);

    expect(renvois).toEqual([expect.objectContaining({ cibleArticleNum: 'L. 142-10 bis', forme: 'plage' })]);
  });
});

describe('expandPlage', () => {
  it("développe l'exemple du cahier des charges en 7 références", () => {
    expect(expandPlage('L. 142-10', 'L. 142-16')).toEqual([
      'L142-10',
      'L142-11',
      'L142-12',
      'L142-13',
      'L142-14',
      'L142-15',
      'L142-16',
    ]);
  });

  it('retourne null quand les préfixes des deux bornes diffèrent', () => {
    expect(expandPlage('L. 121-5', 'R. 121-40')).toBeNull();
  });

  it('retourne null quand une borne ne se termine pas par un nombre pur', () => {
    expect(expandPlage('L. 142-10 bis', 'L. 142-16')).toBeNull();
  });

  it('retourne null quand la borne de fin précède la borne de début', () => {
    expect(expandPlage('L. 142-16', 'L. 142-10')).toBeNull();
  });

  it("retourne null au-delà du garde-fou de taille", () => {
    expect(expandPlage('L. 1', 'L. 500')).toBeNull();
  });
});

describe('extractRenvois - renvoi vers une subdivision et "et suivants"', () => {
  it("l'exemple du cahier des charges - sixième alinéa - fixe cibleSubdivision", () => {
    // Verbatim dans le corpus réel.
    const texte = "prévue au sixième alinéa de l'article R. 122-1.";

    const renvois = extractRenvois(texte);

    expect(renvois).toEqual([
      expect.objectContaining({ cibleArticleNum: 'R. 122-1', cibleSubdivision: 'sixième alinéa' }),
    ]);
  });

  it('reconnaît "premier alinéa" avant un autre article', () => {
    const texte = "mentionnée au premier alinéa de l'article L. 232-12.";

    const renvois = extractRenvois(texte);

    expect(renvois).toEqual([
      expect.objectContaining({ cibleArticleNum: 'L. 232-12', cibleSubdivision: 'premier alinéa' }),
    ]);
  });

  it('un ordinal hors de la liste bornée laisse cibleSubdivision absent', () => {
    const texte = "mentionnée au onzième alinéa de l'article L. 232-12.";

    const renvois = extractRenvois(texte);

    expect(renvois).toEqual([expect.objectContaining({ cibleArticleNum: 'L. 232-12' })]);
    expect(renvois[0]).not.toHaveProperty('cibleSubdivision');
  });

  it('"et suivants" ne développe pas une plage - un seul renvoi simple', () => {
    const texte = "conformément à l'article L. 222-1 et suivants.";

    const renvois = extractRenvois(texte);

    expect(renvois).toEqual([expect.objectContaining({ cibleArticleNum: 'L. 222-1', forme: 'simple' })]);
  });
});
