import { describe, expect, it } from 'vitest';
import type { ColdArticleRow } from './types.js';
import { slugifyCode, toArticle } from './to-article.js';

describe('slugifyCode', () => {
  it('slugifie un titre simple', () => {
    expect(slugifyCode('Code de la route')).toBe('code-de-la-route');
  });

  it("retire les accents et transforme l'apostrophe en tiret", () => {
    expect(slugifyCode("Code de l'énergie")).toBe('code-de-l-energie');
  });

  it('gère plusieurs mots accentués', () => {
    expect(slugifyCode('Code de la sécurité sociale')).toBe('code-de-la-securite-sociale');
  });

  it('ne fait pas collisionner deux titres réels distincts mais proches', () => {
    expect(slugifyCode('Code forestier')).not.toBe(slugifyCode('Code forestier (nouveau)'));
    expect(slugifyCode('Code forestier (nouveau)')).toBe('code-forestier-nouveau');
  });
});

function ligne(overrides: Partial<ColdArticleRow>): ColdArticleRow {
  return {
    article_identifier: 'LEGIARTI000031721924',
    article_num: 'L343-11',
    article_etat: 'VIGUEUR',
    article_date_debut: '2020-01-01',
    article_date_fin: '2999-01-01',
    texte_date_publi: null,
    texte_date_signature: null,
    texte_nature: 'CODE',
    texte_ministere: null,
    texte_num: null,
    texte_nor: null,
    texte_num_parution_jo: null,
    texte_titre: 'Code de la route',
    texte_titre_court: 'Code de la route',
    texte_contexte: 'Partie législative',
    article_contenu_markdown: 'Contenu de test.',
    article_contenu_text: 'Contenu de test.',
    ...overrides,
  };
}

describe('toArticle', () => {
  it('mappe une ligne complète vers Article', () => {
    expect(toArticle(ligne({}))).toEqual({
      articleIdentifier: 'LEGIARTI000031721924',
      articleNum: 'L343-11',
      code: 'Code de la route',
      codeSlug: 'code-de-la-route',
      etat: 'VIGUEUR',
      dateDebut: '2020-01-01',
      dateFin: '2999-01-01',
      sectionPath: ['Partie législative'],
      contenuText: 'Contenu de test.',
      contenuMarkdown: 'Contenu de test.',
      palier: 'largeur',
    });
  });

  it('renvoie null quand article_num est null (chapitre-placeholder)', () => {
    expect(toArticle(ligne({ article_num: null }))).toBeNull();
  });

  it("mappe article_etat null vers 'VIGUEUR'", () => {
    expect(toArticle(ligne({ article_etat: null }))?.etat).toBe('VIGUEUR');
  });

  it('rejette une valeur article_etat inattendue plutôt que de la laisser passer', () => {
    expect(() => toArticle(ligne({ article_etat: 'INCONNU' }))).toThrow();
  });

  it('mappe un markdown vide vers contenuMarkdown undefined', () => {
    const article = toArticle(ligne({ article_contenu_markdown: '' }));
    expect(article).not.toBeNull();
    expect(article).not.toHaveProperty('contenuMarkdown');
  });
});
