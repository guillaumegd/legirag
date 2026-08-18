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

const CONFIANCE_BADGES: Record<Confiance, Badge> = {
  elevee: { label: 'Confiance élevée', className: 'badge-confidence' },
  moyenne: { label: 'Confiance moyenne', className: 'badge-confidence' },
  abstention: { label: 'Abstention', className: 'badge-danger' },
};

export function formatConfianceBadge(confiance: Confiance): Badge {
  return CONFIANCE_BADGES[confiance];
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

// "2011-06-30" -> "30/06/2011", le format du prototype (question-answer.html).
export function formatDateFr(dateIso: string): string {
  const [year, month, day] = dateIso.split('-');
  if (year === undefined || month === undefined || day === undefined) {
    return dateIso;
  }
  return `${day}/${month}/${year}`;
}
