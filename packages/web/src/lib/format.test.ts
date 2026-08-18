import { describe, expect, it } from 'vitest';
import { formatConfianceBadge, formatDateFr, formatEtatBadge, formatMotifPresence } from './format.js';

describe('formatEtatBadge', () => {
  it('maps VIGUEUR to the success badge', () => {
    expect(formatEtatBadge('VIGUEUR')).toEqual({ label: 'en vigueur', className: 'badge-success' });
  });

  it('maps MODIFIE to the warning badge', () => {
    expect(formatEtatBadge('MODIFIE')).toEqual({ label: 'modifié', className: 'badge-warning' });
  });

  it('maps ABROGE to the danger badge', () => {
    expect(formatEtatBadge('ABROGE')).toEqual({ label: 'abrogé', className: 'badge-danger' });
  });
});

describe('formatDateFr', () => {
  it('converts an ISO date to jj/mm/aaaa', () => {
    expect(formatDateFr('2011-06-30')).toBe('30/06/2011');
  });

  it('returns the input unchanged if it is not a plain ISO date', () => {
    expect(formatDateFr('garbage')).toBe('garbage');
  });
});

describe('formatConfianceBadge', () => {
  it('maps elevee and moyenne to the confidence badge', () => {
    expect(formatConfianceBadge('elevee')).toEqual({ label: 'Confiance élevée', className: 'badge-confidence' });
    expect(formatConfianceBadge('moyenne')).toEqual({ label: 'Confiance moyenne', className: 'badge-confidence' });
  });

  it('maps abstention to the danger badge', () => {
    expect(formatConfianceBadge('abstention')).toEqual({ label: 'Abstention', className: 'badge-danger' });
  });
});

describe('formatMotifPresence', () => {
  it('translates each motif to its French label', () => {
    expect(formatMotifPresence('renvoi_explicite')).toBe('renvoi explicite');
    expect(formatMotifPresence('exception')).toBe('exception');
    expect(formatMotifPresence('cas_particulier')).toBe('cas particulier');
    expect(formatMotifPresence('condition')).toBe('condition');
  });
});
