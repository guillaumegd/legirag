import { describe, expect, it } from 'vitest';
import { chunkArticle } from './chunking.js';

const ARTICLE = {
  code: 'Code de la route',
  sectionPath: [
    'Partie réglementaire',
    'Livre IV',
    'Titre Ier',
    'Chapitre III : Vitesse',
    'Section 1 : Vitesses maximales autorisées',
  ],
  articleNum: 'R413-2',
  contenuText: "Hors agglomération, la vitesse des véhicules est limitée à 130 km/h sur les autoroutes.",
};

describe('chunkArticle', () => {
  it('produit un seul chunk pour un article sans subdivision', () => {
    const chunks = chunkArticle(ARTICLE, []);

    expect(chunks).toEqual([
      {
        contenu:
          'Code de la route › Partie réglementaire › Livre IV › Titre Ier › Chapitre III : Vitesse › Section 1 : Vitesses maximales autorisées\n' +
          'Article R413-2\n\n' +
          "Hors agglomération, la vitesse des véhicules est limitée à 130 km/h sur les autoroutes.",
      },
    ]);
  });

  it('produit un chunk par subdivision, chacun avec son propre contenu', () => {
    const chunks = chunkArticle(ARTICLE, [
      { label: 'I', ordre: 1, contenu: 'Hors agglomération, la vitesse est limitée à 130 km/h.' },
      { label: 'I, 1°', ordre: 2, contenu: 'Sur les autoroutes.' },
    ]);

    expect(chunks).toEqual([
      {
        subdivisionLabel: 'I',
        contenu:
          'Code de la route › Partie réglementaire › Livre IV › Titre Ier › Chapitre III : Vitesse › Section 1 : Vitesses maximales autorisées\n' +
          'Article R413-2, I\n\n' +
          'Hors agglomération, la vitesse est limitée à 130 km/h.',
      },
      {
        subdivisionLabel: 'I, 1°',
        contenu:
          'Code de la route › Partie réglementaire › Livre IV › Titre Ier › Chapitre III : Vitesse › Section 1 : Vitesses maximales autorisées\n' +
          'Article R413-2, I, 1°\n\n' +
          'Sur les autoroutes.',
      },
    ]);
  });

  it('trie les subdivisions par ordre même si elles arrivent dans le désordre', () => {
    const chunks = chunkArticle(ARTICLE, [
      { label: 'II', ordre: 2, contenu: 'Second.' },
      { label: 'I', ordre: 1, contenu: 'Premier.' },
    ]);

    expect(chunks.map((c) => c.subdivisionLabel)).toEqual(['I', 'II']);
  });

  it("garde un préfixe valide quand sectionPath est vide", () => {
    const chunks = chunkArticle({ ...ARTICLE, sectionPath: [] }, []);

    expect(chunks[0]?.contenu.startsWith('Code de la route\nArticle R413-2\n\n')).toBe(true);
  });
});
