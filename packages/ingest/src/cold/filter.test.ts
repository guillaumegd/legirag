import { describe, expect, it } from 'vitest';
import { filterColdRows } from './filter.js';

// Ligne réelle simplifiée (LEGIARTI000031747801, code de l'énergie),
// utilisée telle quelle lors de la vérification en direct du dataset.
const ligneCodeValide = {
  article_identifier: 'LEGIARTI000031747801',
  article_num: 'R142-11',
  article_etat: 'VIGUEUR',
  article_date_debut: '2016-01-01',
  article_date_fin: '2999-01-01',
  texte_date_publi: '2999-01-01',
  texte_date_signature: '2999-01-01',
  texte_nature: 'CODE',
  texte_ministere: null,
  texte_num: null,
  texte_nor: null,
  texte_num_parution_jo: null,
  texte_titre: "Code de l'énergie",
  texte_titre_court: "Code de l'énergie",
  texte_contexte: 'Partie réglementaire\nLIVRE IER : ...',
  article_contenu_markdown: "Le ministre chargé de l'énergie désigne par arrêté...",
  article_contenu_text: "Le ministre chargé de l'énergie désigne par arrêté...",
  // colonnes réelles mais non retenues - doivent disparaître du résultat
  'Unnamed: 0': 1,
  texte_titre_en: 'Energy Code',
};

const ligneDecret = { ...ligneCodeValide, texte_nature: 'DECRET' };

describe('filterColdRows', () => {
  it('garde une ligne CODE valide et laisse tomber une ligne non-CODE', () => {
    const resultat = filterColdRows([ligneCodeValide, ligneDecret]);
    expect(resultat).toHaveLength(1);
    expect(resultat[0]?.article_identifier).toBe('LEGIARTI000031747801');
  });

  it('élimine les colonnes hors schéma (index CSV, traductions anglaises)', () => {
    const [resultat] = filterColdRows([ligneCodeValide]);
    expect(resultat).not.toHaveProperty('Unnamed: 0');
    expect(resultat).not.toHaveProperty('texte_titre_en');
  });

  it('lève une erreur si une ligne CODE ne respecte pas le schéma', () => {
    const { article_identifier: _omis, ...ligneSansIdentifiant } = ligneCodeValide;
    expect(() => filterColdRows([ligneSansIdentifiant])).toThrow();
  });

  // Régression : la ligne réelle qui a fait échouer la première exécution de
  // fetch-cold.ts (LEGIARTI000044427114, chapitre-placeholder sans article_num).
  it('accepte une ligne CODE avec article_num null (chapitre-placeholder)', () => {
    const ligne = { ...ligneCodeValide, article_num: null };
    const [resultat] = filterColdRows([ligne]);
    expect(resultat?.article_num).toBeNull();
  });

  // Régression : parmi les lignes CODE, article_etat est null pour 16 lignes
  // sur 157 174 (vérifié en direct, cf. types.ts) - pas seulement VIGUEUR.
  it('accepte une ligne CODE avec article_etat null', () => {
    const ligne = { ...ligneCodeValide, article_etat: null };
    const [resultat] = filterColdRows([ligne]);
    expect(resultat?.article_etat).toBeNull();
  });
});
