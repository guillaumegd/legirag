# Aligner l'UI/UX de `web` sur le diagnostic Claude Design

**Type:** Fix

**Issue:** [#70](https://github.com/guillaumegd/legirag/issues/70)

## The problem

Une archive Claude Design (`packages/web/Diagnostic UXUI web.zip`, un mockup
interactif au format `.dc.html`) documente une version affinée de l'écran
question/réponse et de l'historique. Comparée à l'implémentation React/Next.js
actuelle (`packages/web/src/components/*`, `src/app/site.css`,
`src/app/globals.css`, `src/app/trace/trace.css`), plusieurs écarts
volontaires apparaissent :

1. **Navigation** - le header actuel (`site-header.tsx`) a deux repères texte
   soulignés ("Accueil" implicite via le logo + lien texte "Historique"). Le
   mockup simplifie à logo + icône horloge, surlignée quand la route active
   est `/historique`.
2. **Historique** (`history-view.tsx`) - "Vider l'historique" est dans une
   barre d'outils séparée au-dessus de la liste ; le mockup le renomme "Tout
   supprimer" et le met sur la même ligne que le titre "Historique". Chaque
   carte a un bouton "Supprimer" visible en permanence ; le mockup le
   remplace par un menu "..." (kebab) en coin de carte, avec un dropdown
   fermé par un clic sur un overlay extérieur. La suppression (une entrée ou
   tout l'historique) utilise `window.confirm()` aujourd'hui ; le mockup a
   une modale de confirmation custom (titre, corps, boutons Annuler/Supprimer).
3. **Accueil** (`recent-history-preview.tsx`) - le bloc s'appelle "Vos
   dernières questions", incohérent avec le titre "Historique" de la page
   dédiée vers laquelle il pointe.
4. **États interactifs/accessibilité** - `:hover` manque sur le logo, les
   liens texte ("Nouvelle question", "Retour à l'historique"), les toggles
   "Voir l'article entier" (`article-expander.tsx`), le bouton fermeture "×"
   du panneau Raisonnement (`trace.css`). `:focus-visible` n'est défini
   qu'au cas par cas (`.ask-input` seulement dans `site.css`) au lieu d'être
   global.
5. **Contenu de la réponse** :
   - "Hors périmètre" (`hors-perimetre.tsx`) partage la classe CSS
     `.scope-panel` avec l'avis d'abstention (`main-rule.tsx`), donc les
     deux sont stylés en alerte ambre. Le mockup ne réserve l'ambre qu'à
     l'abstention et repasse "Hors périmètre" en gris neutre. Le composant
     `HorsPerimetre` ne vérifie jamais `items.length`, donc la section
     s'affiche vide si la liste est vide.
   - "Textes complémentaires" (`supplementary-texts.tsx`, `ref-item.tsx`)
     affiche une légende "Nœud plein = même code · anneau pointillé = autre
     code" et un rail avec pastilles distinguant interne/externe - redondant
     avec le nom du code déjà affiché à côté du numéro d'article. Chaque
     texte complémentaire n'affiche ni son état (en vigueur/modifié/abrogé)
     ni sa date de début, contrairement à la citation principale
     (`citation-block.tsx`) qui les affiche - incohérence de traitement
     entre citation principale et complémentaires alors que
     `TexteComplementaire` (schema.ts) étend déjà `Citation` et porte ces
     champs.
   - Le panneau "Raisonnement" (trace technique) est conservé tel quel dans
     son contenu et son comportement (démo technique) - seul son bouton de
     fermeture doit gagner un hover state (point 4).

## The fix

Reproduire ces choix du mockup dans le code React/Next.js réel, sans changer
le comportement fonctionnel au-delà de ce que le mockup montre (pas de
nouvelle logique métier, pas de changement de schéma - `TexteComplementaire`
a déjà `etat`/`date_debut` via `Citation`). Découpé en étapes indépendantes et
revues séparément, puis étendu en cours d'implémentation (étapes 7-12) après
qu'une seconde relecture du mockup a montré des animations et ajustements
visuels non couverts par la liste initiale (fondu d'apparition, points de
chargement pulsants, dépliage animé, chevrons, bannière de confiance avec
jauge, icônes de boutons/pastilles, lien d'exemple hors périmètre, icône
document sur la citation) :

1. Header : icône historique (SVG horloge) + état actif basé sur la route
   (`usePathname`), remplace le lien texte.
2. Historique : titre + "Tout supprimer" sur une ligne ; menu kebab par
   carte avec overlay de fermeture ; modale de confirmation custom
   remplaçant `window.confirm()` pour les deux suppressions.
3. Accueil : renommer "Vos dernières questions" en "Historique".
4. Hover global (logo, liens texte, toggles, boutons modale, fermeture
   trace) + `:focus-visible` global sur boutons/liens/inputs dans
   `globals.css`, retrait des règles `:focus-visible` ponctuelles devenues
   redondantes.
5. "Hors périmètre" : classe CSS neutre distincte de l'abstention ; retour
   `null` si la liste est vide.
6. "Textes complémentaires" : retrait légende + rail/pastilles ; ajout badge
   état + date sur chaque texte complémentaire, aligné sur `citation-block.tsx`.
7. Animations : keyframes `riseIn`/`pulseDot`/`slideDown` absentes du code.
8. Chevrons rotatifs sur les toggles "Voir l'article entier".
9. Bannière de confiance avec jauge animée en tête de réponse (abstention
   traitée en neutre, pas en alerte rouge - cohérence étendue aux badges de
   confiance partout dans l'app via `formatConfianceBadge`).
10. Icônes sur les boutons d'action ("Demander", "Nouvelle question",
    "Retour à l'historique").
11. Icônes sur les pastilles d'exemple + lien "Voir un exemple hors
    périmètre →" qui soumet une vraie question via le flux réel.
12. Icône document sur la citation principale.

Ne doit pas casser : la logique du panneau Raisonnement (aucun changement de
comportement, juste le hover du bouton fermer), le flux de soumission de
question, la persistance locale de l'historique (`lib/history.ts`), les
identifiants/aria-labels déjà en place pour l'accessibilité.

## Build steps

- [x] Étape 1 - Header : icône historique surlignée quand la route active
  est `/historique`.
- [x] Étape 2 - Menu kebab + modale de confirmation custom dans l'historique
  (remplace `window.confirm()`), "Tout supprimer" sur la ligne du titre.
- [x] Étape 3 - Wording accueil : "Vos dernières questions" → "Historique".
- [x] Étape 4 - Hover global + `:focus-visible` global.
- [x] Étape 5 - "Hors périmètre" neutre, masqué si vide.
- [x] Étape 6 - Textes complémentaires simplifiés (état + date, sans
  légende/pastilles).
- [x] Étape 7 - Animations (`riseIn`, `pulseDot`, `slideDown`).
- [x] Étape 8 - Chevrons rotatifs sur les toggles.
- [x] Étape 9 - Bannière de confiance avec jauge, abstention neutre partout.
- [x] Étape 10 - Icônes sur les boutons d'action.
- [x] Étape 11 - Icônes des pastilles + lien exemple hors périmètre.
- [x] Étape 12 - Icône document sur la citation principale.

## Verify

- `pnpm --filter @legirag/web build`, `pnpm --filter @legirag/web typecheck`,
  `pnpm --filter @legirag/web lint`, et `pnpm test` (suite complète du
  monorepo) passent tous.
- Vérification manuelle via Playwright (captures d'écran) : écran idle,
  soumission (points pulsants), réponse nominale (bannière verte, textes
  complémentaires avec état/date, chevrons, icône document), réponse
  abstention (bannière neutre, encart ambre conservé), dépliage d'article
  (animation + chevron), flux historique complet (ajout, kebab, overlay,
  modale de confirmation, suppression unitaire et totale), navigation header
  (icône surlignée sur `/historique`), focus clavier (Tab) visible.
- Décision produit confirmée par l'utilisateur en cours de revue : la couleur
  d'accent rouge/bordeaux (`--accent: oklch(37% 0.11 20)`) est conservée
  volontairement plutôt que passée au bleu, pour ne pas rappeler le bleu
  Marianne réservé aux services `.gouv.fr` (voir `project-overview.md`,
  section UI/UX) - le mockup lui-même utilise la même teinte.

## Findings

### ui-ux-diagnostic-claude-design/F-12 [P1] closed - `formatConfianceBadge` abstention test asserts the removed `badge-danger` class

**File:** packages/web/src/lib/format.test.ts:44-46
**Found:** 2026-08-20 by /audit (scope: current)
**Why it matters:** `pnpm test` fails. The fix's step 9 (confidence banner) deliberately recolors abstention from `badge-danger` (red) to a new `badge-neutral` class (`format.ts`'s `CONFIANCE_BADGES.abstention`), matching the mockup's neutral treatment of abstention everywhere (same philosophy as "Hors périmètre" going neutral in step 5). The existing test still asserted the old `badge-danger` value, so the declared test command (`pnpm test`, the project's Verify gate) was red - this blocked `/complete` regardless of the findings ledger, since a red test suite is a P1 by definition (broken contract).
**Suggested fix:** Update the assertion in `format.test.ts` to `{ label: 'Abstention', className: 'badge-neutral' }`, matching the intentional new behavior.
**Resolution:** Assertion updated to `badge-neutral` (format.test.ts:44-46). Re-ran `pnpm test`: 55 files / 387 tests pass, no failures. Verified 2026-08-20 by /audit re-review.

### ui-ux-diagnostic-claude-design/F-13 [P2] closed - new `formatConfidenceBanner` formatter has no test coverage

**File:** packages/web/src/lib/format.ts (new export, added alongside `formatConfianceBadge`)
**Found:** 2026-08-20 by /audit (scope: current)
**Why it matters:** `coding-standards.md`'s testing gate covers exactly this shape of code ("parsers, formatters, validators... assertable inputs and outputs") and the project's test command is declared, so this is in scope. `formatConfianceBadge`, the sibling formatter it sits next to, already has a `describe` block in `format.test.ts` - `formatConfidenceBanner` (label/className/gaugePercent per `Confiance` value, used by the new `ConfidenceBanner` component) had none.
**Suggested fix:** Add a `describe('formatConfidenceBanner', ...)` block to `format.test.ts` asserting the three `Confiance` values map to the right `className` and `gaugePercent`, mirroring the existing `formatConfianceBadge` tests.
**Resolution:** Added `describe('formatConfidenceBanner', ...)` with one assertion per `Confiance` value (elevee/moyenne/abstention), covering label, className, and gaugePercent. Verified 2026-08-20 by /audit re-review.

### ui-ux-diagnostic-claude-design/F-14 [P3] closed - doubled spacing above the new "Voir un exemple hors périmètre" link

**File:** packages/web/src/app/site.css:137-142 (`.example-pills`), `.hors-perimetre-example-link`
**Found:** 2026-08-20 by /audit (scope: current)
**Why it matters:** `.example-pills` kept its pre-existing `margin-bottom: 2.5rem` (sized for when it was the last idle-view element before `RecentHistoryPreview`). Step 11 inserted `.hors-perimetre-example-link` right after the pills with its own `margin-bottom: 2.5rem`, so the pills-to-link gap was ~2.5rem instead of the tight ~1rem the mockup uses.
**Suggested fix:** Reduce `.example-pills` margin-bottom to `1rem` now that another element sits directly below it.
**Resolution:** `.example-pills` margin-bottom reduced from `2.5rem` to `1rem`. Re-screenshotted the idle view: pills-to-link gap is now tight, `.hors-perimetre-example-link`'s own `2.5rem` still separates it from `RecentHistoryPreview`. Verified 2026-08-20 by /audit re-review.

### ui-ux-diagnostic-claude-design/F-15 [P3] closed - clock icon markup duplicated instead of reused as a shared icon component

**File:** packages/web/src/components/site-header.tsx:21-24 and packages/web/src/components/ask-question.tsx (third `EXEMPLE_QUESTIONS` entry's inline icon)
**Found:** 2026-08-20 by /audit (scope: current)
**Why it matters:** Both places rendered the identical clock SVG (circle + hour/minute hand path) inline rather than through a shared component, drifting from the project's existing centralized-icon pattern (`ActivityIcon`, `WarningTriangleIcon`).
**Suggested fix:** Extract a small `ClockIcon` and use it from both call sites.
**Resolution:** Extracted `packages/web/src/components/clock-icon.tsx` (`ClockIcon`, `size` prop defaulting to 18) and switched both call sites (`site-header.tsx`'s historique icon at 18px, `ask-question.tsx`'s third example-pill icon at 15px) to use it. `lint`/`typecheck`/`build` clean. Verified 2026-08-20 by /audit re-review.
