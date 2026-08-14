import { describe, expect, it } from 'vitest';
import { parseSectionPath, splitContextSegments } from './section-path.js';

describe('splitContextSegments', () => {
  it("découpe sur les retours à la ligne, trim, et élimine les lignes vides", () => {
    expect(splitContextSegments('  Partie réglementaire  \n\n\nChapitre unique.\n')).toEqual([
      'Partie réglementaire',
      'Chapitre unique.',
    ]);
  });

  it('ne fusionne pas les renommages - parseSectionPath en fusionne toujours moins ou autant', () => {
    const texteContexte = [
      'Livre III : CARTES ET TITRES, RETRAITE DU COMBATTANT ET DÉCORATIONS',
      'Livre III : CARTES ET TITRES, ALLOCATION DE RECONNAISSANCE  DU COMBATTANT ET DÉCORATIONS',
    ].join('\n');

    expect(splitContextSegments(texteContexte)).toHaveLength(2);
    expect(parseSectionPath(texteContexte)).toHaveLength(1);
  });
});

describe('parseSectionPath', () => {
  it('découpe un chemin avec tous les niveaux', () => {
    const texteContexte = [
      'Partie réglementaire',
      'Livre VI : Les institutions en matière bancaire et financière',
      "Titre III : Coopération, échanges d'informations",
      "Chapitre II : Coopération et échange d'informations avec l'étranger",
      'Section 1 : Dispositions concernant la surveillance',
      "Sous-section 2 : Coopération et échanges d'informations",
    ].join('\n');

    expect(parseSectionPath(texteContexte)).toEqual([
      'Partie réglementaire',
      'Livre VI : Les institutions en matière bancaire et financière',
      "Titre III : Coopération, échanges d'informations",
      "Chapitre II : Coopération et échange d'informations avec l'étranger",
      'Section 1 : Dispositions concernant la surveillance',
      "Sous-section 2 : Coopération et échanges d'informations",
    ]);
  });

  it('accepte un chemin sans Partie', () => {
    const texteContexte = [
      'Livre III : CARTES ET TITRES, ALLOCATION DE RECONNAISSANCE',
      'Titre IV : AUTRES TITRES ET DROITS CORRESPONDANTS',
      'Chapitre III : Déportés et internés politiques',
    ].join('\n');

    expect(parseSectionPath(texteContexte)).toEqual([
      'Livre III : CARTES ET TITRES, ALLOCATION DE RECONNAISSANCE',
      'Titre IV : AUTRES TITRES ET DROITS CORRESPONDANTS',
      'Chapitre III : Déportés et internés politiques',
    ]);
  });

  it('accepte un chemin sans Sous-section', () => {
    const texteContexte = [
      'Partie réglementaire',
      'Livre IV : Professions et activités sociales',
      "Titre Ier : Eau et milieux aquatiques et marins",
    ].join('\n');

    expect(parseSectionPath(texteContexte)).toEqual([
      'Partie réglementaire',
      'Livre IV : Professions et activités sociales',
      "Titre Ier : Eau et milieux aquatiques et marins",
    ]);
  });

  it('conserve les accents et les chiffres romains', () => {
    const texteContexte = [
      'Titre Ier : Eau et milieux aquatiques et marins',
      'Chapitre préliminaire',
      'Section unique : Dispositions générales',
    ].join('\n');

    expect(parseSectionPath(texteContexte)).toEqual([
      'Titre Ier : Eau et milieux aquatiques et marins',
      'Chapitre préliminaire',
      'Section unique : Dispositions générales',
    ]);
  });

  it('accepte un chemin dégénéré à un seul segment', () => {
    expect(parseSectionPath('Partie réglementaire (nouvelle)')).toEqual([
      'Partie réglementaire (nouvelle)',
    ]);
  });

  it('fusionne deux segments consécutifs de même niveau en gardant le plus récent', () => {
    const texteContexte = [
      'Livre III : CARTES ET TITRES, RETRAITE DU COMBATTANT ET DÉCORATIONS',
      'Livre III : CARTES ET TITRES, ALLOCATION DE RECONNAISSANCE  DU COMBATTANT ET DÉCORATIONS',
      "Titre IV : AUTRES TITRES ET DROITS CORRESPONDANTS",
    ].join('\n');

    expect(parseSectionPath(texteContexte)).toEqual([
      'Livre III : CARTES ET TITRES, ALLOCATION DE RECONNAISSANCE  DU COMBATTANT ET DÉCORATIONS',
      'Titre IV : AUTRES TITRES ET DROITS CORRESPONDANTS',
    ]);
  });

  it('fusionne une chaîne de renommages successifs du même niveau', () => {
    const texteContexte = [
      'Deuxième partie : Santé de la famille, de la mère et de l’enfant',
      'Deuxième partie : Santé reproductive, droits de la femme et protection de la santé de l’enfant',
      'Deuxième partie : Santé sexuelle et reproductive, droits de la femme et protection de la santé de l’enfant',
      'Deuxième partie : Santé sexuelle et reproductive, droits de la femme et protection de la santé de l’enfant, de l’adolescent et du jeune adulte',
    ].join('\n');

    expect(parseSectionPath(texteContexte)).toEqual([
      'Deuxième partie : Santé sexuelle et reproductive, droits de la femme et protection de la santé de l’enfant, de l’adolescent et du jeune adulte',
    ]);
  });

  it('ne fusionne pas des niveaux réellement distincts au style code général des impôts', () => {
    const texteContexte = ['I : Revenus fonciers', '4 : Détermination du revenu imposable', 'B : Sanctions fiscales'].join(
      '\n',
    );

    expect(parseSectionPath(texteContexte)).toEqual([
      'I : Revenus fonciers',
      '4 : Détermination du revenu imposable',
      'B : Sanctions fiscales',
    ]);
  });

  it('tolère les espaces multiples et la ponctuation parasite sans casser le découpage', () => {
    const texteContexte = '  Partie réglementaire  \n\n\nChapitre unique.\n  Section  2   :  Texte  \n';

    expect(parseSectionPath(texteContexte)).toEqual([
      'Partie réglementaire',
      'Chapitre unique.',
      'Section  2   :  Texte',
    ]);
  });
});
