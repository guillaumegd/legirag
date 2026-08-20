# Panneau "Raisonnement" mal positionné en vue desktop large

**Type:** Fix

**Issue:** [#71](https://github.com/guillaumegd/legirag/issues/71)

## The problem

Le panneau "Raisonnement" (`TracePanel`, `.trace-aside` dans
`packages/web/src/app/trace/trace.css`, `position: fixed; right: 0;`) se
positionne mal sur des largeurs de fenêtre desktop courantes (testé et
reproduit avec Playwright à 1440x900) :

- **Fermé**, il reste partiellement visible dans le coin droit de l'écran au
  lieu d'être totalement hors champ.
- **Ouvert**, il ne se docke plus au vrai bord droit du navigateur : il
  flotte au milieu de la colonne de contenu de la réponse, avec un overlay
  qui ne couvre pas toute la fenêtre.

Cause racine : le fix précédent (`blueprint/history/fixes/ui-ux-diagnostic-claude-design.md`,
mergé sur `main` au commit `280b0ab`) a ajouté, à son étape 7 ("Animations"),
une classe `.view-rise-in` avec `animation: lg-rise-in 420ms ease both;` sur
le conteneur englobant toute la réponse "done" dans `ask-question.tsx`
(`ConfidenceBanner`, `MainRule`, `SupplementaryTexts`, `HorsPerimetre`,
`FooterBar`). `FooterBar` rend `TracePanel`, dont `.trace-aside` est en
`position: fixed`.

Le `fill-mode: both` retient l'état final du keyframe (`to { transform:
translateY(0); }`) après la fin de l'animation. Or `transform: translateY(0)`
n'est **pas** équivalent à `transform: none` pour le CSS : tout élément
portant une valeur de `transform` autre que `none` (même une translation
identité) devient un nouveau "containing block" pour ses descendants en
`position: fixed`. `.trace-aside` se positionnait donc par rapport à ce
conteneur `.view-rise-in` (large comme la colonne de contenu, ~720px,
centrée) au lieu de la fenêtre du navigateur - invisible par coïncidence sur
les viewports étroits testés précédemment (900px, où l'écart tombait hors du
`clientWidth`), mais nettement visible et cassé dès 1440px.

## The fix

Retirer `both` du fill-mode de `.view-rise-in` dans
`packages/web/src/app/site.css` : `animation: lg-rise-in 420ms ease;` au lieu
de `animation: lg-rise-in 420ms ease both;`. Sans fill-mode "both"/"forwards",
l'élément revient à son style de base (`transform: none`, pas de containing
block) une fois l'animation terminée. L'effet visuel pendant l'apparition
(fondu + léger glissement) reste inchangé, seul l'état *après* la fin de
l'animation change.

Ne doit pas casser : l'effet de fondu/glissement à l'apparition des écrans
idle et réponse (`.view-rise-in`, utilisé dans `ask-question.tsx`) ; le
comportement d'ouverture/fermeture du panneau Raisonnement lui-même (aucun
changement de `trace-panel.tsx`/`trace.css`).

## Build steps

- [x] Étape 1 - Retirer le fill-mode `both` : `packages/web/src/app/site.css`,
  règle `.view-rise-in`, `animation: lg-rise-in 420ms ease both;` →
  `animation: lg-rise-in 420ms ease;`.

## Verify

- `pnpm --filter @legirag/web typecheck`, `lint`, `build` passent ;
  `pnpm test` (suite complète) : 55 fichiers / 387 tests verts.
- Vérification Playwright, `.trace-aside` mesuré via `getBoundingClientRect()` :
  - 1440x900 : fermé `left=1463/right=1923` (hors viewport, invisible) ;
    ouvert `left=980/right=1440` (docké exactement au bord réel).
  - 900x900 (régression) : fermé `left=923/right=1383` (hors viewport) ;
    ouvert `left=440/right=900` (docké au bord réel).
- Captures d'écran confirmant visuellement les deux largeurs, panneau ouvert
  plein-hauteur avec overlay complet, aucune fuite visuelle à l'état fermé.
