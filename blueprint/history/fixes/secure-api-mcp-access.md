# Current Feature

## Title

Sécuriser l'API et le MCP : token d'accès partagé + rate-limit persistant

## Type

Fix

## The problem

Les deux Lambda Function URLs (`legirag-api`, `legirag-mcp`) sont publiques sans
aucune authentification (`authorization_type = "NONE"`, `infra/lambda.tf`) et,
sur le MCP, sans aucune protection de débit ou de coût. Trois lacunes précises :

1. **Aucun token requis** sur l'API ni le MCP - n'importe qui ayant l'URL peut
   appeler des outils qui coûtent réellement (recherche hybride, appels
   Bedrock via `router_question`/`calculer`).
2. **Le MCP n'a ni rate-limit ni cost-guard**, contrairement à l'API
   (`ThrottlerGuard` 20 req/min/IP + `DailyCostCapGuard`,
   `packages/api/src/app.module.ts`).
3. **Le rate-limit et le cost-cap existants sont en mémoire**
   (`ThrottlerModule`, `DailyTokenBudget` dans `cost-guard.service.ts`) : sur
   Lambda, plusieurs instances tournent en parallèle avec une mémoire isolée
   qui repart à zéro à chaque cold start - le plafond quotidien de tokens
   déjà en place aujourd'hui ne protège donc pas fiablement contre un abus
   soutenu, et un nouveau rate-limit par IP en mémoire aurait le même défaut.

Décision produit actée avec l'utilisateur (2026-08-19) : le MCP n'a plus
vocation à rester un serveur public pour agents tiers (déviation assumée de
l'intention initiale de l'item 7 du build-plan) - il passe derrière le même
token que l'API, personne d'autre que le front legirag ne doit l'utiliser
pour l'instant.

## The fix

- Un token secret partagé (`LEGIRAG_ACCESS_TOKEN`), vérifié sur toutes les
  requêtes API et MCP, stocké dans le secret AWS existant
  (`legirag/app-env`, `infra/secrets.tf`) côté back, et dans les env vars
  serveur du projet Vercel côté front (jamais `NEXT_PUBLIC_*` - un secret
  visible dans le bundle client n'en est plus un).
- Le navigateur n'appelle plus jamais l'API directement : trois routes
  serveur Next.js (`/api/question`, `/api/article/[id]`, `/api/trace/[id]`)
  font proxy vers l'API en ajoutant le token côté serveur. `api-client.ts`
  (`packages/web/src/lib/api-client.ts`) appelle ces chemins relatifs au lieu
  de `NEXT_PUBLIC_API_URL`, qui disparaît.
- Un rate-limit persistant (Supabase Postgres, comme le reste du schéma) à
  1 req/min/IP et 10 req/jour/IP, partagé par un module dans
  `packages/retrieval` que l'API et le MCP appellent tous les deux -
  remplace le `ThrottlerModule` en mémoire de l'API (retiré) ; le MCP n'en
  avait aucun.
- Ne doit pas casser : `/health` reste accessible sans token ni rate-limit
  (sondes de disponibilité) ; le flux SSE de `/question` doit rester
  streamé de bout en bout à travers le proxy, pas bufferisé.
- Hors scope de ce fix : générer/pousser la vraie valeur du token en
  production (`infra/push-secrets.sh`) et la configurer sur Vercel restent
  des actions manuelles explicites, même traitement que le plafond de
  facturation AWS déjà signalé ailleurs dans ce projet - je fournirai les
  noms de variables exacts, jamais une valeur inventée sans confirmation.

## Build steps

### Étape 1 - rate-limit persistant partagé (retrieval + migration)

Migration Supabase créant `rate_limit_requests(ip inet, created_at
timestamptz)` (RLS activée, aucune policy - écritures via `DATABASE_URL`
uniquement, même posture que `traces`). Nouveau module
`packages/retrieval/src/rate-limit.ts` exportant une fonction qui, dans une
seule transaction protégée par un verrou avisory global
(`pg_advisory_xact_lock`, élimine la race condition compte-puis-insère dès la
conception plutôt que de la découvrir à l'étape 6 pentest - sérialise aussi
bien les compteurs par IP que le compteur global), vérifie trois seuils :
1 req/min/IP, 10 req/jour/IP, et **50 req/jour au total tous appelants
confondus**, puis insère une ligne seulement si les trois sont respectés.
Les trois seuils sont variabilisés (`RATE_LIMIT_PER_MINUTE_PER_IP`,
`RATE_LIMIT_PER_DAY_PER_IP`, `RATE_LIMIT_PER_DAY_GLOBAL`), avec repli sûr si
absent - même traitement que `MAX_DAILY_TOKENS`
(`cost-guard.service.ts`), donc pas documentées dans `.env.example`/
`secrets.tf` (précédent déjà établi pour ce genre de seuil). Script
`pnpm --filter @legirag/retrieval reset-rate-limits` pour réinitialiser
manuellement (vide la table - les deux compteurs en dérivent, donc un seul
mécanisme de reset couvre les deux), utile avant une démo si le plafond du
jour est déjà atteint. Pas de test unitaire ici, même précédent que
`traces.ts`/`fetch-article-by-identifier.ts` : une fonction qui ouvre une
vraie connexion et une transaction est une surface d'intégration dans ce
projet, vérifiée en la faisant tourner (étape 6), pas mockée.

**Done when** : `pnpm --filter @legirag/retrieval typecheck` est vert ; un
essai manuel local contre Postgres confirme le comportement (voir étape 6).

### Étape 2 - guard token + guard rate-limit sur l'API

`packages/shared` : fonction pure `verifyAccessToken(header: string |
undefined): boolean` comparant à `requireEnv('LEGIRAG_ACCESS_TOKEN')`, testée
unitairement. Dans `packages/api` : deux nouveaux guards globaux
(`AccessTokenGuard`, `PersistentRateLimitGuard` appelant l'étape 1),
appliqués via `APP_GUARD`, avec un décorateur `@Public()` (reflector) pour
exempter `HealthController`. Retire `ThrottlerModule`/`ThrottlerGuard` et la
dépendance `@nestjs/throttler`.

**Done when** : une requête sans en-tête `Authorization` sur `/question`
répond 401 ; `/health` répond toujours 200 sans en-tête ; les tests et
`pnpm --filter @legirag/api typecheck` passent.

### Étape 3 - mêmes garde-fous sur le MCP

Dans `packages/mcp/src/server.ts`, `handleMcpRequest` vérifie le token
(réutilise `verifyAccessToken`) et le rate-limit (réutilise le module de
l'étape 1) avant de traiter la requête JSON-RPC ; 401/429 sinon, mêmes codes
que l'API.

**Done when** : une requête MCP sans token échoue explicitement ; une requête
avec le bon token et sous les seuils passe (vérifié en local avec
`MCP_PORT`).

### Étape 4 - proxy Next.js et nettoyage du front

Trois route handlers Next.js (`packages/web/src/app/api/question/route.ts`,
`.../api/article/[articleIdentifier]/route.ts`,
`.../api/trace/[traceId]/route.ts`) lisant `LEGIRAG_API_URL` et
`LEGIRAG_ACCESS_TOKEN` (env vars serveur, jamais `NEXT_PUBLIC_*`) et
transmettant la requête à l'API avec l'en-tête `Authorization`. Le flux SSE de
`/question` est repassé tel quel (pas de buffering). `api-client.ts` appelle
ces chemins relatifs ; `NEXT_PUBLIC_API_URL` est retiré de `.env.example`
(remplacé par les deux nouvelles variables, documentées comme "serveur
Vercel uniquement").

**Done when** : `pnpm --filter @legirag/web build` passe ; test manuel local
(`web` + `api` lancés, `LEGIRAG_API_URL`/`LEGIRAG_ACCESS_TOKEN` positionnées)
confirme qu'une question posée depuis l'UI obtient toujours une réponse
streamée.

### Étape 5 - secret et documentation

Ajoute `LEGIRAG_ACCESS_TOKEN` au template `infra/secrets.tf`
(`REPLACE_ME`, même précédent que les autres clés) et à `.env.example` (côté
back). Documente dans le packet de fin de fix les actions manuelles
restantes : générer une vraie valeur, la pousser via
`infra/push-secrets.sh`, la configurer sur Vercel.

**Done when** : `terraform validate` passe dans `infra/` ; rien de secret
n'est écrit dans un fichier suivi par git.

### Étape 6 - pentest des garde-fous eux-mêmes

Les étapes 1-5 construisent les protections ; cette étape essaie activement de
les casser, du point de vue d'un attaquant, avant de considérer le fix
terminé. Lance `/security-review` (ou équivalent) sur le diff complet du fix
en plus des essais ciblés ci-dessous, tous exécutés en local contre `api` et
`mcp` :

- **Contournement du token** : en-tête absent, vide, mauvais schéma
  (`Bearer` manquant/mal placé), casse différente, token tronqué/préfixe
  correct. Vérifie que la comparaison est en temps constant (pas de `===`
  sur une chaîne secrète - timing attack) et que 401 ne renvoie jamais le
  token attendu ni sa longueur.
- **Contournement du rate-limit** : d'où vient l'IP utilisée pour compter
  (`req.socket.remoteAddress` vs en-tête `x-forwarded-for`) - sur une
  Lambda Function URL, confirmer laquelle porte la vraie IP cliente et
  qu'un en-tête `x-forwarded-for` falsifié par l'appelant ne permet pas de
  se faire passer pour une autre IP (ou, pire, de faire retomber tout le
  monde sur la même IP et se faire bannir mutuellement). Vérifie aussi la
  race condition compte-puis-insère : une rafale de requêtes concurrentes
  peut-elle dépasser la limite avant que les insertions ne soient visibles ?
- **Fuite d'information** : les réponses 401/429 et les logs serveur ne
  doivent jamais contenir le token, la chaîne de connexion DB, ou une trace
  utile à un attaquant (cf. `AllExceptionsFilter` déjà en place côté API,
  à vérifier côté MCP qui n'en a pas l'équivalent aujourd'hui).
- **Le proxy Next.js ne doit pas devenir un nouveau trou** : confirmer
  qu'aucune route API Next.js ne transmet un en-tête ou paramètre contrôlé
  par le client qui écraserait le token serveur, et que `LEGIRAG_API_URL`/
  `LEGIRAG_ACCESS_TOKEN` ne sont jamais renvoyés dans une réponse ni un
  message d'erreur au navigateur.
- **`/health` reste le seul chemin non protégé** : vérifier qu'aucune autre
  route n'a été oubliée dans l'exemption `@Public()`.

Toute faille confirmée ici est corrigée avant de passer à `/complete` - ce
n'est pas une étape optionnelle après coup.

**Done when** : chaque point ci-dessus a un verdict explicite (testé,
confirmé sûr ou corrigé) consigné dans le compte-rendu de fin d'étape, sans
faille ouverte restante.

## Verify

- `pnpm typecheck` et `pnpm test` verts sur tout le monorepo.
- Local : `pnpm --filter @legirag/retrieval reset-rate-limits` vide bien la
  table, et le plafond global (50/jour tous appelants confondus) bloque en
  plus des plafonds par IP.
- Local : lancer `api` et `mcp` avec un `LEGIRAG_ACCESS_TOKEN` de test :
  confirmer 401 sans token, 200/succès avec, et le blocage après 1 req/min
  ou 10 req/jour depuis la même IP.
- Local : lancer `web` pointant vers cette `api` locale via les nouvelles
  variables serveur ; poser une question dans l'UI, vérifier le flux SSE et
  l'expander d'article.
- Étape 6 (pentest) complétée sans faille ouverte avant `/complete`.

## Outcome

Toutes les étapes construites et vérifiées, y compris deux ajustements
découverts en cours de route :

- **Étape 6 a révélé** que le trafic passant par le proxy Next.js ferait
  voir à l'API l'IP du serveur Vercel plutôt que celle du vrai visiteur
  (rate-limit par IP de facto partagé entre visiteurs simultanés une fois
  déployé) - corrigé par un en-tête de confiance (`x-legirag-client-ip`,
  `TRUSTED_CLIENT_IP_HEADER`) que le proxy pose depuis `x-forwarded-for`
  (fiable côté Vercel), et que l'API/le MCP ne consultent qu'après que le
  token ait déjà validé l'appelant.
- **Deux passes `/security-review`** (avant et après le pentest manuel) et
  une passe `/audit` de suivi (5 findings P2/P3 trouvés et réparés, voir
  Findings ci-dessous) n'ont laissé aucune trouvaille ouverte.
- Le secret AWS (`legirag/app-env`) a été mis à jour en direct avec
  `LEGIRAG_ACCESS_TOKEN` pendant la session - la protection ne devient
  active qu'après un déploiement (`pnpm deploy:images`), pas avant.
- `packages/web/.env.local` et `packages/web/.env.example` (oubliés dans le
  premier passage de l'étape 4) ont été mis à jour vers le nouveau schéma
  `LEGIRAG_API_URL`/`LEGIRAG_ACCESS_TOKEN` en cours de route.

## Findings

### secure-api-mcp-access/F-12 [P2] closed - "optional numeric env var with fallback" pattern duplicated instead of shared

**File:** packages/retrieval/src/rate-limit.ts:9-14
**Found:** 2026-08-19 by /audit (scope: current)
**Why it matters:** `readLimit()` in `rate-limit.ts` is structurally identical to `readMaxDailyTokens()` in `packages/api/src/question/cost-guard.service.ts` (same four lines: read `process.env[name]`, fall back if undefined, `Number()` + `Number.isFinite && > 0` guard, fall back if invalid). This fix introduced the second copy of a pattern that already existed once - `requireEnv` in `packages/shared` already covers the "required env var" half of this family, but there is no shared equivalent for "optional numeric env var with a safe fallback," so both call sites reimplement it. A third caller (there will likely be one - this is exactly the kind of config knob this project adds often) would make it three.
**Suggested fix:** Extract a small `readPositiveNumberEnv(name: string, fallback: number): number` (or similar) into `packages/shared` next to `requireEnv`, and have both `cost-guard.service.ts` and `rate-limit.ts` call it.
**Resolution:** Extracted `readPositiveNumberEnv` to `packages/shared/src/positive-number-env.ts` (with its own test), both call sites now use it. `pnpm typecheck`/`test` green.

### secure-api-mcp-access/F-13 [P2] closed - new NestJS guards have no unit test despite a direct in-package precedent

**File:** packages/api/src/common/access-token.guard.ts, packages/api/src/common/persistent-rate-limit.guard.ts
**Found:** 2026-08-19 by /audit (scope: current)
**Why it matters:** `packages/api/src/question/daily-cost-cap.guard.test.ts` already shows the cheap pattern for testing a guard in this exact package (a fake injected service, assert `canActivate()` returns `true` or throws the right `HttpException`/status). The two new guards have real branching logic worth the same treatment: `AccessTokenGuard` must skip on `@Public()`, otherwise reject when `verifyAccessToken` returns false; `PersistentRateLimitGuard` must skip on `@Public()`, otherwise reject with 429 when `checkRateLimit` resolves `{ allowed: false }`. Both are currently only covered indirectly, by the manual curl-based testing done during `/implement` (not captured in the automated suite).
**Suggested fix:** Add `access-token.guard.test.ts` and `persistent-rate-limit.guard.test.ts` next to the guards, using a fake `Reflector` (or a real one with `SetMetadata` applied to a stub handler) and a fake/mocked `verifyAccessToken`/`checkRateLimit`, mirroring `daily-cost-cap.guard.test.ts`'s shape.
**Resolution:** Added both test files (fake `ExecutionContext`/`Reflector`, `vi.mock` on `@legirag/shared`/`@legirag/retrieval`), covering @Public() skip, pass, and reject paths for each guard. Also added `is-public-route.test.ts` for the helper extracted in F-16.

### secure-api-mcp-access/F-14 [P2] closed - `realClientIp` (api-proxy.ts) is the only function in packages/web/src/lib without a sibling test

**File:** packages/web/src/lib/api-proxy.ts:6-11
**Found:** 2026-08-19 by /audit (scope: current)
**Why it matters:** Every other file in `packages/web/src/lib/` has a `*.test.ts` sibling (`activity`, `errors`, `format`, `sse`, `trace-step-summary`, `trace-summary`). `realClientIp` is a small pure parser (comma-separated `x-forwarded-for` -> first trimmed segment, or `undefined`) - exactly the "parsers... with real edge cases (empty, missing, malformed)" `coding-standards.md`'s Testing section calls in-scope, and it feeds directly into the rate-limit's per-visitor IP (F-14 is functionally load-bearing for the fix this session just built, not incidental plumbing).
**Suggested fix:** Add `packages/web/src/lib/api-proxy.test.ts` covering `realClientIp`: no header, single IP, comma-separated list (first segment wins), extra whitespace around segments, empty string after trimming.
**Resolution:** Exported `realClientIp` and added `api-proxy.test.ts` with exactly those 5 cases.

### secure-api-mcp-access/F-15 [P3] closed - `fetchTrace` (api-client.ts) and `fetchTraceServer` (api-proxy.ts) duplicate the same 404/error/parse contract

**File:** packages/web/src/lib/api-client.ts:71-81, packages/web/src/lib/api-proxy.ts:53-62
**Found:** 2026-08-19 by /audit (scope: current)
**Why it matters:** Both functions exist because one transport (relative fetch) only works from the browser and the other (direct `proxyToApi` call) only works from a Server Component - a real, justified split (see the comment on `fetchTraceServer`). But the four lines after the request (404 -> `undefined`, `!ok` -> throw with the same French message, JSON parse + cast to `ExecutionTrace`) are copied verbatim between the two files. A future change to that contract (e.g., validating with the `ExecutionTrace` Zod schema instead of a bare cast) would need to remember to touch both.
**Suggested fix:** Factor a small shared `parseTraceResponse(response: Response): Promise<ExecutionTrace | undefined>` (in `api-proxy.ts` or a new shared lib file) that both `fetchTrace` and `fetchTraceServer` call after getting their `Response` however they each obtain it.
**Resolution:** Factored into `api-client.ts` (not `api-proxy.ts` - that file imports `next/headers`, server-only, which would have broken client components importing `fetchTrace` transitively). Both `fetchTrace` and `fetchTraceServer` now call it.

### secure-api-mcp-access/F-16 [P3] closed - `@Public()` reflector-skip check duplicated across the two new API guards

**File:** packages/api/src/common/access-token.guard.ts:15-19, packages/api/src/common/persistent-rate-limit.guard.ts:16-20
**Found:** 2026-08-19 by /audit (scope: current)
**Why it matters:** Both guards open with the identical four-line block (`this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])`, then `if (isPublic === true) return true;`). Idiomatic NestJS boilerplate at two call sites is a minor, low-risk duplication, but a third global guard (plausible - this project adds guards in pairs, see `DailyCostCapGuard` alongside these two) would make it worth a shared `isPublicRoute(context, reflector)` helper in `packages/api/src/common/`.
**Suggested fix:** Low priority; extract only if/when a third guard needs the same check. Noted so it doesn't get silently re-copied a third time without anyone noticing the pattern.
**Resolution:** Extracted to `packages/api/src/common/is-public-route.ts` (with its own test) despite being P3/low-priority - cheap to do while both guards were already open for F-13's tests.
