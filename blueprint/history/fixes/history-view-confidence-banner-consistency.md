# Vue historique incohérente avec la réponse en direct (bannière de confiance)

**Type:** Fix

**Issue:** [#73](https://github.com/guillaumegd/legirag/issues/73)

## The problem

La vue "entrée sélectionnée" de l'historique (`history-view.tsx`) n'utilisait
pas le même composant `ConfidenceBanner` que la vue de réponse en direct
(`ask-question.tsx`) - elle affichait un simple badge+date en bas de page
(`.history-selected-meta`, après `HorsPerimetre`, avant `FooterBar`) au lieu
de la bannière avec jauge animée en haut de réponse. Décision prise
volontairement lors du fix UI/UX précédent (`ui-ux-diagnostic-claude-design`)
en pensant coller à la maquette (qui simplifie effectivement cette vue
archivée), mais l'utilisateur a signalé en testant l'app que consulter une
question depuis l'historique ne ressemble pas à la voir juste après l'avoir
posée, ce qui n'était pas voulu.

Autre écart signalé dans la même remontée, non couvert par ce fix : le
"déroulé de ce qui s'est passé" (liste d'activité "Routé vers Code du
travail / 3 articles lus / Citations vérifiées...") est absent de la vue
historique. Cause structurelle : ces événements SSE sont éphémères et ne
sont jamais persistés dans `HistoryEntry` (`lib/history.ts`, qui ne stocke
que `{id, question, reponse, askedAt}`). L'information équivalente (les
étapes détaillées de la trace) reste accessible via "Voir le raisonnement"
(`TracePanel`), déjà présent dans les deux vues. Laissé de côté sur décision
explicite de l'utilisateur dans la conversation - pas dans le périmètre de
ce fix.

## The fix

`history-view.tsx` utilise `<ConfidenceBanner confiance={selected.reponse.confiance}
dateReference={selected.reponse.date_reference} />` au même endroit que
`ask-question.tsx` (juste après la notice d'archivage, avant "Règle
principale"), remplaçant le bloc `.history-selected-meta`. La classe CSS
`.history-selected-meta` (site.css), devenue morte, est retirée. Import
`formatDateFr` retiré de `history-view.tsx` (n'était utilisé que par ce
bloc) ; `formatConfianceBadge` reste utilisé pour les badges de la liste
d'historique (inchangé).

Ne doit pas casser : les badges de confiance affichés dans la liste
d'historique et le bloc "Historique" de l'accueil (toujours
`formatConfianceBadge`, non touché) ; le comportement de sélection/retour de
la vue historique.

## Build steps

- [x] **Étape 1 - Unifier la bannière de confiance** : `history-view.tsx`
  remplace `.history-selected-meta` par `<ConfidenceBanner>` ; retrait de la
  classe CSS morte dans `site.css` ; import `formatDateFr` retiré.
  Done when : consulter une entrée d'historique affiche la même bannière
  (icône, couleur, jauge) que la réponse venait tout juste d'être posée,
  positionnée au même endroit (avant "Règle principale").

## Verify

- `pnpm --filter @legirag/web typecheck`, `lint`, `build` passent ;
  `pnpm test` (suite complète) : 55 fichiers / 387 tests verts.
- Playwright : capture d'écran de la vue en direct et de la vue historique
  pour la même question/réponse, comparées côte à côte - structure visuelle
  identique pour tout ce qui est persisté (bannière, règle principale,
  textes complémentaires, hors périmètre, pied avec trace).
