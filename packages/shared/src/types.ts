import type { Etat } from './schema.js';

// Cahier des charges technique § 3.4 — table `articles`
export interface Article {
  articleIdentifier: string; // LEGIARTI…
  articleNum: string; // L343-11
  code: string; // texte_titre
  codeSlug: string; // code-de-la-route
  etat: Etat;
  dateDebut: string; // date
  dateFin: string; // 2999-01-01 si en cours
  sectionPath: string[]; // texte_contexte parsé en segments
  contenuText: string;
  contenuMarkdown?: string;
  palier: 'largeur' | 'profondeur';
  idcc?: string; // NULL sauf KALI
  updatedAt?: string;
}

// Cahier des charges technique § 3.4 — table `subdivisions`
export interface Subdivision {
  id: number;
  articleIdentifier: string;
  label: string; // "I, 1°"
  ordre: number;
  contenu: string;
}

// Cahier des charges technique § 3.4 — table `renvois`, le graphe des renvois
export interface Renvoi {
  id: number;
  sourceArticle: string;
  cibleArticleNum: string; // L. 631-3, tel qu'écrit
  cibleCode?: string; // undefined = code courant
  cibleArticleId?: string; // undefined si non résolu
  cibleSubdivision?: string; // "sixième alinéa"
  forme: 'simple' | 'enumeration' | 'plage';
  interCode: boolean;
  offsetDebut?: number;
  offsetFin?: number;
  resolu: boolean;
}

// Cahier des charges technique § 3.4 — table `chunks`
export interface Chunk {
  id: number;
  articleIdentifier: string;
  subdivisionLabel?: string;
  contenu: string; // avec préfixe de contexte, § 3.5
  embedding?: number[]; // vector(1024), Cohere embed-v4
}

// Cahier des charges technique § 4.1 — paramètres de `Retriever.search`
export interface RequeteRecherche {
  texte: string;
  codes?: string[]; // filtre issu du routeur
  dateReference: Date; // filtre temporel
  idcc?: string; // branche convention collective
  topK: number;
}
