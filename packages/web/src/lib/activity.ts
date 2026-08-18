import type { SseEvent } from './sse';

function getProperty(data: unknown, key: string): unknown {
  if (typeof data !== 'object' || data === null) {
    return undefined;
  }
  return (data as Record<string, unknown>)[key];
}

function getArrayLength(data: unknown, key: string): number | undefined {
  const value = getProperty(data, key);
  return Array.isArray(value) ? value.length : undefined;
}

function getNumber(data: unknown, key: string): number | undefined {
  const value = getProperty(data, key);
  return typeof value === 'number' ? value : undefined;
}

// Les slugs de code (ex. "code-de-la-route") perdent les accents et la
// casse officielle - suffisant pour une ligne de statut temporaire, la
// citation affichée ensuite porte le vrai nom du code (champ `code`).
function humanizeCodeSlug(slug: string): string {
  const spaced = slug.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function pluralize(count: number, singular: string, plural: string): string {
  return count > 1 ? plural : singular;
}

// Traduit un événement SSE (nom de nœud du graphe + état partiel) en une
// ligne d'activité en français simple, pour le journal affiché pendant que
// l'agent travaille.
export function describeActivity(event: SseEvent): string {
  switch (event.event) {
    case 'route': {
      const codes = getProperty(event.data, 'codes');
      if (Array.isArray(codes) && codes.length > 0) {
        const names = codes.filter((c): c is string => typeof c === 'string').map(humanizeCodeSlug);
        return `Routé vers ${names.join(', ')}`;
      }
      return 'Recherche non filtrée par code';
    }
    case 'search': {
      const n = getArrayLength(event.data, 'citations') ?? 0;
      return n > 0 ? `${n} ${pluralize(n, 'article lu', 'articles lus')}` : 'Aucun article trouvé';
    }
    case 'draft':
      return 'Citations vérifiées';
    case 'followRenvois': {
      const n = getNumber(event.data, 'newCitationsFound') ?? 0;
      return n > 0
        ? `${n} ${pluralize(n, 'renvoi suivi', 'renvois suivis')}`
        : 'Aucun renvoi supplémentaire à suivre';
    }
    default:
      return event.event;
  }
}
