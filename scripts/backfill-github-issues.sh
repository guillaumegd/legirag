#!/usr/bin/env bash
# One-time backfill: mirror blueprint/build-plan.md (items 1-21, with their
# lettered sub-items) and blueprint/history/fixes/ as GitHub issues, using
# native sub-issues for the build-plan hierarchy.
#
# Dry-run by default. Pass --apply to actually write to GitHub. Idempotent and
# repairable for body and label: an already-existing title is not recreated,
# but its body and label are resynced to the current build_body() output (so
# a fix to link formatting, for example, can be re-applied to already-created
# issues by re-running). Does NOT resync open/closed state on an existing
# issue - if one is manually reopened or closed by mistake, re-running this
# script will not correct that.
#
# See blueprint/context/current-feature.md (feature 22) for the verified
# mapping this data table is derived from, and blueprint/history/features/
# blueprint/history/fixes/ for the archives it links to.

set -euo pipefail

REPO="guillaumegd/legirag"
REPO_URL="https://github.com/$REPO"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_PLAN_FILE="$REPO_ROOT/blueprint/build-plan.md"
APPLY=false
if [[ "${1:-}" == "--apply" ]]; then
  APPLY=true
fi

# type | key | parent_key | title | closed(yes/no) | archive_file | commit | commit_subject
# archive_file/commit/commit_subject are "-" when not applicable.
DATA='
parent|1|-|1. Repo foundations and shared contracts|yes|01-repo-foundations-shared-contracts.md|6fac846|feat: close out repo foundations and shared contracts (feature 1)
parent|2|-|2. Legal corpus in the database|yes|-|-|-
sub|2a|2|2a. COLD corpus acquisition and filtering|yes|02a-cold-corpus-acquisition-and-filtering.md|17bdacc|feat: COLD corpus acquisition and filtering (feature 2a)
sub|2b|2|2b. Hierarchical path parser|yes|02b-hierarchical-path-parser.md|bc18af4|feat: hierarchical path parser (feature 2b)
sub|2c|2|2c. Subdivision extractor|yes|02c-subdivision-extractor.md|d7a14aa|feat: subdivision extractor (2c)
sub|2d|2|2d. Supabase schema and load|yes|02d-supabase-schema-and-load.md|fa6e69d|feat: Supabase schema and load (2d)
parent|3|-|3. Cross-reference graph|yes|-|-|-
sub|3a|3|3a. Renvoi extractor|yes|03a-renvoi-extractor.md|1ba13c5|feat: renvoi extractor (3a)
sub|3b|3|3b. Renvois table and load|yes|03b-renvois-table-and-load.md|1103d70|feat: renvois table and load (3b)
parent|4|-|4. Search index and access-control policies|yes|-|-|-
sub|4a|4|4a. Contextual chunking|yes|04a-contextual-chunking.md|3afb750|feat: contextual chunking (4a)
sub|4b|4|4b. Chunks table, embeddings, and indexes|yes|04b-chunks-table-embeddings-and-indexes.md|127e56c|feat: chunks table, embeddings, and indexes (4b)
sub|4c|4|4c. Access-control policies (RLS)|yes|04c-access-control-policies-rls.md|80baa5d|feat: access-control policies (RLS) (4c)
sub|4d|4|4d. Hybrid Retriever implementation|yes|04d-hybrid-retriever-implementation.md|746c641|feat: hybrid Retriever implementation (4d)
parent|5|-|5. Evaluation question set and harness|yes|05-evaluation-question-set-and-harness.md|6952462|feat: evaluation question set and harness (5)
parent|6|-|6. Retrieval quality improvements, each measured in isolation|no|-|-|-
sub|6a|6|6a. Naive baseline|yes|06a-naive-baseline.md|babac7b|feat: naive baseline retrieval measurement (6a)
sub|6b|6|6b. Contextual chunking, measured in isolation|yes|06b-contextual-chunking-isolated.md|0b10bf6|feat: contextual chunking measured in isolation (6b)
sub|6c|6|6c. Hybrid keyword + vector search, measured in isolation|yes|06c-hybrid-search-isolated.md|c8a5494|feat: hybrid search measured in isolation (6c)
sub|6d|6|6d. Re-ranking|no|-|-|-
parent|7|-|7. Tool server|yes|-|-|-
sub|7a|7|7a. MCP server skeleton and chercher_droit|yes|07a-mcp-server-chercher-droit.md|2c5b8cf|feat: MCP server skeleton and chercher_droit tool (7a)
sub|7b|7|7b. suivre_renvoi|yes|07b-suivre-renvoi.md|aed0313|feat: suivre_renvoi cross-reference-following tool (7b)
sub|7c|7|7c. router_question, calculer, demander_a_l_humain|yes|07c-router-question-calculer-demander-a-l-humain.md|7897a37|feat: router_question, calculer, demander_a_l_humain MCP tools (7c)
sub|7d|7|7d. Stub tools and third-party client verification|yes|07d-stub-tools-and-third-party-client-verification.md|aee0fa8|feat: stub tools and MCP Inspector third-party verification (7d)
parent|8|-|8. Reasoning agent|yes|-|-|-
sub|8a|8|8a. Agent foundations and fixed-chain baseline|yes|08a-agent-foundations-fixed-chain.md|d4d4cc5|feat: reasoning agent (item 8, 8a-8d)
sub|8b|8|8b. Routing node|yes|08b-routing-node.md|d4d4cc5|feat: reasoning agent (item 8, 8a-8d)
sub|8c|8|8c. Bounded cross-reference-following loop|yes|08c-cross-reference-loop.md|d4d4cc5|feat: reasoning agent (item 8, 8a-8d)
sub|8d|8|8d. Verification and abstention|yes|08d-verification-and-abstention.md|d4d4cc5|feat: reasoning agent (item 8, 8a-8d)
parent|9|-|9. Agent quality evaluation|yes|-|-|-
sub|9a|9|9a. Agent-level eval harness, routing accuracy, correct-abstention rate|yes|09a-agent-eval-harness.md|3137ac8|feat: agent quality evaluation (item 9, 9a-9c)
sub|9b|9|9b. Cross-reference coverage, loop-stop accuracy, turns and cost|yes|09b-cross-ref-coverage-cost.md|3137ac8|feat: agent quality evaluation (item 9, 9a-9c)
sub|9c|9|9c. Failure-injection recovery and stop-criteria tuning|yes|09c-failure-injection-tuning.md|3137ac8|feat: agent quality evaluation (item 9, 9a-9c)
parent|10|-|10. Historical versions, time travel, and abstention|no|-|-|-
sub|10a|10|10a. Historical-version acquisition, scoping, and load|no|-|-|-
sub|10b|10|10b. RLS time-travel predicate|no|-|-|-
sub|10c|10|10c. Time-travel lookup wiring|no|-|-|-
sub|10d|10|10d. Abstention threshold calibration|no|-|-|-
parent|11|-|11. Public API|yes|-|-|-
sub|11a|11|11a. NestJS foundations and streamed question endpoint|yes|11a-nestjs-question-endpoint.md|f9a996f|feat: NestJS foundations and streamed question endpoint (11a)
sub|11b|11|11b. Trace and article read endpoints|yes|11b-trace-article-endpoints.md|87f59f1|feat: trace and article read endpoints (11b)
sub|11c|11|11c. Cost caps, rate limiting, structured errors|yes|11c-cost-rate-error-guards.md|a0860a7|feat: cost caps, rate limiting, structured errors (11c)
sub|11d|11|11d. Containerization and end-to-end validation|yes|11d-containerize-api.md|48789f8|feat: containerization and end-to-end validation (11d)
parent|12|-|12. Observability and infrastructure automation|yes|-|-|-
sub|12a|12|12a. Per-tool and per-model-call tracing (cost, latency)|yes|12a-per-call-tracing.md|f9bd2e5|feat: per-tool and per-model-call tracing (12a)
sub|12b|12|12b. Evaluation suite as a blocking CI regression check|yes|12b-eval-regression-gate.md|8bd9e4b|feat: evaluation suite as a blocking CI regression check (12b)
sub|12c|12|12c. Event-driven reindexing on text updates|yes|12c-event-driven-reindexing.md|5df2e2b|feat: event-driven reindexing on text updates (12c)
sub|12d|12|12d. Terraform provisioning the stack from scratch|yes|12d-terraform-provisioning.md|7b53488|feat: provision AWS Lambda stack for API and MCP server (12d)
parent|13|-|13. Front end and reliability case study|yes|-|-|-
sub|13a|13|13a. Next.js scaffold and the question/answer screen|yes|13a-question-answer-screen.md|23585f4|feat: question/answer screen (13a)
sub|13b|13|13b. Agent-trace view|yes|13b-agent-trace-view.md|6caa6e9|feat: front end and reliability case study (item 13, 13b-13d)
sub|13c|13|13c. End-to-end smoke test|yes|13c-end-to-end-smoke-test.md|6caa6e9|feat: front end and reliability case study (item 13, 13b-13d)
sub|13d|13|13d. Reliability case study write-up|yes|13d-reliability-case-study.md|6caa6e9|feat: front end and reliability case study (item 13, 13b-13d)
parent|14|-|14. Item 8 deep-dive exploration|no|-|-|-
parent|15|-|15. Restyle front-end (design handoff)|yes|15-restyle-front-end.md|5994e5a|feat(web): restyle front end from design handoff (item 15)
parent|16|-|16. Restore valid Bedrock credentials in prod|no|-|-|-
parent|17|-|17. Separate paid and free-route quotas|no|-|-|-
parent|18|-|18. Client-side local history of questions, answers, and traces|no|-|-|-
parent|19|-|19. Surface the real error behind the generic verification-failure abstention|no|-|-|-
parent|20|-|20. Upgrade to Node 24|no|-|-|-
parent|21|-|21. Wire up release-please, enforce conventional commits|yes|-|-|-
sub|21a|21|21a. release-please workflow and config|yes|21a-release-please-workflow.md|5a27e8a|feat(ci): add release-please workflow and config (21a)
sub|21b|21|21b. Commitlint enforcement|yes|21b-commitlint-enforcement.md|0c82c1d|feat(ci): add commitlint enforcement via husky and a PR check (21b)
fix|fix-secure-api|-|Fix: Sécuriser l'\''API et le MCP : token d'\''accès partagé + rate-limit persistant|yes|secure-api-mcp-access.md|af36851|fix: secure API and MCP with shared token and persistent rate limiting
fix|fix-simplify-deploy|-|Fix: Simplify Terraform state and automate the Lambda image deploy|yes|simplify-deploy-automation.md|c5ad909|fix: simplify Terraform state, automate Lambda deploys, prove it live
'

# Plain indexed arrays + linear-scan lookups, not `declare -A`: macOS ships
# bash 3.2 (no associative arrays) as /bin/bash, and this script must run
# there without requiring a newer bash to be installed first.
ISSUE_TITLES=()   # parallel arrays: title -> issue number (pre-existing or
ISSUE_NUMS=()      # just created)
PARENT_KEYS=()     # parallel arrays: build-plan key -> issue number, for
PARENT_NUMS=()     # --parent linkage

TOTAL=0
TO_CLOSE=0
TO_OPEN=0

issue_num_for_title() {
  local title="$1" i
  for i in "${!ISSUE_TITLES[@]}"; do
    if [[ "${ISSUE_TITLES[$i]}" == "$title" ]]; then
      echo "${ISSUE_NUMS[$i]}"
      return 0
    fi
  done
  return 1
}

parent_num_for_key() {
  local key="$1" i
  for i in "${!PARENT_KEYS[@]}"; do
    if [[ "${PARENT_KEYS[$i]}" == "$key" ]]; then
      echo "${PARENT_NUMS[$i]}"
      return 0
    fi
  done
  return 1
}

preload_existing() {
  # A read-only `gh issue list` call, safe in dry-run too - without it, a
  # dry-run preview on a repo that already has issues would wrongly show
  # CREATE for everything instead of UPDATE.
  while IFS=$'\t' read -r num title; do
    [[ -z "$num" ]] && continue
    ISSUE_TITLES+=("$title")
    ISSUE_NUMS+=("$num")
  done < <(gh issue list --repo "$REPO" --state all --limit 300 --json number,title \
    --jq '.[] | [(.number|tostring), .title] | @tsv')
}

ensure_labels() {
  if $APPLY; then
    gh label create "build-plan" --repo "$REPO" --color "1d76db" \
      --description "Mirrors a blueprint/build-plan.md item" 2>/dev/null || true
    gh label create "fix" --repo "$REPO" --color "d4c5f9" \
      --description "Mirrors an ad hoc blueprint/history/fixes/ entry" 2>/dev/null || true
  else
    echo "would ensure labels: build-plan, fix"
  fi
}

# Real GitHub blob/commit links, not inert backtick-quoted paths - a plain
# `path/to/file.md` renders as monospace text in an issue body, not something
# a reader can click, which defeats the whole point of a "browsable" history.
archive_link() {
  local dir="$1" file="$2"
  printf '[blueprint/%s/%s](%s/blob/main/blueprint/%s/%s)' "$dir" "$file" "$REPO_URL" "$dir" "$file"
}
commit_link() {
  printf '[`%s`](%s/commit/%s)' "$1" "$REPO_URL" "$1"
}
BUILD_PLAN_LINK="[blueprint/build-plan.md]($REPO_URL/blob/main/blueprint/build-plan.md)"

# The issue body must be self-contained - a reader shouldn't have to click
# through to a repo file to know what an item actually was or did. These
# pull the real text at run time instead of a link-only summary:
#
# - archive_content: the full archived spec, minus the "## Build loop"
#   section when (and only when) it's the generic Blueprint-workflow
#   boilerplate, identical in most archives - real noise, not history, if
#   repeated in every issue. Some archives customize that section with
#   feature-specific warnings (e.g. 04b's "Step 1 is destructive against the
#   live Supabase project" note) - stripping unconditionally would silently
#   delete those, so this only strips on an exact match against the known
#   boilerplate text; anything else is left in place.
# - build_plan_own_text (parent): this item's own bullet text, including any
#   of its own notes wherever they fall (before or after its lettered
#   children), but excluding the children's own bullets - those get their
#   own issues.
# - build_plan_own_text (sub): this sub-item's own bullet text, including any
#   notes nested under it (e.g. 6d's on-hold history).

# Bash 3.2 (macOS's /bin/bash) mis-parses an apostrophe inside a heredoc that
# sits inside a `$(...)` command substitution within a double-quoted
# assignment - hence a plain single-quoted string here instead of a heredoc,
# with the apostrophe in "haven't" escaped the standard way (close quote,
# escaped literal quote, reopen quote). No trailing newline before the
# closing quote, matching how `$(...)` strips trailing newlines from the
# archive's own extracted section when compared below.
BUILD_LOOP_BOILERPLATE='
Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven'\''t read. If a diff is too big to review, the step was too big, so split it.'

archive_content() {
  local dir="$1" file="$2"
  local path="$REPO_ROOT/blueprint/$dir/$file"
  local section
  section="$(awk '/^## Build loop$/{p=1;next} p&&/^## /{p=0} p' "$path")"
  if [[ "$section" == "$BUILD_LOOP_BOILERPLATE" ]]; then
    awk '
      /^## Build loop$/ { skip=1; next }
      skip && /^## / { skip=0 }
      !skip { print }
    ' "$path"
  else
    cat "$path"
  fi
}

build_plan_own_text() {
  local type="$1" key="$2"
  # Two sed passes on top of the raw awk extraction:
  # 1. Strip the `- [ ]`/`- [x]` checkbox marker from just the opening line:
  #    pasted verbatim, GitHub renders that marker as a real, clickable
  #    task-list checkbox - which looks actionable and duplicates the issue's
  #    own Open/Closed badge, even though it's just quoted build-plan.md
  #    status text, not a to-do inside the issue.
  # 2. Dedent every line by the list-nesting indent (2 for a top-level item,
  #    4 for a lettered sub-item): once the opening line loses its marker, it
  #    starts at column 0, so leaving continuation lines at their original
  #    2-4 space indent would make CommonMark misread them as an indented
  #    code block. Dedenting keeps plain continuation flowing as prose and
  #    turns nested `- ` notes into clean top-level bullets instead.
  if [[ "$type" == "parent" ]]; then
    awk -v key="$key" '
      $0 ~ ("^- \\[[ x]\\] " key "\\. ") { in_block=1; skipping=0; print; next }
      in_block && (/^- \[/ || /^## /) { in_block=0; skipping=0 }
      in_block {
        if ($0 ~ /^  - \[[ x]\] [0-9]+[a-z]\. /) { skipping=1; next }
        if ($0 ~ /^  - /) { skipping=0 }
        if (!skipping) print
      }
    ' "$BUILD_PLAN_FILE" | sed '1s/^- \[[ x]\] //' | sed -E 's/^ {2}//'
  else
    awk -v key="$key" '
      $0 ~ ("^  - \\[[ x]\\] " key "\\. ") { on=1; print; next }
      on && (/^  - \[/ || /^- \[/ || /^## /) { on=0 }
      on { print }
    ' "$BUILD_PLAN_FILE" | sed '1s/^  - \[[ x]\] //' | sed -E 's/^ {4}//'
  fi
}

build_body() {
  local type="$1" key="$2" parent_key="$3" closed="$4" archive="$5" commit="$6" subject="$7"

  if [[ "$type" == "fix" ]]; then
    printf '**Ad hoc fix** (not a build-plan item) - closed, squash-merged as %s.\n\n---\n\n%s\n\n---\n\nFull spec: %s\n' \
      "$(commit_link "$commit")" "$(archive_content history/fixes "$archive")" "$(archive_link history/fixes "$archive")"
    return
  fi

  if [[ "$closed" == "yes" && "$archive" != "-" ]]; then
    local scope="**Build-plan item $key**"
    [[ "$type" == "sub" ]] && scope="**Build-plan sub-item $key** (part of item $parent_key)"
    printf '%s - closed, squash-merged as %s (%s).\n\n---\n\n%s\n\n---\n\nFull spec: %s  \nBuild-plan entry: %s\n' \
      "$scope" "$(commit_link "$commit")" "$subject" \
      "$(archive_content history/features "$archive")" \
      "$(archive_link history/features "$archive")" "$BUILD_PLAN_LINK"
    return
  fi

  if [[ "$closed" == "yes" && "$archive" == "-" ]]; then
    printf '**Build-plan item %s** - closed. Split immediately into sub-features, so it has no standalone spec or commit of its own - see its sub-issues for the actual build history and commits.\n\n---\n\n%s\n\n---\n\nBuild-plan entry: %s\n' \
      "$key" "$(build_plan_own_text "$type" "$key")" "$BUILD_PLAN_LINK"
    return
  fi

  # closed == no
  local scope="**Build-plan item $key**"
  [[ "$type" == "sub" ]] && scope="**Build-plan sub-item $key** (part of item $parent_key)"
  local status="open, not started yet"
  [[ "$key" == "6" ]] && status="open - stays open until every sub-item (6a-6d) is closed; 6d is on hold, not abandoned"
  [[ "$key" == "6d" ]] && status="open, on hold since 2026-08-16, not abandoned"
  printf '%s - %s.\n\n---\n\n%s\n\n---\n\nBuild-plan entry: %s\n' \
    "$scope" "$status" "$(build_plan_own_text "$type" "$key")" "$BUILD_PLAN_LINK"
}

create_or_reuse() {
  local type="$1" key="$2" parent_key="$3" title="$4" closed="$5" archive="$6" commit="$7" subject="$8"
  TOTAL=$((TOTAL + 1))
  [[ "$closed" == "yes" ]] && TO_CLOSE=$((TO_CLOSE + 1)) || TO_OPEN=$((TO_OPEN + 1))

  local label="build-plan"
  [[ "$type" == "fix" ]] && label="fix"

  local existing_num
  if existing_num="$(issue_num_for_title "$title")"; then
    echo "UPDATE (exists #$existing_num, resync body): $title"
    if $APPLY; then
      local bodyfile
      bodyfile="$(mktemp)"
      build_body "$type" "$key" "$parent_key" "$closed" "$archive" "$commit" "$subject" > "$bodyfile"
      gh issue edit "$existing_num" --repo "$REPO" --body-file "$bodyfile" --add-label "$label" >/dev/null
      rm -f "$bodyfile"
    fi
    if [[ "$type" == "parent" ]]; then
      PARENT_KEYS+=("$key")
      PARENT_NUMS+=("$existing_num")
    fi
    return
  fi

  echo "CREATE ($( [[ $closed == yes ]] && echo closed || echo open )): $title"
  if $APPLY; then
    local bodyfile
    bodyfile="$(mktemp)"
    build_body "$type" "$key" "$parent_key" "$closed" "$archive" "$commit" "$subject" > "$bodyfile"
    local args=(--repo "$REPO" --title "$title" --body-file "$bodyfile" --label "$label")
    if [[ "$type" == "sub" ]]; then
      local pnum
      if ! pnum="$(parent_num_for_key "$parent_key")"; then
        echo "  ERROR: parent issue for '$parent_key' not found - create parents before sub-items" >&2
        exit 1
      fi
      args+=(--parent "$pnum")
    fi
    local url num
    url="$(gh issue create "${args[@]}")"
    num="${url##*/}"
    rm -f "$bodyfile"
    ISSUE_TITLES+=("$title")
    ISSUE_NUMS+=("$num")
    if [[ "$type" == "parent" ]]; then
      PARENT_KEYS+=("$key")
      PARENT_NUMS+=("$num")
    fi

    if [[ "$closed" == "yes" ]]; then
      gh issue close "$num" --repo "$REPO" \
        --comment "Backfilled as already complete - see the issue body for the archived spec and squash-merge commit."
    fi
  fi
}

echo "Repo: $REPO (mode: $([[ $APPLY == true ]] && echo APPLY || echo DRY-RUN))"
echo

preload_existing
ensure_labels
echo

# Pass 1: parents and fixes (parents must exist before their sub-issues can
# reference them via --parent).
while IFS='|' read -r type key parent_key title closed archive commit subject; do
  [[ -z "$type" ]] && continue
  [[ "$type" == "parent" || "$type" == "fix" ]] || continue
  create_or_reuse "$type" "$key" "$parent_key" "$title" "$closed" "$archive" "$commit" "$subject"
done <<< "$DATA"

echo
# Pass 2: sub-issues.
while IFS='|' read -r type key parent_key title closed archive commit subject; do
  [[ -z "$type" ]] && continue
  [[ "$type" == "sub" ]] || continue
  create_or_reuse "$type" "$key" "$parent_key" "$title" "$closed" "$archive" "$commit" "$subject"
done <<< "$DATA"

echo
echo "Total issues: $TOTAL (to close: $TO_CLOSE, to leave open: $TO_OPEN)"
if ! $APPLY; then
  echo
  echo "Dry run only - nothing was created. Re-run with --apply to write to GitHub."
fi
