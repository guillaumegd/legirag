# Feature: Evaluation question set and harness

**From build-plan:** feature 5

**Status:** complete

## Goal

Ship a hand-annotated set of French legal questions covering the build-plan's
five categories (routine lookup, mandatory cross-reference, time-sensitive,
out-of-scope, false premise), plus a runnable harness that scores retrieval
quality against them - so that item 6's chunking/hybrid-search/re-ranking
changes, and later item 9's agent evaluation, have something concrete to be
measured against instead of "looks right."

## In scope

- `eval/questions.json` (new, top-level, git-tracked) - ~15 hand-authored
  questions across the 5 categories. Every `articlesAttendus`/`articlesExclus`
  ground-truth reference is verified against the live Supabase project (real
  `article_identifier`s, checked below), not guessed.
- `packages/eval`, a new workspace package:
  - Zod-validated loader for the dataset (`EvaluationQuestion` schema).
  - Pure scoring logic: recall@1/5/10 and MRR against a `SupabaseRetriever`
    ranked result list, plus a simple exclusion check for the date-filtering
    fixtures.
  - A runnable script (`pnpm --filter @legirag/eval harness`) that runs every
    question through the real `SupabaseRetriever` (item 4d) and prints a
    per-question and aggregate report - the harness the build-plan asks for.
- Unit tests for the pure loader/scoring logic (testing gate is ON).
- Documenting the new package in `coding-standards.md`'s monorepo list and in
  the root `tsconfig.json`'s project references, matching how every prior
  package was added.

## Out of scope

- Scoring `hors_perimetre` / `fausse_premisse` questions. There's no ground
  truth for them at the retrieval layer - correcting a false premise or
  abstaining is agent behavior that doesn't exist yet (items 8-9). They're
  annotated now, per the build-plan's own requirement, and listed by the
  harness as unscored; item 9 (agent quality evaluation) is what actually
  scores them, once there's an agent to run.
- Real time-travel / historical-version testing. Per `project-overview.md`'s
  open note, item 10 hasn't loaded any historical rows yet - every demo
  article is `VIGUEUR` with `dateFin = 2999-01-01`. The `sensible_a_la_date`
  fixtures here only re-prove `SupabaseRetriever` correctly wires
  `RequeteRecherche.dateReference` (reusing 4d's own proven
  `checkDateReferenceFilter` pattern), not that a past version's different
  text is served - that needs item 10's actual history data.
- Any pass/fail gate, threshold, or CI wiring. Item 12's job ("the evaluation
  suite wired into CI as a blocking regression check"). This harness prints
  numbers for a human to read; it has nothing to compare them against yet.
- Persisting or diffing report runs over time (e.g. to a file, to compare
  item 6's baseline vs. improvements). Item 6 can add that when it actually
  needs to diff two runs; this harness prints one run to stdout, matching
  `validate-search.ts`'s existing convention.
- Reranking or any change to `SupabaseRetriever` itself - item 6's job. This
  feature only measures the existing 4d implementation as-is.
- Growing the question set beyond this first ~15-question pass, or the
  collective-bargaining-agreement branch (no KALI data loaded, per
  `project-overview.md`). The set is expected to grow later; it isn't meant
  to be exhaustive here.
- Full cross-reference *graph* coverage scoring for `renvoi_obligatoire`
  questions (requiring every referenced article to surface in one flat
  top-K list). A single hybrid search call can't follow references - that's
  the agent's bounded cross-reference loop, item 8. This harness scores
  whether the directly relevant article surfaced at all (see Notes).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Question set, schema, and loader** -

  `eval/questions.json` (new, top-level - see Notes for why it lives outside
  `packages/`), exactly these 15 entries:

  ```json
  [
    { "id": "q-001", "category": "recherche_simple",
      "question": "Quelle est la vitesse maximale autorisée en agglomération ?",
      "articlesAttendus": ["LEGIARTI000028436430"],
      "notes": "code-de-la-route R413-3, vitesse limitée à 50 km/h en agglomération." },
    { "id": "q-002", "category": "recherche_simple",
      "question": "Quel est le délai de rétractation pour un achat en ligne ?",
      "articlesAttendus": ["LEGIARTI000032226842"],
      "notes": "code-de-la-consommation L221-18, délai de 14 jours." },
    { "id": "q-003", "category": "recherche_simple",
      "question": "Quelle peine encourt l'auteur d'un vol simple ?",
      "articlesAttendus": ["LEGIARTI000006418131"],
      "notes": "code pénal 311-3, 3 ans d'emprisonnement et 45 000 euros d'amende." },
    { "id": "q-004", "category": "recherche_simple",
      "question": "Quelles sont les conditions de validité d'un contrat ?",
      "articlesAttendus": ["LEGIARTI000032040911"],
      "notes": "code civil 1128, consentement / capacité / contenu licite." },
    { "id": "q-005", "category": "recherche_simple",
      "question": "Comment est calculé l'impôt sur le revenu ?",
      "articlesAttendus": ["LEGIARTI000048805432"],
      "notes": "code général des impôts, article 197." },
    { "id": "q-006", "category": "renvoi_obligatoire",
      "question": "Qui peut collecter les informations sur le nombre de points d'un permis de conduire, et que risque-t-on à les détourner de leur finalité ?",
      "articlesAttendus": ["LEGIARTI000006840969", "LEGIARTI000006417981", "LEGIARTI000006417984"],
      "notes": "code-de-la-route L223-7 renvoie (inter-code, résolu) vers code pénal 226-21 et 226-22 - vérifié dans la table renvois." },
    { "id": "q-007", "category": "renvoi_obligatoire",
      "question": "Que risque une personne qui usurpe le nom d'autrui pour qu'une condamnation liée au permis de conduire soit enregistrée à son nom au lieu du sien ?",
      "articlesAttendus": ["LEGIARTI000006841021", "LEGIARTI000006418661"],
      "notes": "code-de-la-route L225-7 renvoie (inter-code, résolu) vers code pénal 434-23 pour la peine encourue." },
    { "id": "q-008", "category": "sensible_a_la_date",
      "question": "Quelle est la vitesse maximale autorisée en agglomération ?",
      "dateReference": "2020-01-01",
      "articlesAttendus": ["LEGIARTI000028436430"],
      "notes": "R413-3 : date_debut = 2014-01-10, donc en vigueur au 2020-01-01." },
    { "id": "q-009", "category": "sensible_a_la_date",
      "question": "Quelle est la vitesse maximale autorisée en agglomération ?",
      "dateReference": "2000-01-01",
      "articlesExclus": ["LEGIARTI000028436430"],
      "notes": "R413-3 : date_debut = 2014-01-10, donc absent au 2000-01-01 - reprend le test de 4d (checkDateReferenceFilter)." },
    { "id": "q-010", "category": "hors_perimetre",
      "question": "Quel est le préavis de licenciement pour un cadre en CDI ?",
      "notes": "code du travail, non chargé dans le corpus de démonstration (5 codes, voir 4d)." },
    { "id": "q-011", "category": "hors_perimetre",
      "question": "Quelles sont les conditions d'obtention d'un titre de séjour en France ?",
      "notes": "CESEDA, non chargé." },
    { "id": "q-012", "category": "hors_perimetre",
      "question": "Quelles sont les obligations d'une installation classée pour la protection de l'environnement (ICPE) ?",
      "notes": "code de l'environnement, non chargé." },
    { "id": "q-013", "category": "fausse_premisse",
      "question": "Puisque le vol simple est un crime, quelle cour d'assises est compétente pour le juger ?",
      "notes": "fausse prémisse : le vol simple (311-3) est un délit, jugé par le tribunal correctionnel, pas un crime jugé en cour d'assises." },
    { "id": "q-014", "category": "fausse_premisse",
      "question": "Le délai de rétractation légal de 30 jours pour un achat en ligne s'applique-t-il aussi aux achats en magasin ?",
      "notes": "fausse prémisse double : le délai légal est de 14 jours (L221-18), et le droit de rétractation ne couvre que la vente à distance, pas les achats en magasin." },
    { "id": "q-015", "category": "fausse_premisse",
      "question": "À partir de quel âge un contrat signé seul par un mineur est-il automatiquement valable sans l'accord de ses représentants légaux ?",
      "notes": "fausse prémisse : un mineur non émancipé n'a en général pas la capacité de contracter seul (1128, capacité de contracter)." }
  ]
  ```

  `packages/eval/src/schema.ts`:

  ```ts
  import { z } from 'zod';

  export const EvaluationCategory = z.enum([
    'recherche_simple',
    'renvoi_obligatoire',
    'sensible_a_la_date',
    'hors_perimetre',
    'fausse_premisse',
  ]);
  export type EvaluationCategory = z.infer<typeof EvaluationCategory>;

  export const EvaluationQuestion = z
    .object({
      id: z.string(),
      question: z.string(),
      category: EvaluationCategory,
      articlesAttendus: z.array(z.string()).optional(),
      articlesExclus: z.array(z.string()).optional(),
      dateReference: z.string().optional(), // 'YYYY-MM-DD' ; absent = aujourd'hui
      notes: z.string().optional(),
    })
    .refine(
      (q) => {
        const hasGroundTruth = Boolean(q.articlesAttendus?.length) || Boolean(q.articlesExclus?.length);
        if (q.category === 'hors_perimetre' || q.category === 'fausse_premisse') return !hasGroundTruth;
        if (q.category === 'recherche_simple' || q.category === 'renvoi_obligatoire') {
          return Boolean(q.articlesAttendus?.length);
        }
        return hasGroundTruth; // sensible_a_la_date : au moins l'un des deux
      },
      { message: "vérité terrain incohérente avec la catégorie (voir Data / contracts)." },
    );
  export type EvaluationQuestion = z.infer<typeof EvaluationQuestion>;
  ```

  `packages/eval/src/data-paths.ts` (mirrors `packages/ingest/src/cold/data-paths.ts`'s exact pattern):

  ```ts
  import path from 'node:path';
  import { fileURLToPath } from 'node:url';

  const repoRoot = path.join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
  export const questionsPath = path.join(repoRoot, 'eval', 'questions.json');
  ```

  `packages/eval/src/questions.ts`:

  ```ts
  import { readFileSync } from 'node:fs';
  import { EvaluationQuestion } from './schema.js';
  import { questionsPath } from './data-paths.js';

  export function loadEvaluationQuestions(): EvaluationQuestion[] {
    const raw: unknown = JSON.parse(readFileSync(questionsPath, 'utf-8'));
    return z.array(EvaluationQuestion).parse(raw);
  }
  ```

  (import `z` from `'zod'` alongside `EvaluationQuestion`.)

  `packages/eval/src/questions.test.ts` - covers: `loadEvaluationQuestions()`
  returns exactly 15 entries, every `id` is unique, every entry matches the
  schema, and every category from the build-plan's 5 is represented at least
  once. Also exercises `EvaluationQuestion`'s `.refine()` directly (not via
  the file): a `recherche_simple`-category object with no `articlesAttendus`
  is rejected, and a `hors_perimetre`-category object carrying one is
  rejected - proving a malformed fixture fails loudly instead of loading
  silently.

  `packages/eval/package.json` (new, mirrors `packages/retrieval/package.json`):

  ```json
  {
    "name": "@legirag/eval",
    "version": "0.0.0",
    "private": true,
    "type": "module",
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "scripts": {
      "build": "tsc -b",
      "typecheck": "tsc -b",
      "harness": "tsx --env-file=../../.env src/run-harness.ts"
    },
    "dependencies": {
      "@legirag/shared": "workspace:*",
      "@legirag/retrieval": "workspace:*",
      "zod": "^3.23.8"
    },
    "devDependencies": {
      "tsx": "^4.19.0",
      "typescript": "^5.6.0"
    }
  }
  ```

  `packages/eval/tsconfig.json` (mirrors `packages/retrieval/tsconfig.json`,
  `references` pointing at `../shared` and `../retrieval`).

  Add `{ "path": "packages/eval" }` to the root `tsconfig.json`'s
  `references` array. Add an `eval` bullet to `coding-standards.md`'s
  monorepo package list (`- eval - the evaluation question set and scoring
  harness, consumed later by item 6/9`).

  *Done when:* `pnpm --filter @legirag/eval typecheck` passes;
  `pnpm test` runs `questions.test.ts` green.

- [x] **Step 2 - Scoring logic, unit tested** -

  `packages/eval/src/scoring.ts`:

  ```ts
  import type { Chunk } from '@legirag/shared';
  import type { EvaluationCategory, EvaluationQuestion } from './schema.js';

  export const HARNESS_TOP_K = 10; // indépendant du PRE_FUSION_LIMIT interne de SupabaseRetriever

  export interface QuestionScore {
    questionId: string;
    category: EvaluationCategory;
    hasGroundTruth: boolean; // false seulement pour hors_perimetre / fausse_premisse
    rank?: number; // position 1-indexée du premier chunk attendu, absent si non trouvé
    hitAt1?: boolean;
    hitAt5?: boolean;
    hitAt10?: boolean;
    reciprocalRank?: number;
    exclusionRespected?: boolean; // présent seulement si articlesExclus était renseigné
  }

  export interface CategoryMetrics {
    category: EvaluationCategory;
    questionCount: number;
    recallAt1: number;
    recallAt5: number;
    recallAt10: number;
    mrr: number;
  }

  export interface HarnessReport {
    topK: number;
    perCategory: CategoryMetrics[];
    overall: Omit<CategoryMetrics, 'category'>;
    exclusionChecks: { questionId: string; passed: boolean }[];
    unscored: { questionId: string; category: EvaluationCategory }[];
  }

  export function scoreQuestion(question: EvaluationQuestion, chunks: Chunk[]): QuestionScore { /* ... */ }
  export function aggregateResults(scores: QuestionScore[]): HarnessReport { /* ... */ }
  ```

  `scoreQuestion` logic: if `articlesAttendus` is set, scan `chunks` (already
  ranked, length `<= HARNESS_TOP_K`) for the first entry whose
  `articleIdentifier` is in `articlesAttendus` - no article-level dedup, this
  scans the exact list a user would see. `rank` = 1-indexed position of that
  hit (absent if none found); `hitAt1/5/10` = whether that rank is `<= 1/5/10`
  (`false` if not found); `reciprocalRank` = `1 / rank` or `0`. If
  `articlesExclus` is set, `exclusionRespected` = `true` iff no chunk's
  `articleIdentifier` is in `articlesExclus`. `hasGroundTruth` = either field
  was set and non-empty.

  `aggregateResults` groups scores with `hitAt1/5/10` defined by `category`;
  `recallAtK` = mean of `hitAtK` in that group, `mrr` = mean of
  `reciprocalRank`; `overall` = the same computed across every scored
  question regardless of category. `exclusionChecks` = every score with
  `exclusionRespected` defined. `unscored` = every score with
  `hasGroundTruth === false`.

  `packages/eval/src/scoring.test.ts` - covers: hit at rank 1 / rank 5 / rank
  10 / not found (with 1, 2, and 3+ `articlesAttendus`, confirming
  first-hit-among-any semantics), an unscored question (`hasGroundTruth:
  false`, no rank fields), an exclusion respected and an exclusion violated,
  and `aggregateResults` over a small mixed fixture producing hand-checked
  `recallAtK`/`mrr` numbers per category and overall.

  *Done when:* `pnpm test` runs `scoring.test.ts` green;
  `pnpm --filter @legirag/eval typecheck` passes.

- [x] **Step 3 - Harness script, run against the live corpus** -

  `packages/eval/src/run-harness.ts` (mirrors
  `packages/retrieval/src/validate-search.ts`'s shape and console-output
  style):

  ```ts
  import { SupabaseRetriever } from '@legirag/retrieval';
  import { loadEvaluationQuestions } from './questions.js';
  import { scoreQuestion, aggregateResults, HARNESS_TOP_K } from './scoring.js';

  async function main(): Promise<void> {
    const questions = loadEvaluationQuestions();
    const retriever = new SupabaseRetriever();

    const scores = [];
    for (const q of questions) {
      const chunks = await retriever.search({
        texte: q.question,
        dateReference: q.dateReference ? new Date(q.dateReference) : new Date(),
        topK: HARNESS_TOP_K,
      });
      const score = scoreQuestion(q, chunks);
      console.log(`[${q.id}] ${q.category} - ${q.question}`);
      console.log(`  ${JSON.stringify(score)}`);
      scores.push(score);
    }

    const report = aggregateResults(scores);
    console.log('\n--- Rapport agrégé ---');
    console.table(report.perCategory);
    console.log('Overall:', report.overall);
    console.log('Exclusion checks:', report.exclusionChecks);
    console.log('Non notées (hors_perimetre / fausse_premisse) :', report.unscored);
  }

  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
  ```

  Export `loadEvaluationQuestions`, `scoreQuestion`, `aggregateResults`,
  `HARNESS_TOP_K`, and the schema/types from `packages/eval/src/index.ts`, for
  item 6/9 to import later.

  *Done when:* run live via `pnpm --filter @legirag/eval harness` against the
  real Supabase project: all 5 `recherche_simple` and both
  `renvoi_obligatoire` questions score `hitAt10: true`; `q-008` scores
  `hitAt10: true` and `q-009` scores `exclusionRespected: true`; the 6
  `hors_perimetre`/`fausse_premisse` questions appear under `unscored`. Any
  fixture that doesn't hit gets its `articleIdentifier` re-checked against
  the live DB (a wrong ID in the JSON, not a harness bug) before this step is
  considered done - the point of this step is to prove both the harness and
  the fixtures are correct together.

## Files / areas

- `eval/questions.json` (new)
- `packages/eval/package.json` (new)
- `packages/eval/tsconfig.json` (new)
- `packages/eval/src/schema.ts` (new)
- `packages/eval/src/data-paths.ts` (new)
- `packages/eval/src/questions.ts` (new)
- `packages/eval/src/questions.test.ts` (new)
- `packages/eval/src/scoring.ts` (new)
- `packages/eval/src/scoring.test.ts` (new)
- `packages/eval/src/run-harness.ts` (new)
- `packages/eval/src/index.ts` (new)
- `tsconfig.json` (edit - add `packages/eval` reference)
- `blueprint/context/coding-standards.md` (edit - add `eval` to monorepo list)

## Data / contracts

- New `EvaluationQuestion` Zod schema, defined in `packages/eval/src/schema.ts`
  - deliberately package-local, not promoted to `packages/shared`. Only
  `packages/eval` consumes it directly today; item 9 (agent quality
  evaluation) will likely need to *extend* this shape (expected
  `ReponseStructuree` fields, expected `confiance`, ...) in ways not yet
  known, so locking it into `shared` now risks locking the wrong contract.
  Item 6/9 import it from `@legirag/eval` when they need it.
- Locks (other packages importing `@legirag/eval` should treat these as
  stable): `EvaluationQuestion` fields, `HARNESS_TOP_K = 10` (independent of
  `SupabaseRetriever`'s internal `PRE_FUSION_LIMIT = 50`), and the
  `QuestionScore` / `CategoryMetrics` / `HarnessReport` shapes.
- No changes to `Retriever`, `Chunk`, `RequeteRecherche`, or
  `SupabaseRetriever` (items 1 / 4d) - this feature only calls
  `SupabaseRetriever.search()` as-is.

## Testing

- `scoring.ts` (rank-finding, recall@k, MRR, exclusion check, aggregation) is
  pure logic with real edge cases (no hit, multiple `articlesAttendus`,
  exclusion respected/violated, unscored question) - Vitest coverage in
  `packages/eval/src/scoring.test.ts`, required by the testing gate.
- `questions.ts`'s `loadEvaluationQuestions()` (JSON parse + Zod validation)
  is also pure, parseable logic with a real failure mode (a malformed
  dataset should throw, not silently pass) - Vitest coverage in
  `packages/eval/src/questions.test.ts`.
- `run-harness.ts` itself is DB + Bedrock integration code (a real
  `SupabaseRetriever.search()` round trip per question), matching every
  other DB-touching script in this project (4b, 4c, 4d) - verified by
  actually running it against the live Supabase project (step 3's
  done-when), not a Vitest test.
- `pnpm typecheck` / `pnpm lint` / `pnpm test` stay green throughout.

## Notes for the AI

- Every `articleIdentifier` in `eval/questions.json` above was verified
  directly against the live Supabase project while writing this spec
  (`articles` and `renvois` tables) - use them as written. If more fixtures
  are added later (this feature or item 6/9), verify the same way (query the
  live DB) rather than guessing article numbers or dates from memory.
- `eval/` is a new top-level, git-tracked directory, sibling to `packages/`,
  outside the pnpm workspace (`pnpm-workspace.yaml` only globs `packages/*`).
  `eslint.config.mjs` already ignores `eval/**` - this was set up when the
  repo was first scaffolded, anticipating exactly this: hand-authored,
  human-editable data, not lint-checked source. Don't move `questions.json`
  into `packages/eval/src`, and don't add `eval/` to `.gitignore` - unlike
  `packages/ingest/.data/`, it's meant to be tracked and eventually
  published (`project-overview.md`'s Monetization section: "the evaluation
  question set... published openly").
- The "first hit among any of `articlesAttendus`" scoring rule for
  `renvoi_obligatoire` questions is intentional, not a shortcut: a single
  hybrid search call has no cross-reference-following capability (that's the
  agent's bounded loop, item 8), so this harness measures whether the
  directly relevant article surfaced in one shot, not full graph coverage.
- Reuse `packages/ingest/src/cold/data-paths.ts`'s exact path-resolution
  pattern (resolved from the file itself via `import.meta.url`, not the
  caller's cwd) for `packages/eval/src/data-paths.ts` - already proven
  correct regardless of which script imports it.
- `packages/retrieval/src/validate-search.ts` is the direct precedent for
  `run-harness.ts`'s shape (`tsx --env-file=../../.env`, plain console
  output, human-reviewable) - follow it rather than inventing a new
  CLI/reporting convention.
- `SupabaseRetriever.search()` embeds the query text on every call
  (`embedTexts`, Cohere) - running the full 15-question harness costs 15
  embedding calls plus 15 DB round trips. Fine for this size; worth knowing
  if the set grows much larger later.

## Live harness results (first run, 2026-08-16)

Run against the real Supabase project with the untuned 4d `SupabaseRetriever`:

| Category | questionCount | recall@1 | recall@5 | recall@10 | MRR |
|---|---|---|---|---|---|
| recherche_simple | 5 | 0 | 0.6 | 0.8 | 0.235 |
| renvoi_obligatoire | 2 | 1.0 | 1.0 | 1.0 | 1.0 |
| sensible_a_la_date | 1 (scored) | 1.0 | 1.0 | 1.0 | 1.0 |
| **Overall** | 8 | 0.375 | 0.75 | 0.875 | 0.522 |

Plus: `q-009`'s exclusion check passed (article correctly absent for a
pre-`date_debut` reference date), and the 6 `hors_perimetre`/
`fausse_premisse` questions correctly listed as unscored.

`q-002` ("délai de rétractation pour un achat en ligne") did not hit within
top 10, despite its target article (`LEGIARTI000032226842`, L221-18) being
confirmed present in `chunks` with a real embedding. Verified this is a
genuine current retrieval-quality gap, not a bad fixture or a harness bug -
the fixture is left as-is, documenting a known baseline weakness for item 6
to improve on and re-measure against.

## Findings

### 05/F-01 [P3] closed - `aggregateResults` relies on an unchecked cast to reconcile a union return type

**File:** packages/eval/src/scoring.ts:75-89
**Found:** 2026-08-16 by /audit (scope: current)
**Why it matters:** `metricsFor()` is typed to return
`CategoryMetrics | Omit<CategoryMetrics, 'category'>` regardless of which
branch its ternary takes, so TypeScript can't narrow the result at the call
site. `aggregateResults()` works around this with
`metricsFor(category, ...) as CategoryMetrics` (line 89) when building
`perCategory`. The cast is currently safe (`category` is always defined in
that call, so the ternary always returns the full shape), but it removes the
type checker's ability to catch a future regression - e.g. if `metricsFor`'s
ternary were ever inverted or a new caller passed a value that hit the
`Omit<...>` branch while still being assigned to a `CategoryMetrics[]`, the
cast would silently paper over the mismatch instead of erroring. Confirmed by
reading the code and `pnpm --filter @legirag/eval typecheck` (passes only
because of the cast); no runtime misbehavior observed, and the existing
`scoring.test.ts` aggregate tests do exercise the current correct behavior.
**Suggested fix:** Split `metricsFor` into two functions with distinct
return types (e.g. `categoryMetrics(category, scores): CategoryMetrics` and
`overallMetrics(scores): Omit<CategoryMetrics, 'category'>`), each just
adding or omitting the `category` field, so `perCategory`'s `.map()` and
`overall`'s assignment both typecheck without any cast.
**Resolution:** Fixed 2026-08-16 - split `metricsFor` into `baseMetrics()`
(returns `Omit<CategoryMetrics, 'category'>`, used directly for `overall`)
and `categoryMetrics(category, scores)` (returns `CategoryMetrics` by
spreading `category` onto `baseMetrics()`'s result). `perCategory`'s
`.map()` now calls `categoryMetrics` directly with no cast anywhere in the
file. `pnpm --filter @legirag/eval typecheck`, `pnpm test` (118/118),
`pnpm lint` all green. Closed 2026-08-16 - re-read the repaired
`scoring.ts` fresh: `metricsFor` no longer exists, `baseMetrics`/
`categoryMetrics` have distinct concrete return types, no `as` cast
anywhere in the file, no stale references to the old function name
anywhere in the package. No new defect introduced by the repair.

### 05/F-02 [P3] closed - Redundant schema-validation test can't independently fail

**File:** packages/eval/src/questions.test.ts:17-21
**Found:** 2026-08-16 by /audit (scope: current)
**Why it matters:** `loadEvaluationQuestions()` (called once at the top of
the `describe` block, during Vitest's collection phase) already runs
`z.array(EvaluationQuestion).parse(raw)` internally and throws if any entry
is invalid - a throw there fails the whole file's collection before any
individual `it` runs. The `it('valide chaque entrée contre le schéma...')`
test then re-`safeParse`s each already-loaded (and therefore already
zod-valid) question and asserts success - by the time this test body
executes, that assertion cannot be false. It reads as independent
per-entry schema coverage but is actually inert once the suite is running;
the real validation the test's name promises already happened as a side
effect of the `describe`-level `loadEvaluationQuestions()` call. Confirmed
by reading `questions.ts`'s `loadEvaluationQuestions` (throws on any Zod
failure) and `questions.test.ts`'s structure (`questions` computed
top-level, this test reads from it downstream). Not a production defect -
the malformed-data guarantee this test wants to demonstrate does hold, just
not for the reason the test's own assertion suggests.
**Suggested fix:** Either delete this `it` as redundant with the
`describe`-level load already implicitly proving it, or change it to
exercise real coverage - e.g. call
`EvaluationQuestion.safeParse(rawJsonEntry)` against the unparsed JSON read
directly from disk (bypassing `loadEvaluationQuestions()`'s own throw), or
merge its intent into the existing schema-refine tests already in this file.
**Resolution:** Fixed 2026-08-16 - the test now re-reads and
`JSON.parse`s `eval/questions.json` directly (via `questionsPath` from
`data-paths.ts`), independently of `loadEvaluationQuestions()`, and
`safeParse`s each raw entry - so it now genuinely exercises schema
validation against the tracked file rather than re-checking an
already-guaranteed-valid in-memory array. `pnpm test` (118/118) green,
including this test. Closed 2026-08-16 - re-read the repaired
`questions.test.ts` fresh: the test independently `readFileSync`s and
`JSON.parse`s `eval/questions.json` via `questionsPath`, bypassing
`loadEvaluationQuestions()` entirely, then `safeParse`s each raw entry -
this assertion can now genuinely fail if the tracked file drifts from the
schema. No new defect introduced by the repair.
