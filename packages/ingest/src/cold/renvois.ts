// Un renvoi se reconnaît toujours par le mot « article »/« articles » suivi
// directement d'un ou plusieurs numéros - jamais l'inverse. Le numéro porte
// soit le préfixe législatif/réglementaire (L, R, D), avec une ponctuation
// variable (« L.142-10 », « L. 142-10 », « L 142-10 »), soit aucun préfixe :
// certains codes (le CGI confirmé sur le corpus réel, ex. « l'article 1727 »,
// « l'article 220 sexies ») numérotent leurs articles sans lettre. Le
// suffixe ordinal latin va au-delà de bis/ter/quater dans le corpus réel
// (ex. « l'article 220 sexies », CGI) - liste bornée aux formes réellement
// observées, pas un générateur latin complet.
const NOMBRE = String.raw`(?:[LRD]\.?\s*\d[\d\-]*|\d[\d\-]*)(?:\s+(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?`;

// Un membre de la liste est soit un numéro seul, soit une plage « X à Y »
// (ex. « L. 142-10 à L. 142-16 », à développer en références individuelles -
// cahier des charges technique §3.2). Le « à » ne fait donc pas partie des
// séparateurs de liste : il reste attaché à son membre.
const MEMBRE = String.raw`${NOMBRE}(?:\s*à\s*${NOMBRE})?`;

// Ancre + liste séparée par virgule et/ou « et » : « L. 142-18, L. 631-3 et
// L. 641-3 », ou « R. 121-16 à R. 121-18 et R. 121-20 à R. 121-25 » (deux
// plages enchaînées). Chaque nouvelle occurrence d'« article(s) » redémarre
// une liste, ce qui gère naturellement une phrase qui enchaîne plusieurs
// renvois (« les articles A et B, les articles C à D et les dispositions... »).
const ANCHOR_LISTE = new RegExp(
  String.raw`\barticles?\b\s+(${MEMBRE}(?:\s*(?:,|et)\s*${MEMBRE})*)`,
  'gi',
);

const SEPARATEUR_LISTE = /\s*,\s*|\s+et\s+/;
const MEMBRE_PLAGE = /^(.+?)\s+à\s+(.+)$/;
const NOMBRE_FINAL = /^(.*?)(\d+)$/;

// Garde-fou contre une plage mal détectée (jamais une vraie forme du corpus) :
// pas un frein réel, juste une limite de sécurité sur l'expansion.
const PLAGE_MAX = 200;

// Un renvoi vers un texte qui n'est pas un code (loi, ordonnance, décret,
// convention) ne vise rien dans ce corpus : COLD ne charge que les lignes
// `texte_nature = 'CODE'`. Confirmé réel et non négligeable (~18 % des
// lignes du corpus contiennent ce genre de référence) - à exclure entièrement
// plutôt qu'à stocker comme un renvoi jamais résolu.
const EXCLUSION_HORS_CODE = new RegExp(
  String.raw`^\s+de\s+la\s+(?:présente\s+)?loi\b` +
    String.raw`|^\s+de\s+l['’]ordonnance\b|^\s+de\s+la\s+présente\s+ordonnance\b` +
    String.raw`|^\s+du\s+(?:présent\s+)?décret\b` +
    String.raw`|^\s+de\s+la\s+(?:présente\s+)?convention\b`,
  'i',
);

const CLAUSE_PRESENT_CODE = /^\s+du\s+présent\s+code\b/i;

// Un nom de code n'est pas toujours suivi d'une ponctuation avant la suite
// de la phrase - cas réel confirmé : « du code de l'énergie est à
// l'initiative de l'une ou l'autre des parties » (LEGIARTI000031747659)
// n'a aucune virgule entre le nom du code et le verbe qui suit. Sans garde-
// fou, `[^,;.]+` engloutissait toute la phrase. Les verbes courants de ce
// registre juridique bornent la capture ; liste réelle et bornée, pas un
// dictionnaire complet.
const VERBE_ARRET =
  'est|sont|doit|doivent|peut|peuvent|fixe|fixent|prévoit|prévoient|précise|précisent|détermine|déterminent|demeure|demeurent|entre|entrent';
const CLAUSE_AUTRE_CODE = new RegExp(
  String.raw`^\s+du\s+(code(?:\s+(?!(?:${VERBE_ARRET})\b)[a-zà-ÿ']+){0,8})`,
  'i',
);

// Une citation réelle peut intercaler un repère de paragraphe entre le
// numéro et la clause qui suit - ex. « l'article 107 III B de la loi n°
// 2015-1785 » (LEGIARTI000031781860, réel). Sans ce saut, la clause
// d'exclusion « de la loi » ne serait jamais testée juste après « III B ».
const QUALIFICATEUR = /^(?:\s+[IVXLCDM]+\b)?(?:\s+[A-Z]\b)?/;

// Liste bornée, pas un générateur d'ordinaux français complet - les ordinaux
// réellement observés dans le corpus et dans l'exemple du cahier des charges
// (« au sixième alinéa de l'article R. 122-1 »). Un ordinal hors liste laisse
// simplement `cibleSubdivision` absent ; le renvoi vers l'article lui-même
// reste extrait.
const SUBDIVISION_AVANT =
  /(premier|deuxième|troisième|quatrième|cinquième|sixième|septième|huitième|neuvième|dixième|avant-dernier|dernier)\s+alinéa\s+de\s+l['’]$/i;

export interface ExtractedRenvoi {
  cibleArticleNum: string;
  cibleCode?: string;
  cibleSubdivision?: string;
  forme: 'simple' | 'enumeration' | 'plage';
  interCode: boolean;
  offsetDebut: number;
  offsetFin: number;
}

// Ramène les variantes d'espacement/ponctuation réelles du corpus
// (« L.142-10 », « L. 142-10 », « L 142-10 ») à la forme sans espace que
// `articles.article_num` utilise déjà (2d), pour que la résolution de 3b
// puisse comparer par égalité stricte.
export function normalizeArticleNum(raw: string): string {
  return raw.replace(/\./g, '').replace(/\s+/g, '');
}

// Développe une plage en références individuelles (cahier des charges
// technique §3.2 : « L. 142-10 à L. 142-16 — à développer en 7 références »).
// Contrairement aux autres formes, un membre intermédiaire n'a jamais existé
// tel quel dans le texte source - le résultat est donc une forme normalisée
// synthétisée (« L142-13 »), pas une citation verbatim.
export function expandPlage(debut: string, fin: string): string[] | null {
  const debutMatch = NOMBRE_FINAL.exec(normalizeArticleNum(debut));
  const finMatch = NOMBRE_FINAL.exec(normalizeArticleNum(fin));
  if (debutMatch?.[1] === undefined || debutMatch[2] === undefined) return null;
  if (finMatch?.[1] === undefined || finMatch[2] === undefined) return null;
  if (debutMatch[1] !== finMatch[1]) return null;

  const prefixe = debutMatch[1];
  const premier = Number(debutMatch[2]);
  const dernier = Number(finMatch[2]);
  if (dernier < premier || dernier - premier > PLAGE_MAX) return null;

  const membres: string[] = [];
  for (let n = premier; n <= dernier; n += 1) {
    membres.push(`${prefixe}${n}`);
  }
  return membres;
}

export function extractRenvois(contenuText: string): ExtractedRenvoi[] {
  const renvois: ExtractedRenvoi[] = [];

  for (const match of contenuText.matchAll(ANCHOR_LISTE)) {
    const liste = match[1];
    if (liste === undefined || match.index === undefined) continue;

    const debutMatch = match.index;
    const finListe = debutMatch + match[0].length;
    const suite = contenuText.slice(finListe);
    const avant = SUBDIVISION_AVANT.exec(contenuText.slice(0, debutMatch));
    const cibleSubdivision = avant?.[1] !== undefined ? `${avant[1]} alinéa` : undefined;
    const qualificateur = QUALIFICATEUR.exec(suite)?.[0] ?? '';
    const apresQualificateur = suite.slice(qualificateur.length);

    if (EXCLUSION_HORS_CODE.test(apresQualificateur)) continue;

    let cibleCode: string | undefined;
    let interCode = false;
    let offsetFin = finListe;

    const clauseAutreCode = CLAUSE_AUTRE_CODE.exec(apresQualificateur);
    if (clauseAutreCode !== null && clauseAutreCode[1] !== undefined) {
      cibleCode = clauseAutreCode[1].trim();
      interCode = true;
      offsetFin = finListe + qualificateur.length + clauseAutreCode[0].length;
    } else {
      const clausePresentCode = CLAUSE_PRESENT_CODE.exec(apresQualificateur);
      if (clausePresentCode !== null) {
        offsetFin = finListe + qualificateur.length + clausePresentCode[0].length;
      }
    }

    const tokens = liste.split(SEPARATEUR_LISTE).filter((token) => token.length > 0);
    const plusieursMembres = tokens.length > 1;

    for (const token of tokens) {
      const plageMatch = MEMBRE_PLAGE.exec(token.trim());

      if (plageMatch !== null && plageMatch[1] !== undefined && plageMatch[2] !== undefined) {
        const membres = expandPlage(plageMatch[1], plageMatch[2]);
        // Une plage non développable (préfixes différents, borne non
        // numérique...) reste un renvoi unique vers sa première borne plutôt
        // que d'être silencieusement perdue.
        const cibles = membres ?? [plageMatch[1].trim()];
        for (const cible of cibles) {
          renvois.push({
            cibleArticleNum: cible,
            ...(cibleCode !== undefined ? { cibleCode } : {}),
            ...(cibleSubdivision !== undefined ? { cibleSubdivision } : {}),
            forme: 'plage',
            interCode,
            offsetDebut: debutMatch,
            offsetFin,
          });
        }
        continue;
      }

      renvois.push({
        cibleArticleNum: token.trim(),
        ...(cibleCode !== undefined ? { cibleCode } : {}),
        ...(cibleSubdivision !== undefined ? { cibleSubdivision } : {}),
        forme: plusieursMembres ? 'enumeration' : 'simple',
        interCode,
        offsetDebut: debutMatch,
        offsetFin,
      });
    }
  }

  return renvois;
}
