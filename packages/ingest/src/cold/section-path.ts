// Clé de comparaison d'un segment : le libellé avant les deux-points (ex.
// "Livre III", "Titre Ier", "I"), normalisé. Deux segments consécutifs avec la
// même clé désignent le même niveau, cité deux fois avec un intitulé
// différent (renommage législatif conservé tel quel dans l'instantané COLD) -
// ex. réel : "Livre III : ... RETRAITE DU COMBATTANT ..." suivi de "Livre
// III : ... ALLOCATION DE RECONNAISSANCE DU COMBATTANT ...", même Livre III,
// juste renommé.
function prefixKey(segment: string): string {
  const indexDeuxPoints = segment.indexOf(':');
  const brut = indexDeuxPoints === -1 ? segment : segment.slice(0, indexDeuxPoints);
  return brut.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Segments bruts, avant fusion des renommages - exporté pour que les scripts
// de diagnostic (ex. validate-section-paths.ts) comparent avant/après sans
// dupliquer cette règle de découpage.
export function splitContextSegments(texteContexte: string): string[] {
  return texteContexte
    .split('\n')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

// texte_contexte est déjà le fil d'Ariane hiérarchique, un segment par ligne
// (vérifié sur les 157 174 lignes CODE réelles) : pas de hiérarchie à
// reconstruire, seulement à découper et nettoyer les doublons de renommage.
export function parseSectionPath(texteContexte: string): string[] {
  const segments = splitContextSegments(texteContexte);

  const sectionPath: string[] = [];
  for (const segment of segments) {
    const dernier = sectionPath[sectionPath.length - 1];
    if (dernier !== undefined && prefixKey(dernier) === prefixKey(segment)) {
      // Même niveau que le précédent : on garde l'intitulé le plus récent.
      sectionPath[sectionPath.length - 1] = segment;
    } else {
      sectionPath.push(segment);
    }
  }
  return sectionPath;
}
