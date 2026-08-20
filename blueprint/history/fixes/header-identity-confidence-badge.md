# Identité visuelle du header (logo, nom, historique) et bug badge de confiance

**Type:** Fix

**Issue:** [#75](https://github.com/guillaumegd/legirag/issues/75)

## The problem

Diagnostic mené avec l'utilisateur sur l'identité visuelle du header
(`site-header.tsx`) et un bug de couleur repéré en testant l'app :

1. **Bouton "historique" (pendule)** dans le header : jugé superflu par
   l'utilisateur une fois qu'on a un vrai point d'entrée sur l'accueil.
2. **Marque de l'app** (`.brand-mark`) : c'est juste `<span>§</span>` dans un
   carré de couleur accent - pas un vrai logo, aucune identité.
3. **Nom "legirag"** : traitement typographique par défaut, sans personnalité.
   La classe CSS `.brand-tagline` existe déjà dans `site.css` (stylée) mais
   n'est jamais utilisée dans le JSX - un tagline a été prévu puis abandonné.
4. **Favicon** : absent (pas de `public/`, pas de `app/icon.*`, pas d'entrée
   `icons` dans `metadata`). L'onglet du navigateur n'a pas d'icône.
5. **Bug UX confirmé** : `formatConfianceBadge` (`packages/web/src/lib/format.ts`)
   assigne la même classe `badge-confidence` (couleur `--accent`, rouge) à la
   fois à `elevee` et `moyenne` - le badge de confiance a donc toujours la
   même couleur rouge quel que soit le niveau, alors que la jauge de
   `ConfidenceBanner` (`formatConfidenceBanner`) les différencie bien en
   vert/orange (`confidence-banner-success`/`confidence-banner-warning`).
   Incohérence trompeuse entre les deux composants pour la même information.

L'utilisateur a fourni un logo (déposé dans `blueprint/reference/logo.png`) :
un livre de droit rouge/bordeaux avec un "§" doré et une tranche dorée, fond
transparent, 1254x1254px. Bbox du contenu opaque (mesurée via PIL) :
`(105, 35, 1149, 1201)` - marges horizontales (~105px) nettement plus larges
que les marges verticales (~35-53px), à recadrer/uniformiser avant usage
(favicon et petite taille header) sinon le motif paraît trop petit une fois
contraint dans un carré.

Décisions déjà validées par l'utilisateur (AskUserQuestion) :
- Bouton historique : suppression pure, pas de restylage.
- Nom "legirag" : on garde le nom, on retravaille seulement l'habillage
  typographique + on câble un tagline. Pas de renommage de l'app.

Découverte faite en cours d'implémentation : `/historique` avait déjà migré
vers une vraie route `/historique/[id]` (commit `8f77c87`, fait dans une
autre session entre le diagnostic et cette implémentation) au lieu du motif
`?entry=` décrit dans un fix antérieur. Ce fix s'appuie sur cette route sans
la retoucher.

## The fix

- **Retrait bouton historique + état vide accueil** : suppression de
  `.historique-link` de `site-header.tsx` (et le CSS mort associé). Comme ce
  lien était le seul point d'accès à `/historique` quand il n'y a aucune
  entrée, `recent-history-preview.tsx` ne fait plus `return null` sur liste
  vide : affiche à la place un état vide reprenant l'esprit du message vide
  de `/historique` ("Aucune question pour l'instant. Vos prochaines questions
  apparaîtront ici.") avec un lien vers `/historique`, qui reste donc
  toujours atteignable.
- **Logo** : `blueprint/reference/logo.png` recadré (script ponctuel PIL) à
  marge uniforme (~6%) dans `blueprint/reference/logo-cropped.png`, source
  des assets dérivés : `packages/web/src/app/icon.png` (512x512, convention
  Next.js App Router - favicon généré automatiquement) et
  `packages/web/src/app/apple-icon.png` (180x180). `site-header.tsx` utilise
  `packages/web/public/logo.png` (128x128) à la place du `<span>§</span>`,
  affiché à 28x28.
- **Nom + tagline** : nouvelle classe `.brand-wordmark` (poids 800, taille
  1.35rem, tracking resserré) pour "legirag" ; `.brand-tagline` câblée avec
  "Recherche juridique sourcée", masquée sous 480px pour ne pas presser le
  header sur mobile.
- **Badge de confiance** : dans `formatConfianceBadge`
  (`packages/web/src/lib/format.ts`), `elevee` → `badge-success`, `moyenne` →
  `badge-warning` (au lieu du `badge-confidence` partagé), cohérent avec
  `formatEtatBadge` et avec les couleurs de `formatConfidenceBanner`.
  Assertions de `packages/web/src/lib/format.test.ts` mises à jour. Classe
  CSS `.badge-confidence` (devenue morte) retirée de `site.css`.

`site-header.tsx` a aussi perdu `'use client'`/`usePathname` : sans la
logique de bouton actif sur `/historique`, il n'a plus besoin d'être un
composant client.

Rien de cassé : `/historique` (liste, sélection, suppression) inchangée ;
`recent-history-preview.tsx` avec des entrées reste inchangé (liste + "Tout
voir →") ; les badges d'état (`formatEtatBadge`) et le badge `abstention`
(déjà `badge-neutral`) non touchés.

## Build steps

1. [x] **Assets logo + favicon** : recadrage PIL, `app/icon.png`,
   `app/apple-icon.png`, `public/logo.png`.
   **Done when :** favicon visible dans l'onglet du navigateur ; pas de
   bordure/marge visiblement asymétrique en petit format.
   Vérifié : `icon.png`/`apple-icon.png` retournent 200 et sont référencés
   dans le `<head>` (`<link rel="icon">`/`<link rel="apple-touch-icon">`) sur
   le serveur dev.

2. [x] **Header : logo + nom + tagline + retrait du bouton historique**.
   **Done when :** header sans icône pendule ; logo réel affiché ; nom +
   tagline visuellement distincts du placeholder d'origine.
   Vérifié : capture d'écran Playwright + `historique-link` compte 0 dans le
   DOM + typecheck vert.

3. [x] **État vide de l'accueil**.
   **Done when :** `localStorage` vidé sur `/` affiche l'état vide avec un
   lien fonctionnel vers `/historique` ; avec des entrées, comportement
   inchangé.
   Vérifié : Playwright, les deux branches (vide/peuplée) testées séparément.

4. [x] **Bug badge de confiance**.
   **Done when :** `pnpm test` vert ; une réponse `elevee` affiche un badge
   vert et une réponse `moyenne` un badge orange dans `/historique`,
   cohérents avec `ConfidenceBanner`.
   Vérifié : Playwright avec deux entrées d'historique fixture (`elevee` /
   `moyenne`) - couleurs calculées distinctes confirmées (vert vs orange).

## Verify

- `pnpm --filter @legirag/web typecheck` ✓, `lint` ✓, `build` ✓ (routes
  `icon.png`/`apple-icon.png`/`historique/[id]` générées).
- `pnpm test` : 55 fichiers / 387 tests ✓.
- Playwright : favicon servi et référencé, bouton historique absent du DOM,
  état vide accueil + lien fonctionnel, branche peuplée inchangée, couleurs
  de badge distinctes (vert `elevee` / orange `moyenne`) sur `/historique`.
