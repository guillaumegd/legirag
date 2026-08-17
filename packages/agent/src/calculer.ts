import type { CalculerInput } from './schema.js';

export interface CalculerResult {
  resultat: number | string;
  formule: string;
  sourceArticle: string;
}

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

// Dates 'YYYY-MM-DD' sans heure - on parse/calcule en UTC pour éviter la
// classe de bug que formatDateReference (packages/retrieval) existe pour
// prévenir ailleurs (décalage de fuseau autour de minuit).
function parseDateUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function formatDateUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// setUTCMonth/setUTCFullYear normalisent un débordement de jour (ex. 31
// janvier + 1 mois -> 3 mars, février n'ayant pas 31 jours) plutôt que de
// caler sur le dernier jour du mois cible - simplification assumée, voir
// current-feature.md / "Scope decision: calculer's formulas".
function ajouterDuree(date: Date, duree: number, unite: 'jours' | 'mois' | 'annees'): Date {
  const result = new Date(date.getTime());
  if (unite === 'jours') result.setUTCDate(result.getUTCDate() + duree);
  else if (unite === 'mois') result.setUTCMonth(result.getUTCMonth() + duree);
  else result.setUTCFullYear(result.getUTCFullYear() + duree);
  return result;
}

export function calculer(input: CalculerInput, now: Date = new Date()): CalculerResult {
  switch (input.type) {
    case 'delai':
    case 'prescription': {
      const { dateDepart, duree, unite, sourceArticle } = input.params;
      const limite = ajouterDuree(parseDateUTC(dateDepart), duree, unite);
      return { resultat: formatDateUTC(limite), formule: `${dateDepart} + ${duree} ${unite}`, sourceArticle };
    }
    case 'anciennete': {
      const { dateDebut, dateReference, sourceArticle } = input.params;
      const referenceIso = dateReference ?? formatDateUTC(now);
      const jours = Math.round(
        (parseDateUTC(referenceIso).getTime() - parseDateUTC(dateDebut).getTime()) / MS_PAR_JOUR,
      );
      return { resultat: jours, formule: `${referenceIso} - ${dateDebut} (jours calendaires)`, sourceArticle };
    }
    case 'seuil': {
      const { valeur, seuil, sourceArticle } = input.params;
      const atteint = valeur >= seuil;
      return { resultat: atteint ? 'atteint' : 'non atteint', formule: `${valeur} >= ${seuil}`, sourceArticle };
    }
  }
}
