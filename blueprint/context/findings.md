# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-01 [P3] unverified - Per-IP rate limiting trusts the raw socket IP, not yet reverse-proxy-aware

**File:** packages/api/src/app.module.ts:16-22
**Found:** 2026-08-17 by /audit (scope: current)
**Why it matters:** `ThrottlerGuard`'s default tracker keys on `req.ip`, which under Express is the direct socket address unless the app explicitly trusts a proxy (`app.set('trust proxy', ...)`). Today (local dev, no reverse proxy in front) this is correct and not exploitable. Once item 11d containerizes the API and it eventually sits behind a load balancer or reverse proxy (item 12's Terraform-provisioned infra), every request would arrive from the proxy's IP unless trust-proxy is configured, either collapsing all clients onto one rate-limit bucket or - if a proxy forwards `X-Forwarded-For` and Express is misconfigured to trust it unconditionally - letting a client spoof the header to bypass the limit entirely. No reverse proxy exists yet in this project, so there is no concrete exploitable path today - flagged as a lead for whoever stands up the actual deployment topology, not a confirmed defect.
**Suggested fix:** When 11d/12 introduce a real reverse proxy or load balancer, configure Express's `trust proxy` setting to match the actual number of trusted hops, and confirm `ThrottlerGuard`'s tracker resolves the real client IP correctly in that topology (a manual check with the real infra, not something unit-testable today).
**Resolution:**
