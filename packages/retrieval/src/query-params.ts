// § contrat GUC verrouillé par 4c (add_search_rls.sql) : app.date_reference
// attend 'YYYY-MM-DD' ou l'absence de valeur, app.codes une liste code_slug
// séparée par des virgules ou l'absence de valeur (chaîne vide = pas de filtre,
// via nullif(..., '') côté SQL).
//
// Fuseau Europe/Paris fixé explicitement plutôt que toISOString() (UTC) : un
// appelant qui passe new Date() pour "aujourd'hui" près de minuit heure de
// Paris obtenait le mauvais jour calendaire côté UTC (ex. 00h30 le 17 rendait
// le 16) - directement faux pour un filtre de validité juridique par date.
// La locale en-CA formate nativement en YYYY-MM-DD.
const DATE_REFERENCE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function formatDateReference(date: Date): string {
  return DATE_REFERENCE_FORMATTER.format(date);
}

export function formatCodesFilter(codes?: string[]): string {
  return codes?.join(',') ?? '';
}
