import type { ExecutionTraceStep } from '@legirag/shared/schema';
import { humanizeCodeSlug, pluralize } from './activity';
import { asConfiance, formatConfianceBadge } from './format';

const NODE_LABELS: Record<string, string> = {
  route: 'Routage',
  search: 'Recherche',
  draft: 'Rédaction',
  followRenvois: 'Suivi des renvois',
};

// Un nœud absent de la table (futur ajout au graphe fixe) s'affiche par son
// nom brut plutôt que de faire planter le rendu (même défense que
// summarizeNode côté API pour un nœud inconnu).
export function describeStepNode(node: string): string {
  return NODE_LABELS[node] ?? node;
}

// Traduit le résumé déjà calculé d'une étape (summarizeNode,
// packages/api/src/question/build-execution-trace.ts) en une ligne de
// résultat en français simple pour la timeline - même vocabulaire que
// describeActivity (journal en direct de la question/réponse), mais sur la
// forme post-trace (summary.citationsCount, pas summary.citations).
export function describeStepSummary(step: ExecutionTraceStep): string {
  switch (step.node) {
    case 'route': {
      const codes = step.summary.codes;
      if (Array.isArray(codes) && codes.length > 0) {
        const names = codes.filter((code): code is string => typeof code === 'string').map(humanizeCodeSlug);
        return `Routé vers ${names.join(', ')}`;
      }
      return 'Recherche non filtrée par code';
    }
    case 'search': {
      const count = typeof step.summary.citationsCount === 'number' ? step.summary.citationsCount : 0;
      return count > 0
        ? `${count} ${pluralize(count, 'citation trouvée', 'citations trouvées')}`
        : 'Aucune citation trouvée';
    }
    case 'draft': {
      const confiance = asConfiance(step.summary.confiance);
      const attempt = typeof step.summary.draftAttempts === 'number' ? step.summary.draftAttempts : undefined;
      const label = confiance !== undefined ? formatConfianceBadge(confiance).label : 'Brouillon produit';
      return attempt !== undefined ? `${label} (tentative ${attempt})` : label;
    }
    case 'followRenvois': {
      const count = typeof step.summary.newCitationsFound === 'number' ? step.summary.newCitationsFound : 0;
      return count > 0
        ? `${count} ${pluralize(count, 'nouveau renvoi suivi', 'nouveaux renvois suivis')}`
        : 'Aucun renvoi supplémentaire à suivre';
    }
    default:
      return step.node;
  }
}
