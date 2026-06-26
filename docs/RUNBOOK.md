# CartWise AI — Operations Runbook

This runbook covers error monitoring, alerting, and incident response (INFRA-03).

---

## Error Monitoring Setup (Sentry)

The app ships with `@sentry/nextjs` wired into the client, server, and edge runtimes (`instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`). It is **disabled by default** — without a `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`, the SDK no-ops everywhere and nothing is sent.

### One-time setup (manual — requires a Sentry account)

1. Create a free or team Sentry project at [sentry.io](https://sentry.io) (platform: Next.js).
2. Copy the DSN from Project Settings → Client Keys.
3. Set these in Vercel (Project Settings → Environment Variables, for both Production and Preview) and in your local `.env`:
   - `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` — same value, set both (server and client need their own var name).
   - `SENTRY_ORG` — your Sentry org slug (only needed for source map uploads at build time).
   - `SENTRY_PROJECT` — your Sentry project slug.
   - `SENTRY_AUTH_TOKEN` — a Sentry auth token with `project:releases` scope (Settings → Auth Tokens). Without this, the build still succeeds but stack traces won't be de-minified.
4. Redeploy. Errors will start appearing in the Sentry Issues stream within a few minutes of the next request that throws.

### Alert configuration (manual — Sentry dashboard, not code)

In the Sentry project, go to **Alerts → Create Alert Rule** and create three rules (this is dashboard configuration, not something a deploy can automate):

| Rule | Condition | Action |
|---|---|---|
| New issue | "A new issue is created" | Notify on-call (email/Slack) immediately |
| Error spike | "Number of events > 25 in 5 minutes" for the project | Notify on-call immediately |
| P0 error rate | "Number of events in `api/optimize` or `api/plans` > 1% of `api/health` request volume over 5 minutes" (approximate via the issue's `transaction` tag) | Page on-call (highest urgency) |

Target: on-call should be notified for a P0 spike within 5 minutes — Sentry's alert evaluation runs on a 1-minute cadence by default, well within that budget.

### Performance monitoring

`tracesSampleRate: 0.2` is set in all three Sentry init files, so 20% of requests get a performance transaction. The `/api/optimize` route additionally wraps its core matching/pricing logic (`generateScenarios`) in an explicit `Sentry.startSpan({ name: "optimize.generateScenarios" })` so it shows as its own span even when sampled, separate from request overhead — this is the most expensive and most user-visible code path in the app.

---

## Runbook: Top 5 Error Types

### 1. `PrismaClientInitializationError` / `P1001` (database unreachable)

**Symptom:** `/api/health` reports `services.database.status: "error"`; most API routes return 500.
**Likely cause:** `DATABASE_URL` misconfigured, Neon database paused (free tier auto-suspends after inactivity), or connection pool exhausted.
**Response:**
1. Check `/api/health` for the specific error.
2. Verify `DATABASE_URL` in Vercel env vars matches the intended Neon database (see [DEPLOYMENT.md](./DEPLOYMENT.md)).
3. If Neon shows the database as "idle/suspended," any query will auto-wake it within a few seconds — retry once before escalating.
4. If the pool is exhausted, check for connection leaks (queries not awaited / dangling transactions) in recent deploys.

### 2. `P2021` "table does not exist"

**Symptom:** A specific API route fails while others succeed; error mentions a model name.
**Likely cause:** A migration didn't run before this deploy, or the database the app is pointed at doesn't match the expected schema (see the shared-database incident below — this exact error is what surfaced it).
**Response:**
1. Run `npx prisma migrate status` against the affected database.
2. If migrations are pending, run `npm run db:migrate`.
3. If the database has no CartWise tables at all, confirm `DATABASE_URL` actually points at the dedicated CartWise database before doing anything else — do **not** run `prisma db push --accept-data-loss` on an unfamiliar database.

### 3. Optimization timeout / slow `/api/optimize`

**Symptom:** Elevated p95/p99 duration on the `optimize.generateScenarios` span; users report the planner hanging.
**Likely cause:** Large shopping list (many items) combined with a large product catalog now that DATA-01 expanded it past 500 products — matching is O(items × products).
**Response:**
1. Check the Sentry performance view for `optimize.generateScenarios` span duration trends.
2. If duration scales with catalog size, consider pre-filtering candidate products by category/keyword before full similarity scoring (see `matchProducts` in `src/engine/optimizer.ts`).

### 4. Unhandled exception in a Server Component (caught by `global-error.tsx`)

**Symptom:** User sees the generic "Something went wrong" page; Sentry shows an issue tagged with the route.
**Likely cause:** Usually a null-safety gap when a relation is missing (e.g. a `Product` with no `category`).
**Response:** Reproduce with the exact input from the Sentry breadcrumb trail, add a regression test, and null-guard the access path.

### 5. Provider sync failures (`/api/cron/sync-providers`)

**Symptom:** Discover page shows stale or no deals; cron job errors in Sentry.
**Likely cause:** A live provider's upstream API changed shape, rate-limited us, or credentials expired.
**Response:**
1. Check `/api/providers/status` for which provider is failing.
2. Per-provider sync already has a 30s timeout and is skipped on failure rather than blocking the whole sync — confirm other providers still succeeded.
3. Re-issue/rotate credentials via `/integrations` if it's an auth failure.

---

## Related

- [DEPLOYMENT.md](./DEPLOYMENT.md) — environment variables and deploy process.
- [BACKUP_RESTORE.md](./BACKUP_RESTORE.md) — database backup/restore (INFRA-02).
