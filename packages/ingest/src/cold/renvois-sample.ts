import type { ExtractedRenvoi } from './renvois.js';

export interface AnnotatedRenvoiCase {
  articleIdentifier: string;
  contenuText: string;
  attendus: ExtractedRenvoi[];
}

// Échantillon annoté à la main, ~50 lignes réelles du corpus local
// (packages/ingest/.data/cold-corpus.ndjson), chaque `articleIdentifier`
// vérifié réel. `contenuText` est un extrait verbatim (sous-chaîne exacte)
// du `article_contenu_text` de la ligne citée - pas reformulé. Les offsets
// (`offsetDebut`/`offsetFin`) sont mis à 0 : `computeAccuracy` (3a, étape 5)
// les ignore délibérément, seule la cible/forme/code compte pour la mesure
// de précision/rappel.
const O = { offsetDebut: 0, offsetFin: 0 };

// Recalcule volontairement la même arithmétique que `expandPlage` (renvois.ts)
// au lieu de l'importer : la vérité terrain de cet échantillon doit rester
// indépendante du code qu'elle sert à noter (renvois-accuracy.ts), sinon
// computeAccuracy validerait l'extracteur contre lui-même. Ne pas fusionner
// avec `expandPlage`, même si ça a l'air d'une duplication à nettoyer.
function plage(prefixe: string, debut: number, fin: number): ExtractedRenvoi[] {
  const membres: ExtractedRenvoi[] = [];
  for (let n = debut; n <= fin; n += 1) {
    membres.push({ cibleArticleNum: `${prefixe}${n}`, forme: 'plage', interCode: false, ...O });
  }
  return membres;
}

export const RENVOIS_SAMPLE: AnnotatedRenvoiCase[] = [
  // --- Plage + énumération combinées : l'exemple du cahier des charges lui-même ---
  {
    articleIdentifier: 'LEGIARTI000031747801', // Code de l'énergie, R142-11
    contenuText:
      "les personnes habilitées, sur l'ensemble du territoire français, à procéder aux " +
      'constatations et à établir les procès-verbaux mentionnés aux articles L. 142-10 à ' +
      'L. 142-16, L. 142-18, L. 631-3 et L. 641-3.',
    attendus: [
      ...plage('L142-', 10, 16),
      { cibleArticleNum: 'L. 142-18', forme: 'enumeration', interCode: false, ...O },
      { cibleArticleNum: 'L. 631-3', forme: 'enumeration', interCode: false, ...O },
      { cibleArticleNum: 'L. 641-3', forme: 'enumeration', interCode: false, ...O },
    ],
  },

  // --- Inter-codes (simple) ---
  {
    articleIdentifier: 'LEGIARTI000031747877', // Code de l'énergie, R144-14
    contenuText: "il exerce un contrôle exclusif ou conjoint au sens de l'article L. 233-16 du code de commerce.",
    attendus: [
      { cibleArticleNum: 'L. 233-16', cibleCode: 'code de commerce', forme: 'simple', interCode: true, ...O },
    ],
  },
  {
    articleIdentifier: 'LEGIARTI000031764776', // Code de l'urbanisme, R*443-2-1
    contenuText:
      "Lorsque la demande de permis d'aménager est déposée pour se conformer aux normes " +
      "d'urbanisme, d'insertion dans les paysages, d'aménagement, d'équipement et de " +
      "fonctionnement visées à l'article R. 111-35 du code de l'urbanisme, elle comporte :",
    attendus: [
      { cibleArticleNum: 'R. 111-35', cibleCode: "code de l'urbanisme", forme: 'simple', interCode: true, ...O },
    ],
  },
  {
    articleIdentifier: 'LEGIARTI000031720930', // Code de l'urbanisme, R121-37
    contenuText: "définie par l'article L. 5111-2 du code général de la propriété des personnes publiques",
    attendus: [
      {
        cibleArticleNum: 'L. 5111-2',
        cibleCode: 'code général de la propriété des personnes publiques',
        forme: 'simple',
        interCode: true,
        ...O,
      },
    ],
  },
  {
    articleIdentifier: 'LEGIARTI000031765817', // CGI, 281 G - référence sans préfixe L/R/D, inter-codes
    contenuText:
      "mutation à titre gratuit prévue au 7° du 2 de l'article 793 du code général des impôts, la demande",
    attendus: [
      { cibleArticleNum: '793', cibleCode: 'code général des impôts', forme: 'simple', interCode: true, ...O },
    ],
  },

  // --- Inter-codes + subdivision-cible combinés : l'exemple des "140 km/h" du brief ---
  {
    articleIdentifier: 'LEGIARTI000042240048', // Code de la route, R413-2
    contenuText:
      "fait l'objet d'un classement dans la catégorie des autoroutes en application du " +
      "sixième alinéa de l'article R. 122-1 du code de la voirie routière, la vitesse " +
      'maximale autorisée demeure celle fixée antérieurement à ce classement ;',
    attendus: [
      {
        cibleArticleNum: 'R. 122-1',
        cibleCode: 'code de la voirie routière',
        cibleSubdivision: 'sixième alinéa',
        forme: 'simple',
        interCode: true,
        ...O,
      },
    ],
  },

  // --- Exclusions : loi / ordonnance / décret / convention (jamais un article de code) ---
  {
    articleIdentifier: 'LEGIARTI000031711355', // Pensions militaires, L123-20
    contenuText:
      "Conformément à l'article 8 de l'ordonnance n° 2015-1781 du 28 décembre 2015, les " +
      "dispositions de la partie législative du code des pensions militaires d'invalidité " +
      'et des victimes de guerre entrent en vigueur le lendemain de la publication au ' +
      "Journal officiel de la République française du décret en Conseil d'Etat relatif à " +
      "la partie réglementaire dudit code, et au plus tard le 1er janvier 2017.",
    attendus: [],
  },
  {
    articleIdentifier: 'LEGIARTI000031711099', // Pensions militaires, L141-30 - même préambule, ligne distincte
    contenuText:
      "Conformément à l'article 8 de l'ordonnance n° 2015-1781 du 28 décembre 2015, les " +
      "dispositions de la partie législative du code des pensions militaires d'invalidité " +
      'et des victimes de guerre entrent en vigueur le lendemain de la publication au ' +
      "Journal officiel de la République française du décret en Conseil d'Etat relatif à " +
      "la partie réglementaire dudit code, et au plus tard le 1er janvier 2017.",
    attendus: [],
  },
  {
    articleIdentifier: 'LEGIARTI000031781860', // CGI, 244 quater V - qualificateur "107 III B" intercalé
    contenuText:
      "Conformément à l'article 107 III B de la loi n° 2015-1785 du 29 décembre 2015, les " +
      "présentes dispositions s'appliquent aux offres de prêt émises à compter du 1er " +
      "janvier 2016, ainsi que, en cas d'accord de l'emprunteur et de l'établissement de " +
      'crédit ou de la société de financement, aux prêts versés depuis le 1er janvier 2011.',
    attendus: [],
  },
  {
    articleIdentifier: 'LEGIARTI000031747879', // Code de l'énergie, R144-?
    contenuText: "Par dérogation aux dispositions de l'article 6 du décret n° 55-733 du 9 août 1953",
    attendus: [],
  },
  {
    articleIdentifier: 'LEGIARTI000031720971', // Code de l'urbanisme
    contenuText: "l'objet de la publicité prévue au 2° de l'article 36 du décret n° 55-22 du 4 janvier 1955.",
    attendus: [],
  },
  {
    articleIdentifier: 'LEGIARTI000031729361', // Code rural et de la pêche maritime
    contenuText: "Conformément à l'article 10 du décret n° 2015-1768 du 24 décembre 2015, les présentes dispositions",
    attendus: [],
  },
  {
    articleIdentifier: 'LEGIARTI000047481351', // Code de l'action sociale et des familles
    contenuText: "l'autorisation prévue à l'article 12 de la convention de La Haye du 29 mai 1993",
    attendus: [],
  },
  {
    articleIdentifier: 'LEGIARTI000047481330', // même clause, ligne distincte
    contenuText: "l'autorisation prévue à l'article 12 de la convention de La Haye du 29 mai 1993",
    attendus: [],
  },
  {
    articleIdentifier: 'LEGIARTI000047481320', // même clause, ligne distincte
    contenuText: "l'autorisation prévue à l'article 12 de la convention de La Haye du 29 mai 1993",
    attendus: [],
  },

  // --- Numérotation sans préfixe L/R/D (CGI) ---
  {
    articleIdentifier: 'LEGIARTI000031762462', // CGI, 150-0 B quater
    contenuText:
      "sans préjudice de l'intérêt de retard prévu à l'article 1727 à compter de la date " +
      'à laquelle cet impôt aurait dû être acquitté.',
    attendus: [{ cibleArticleNum: '1727', forme: 'simple', interCode: false, ...O }],
  },
  {
    articleIdentifier: 'LEGIARTI000031762462', // même article, clause "présent code" plus loin dans le texte
    contenuText: "si placée en report sur la déclaration prévue à l'article 170 du présent code.",
    attendus: [{ cibleArticleNum: '170', forme: 'simple', interCode: false, ...O }],
  },
  {
    articleIdentifier: 'LEGIARTI000031781973', // CGI, 220 F - suffixe latin au-delà de bis/ter/quater
    contenuText: "Le crédit d'impôt défini à l'article 220 sexies",
    attendus: [{ cibleArticleNum: '220 sexies', forme: 'simple', interCode: false, ...O }],
  },

  // --- Subdivision-cible (alinéa) ---
  {
    articleIdentifier: 'LEGIARTI000031794680', // Code de commerce, D23-10-1
    contenuText:
      'Le délai de deux mois mentionné au premier alinéa de ' +
      "l'article L. 23-10-1 s'apprécie au regard de la date de cession, entendue comme " +
      'étant la date de conclusion du contrat.',
    attendus: [
      { cibleArticleNum: 'L. 23-10-1', cibleSubdivision: 'premier alinéa', forme: 'simple', interCode: false, ...O },
    ],
  },
  {
    articleIdentifier: 'LEGIARTI000031721063', // Code de l'urbanisme, R113-26
    contenuText:
      "Le programme d'action est adopté par une délibération du conseil départemental. Les " +
      "modalités de publicité prévues au deuxième alinéa de l'article R. 113-22 sont " +
      'applicables à cette délibération.',
    attendus: [
      { cibleArticleNum: 'R. 113-22', cibleSubdivision: 'deuxième alinéa', forme: 'simple', interCode: false, ...O },
    ],
  },
  {
    articleIdentifier: 'LEGIARTI000031727706', // Code de l'action sociale et des familles, L232-14
    contenuText:
      "Lorsqu'il n'y a pas lieu d'élaborer un plan d'aide, un compte rendu de visite " +
      "comportant des conseils est établi. \nA domicile, les droits à l'allocation " +
      'personnalisée d\'autonomie sont ouverts à compter de la date de la notification de ' +
      'la décision du président du conseil départemental mentionnée au premier alinéa de ' +
      "l'article L. 232-12.",
    attendus: [
      { cibleArticleNum: 'L. 232-12', cibleSubdivision: 'premier alinéa', forme: 'simple', interCode: false, ...O },
    ],
  },
  {
    // Ordinal composé ("six premiers alinéas", au pluriel) hors de la liste bornée sur la
    // première occurrence - cibleSubdivision doit rester absent ; "dernier alinéa" (singulier)
    // sur la seconde occurrence doit, lui, être reconnu.
    articleIdentifier: 'LEGIARTI000031747659', // Code de l'énergie, R134-7
    contenuText:
      'La saisine du comité de règlement des différends et des sanctions en application des ' +
      "six premiers alinéas de l'article L. 134-19 du code de l'énergie est à l'initiative " +
      "de l'une ou l'autre des parties. \nLa saisine du comité en application du dernier " +
      "alinéa de l'article L. 134-19 du code de l'énergie est à l'initiative de toute " +
      "personne à laquelle le non-respect des règles d'indépendance fixées à la section 2 " +
      "du chapitre Ier du titre Ier du livre Ier du même code crée un préjudice personnel.",
    attendus: [
      { cibleArticleNum: 'L. 134-19', cibleCode: "code de l'énergie", forme: 'simple', interCode: true, ...O },
      {
        cibleArticleNum: 'L. 134-19',
        cibleCode: "code de l'énergie",
        cibleSubdivision: 'dernier alinéa',
        forme: 'simple',
        interCode: true,
        ...O,
      },
    ],
  },

  // --- Énumérations ---
  {
    articleIdentifier: 'LEGIARTI000031749361', // Code de l'énergie, R433-14
    contenuText:
      'Les transporteurs et distributeurs de gaz naturel, les exploitants d\'installations ' +
      'de gaz naturel liquéfié et les titulaires de concessions de stockage de gaz naturel ' +
      'élaborent les prescriptions techniques mentionnées aux articles L. 433-13 et ' +
      'L. 453-4 que doivent respecter les opérateurs et les fournisseurs de gaz.',
    attendus: [
      { cibleArticleNum: 'L. 433-13', forme: 'enumeration', interCode: false, ...O },
      { cibleArticleNum: 'L. 453-4', forme: 'enumeration', interCode: false, ...O },
    ],
  },
  {
    // Inter-codes (simple) + énumération (courant) dans la même liste numérotée.
    articleIdentifier: 'LEGIARTI000031720605', // Code de l'urbanisme, R151-23
    contenuText:
      'Peuvent être autorisées, en zone A : 1° Les constructions et installations ' +
      "nécessaires à l'exploitation agricole ou au stockage et à l'entretien de matériel " +
      "agricole par les coopératives d'utilisation de matériel agricole agréées au titre " +
      "de l'article L. 525-1 du code rural et de la pêche maritime ; 2° Les constructions, " +
      'installations, extensions ou annexes aux bâtiments d\'habitation, changements de ' +
      'destination et aménagements prévus par les articles L. 151-11, L. 151-12 et L. 151-13',
    attendus: [
      {
        cibleArticleNum: 'L. 525-1',
        cibleCode: 'code rural et de la pêche maritime',
        forme: 'simple',
        interCode: true,
        ...O,
      },
      { cibleArticleNum: 'L. 151-11', forme: 'enumeration', interCode: false, ...O },
      { cibleArticleNum: 'L. 151-12', forme: 'enumeration', interCode: false, ...O },
      { cibleArticleNum: 'L. 151-13', forme: 'enumeration', interCode: false, ...O },
    ],
  },
  {
    // Deux références simples + une énumération, trois ancres distinctes dans un même article.
    articleIdentifier: 'LEGIARTI000031764615', // Code de l'urbanisme, R*410-10
    contenuText:
      "Dans le cas prévu au b de l'article L. 410-1, le délai d'instruction est de deux " +
      "mois à compter de la réception en mairie de la demande. \n\nL'autorité compétente " +
      "recueille l'avis des collectivités, établissements publics et services " +
      "gestionnaires des réseaux mentionnés à l'article L. 111-11 ainsi que les avis " +
      'prévus par les articles R. 423-52 et R. 423-53.',
    attendus: [
      { cibleArticleNum: 'L. 410-1', forme: 'simple', interCode: false, ...O },
      { cibleArticleNum: 'L. 111-11', forme: 'simple', interCode: false, ...O },
      { cibleArticleNum: 'R. 423-52', forme: 'enumeration', interCode: false, ...O },
      { cibleArticleNum: 'R. 423-53', forme: 'enumeration', interCode: false, ...O },
    ],
  },

  // --- Plages (ranges) ---
  {
    articleIdentifier: 'LEGIARTI000031749337', // Code de l'énergie, R433-5
    contenuText:
      "Les servitudes instituées à la suite de la déclaration d'utilité publique prononcée " +
      'dans les conditions prévues à la sous-section 1 sont soumises au régime prévu aux ' +
      'articles R. 323-7 à R. 323-14.',
    attendus: plage('R323-', 7, 14),
  },
  {
    // Référence simple (courant) + plage, deux ancres distinctes.
    articleIdentifier: 'LEGIARTI000031747941', // Code de l'énergie, R161-9
    contenuText:
      'Dans le cadre des établissements constitués au sein des services communs ' +
      "mentionnés à l'article L. 111-71, les salariés de ces services sont électeurs et " +
      "éligibles pour la mise en place des comités d'établissement et des délégués du " +
      "personnel et participent à la constitution des comités d'hygiène, de sécurité et " +
      'des conditions de travail, dans les conditions prévues aux articles R. 161-7 à ' +
      'R. 161-11.',
    attendus: [
      { cibleArticleNum: 'L. 111-71', forme: 'simple', interCode: false, ...O },
      ...plage('R161-', 7, 11),
    ],
  },
  {
    // Deux plages enchaînées par "et" dans la même phrase.
    articleIdentifier: 'LEGIARTI000031720997', // Code de l'urbanisme, R121-13
    contenuText:
      'La suspension de la servitude est prononcée dans les conditions définies par les ' +
      'articles R. 121-16 à R. 121-18 et R. 121-20 à R. 121-25.',
    attendus: [...plage('R121-', 16, 18), ...plage('R121-', 20, 25)],
  },

  // --- "et suivants" (jamais développé - voir Notes for the AI) ---
  {
    // Plage + "et suivants" dans le même article.
    articleIdentifier: 'LEGIARTI000024204135', // Code de l'environnement, R222-24
    contenuText:
      'Le projet de plan, tel que défini aux articles R. 222-14 à R. 222-19, ainsi ' +
      "qu'un résumé non technique du plan régional pour la qualité de l'air, s'il existe, " +
      "et du schéma régional du climat, de l'air et de l'énergie prévu à l'article " +
      'L. 222-1 et suivants.',
    attendus: [...plage('R222-', 14, 19), { cibleArticleNum: 'L. 222-1', forme: 'simple', interCode: false, ...O }],
  },
  {
    articleIdentifier: 'LEGIARTI000037017220', // Code de la santé publique, R1333-78
    contenuText:
      'Tout dispositif médical exposant aux rayonnements ionisants satisfait aux ' +
      "dispositions réglementaires prises en application de l'article L. 5212-1.\nLes " +
      'médicaments et produits radiopharmaceutiques sont utilisés conformément à ' +
      "l'article L. 5121-1 et suivants.",
    attendus: [
      { cibleArticleNum: 'L. 5212-1', forme: 'simple', interCode: false, ...O },
      { cibleArticleNum: 'L. 5121-1', forme: 'simple', interCode: false, ...O },
    ],
  },
  {
    // "et suivants" + subdivision-cible, deux ancres distinctes dans le même article.
    articleIdentifier: 'LEGIARTI000037854614', // Code de la sécurité sociale, R382-32
    contenuText:
      "Pour les personnes mentionnées à l'article R. 382-1 qui exercent par ailleurs une " +
      'ou plusieurs activités salariées ou assimilées, il est ajouté à la durée de travail ' +
      'requise par les article R. 313-1 et suivants, pour l\'ouverture du droit au titre de ' +
      "l'activité salariée ou assimilée, la durée de travail réputée correspondre à " +
      "l'activité artistique et déterminée en rapportant le montant de l'assiette soumise " +
      'à cotisation au salaire minimum interprofessionnel de croissance.\nA cet effet, la ' +
      'durée de travail artistique évaluée comme il est dit au premier alinéa de ' +
      "l'article R. 382-31 est, le cas échéant, réduite au prorata de la durée de la " +
      "période de référence retenue au titre de l'activité salariée ou assimilée.",
    attendus: [
      { cibleArticleNum: 'R. 382-1', forme: 'simple', interCode: false, ...O },
      { cibleArticleNum: 'R. 313-1', forme: 'simple', interCode: false, ...O },
      {
        cibleArticleNum: 'R. 382-31',
        cibleSubdivision: 'premier alinéa',
        forme: 'simple',
        interCode: false,
        ...O,
      },
    ],
  },

  // --- "du présent code" explicite (reste le code courant) ---
  {
    articleIdentifier: 'LEGIARTI000031765068', // Code de l'environnement
    contenuText: "et les valeurs limites mentionnées à l'article L. 572-6 du présent code",
    attendus: [{ cibleArticleNum: 'L. 572-6', forme: 'simple', interCode: false, ...O }],
  },
  {
    articleIdentifier: 'LEGIARTI000031750067', // Code de l'énergie
    contenuText: "La commission spécialisée mentionnée à l'article R. 671-13 du présent code",
    attendus: [{ cibleArticleNum: 'R. 671-13', forme: 'simple', interCode: false, ...O }],
  },
  {
    // Quatre ancres distinctes dans un même article : subdivision-cible, inter-codes,
    // "présent code", et une référence simple sans clause - la richesse réelle d'un
    // article qui renvoie beaucoup, plutôt qu'un cas isolé par forme.
    articleIdentifier: 'LEGIARTI000031728161', // Code de l'action sociale et des familles, L342-3
    contenuText:
      "Le socle de prestations prévu au troisième alinéa de l'article L. 342-2 fait " +
      "l'objet d'un prix global. Toute clause prévoyant un prix distinct pour une " +
      'prestation relevant du socle de prestations est réputée non écrite. \n' +
      'Le prix du socle de prestations et les prix des autres prestations ' +
      "d'hébergement sont librement fixés lors de la signature du contrat. Ils varient " +
      'ensuite, dans des conditions fixées par décret, dans la limite d\'un pourcentage ' +
      "fixé au 1er janvier de chaque année par arrêté des ministres chargés des personnes " +
      "âgées et de l'économie, compte tenu de l'évolution des coûts de la construction et " +
      'des loyers, des produits alimentaires et des services et du taux d\'évolution des ' +
      "retraites de base prévu à l'article L. 161-23-1 du code de la sécurité sociale. \n" +
      'Le conseil de la vie sociale est consulté au moins une fois par an sur le niveau du ' +
      "prix du socle de prestations et sur le prix des autres prestations d'hébergement " +
      "ainsi qu'à chaque création d'une nouvelle prestation. \nPour les établissements " +
      "relevant du 3° de l'article L. 342-1 du présent code, le prix du socle de " +
      'prestations pris en compte dans le calcul de la part de redevance assimilable au ' +
      "loyer et aux charges locatives récupérables évolue conformément à ce que prévoit " +
      "la convention conclue au titre de l'aide personnalisée au logement ; seules les " +
      "autres prestations évoluent en fonction de l'arrêté interministériel mentionné au " +
      'deuxième alinéa du présent article. \nLorsqu\'une des prestations offertes est ' +
      'choisie par un résident postérieurement à la signature du contrat ou à la création ' +
      'de cette prestation, son prix est celui qui figure dans le document contractuel ' +
      "mentionné à l'article L. 342-2, majoré, le cas échéant, dans la limite des " +
      'pourcentages de variation autorisés depuis la date de signature du contrat ou de ' +
      "la création de la prestation si celle-ci est postérieure.",
    attendus: [
      { cibleArticleNum: 'L. 342-2', cibleSubdivision: 'troisième alinéa', forme: 'simple', interCode: false, ...O },
      {
        cibleArticleNum: 'L. 161-23-1',
        cibleCode: 'code de la sécurité sociale',
        forme: 'simple',
        interCode: true,
        ...O,
      },
      { cibleArticleNum: 'L. 342-1', forme: 'simple', interCode: false, ...O },
      { cibleArticleNum: 'L. 342-2', forme: 'simple', interCode: false, ...O },
    ],
  },

  // --- Référence simple, courant, sans autre clause ---
  {
    articleIdentifier: 'LEGIARTI000031749915', // Code de l'énergie, R642-9
    contenuText:
      "Le comité a pour mission d'assurer la constitution et la conservation des stocks " +
      "stratégiques de produits pétroliers mentionnés à l'article L. 642-5",
    attendus: [{ cibleArticleNum: 'L. 642-5', forme: 'simple', interCode: false, ...O }],
  },
];
