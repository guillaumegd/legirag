import { describe, expect, it } from 'vitest';
import { naiveChunk } from './naive-chunking.js';

describe('naiveChunk', () => {
  it('renvoie contenuText tel quel, sans préfixe ni transformation', () => {
    const article = {
      articleIdentifier: 'LEGIARTI000028436430',
      contenuText: 'La vitesse est limitée à 50 km/h en agglomération.',
    };

    const chunk = naiveChunk(article);

    expect(chunk.contenu).toBe(article.contenuText);
  });

  it('passe articleIdentifier sans le modifier', () => {
    const chunk = naiveChunk({
      articleIdentifier: 'LEGIARTI000006418131',
      contenuText: 'Peu importe.',
    });

    expect(chunk.articleIdentifier).toBe('LEGIARTI000006418131');
  });
});
