export type MockScenario = 'nominal' | 'abstention' | 'erreur';

// Double garde-fou volontaire : LEGIRAG_MOCK_BACKEND seul ne suffit pas,
// NODE_ENV !== 'production' doit aussi être vrai - une bascule accidentelle
// de la variable en prod (mauvais fichier d'env poussé, faute de frappe)
// reste donc sans effet plutôt que de faire répondre du contenu fictif aux
// vrais visiteurs.
export function isMockBackendEnabled(): boolean {
  return process.env.LEGIRAG_MOCK_BACKEND === 'true' && process.env.NODE_ENV !== 'production';
}

// Décompose en forme NFD (une lettre de base suivie de ses marques
// diacritiques) puis filtre les marques (plage Unicode 0x0300-0x036f) -
// évite une plage d'échappement \u dans une classe de caractères regex,
// source classique d'erreurs de copier-coller silencieuses.
function stripAccents(value: string): string {
  return Array.from(value.normalize('NFD'))
    .filter((char) => {
      const codePoint = char.codePointAt(0) ?? 0;
      return codePoint < 0x0300 || codePoint > 0x036f;
    })
    .join('');
}

// Sélection du scénario mocké par mot-clé dans la question posée - seul
// signal disponible : POST /question ne porte que le texte de la question,
// pas de paramètre dédié au scénario.
export function selectScenario(question: string): MockScenario {
  const normalized = stripAccents(question).toLowerCase();
  if (normalized.includes('abstention')) {
    return 'abstention';
  }
  if (normalized.includes('erreur')) {
    return 'erreur';
  }
  return 'nominal';
}
