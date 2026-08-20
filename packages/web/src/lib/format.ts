import type { Confiance, Etat, MotifPresence } from '@legirag/shared/schema';

export interface Badge {
  label: string;
  className: string;
}

const ETAT_BADGES: Record<Etat, Badge> = {
  VIGUEUR: { label: 'en vigueur', className: 'badge-success' },
  MODIFIE: { label: 'modifié', className: 'badge-warning' },
  ABROGE: { label: 'abrogé', className: 'badge-danger' },
};

export function formatEtatBadge(etat: Etat): Badge {
  return ETAT_BADGES[etat];
}

// L'abstention est un badge neutre (pas rouge/danger) : le système signale
// honnêtement une limite, ce n'est pas un échec - même logique que le
// traitement neutre de "Hors périmètre" (hors-perimetre.tsx).
const CONFIANCE_BADGES: Record<Confiance, Badge> = {
  elevee: { label: 'Confiance élevée', className: 'badge-confidence' },
  moyenne: { label: 'Confiance moyenne', className: 'badge-confidence' },
  abstention: { label: 'Abstention', className: 'badge-neutral' },
};

export function formatConfianceBadge(confiance: Confiance): Badge {
  return CONFIANCE_BADGES[confiance];
}

export interface ConfidenceBannerMeta {
  label: string;
  className: string;
  gaugePercent: number;
}

const CONFIANCE_BANNER: Record<Confiance, ConfidenceBannerMeta> = {
  elevee: { label: 'Confiance élevée', className: 'confidence-banner-success', gaugePercent: 92 },
  moyenne: { label: 'Confiance moyenne', className: 'confidence-banner-warning', gaugePercent: 58 },
  abstention: { label: 'Abstention', className: 'confidence-banner-neutral', gaugePercent: 0 },
};

export function formatConfidenceBanner(confiance: Confiance): ConfidenceBannerMeta {
  return CONFIANCE_BANNER[confiance];
}

const CONFIANCE_VALUES: readonly Confiance[] = ['elevee', 'moyenne', 'abstention'];

// Un ExecutionTraceStep.summary est un z.record(z.unknown()) (schema.ts) -
// ce garde-fou est ce qui permet de repasser un champ confiance non typé par
// formatConfianceBadge sans forcer un `as Confiance` à l'aveugle.
export function asConfiance(value: unknown): Confiance | undefined {
  return CONFIANCE_VALUES.includes(value as Confiance) ? (value as Confiance) : undefined;
}

const MOTIF_LABELS: Record<MotifPresence, string> = {
  renvoi_explicite: 'renvoi explicite',
  exception: 'exception',
  cas_particulier: 'cas particulier',
  condition: 'condition',
};

export function formatMotifPresence(motif: MotifPresence): string {
  return MOTIF_LABELS[motif];
}

// Sous la seconde en millisecondes entiers (lisibles tels quels pour un
// appel individuel), au-delà en secondes à une décimale, virgule française.
export function formatDurationMs(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }
  const seconds = (durationMs / 1000).toLocaleString('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${seconds} s`;
}

// "2011-06-30" -> "30/06/2011", le format du prototype (question-answer.html).
export function formatDateFr(dateIso: string): string {
  const [year, month, day] = dateIso.split('-');
  if (year === undefined || month === undefined || day === undefined) {
    return dateIso;
  }
  return `${day}/${month}/${year}`;
}

// Horodatage complet (askedAt de l'historique local) -> "30/06/2011 à 14:05".
// Contrairement à formatDateFr (une simple date "YYYY-MM-DD"), l'entrée ici
// est un timestamp ISO complet, donc on repasse par Date plutôt que par un
// découpage de chaîne.
export function formatDateTimeFr(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return isoTimestamp;
  }
  const datePart = date.toLocaleDateString('fr-FR');
  const timePart = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${datePart} à ${timePart}`;
}
