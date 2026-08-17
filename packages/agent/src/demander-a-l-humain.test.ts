import { describe, expect, it } from 'vitest';
import { demanderALHumain } from './demander-a-l-humain.js';

describe('demanderALHumain', () => {
  it('combine motif et questionOuverte dans escalade', () => {
    const result = demanderALHumain({
      motif: 'Succession internationale hors corpus indexé',
      questionOuverte: 'Quelle loi applicable pour un défunt résidant à l’étranger ?',
    });
    expect(result.escalade).toBe(
      'Succession internationale hors corpus indexé : Quelle loi applicable pour un défunt résidant à l’étranger ?',
    );
  });

  it('retourne toujours le même interlocuteur', () => {
    const first = demanderALHumain({ motif: 'a', questionOuverte: 'b' });
    const second = demanderALHumain({ motif: 'c', questionOuverte: 'd' });
    expect(first.interlocuteur).toBe(second.interlocuteur);
    expect(first.interlocuteur.length).toBeGreaterThan(0);
  });
});
