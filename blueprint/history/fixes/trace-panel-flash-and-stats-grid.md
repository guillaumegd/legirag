# Panneau "Raisonnement" : flash à l'apparition + grille de statistiques manquante

**Type:** Fix

**Issue:** [#72](https://github.com/guillaumegd/legirag/issues/72)

## The problem

Deux écarts constatés par l'utilisateur en testant l'app après le fix
précédent (`trace-panel-desktop-positioning`, commit `6a2643e`) :

1. **Flash du panneau à l'apparition de la réponse.** Dès qu'une réponse
   s'affiche, le panneau "Raisonnement" (`TracePanel`, `.trace-aside`,
   `position: fixed`) apparaît brièvement puis se cache, sans qu'aucun clic
   n'ait eu lieu. Root cause : même famille de bug que le fix précédent - ce
   dernier avait neutralisé le containing block CSS créé par `.view-rise-in`
   uniquement *après* la fin de son animation (en retirant `fill-mode: both`),
   mais *pendant* les 420ms où l'animation tourne activement, le conteneur a
   toujours un `transform` interpolé (`translateY`), donc reste un containing
   block pour son descendant `position:fixed` - `.trace-aside`, rendu via
   `FooterBar` → `TracePanel`, imbriqué dans `.view-rise-in` dans
   `ask-question.tsx`. Le panneau fermé se positionne alors mal et devient
   brièvement visible pendant cette fenêtre, à chaque apparition de réponse.
   Reproduit avec Playwright : échantillonnage de
   `.trace-aside.getBoundingClientRect()` toutes les 20ms dès l'apparition de
   la réponse.

2. **Grille de 4 cartes-statistiques absente.** La maquette Claude Design
   affiche "Durée totale"/"Appels modèle"/"Appels outils"/"Tokens utilisés"
   comme 4 cartes avec icône en grille 2x2 (fond gris, coins arrondis) ;
   l'implémentation actuelle les affiche en simple ligne de texte "Label :
   **Valeur**" (`.totals`). Ce point avait été explicitement exclu du
   précédent fix UI/UX ("le panneau Raisonnement reste inchangé, c'est une
   démo technique") sur confirmation de l'utilisateur à l'époque - il
   redemande maintenant son implémentation, capture d'écran de la maquette à
   l'appui.

## The fix

1. Dans `ask-question.tsx`, sortir `<FooterBar reponse={reponse} />` du
   `<div className="view-rise-in">` (qui enveloppe `ConfidenceBanner`/
   `MainRule`/`SupplementaryTexts`/`HorsPerimetre`) - le rendre comme frère
   juste après, plutôt qu'enfant. `TracePanel` (et son `.trace-aside`
   `position:fixed`) n'est ainsi jamais imbriqué sous un ancêtre avec
   `transform` actif, à aucun moment de son cycle de vie.
2. Dans `trace-panel.tsx`, remplacer le bloc `.totals` (flex, texte) par une
   grille `.trace-totals-grid` (2x2) de 4 `TraceStat` (icône + label +
   valeur), nouveau petit composant local au fichier. Icônes SVG fidèles à
   la maquette (horloge - réutilise `ClockIcon` déjà extrait précédemment -,
   icône "puce" pour les appels modèle, icône "clé/recherche" pour les
   outils, icône "grille de lignes" pour les tokens). Nouvelles classes dans
   `trace.css` (`.trace-totals-grid`, `.trace-stat-card`, `.trace-stat-icon`,
   `.trace-stat-label`, `.trace-stat-value`). La classe `.totals` reste
   intacte : toujours utilisée par la page trace complète (`/trace/[traceId]`),
   hors périmètre de la maquette (qui ne couvre que le panneau slide-over).

Ne doit pas casser : le comportement d'ouverture/fermeture du panneau
(clavier Escape, focus au trigger à la fermeture), le contenu de la
timeline des étapes (`TraceTimeline`, non touché), la page trace complète
(`/trace/[traceId]`, non touchée).

## Build steps

- [x] **Étape 1 - Sortir FooterBar du conteneur animé** : `ask-question.tsx`,
  `<FooterBar reponse={reponse} />` déplacé hors de `.view-rise-in`, comme
  frère.
  Done when : à 1440x900, échantillonnage de `.trace-aside`
  `getBoundingClientRect()` toutes les 20ms depuis l'apparition de la réponse
  (t=0) jusqu'à 680ms montre une position stable (`left=1463`, hors
  viewport) sans variation pendant la fenêtre d'animation.

- [x] **Étape 2 - Grille de statistiques** : `trace-panel.tsx` (nouveau
  composant local `TraceStat`, remplace `.totals`) + `trace.css` (nouvelles
  classes `.trace-totals-grid`/`.trace-stat-*`).
  Done when : le panneau ouvert affiche 4 cartes en grille 2x2 avec icône,
  label et valeur, visuellement conforme à la maquette ; `.totals` reste
  utilisée sans changement sur `/trace/[traceId]`.

## Verify

- `pnpm --filter @legirag/web typecheck`, `lint`, `build` passent ;
  `pnpm test` (suite complète) : 55 fichiers / 387 tests verts.
- Playwright à 1440x900 : capture d'écran du panneau ouvert confirmant la
  grille de 4 cartes ; échantillonnage dense de position confirmant
  l'absence de flash dès l'apparition de la réponse.
