# Navigation historique cassée avec le bouton précédent du navigateur

**Type:** Fix

**Issue:** [#74](https://github.com/guillaumegd/legirag/issues/74)

## The problem

Sur `/historique`, sélectionner une question dans la liste (`HistoryView`,
`packages/web/src/components/history-view.tsx`) ne fait qu'un
`setSelectedId(entry.id)` : aucun état n'est poussé dans l'historique du
navigateur (`window.history`). Résultat : quand l'utilisateur ouvre une
question depuis la liste puis clique sur le bouton précédent du navigateur, il
ne revient pas à la vue liste de `/historique` - il saute directement à la
page qui précédait `/historique` dans l'historique réel du navigateur (le plus
souvent la page d'accueil).

Le bouton "Retour à l'historique" (`goBackToList`, ligne 29-32) aggrave le
problème : il fait un `window.history.replaceState(null, '', '/historique')`,
qui *remplace* l'entrée courante au lieu d'en pousser une nouvelle.

## The fix

Remplacer le changement de vue interne (état React + manipulation manuelle de
`window.history`) par une vraie route Next.js dédiée : `/historique/[id]`.
Laisser Next.js gérer la navigation et la pile d'historique du navigateur
normalement, plutôt que rejouer `pushState`/`popstate` à la main.

- Extraire le rendu du détail d'une entrée (bannière d'archivage,
  `ConfidenceBanner`, `MainRule`, `SupplementaryTexts`, `HorsPerimetre`,
  `FooterBar`) de `history-view.tsx` vers un nouveau composant
  `HistoryEntryDetail` (`packages/web/src/components/history-entry-detail.tsx`),
  prenant `{ entry: HistoryEntry }`. Le lien "Retour à l'historique" y devient
  un `<a href="/historique">` simple (navigation réelle, cohérent avec le
  reste du code qui n'utilise pas `next/link`).
- `history-view.tsx` (rendu sur `/historique`) perd `selectedId` et toute la
  logique liée : elle affiche uniquement la liste, dont chaque item est un
  lien `<a href={`/historique/${entry.id}`}>` au lieu d'un `onClick` avec
  état React.
- Nouvelle page `packages/web/src/app/historique/[id]/page.tsx` (client
  component, `useParams` pour lire `id`) : charge les entrées via
  `listHistoryEntries()`, trouve celle qui correspond, affiche
  `<HistoryEntryDetail entry={...} />` ; si l'id ne correspond à aucune
  entrée, affiche un message "introuvable" avec un lien retour vers
  `/historique` (même esprit que le 404 de `trace/[traceId]/page.tsx`, mais
  côté client puisque l'historique vit en `localStorage`).
- `recent-history-preview.tsx` (page d'accueil) : mettre à jour le lien de
  `/historique?entry=${id}` vers `/historique/${id}`.

Plus besoin de `pushState`/`popstate` manuels : le bouton précédent du
navigateur fonctionne nativement puisque chaque vue (liste, détail) est une
vraie route.

## Build steps

- [x] Créer `history-entry-detail.tsx` avec le JSX de détail extrait de
   `history-view.tsx` (sans logique de sélection). Adapter `history-view.tsx`
   pour n'afficher que la liste, avec des liens `<a href="/historique/{id}">`
   au lieu du `onClick`. Supprimer `selectedId`, `goBackToList`, la lecture de
   `?entry=` dans `useEffect`.
   **Done when :** `/historique` affiche uniquement la liste (ou l'état vide),
   chaque question est un lien cliquable vers `/historique/<id>`.
- [x] Créer `packages/web/src/app/historique/[id]/page.tsx` qui rend
   `HistoryEntryDetail` pour l'entrée trouvée, ou un message "introuvable" +
   lien retour sinon. Mettre à jour `recent-history-preview.tsx` pour pointer
   vers `/historique/${entry.id}`.
   **Done when :** dans le navigateur, `/historique` -> clic sur une question
   -> affiche `/historique/<id>` avec le détail -> bouton précédent du
   navigateur revient à la liste `/historique` (pas à l'accueil) ; depuis
   l'accueil, clic sur une question de l'aperçu "Historique" affiche
   directement `/historique/<id>` ; visiter un id inconnu affiche le message
   "introuvable".

## Verify

- `pnpm --filter @legirag/web dev` (ou `LEGIRAG_MOCK_BACKEND=true`), avoir au
  moins une entrée dans l'historique local.
- `/historique` -> clic sur une question -> précédent navigateur : doit
  afficher la liste `/historique`, pas l'accueil.
- Depuis l'accueil, clic sur une question de l'aperçu "Historique" -> doit
  afficher directement `/historique/<id>` ; "Retour à l'historique" ramène à
  `/historique`.
- Visiter `/historique/id-inexistant` : message "introuvable", pas de crash.
- `pnpm typecheck` ; pas de nouveau test unitaire nécessaire (comportement de
  navigation navigateur/UI, couvert par vérification manuelle, pas Vitest).
