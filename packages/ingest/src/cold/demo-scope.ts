// Périmètre de démo confirmé en session (feature 4b) : base à 499/500 Mo sur
// le free tier Supabase, sans marge pour embedder les 157k articles du
// corpus complet. Ces 5 codes couvrent des domaines variés et reconnaissables
// tout en restant dans un budget de stockage raisonnable. Seule cette liste
// écrit le périmètre en dur - une fois élagué (4b, étape 1), le reste de la
// base (subdivisions, renvois, chunks) suit la base pruned.
export const DEMO_CODE_SLUGS = [
  'code-de-la-route',
  'code-penal',
  'code-de-la-consommation',
  'code-civil',
  'code-general-des-impots',
];
