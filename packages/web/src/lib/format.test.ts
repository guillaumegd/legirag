import { describe, expect, it } from 'vitest';
import {
  asConfiance,
  formatConfianceBadge,
  formatConfidenceBanner,
  formatDateFr,
  formatDateTimeFr,
  formatDurationMs,
  formatEtatBadge,
  formatMotifPresence,
} from './format.js';

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

describe('formatDateTimeFr', () => {
  it('formats an ISO timestamp as jj/mm/aaaa à hh:mm', () => {
    expect(formatDateTimeFr('2026-08-19T10:05:00.000Z')).toMatch(/^\d{2}\/\d{2}\/2026 à \d{2}:\d{2}$/);
  });

  it('returns the input unchanged if it is not a parseable timestamp', () => {
    expect(formatDateTimeFr('garbage')).toBe('garbage');
  });
});

describe('formatConfianceBadge', () => {
  it('maps elevee to the success badge and moyenne to the warning badge', () => {
    expect(formatConfianceBadge('elevee')).toEqual({ label: 'Confiance élevée', className: 'badge-success' });
    expect(formatConfianceBadge('moyenne')).toEqual({ label: 'Confiance moyenne', className: 'badge-warning' });
  });

  it('maps abstention to a neutral badge, not a danger one', () => {
    expect(formatConfianceBadge('abstention')).toEqual({ label: 'Abstention', className: 'badge-neutral' });
  });
});

describe('formatConfidenceBanner', () => {
  it('maps elevee to the success banner with a high gauge', () => {
    expect(formatConfidenceBanner('elevee')).toEqual({
      label: 'Confiance élevée',
      className: 'confidence-banner-success',
      gaugePercent: 92,
    });
  });

  it('maps moyenne to the warning banner with a mid gauge', () => {
    expect(formatConfidenceBanner('moyenne')).toEqual({
      label: 'Confiance moyenne',
      className: 'confidence-banner-warning',
      gaugePercent: 58,
    });
  });

  it('maps abstention to the neutral banner with an empty gauge', () => {
    expect(formatConfidenceBanner('abstention')).toEqual({
      label: 'Abstention',
      className: 'confidence-banner-neutral',
      gaugePercent: 0,
    });
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

describe('formatDurationMs', () => {
  it('renders sub-second durations in milliseconds', () => {
    expect(formatDurationMs(180)).toBe('180 ms');
    expect(formatDurationMs(999)).toBe('999 ms');
  });

  it('renders durations of a second or more in seconds with a French decimal comma', () => {
    expect(formatDurationMs(1000)).toBe('1,0 s');
    expect(formatDurationMs(6420)).toBe('6,4 s');
  });
});

describe('asConfiance', () => {
  it('accepts each known confiance value', () => {
    expect(asConfiance('elevee')).toBe('elevee');
    expect(asConfiance('moyenne')).toBe('moyenne');
    expect(asConfiance('abstention')).toBe('abstention');
  });

  it('rejects anything else, including undefined and unrelated strings', () => {
    expect(asConfiance(undefined)).toBeUndefined();
    expect(asConfiance('garbage')).toBeUndefined();
    expect(asConfiance(null)).toBeUndefined();
  });
});
