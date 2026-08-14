import { describe, expect, it } from 'vitest';
import { extractSubdivisions, splitContentBlocks } from './subdivisions.js';

describe('splitContentBlocks', () => {
  it('rejoint une phrase habillée sur plusieurs lignes en un seul bloc', () => {
    const markdown = "Peuvent être\nclassés en zone naturelle et forestière, les secteurs";

    expect(splitContentBlocks(markdown)).toEqual([
      'Peuvent être classés en zone naturelle et forestière, les secteurs',
    ]);
  });

  it('coupe sur une ligne vide en deux blocs', () => {
    const markdown = 'Premier paragraphe.\n\nSecond paragraphe.';

    expect(splitContentBlocks(markdown)).toEqual(['Premier paragraphe.', 'Second paragraphe.']);
  });

  it('coupe sur un saut dur markdown (deux espaces puis retour à la ligne)', () => {
    const markdown = "Dans les cas suivants :  \n2° Dans les villages de vacances";

    expect(splitContentBlocks(markdown)).toEqual([
      'Dans les cas suivants :',
      '2° Dans les villages de vacances',
    ]);
  });

  it('fusionne plusieurs lignes vides consécutives en une seule coupure', () => {
    const markdown = 'Premier paragraphe.\n\n\n\nSecond paragraphe.';

    expect(splitContentBlocks(markdown)).toEqual(['Premier paragraphe.', 'Second paragraphe.']);
  });

  it("ne produit pas de bloc vide à partir d'espaces de début ou de fin", () => {
    const markdown = '  \n\nSeul contenu utile  \n';

    expect(splitContentBlocks(markdown)).toEqual(['Seul contenu utile']);
  });

  it('renvoie un tableau vide pour une entrée vide', () => {
    expect(splitContentBlocks('')).toEqual([]);
  });
});

describe('extractSubdivisions', () => {
  it('renvoie un tableau vide quand aucun marqueur n\'est présent (le cas majoritaire)', () => {
    const markdown =
      "Le ministre chargé de l'énergie désigne par arrêté les personnes habilitées à\nprocéder aux constatations.";

    expect(extractSubdivisions(markdown)).toEqual([]);
  });

  it('découpe une liste de chiffres romains seuls', () => {
    const markdown = [
      "I. – L'imposition des plus-values retirées de la cession est reportée.",
      'II. – Le bénéfice du report est subordonné au respect des conditions suivantes.',
      'III. – Un décret précise les modalités.',
    ].join('\n\n');

    expect(extractSubdivisions(markdown)).toEqual([
      { label: 'I', ordre: 1, contenu: "L'imposition des plus-values retirées de la cession est reportée." },
      { label: 'II', ordre: 2, contenu: 'Le bénéfice du report est subordonné au respect des conditions suivantes.' },
      { label: 'III', ordre: 3, contenu: 'Un décret précise les modalités.' },
    ]);
  });

  it('imbrique une énumération sous le chiffre romain qui la précède', () => {
    const markdown = [
      "I.-Pour l'attribution, la gestion et le contrôle, les départements collectent des données relatives :",
      "1° Aux versements d'allocation personnalisée d'autonomie ;",
      '2° Aux prestations servies en établissement.',
    ].join('\n\n');

    expect(extractSubdivisions(markdown)).toEqual([
      {
        label: 'I',
        ordre: 1,
        contenu: "Pour l'attribution, la gestion et le contrôle, les départements collectent des données relatives :",
      },
      { label: 'I, 1°', ordre: 2, contenu: "Aux versements d'allocation personnalisée d'autonomie ;" },
      { label: 'I, 2°', ordre: 3, contenu: 'Aux prestations servies en établissement.' },
    ]);
  });

  it("reste à plat quand l'énumération apparaît sans chiffre romain", () => {
    const markdown = [
      'Les résidences mobiles de loisirs ne peuvent être installées que :',
      'Dans les parcs résidentiels de loisirs spécialement aménagés à cet effet,',
    ].join('\n\n');
    // Le premier bloc, sans marqueur et sans subdivision déjà ouverte, ne
    // produit rien : il n'y a rien à quoi le rattacher.
    expect(extractSubdivisions(markdown)).toEqual([]);

    const avecEnumeration = [
      "1° Dans les parcs résidentiels de loisirs spécialement aménagés à cet effet ;",
      '2° Dans les villages de vacances classés en hébergement léger.',
    ].join('\n\n');

    expect(extractSubdivisions(avecEnumeration)).toEqual([
      { label: '1°', ordre: 1, contenu: 'Dans les parcs résidentiels de loisirs spécialement aménagés à cet effet ;' },
      { label: '2°', ordre: 2, contenu: 'Dans les villages de vacances classés en hébergement léger.' },
    ]);
  });

  it('imbrique une liste lettrée sous une énumération, sans chiffre romain', () => {
    const markdown = [
      "L'obligation de réduction des émissions est mise en œuvre dans les conditions suivantes :",
      "1° Objectif à atteindre le 31 décembre 2020 au plus tard, obtenu par l'une des méthodes suivantes :",
      "a) L'emploi de l'énergie électrique dans tout type de véhicule routier ;",
      'b) L\'utilisation de toute technologie susceptible de réduire les émissions.',
    ].join('\n\n');

    expect(extractSubdivisions(markdown)).toEqual([
      {
        label: '1°',
        ordre: 1,
        contenu: "Objectif à atteindre le 31 décembre 2020 au plus tard, obtenu par l'une des méthodes suivantes :",
      },
      { label: '1°, a)', ordre: 2, contenu: "L'emploi de l'énergie électrique dans tout type de véhicule routier ;" },
      { label: '1°, b)', ordre: 3, contenu: "L'utilisation de toute technologie susceptible de réduire les émissions." },
    ]);
  });

  it('imbrique sur trois niveaux : chiffre romain, énumération, lettre', () => {
    const markdown = [
      'I. – Les organismes de gestion collective doivent :',
      '1° Soit être contrôlés par leurs membres titulaires de droits ;',
      'a) Sous réserve des statuts en vigueur ;',
      'b) Sous réserve du contrôle annuel.',
    ].join('\n\n');

    expect(extractSubdivisions(markdown)).toEqual([
      { label: 'I', ordre: 1, contenu: 'Les organismes de gestion collective doivent :' },
      { label: 'I, 1°', ordre: 2, contenu: 'Soit être contrôlés par leurs membres titulaires de droits ;' },
      { label: 'I, 1°, a)', ordre: 3, contenu: 'Sous réserve des statuts en vigueur ;' },
      { label: 'I, 1°, b)', ordre: 4, contenu: 'Sous réserve du contrôle annuel.' },
    ]);
  });

  it("un nouveau chiffre romain referme l'énumération et la lettre ouvertes par le précédent", () => {
    const markdown = [
      'I. – Les organismes de gestion collective doivent :',
      '1° Soit être contrôlés par leurs membres titulaires de droits ;',
      'a) Sous réserve des statuts en vigueur.',
      'II. – Les organismes de gestion collective peuvent mener des actions de promotion.',
      '1° Dans la limite de leurs ressources.',
    ].join('\n\n');

    expect(extractSubdivisions(markdown)).toEqual([
      { label: 'I', ordre: 1, contenu: 'Les organismes de gestion collective doivent :' },
      { label: 'I, 1°', ordre: 2, contenu: 'Soit être contrôlés par leurs membres titulaires de droits ;' },
      { label: 'I, 1°, a)', ordre: 3, contenu: 'Sous réserve des statuts en vigueur.' },
      {
        label: 'II',
        ordre: 4,
        contenu: 'Les organismes de gestion collective peuvent mener des actions de promotion.',
      },
      { label: 'II, 1°', ordre: 5, contenu: 'Dans la limite de leurs ressources.' },
    ]);
  });

  it('accepte un chiffre romain avec suffixe bis/ter', () => {
    const markdown = ['I. – Premier bloc.', 'I bis. – Bloc inséré après coup.', 'II. – Bloc suivant.'].join('\n\n');

    expect(extractSubdivisions(markdown)).toEqual([
      { label: 'I', ordre: 1, contenu: 'Premier bloc.' },
      { label: 'I bis', ordre: 2, contenu: 'Bloc inséré après coup.' },
      { label: 'II', ordre: 3, contenu: 'Bloc suivant.' },
    ]);
  });

  it('ne confond pas un renvoi d\'article coupé en tête de bloc ("L." / "R.") avec un marqueur', () => {
    // Cas réel du corpus (proche de LEGIARTI000031747801) : la référence
    // "L. 631-3" tombe juste après un saut dur, donc "L." atterrit en tête
    // de bloc, comme un vrai marqueur le ferait. Contrairement à "a)"
    // (lettre minuscule), "L." est en majuscule et suivi d'un point, pas
    // d'une parenthèse : il ne doit matcher ni le marqueur romain (L n'est
    // pas dans I/V/X) ni le marqueur lettré. Le bloc doit donc rester
    // rattaché à la subdivision I ouverte, pas créer une fausse entrée.
    const markdown = [
      'I. – Les personnes habilitées à établir les procès-verbaux mentionnés aux articles',
      'L. 631-3 et L. 641-3 sont désignées par arrêté.',
    ].join('  \n');

    expect(extractSubdivisions(markdown)).toEqual([
      {
        label: 'I',
        ordre: 1,
        contenu:
          'Les personnes habilitées à établir les procès-verbaux mentionnés aux articles\n\nL. 631-3 et L. 641-3 sont désignées par arrêté.',
      },
    ]);
  });
});
