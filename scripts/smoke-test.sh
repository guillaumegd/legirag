#!/usr/bin/env bash
# Item 11d - smoke test hitting all three Public API endpoint families
# against a running instance (local dev server or a Docker container).
#
# Usage: scripts/smoke-test.sh [base-url]
#   base-url defaults to http://localhost:3000
#
# Requires: curl, jq

set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
# Article connu, actuellement visible dans le corpus de démo (code-de-la-route,
# VIGUEUR) - même identifiant déjà vérifié en direct pendant 11b.
KNOWN_ARTICLE_ID="LEGIARTI000006841719"

fail() {
  echo "SMOKE TEST FAILED: $1" >&2
  exit 1
}

command -v jq >/dev/null 2>&1 || fail "jq is required but not found on PATH"

echo "==> GET /health"
health_status=$(curl -s -o /tmp/smoke-health.json -w '%{http_code}' "$BASE_URL/health") \
  || fail "GET /health request failed - is $BASE_URL reachable?"
[ "$health_status" = "200" ] || fail "GET /health returned $health_status (expected 200)"
[ "$(jq -r '.status' /tmp/smoke-health.json)" = "ok" ] || fail "GET /health body did not contain status: ok"
echo "    ok"

echo "==> POST /question"
question_status=$(curl -sN -X POST "$BASE_URL/question" \
  -H "Content-Type: application/json" \
  -d '{"question":"vitesse maximale autorisée en agglomération"}' \
  --max-time 60 \
  -o /tmp/smoke-question.txt -w '%{http_code}') \
  || fail "POST /question request failed - is $BASE_URL reachable?"
[ "$question_status" = "201" ] || fail "POST /question returned $question_status (expected 201)"
grep -q '^event: done' /tmp/smoke-question.txt || fail "POST /question stream never reached a done event"
trace_id=$(grep -A1 '^event: done' /tmp/smoke-question.txt | grep '^data:' | sed 's/^data: //' | jq -r '.trace_id')
[ -n "$trace_id" ] && [ "$trace_id" != "null" ] || fail "POST /question done event carried no trace_id"
echo "    ok (trace_id=$trace_id)"

echo "==> GET /article/:id"
article_status=$(curl -s -o /tmp/smoke-article.json -w '%{http_code}' "$BASE_URL/article/$KNOWN_ARTICLE_ID") \
  || fail "GET /article request failed - is $BASE_URL reachable?"
[ "$article_status" = "200" ] || fail "GET /article/$KNOWN_ARTICLE_ID returned $article_status (expected 200)"
[ "$(jq -r '.article.articleIdentifier' /tmp/smoke-article.json)" = "$KNOWN_ARTICLE_ID" ] || fail "GET /article body did not echo the expected articleIdentifier"
echo "    ok"

echo "==> GET /trace/:id"
trace_status=$(curl -s -o /tmp/smoke-trace.json -w '%{http_code}' "$BASE_URL/trace/$trace_id") \
  || fail "GET /trace request failed - is $BASE_URL reachable?"
[ "$trace_status" = "200" ] || fail "GET /trace/$trace_id returned $trace_status (expected 200)"
[ "$(jq -r '.traceId' /tmp/smoke-trace.json)" = "$trace_id" ] || fail "GET /trace body did not echo the expected traceId"
echo "    ok"

echo "All smoke tests passed against $BASE_URL"
