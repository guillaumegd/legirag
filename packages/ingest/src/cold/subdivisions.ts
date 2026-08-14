// article_contenu_markdown est mis en page pour l'affichage, pas pour la
// structure : le texte est réenveloppé (retour à la ligne simple) tous les
// ~80 caractères, y compris en plein milieu d'une phrase. Un vrai passage à
// la ligne (fin de paragraphe, élément suivant d'une liste) se reconnaît soit
// à une ligne vide (« \n\n »), soit à un saut dur markdown (deux espaces ou
// plus puis « \n ») - jamais à un simple « \n » isolé. Confirmé sur des
// exemples réels du corpus, ex. LEGIARTI000031721209 : « ... exploités par
// cession\nd'emplacements ... » est un retour à la ligne d'habillage (à
// rejoindre), tandis que « ... un an ;  \n2° Dans les villages ... » est un
// saut dur (à couper).
const SAUT_DUR = / {2,}\n/g;

export function splitContentBlocks(markdown: string): string[] {
  const normalise = markdown.replace(SAUT_DUR, '\n\n');

  return normalise
    .split(/\n{2,}/)
    .map((bloc) =>
      bloc
        .split('\n')
        .map((ligne) => ligne.trim())
        .filter((ligne) => ligne.length > 0)
        .join(' '),
    )
    .filter((bloc) => bloc.length > 0);
}

// Forme avant persistance : ni `id` ni `articleIdentifier`, qui n'existent
// qu'une fois la ligne chargée en base (2d). Nommé différemment du
// `Subdivision` de packages/shared/src/types.ts (la ligne DB complète) pour
// que les deux puissent être importés côte à côte sans collision, ce dont 2d
// aura besoin.
export interface ExtractedSubdivision {
  label: string;
  ordre: number;
  contenu: string;
}

// Hiérarchie officielle du guide de légistique de Légifrance (fiche 3.2.2,
// « Division du texte ») : les chiffres romains (I, II...) forment un niveau
// de subdivision à part, jamais utilisé comme élément d'énumération ; les
// énumérations, elles, s'écrivent en 1°, 2°... puis a), b)...
// (legifrance.gouv.fr/contenu/Media/files/autour-de-la-loi/guide-de-legistique/2024_12_05_fiche_3.2.2_division_du_texte.pdf).
const CHIFFRES_ROMAINS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

// Le séparateur après le chiffre romain n'est pas toujours un seul signe :
// la forme réelle la plus fréquente combine point ET tiret ("I. – texte",
// "I.-texte"), d'où le `+` pour absorber toute la série avant le texte.
const MARQUEUR_ROMAIN = /^([IVX]+)\s*(bis|ter|quater)?(?:\s*[.\-–:])+\s*(.*)$/;
const MARQUEUR_ENUMERATION = /^(\d+)°\s*(.*)$/;
const MARQUEUR_LETTRE = /^([a-z])\)\s*(.*)$/;

function detecteRomain(bloc: string): { label: string; reste: string } | null {
  const m = MARQUEUR_ROMAIN.exec(bloc);
  if (!m) return null;
  const chiffre = m[1];
  const suffixe = m[2];
  const reste = m[3];
  if (chiffre === undefined || reste === undefined || !CHIFFRES_ROMAINS.includes(chiffre)) return null;
  return { label: suffixe ? `${chiffre} ${suffixe}` : chiffre, reste };
}

function detecteEnumeration(bloc: string): { label: string; reste: string } | null {
  const m = MARQUEUR_ENUMERATION.exec(bloc);
  if (!m) return null;
  const chiffre = m[1];
  const reste = m[2];
  if (chiffre === undefined || reste === undefined) return null;
  return { label: `${chiffre}°`, reste };
}

function detecteLettre(bloc: string): { label: string; reste: string } | null {
  const m = MARQUEUR_LETTRE.exec(bloc);
  if (!m) return null;
  const lettre = m[1];
  const reste = m[2];
  if (lettre === undefined || reste === undefined) return null;
  return { label: `${lettre})`, reste };
}

// Rattache un bloc sans marqueur (simple suite du texte) à la subdivision
// ouverte la plus récente, sans quoi le contenu qui suit « I.- » avant le
// premier « 1° » serait perdu.
function ajoute(subdivision: ExtractedSubdivision, bloc: string): void {
  subdivision.contenu = subdivision.contenu.length > 0 ? `${subdivision.contenu}\n\n${bloc}` : bloc;
}

export function extractSubdivisions(markdown: string): ExtractedSubdivision[] {
  const subdivisions: ExtractedSubdivision[] = [];
  let romainCourant: string | null = null;
  let enumerationCourante: string | null = null;
  let courante: ExtractedSubdivision | null = null;
  let ordre = 0;

  for (const bloc of splitContentBlocks(markdown)) {
    const romain = detecteRomain(bloc);
    const enumeration = romain ? null : detecteEnumeration(bloc);
    const lettre = romain || enumeration ? null : detecteLettre(bloc);

    if (romain) {
      romainCourant = romain.label;
      enumerationCourante = null;
      ordre += 1;
      courante = { label: romainCourant, ordre, contenu: romain.reste };
      subdivisions.push(courante);
    } else if (enumeration) {
      enumerationCourante = enumeration.label;
      const label = romainCourant ? `${romainCourant}, ${enumerationCourante}` : enumerationCourante;
      ordre += 1;
      courante = { label, ordre, contenu: enumeration.reste };
      subdivisions.push(courante);
    } else if (lettre) {
      const parts = [romainCourant, enumerationCourante, lettre.label].filter(
        (part): part is string => part !== null,
      );
      ordre += 1;
      courante = { label: parts.join(', '), ordre, contenu: lettre.reste };
      subdivisions.push(courante);
    } else if (courante) {
      ajoute(courante, bloc);
    }
  }

  return subdivisions;
}
