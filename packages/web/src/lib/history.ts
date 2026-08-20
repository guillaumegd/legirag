import { ReponseStructuree as ReponseStructureeSchema, type ReponseStructuree } from '@legirag/shared/schema';

export interface HistoryEntry {
  id: string;
  question: string;
  reponse: ReponseStructuree;
  askedAt: string;
}

export const MAX_HISTORY_ENTRIES = 20;

const STORAGE_KEY = 'legirag.history.v1';

// F-12 : accéder à la propriété `localStorage` elle-même peut lever une
// SecurityError (iframe sandboxée sans allow-same-origin, stockage bloqué par
// les réglages de confidentialité) - pas seulement `setItem`. Tout le corps
// est donc dans le try, pas seulement l'appel qui écrit, sinon l'exception
// remonte non rattrapée jusqu'au flux de réponse (ask-question.tsx) et
// masque une réponse pourtant reçue avec succès derrière une fausse erreur.
function readRaw(): unknown[] {
  try {
    if (typeof localStorage === 'undefined') {
      return [];
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(entries: HistoryEntry[]): void {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Stockage plein ou bloqué (navigation privée, iframe sandboxée...) :
    // l'historique reste une fonctionnalité de confort, jamais bloquante
    // pour poser une question.
  }
}

// Chaque entrée est revalidée avec le schéma partagé au moment de la lecture,
// pas seulement à l'écriture : une entrée trafiquée à la main ou écrite par
// une version antérieure du schéma ne doit jamais faire planter l'affichage.
function parseEntry(value: unknown): HistoryEntry | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== 'string' || typeof candidate.question !== 'string' || typeof candidate.askedAt !== 'string') {
    return undefined;
  }
  const reponse = ReponseStructureeSchema.safeParse(candidate.reponse);
  if (!reponse.success) {
    return undefined;
  }
  return { id: candidate.id, question: candidate.question, reponse: reponse.data, askedAt: candidate.askedAt };
}

export function listHistoryEntries(): HistoryEntry[] {
  return readRaw()
    .map(parseEntry)
    .filter((entry): entry is HistoryEntry => entry !== undefined);
}

export function saveHistoryEntry(entry: HistoryEntry): void {
  const withoutExisting = listHistoryEntries().filter((existing) => existing.id !== entry.id);
  const next = [entry, ...withoutExisting].slice(0, MAX_HISTORY_ENTRIES);
  writeRaw(next);
}

export function removeHistoryEntry(id: string): void {
  writeRaw(listHistoryEntries().filter((entry) => entry.id !== id));
}

export function clearHistory(): void {
  writeRaw([]);
}
