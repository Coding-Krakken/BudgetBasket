# CartWise AI — Technical Architecture

**Version:** 0.1.0 (MVP/Seed Stage)
**Last Updated:** 2026-06-23

---

## Overview

CartWise AI is a grocery savings optimization platform built on Next.js 15 with App Router. The MVP is a monolithic full-stack application designed to demonstrate core product value: parse a plain-text shopping list, match items to a product catalog, find applicable coupons and rebates, and return a multi-scenario optimized basket plan.

The architecture is intentionally simple for seed stage — one repo, one deploy, one database. Complexity is added in later phases as user scale demands it.

---

## Stack at a Glance

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5.7 |
| Database | PostgreSQL (Prisma ORM) |
| Styling | Tailwind CSS + Radix UI |
| Validation | Zod |
| Testing | Vitest (unit/integration), Playwright (e2e) |
| Deployment | Vercel (primary) or Docker Compose |

---

## Directory Structure

```
src/
  app/                    # Next.js App Router pages and API routes
    api/
      health/             # GET /api/health — liveness + DB check
      stores/             # GET /api/stores
      products/           # GET /api/products
      opportunities/      # GET /api/opportunities
      optimize/           # POST /api/optimize (core engine endpoint)
      providers/status/   # GET /api/providers/status
    plan/                 # Shopping plan UI (main user flow)
    discover/             # Browse deals/opportunities
    pantry/               # Pantry tracking (V3 feature, placeholder)
    integrations/         # Provider account linking (V2, placeholder)
    profile/              # User preferences
    admin/                # Internal admin views
  engine/                 # Pure optimization logic (no DB calls)
    parser.ts             # parseShoppingList(), normalizeShoppingItem()
    effective-price.ts    # calculateEffectivePrice(), coupon stackability
    confidence.ts         # scoreConfidence(), combineConfidence(), UI labels
    optimizer.ts          # optimizeBasket(), generateScenarios(), matchProducts()
  providers/              # Data ingestion abstraction layer
    base.ts               # BaseProvider abstract class
    registry.ts           # Provider registry and health summary
    seed-walmart.ts       # Demo seed data (Walmart)
  lib/                    # Shared utilities
    db.ts                 # Prisma client singleton
  types/                  # Shared TypeScript interfaces
  components/             # Reusable React components
prisma/
  schema.prisma           # Full data model
  seed.ts                 # Database seeder (8 stores, 50 products, 75 opportunities)
  migrations/             # Prisma migration history
```

---

## Frontend Architecture

CartWise uses Next.js App Router with React Server Components (RSC) where practical and client components for interactive UI.

### Key Pages

- `/plan` — The primary user flow. User enters a shopping list, selects optimization mode, receives a multi-scenario result with per-item store assignments, applied coupons, confidence scores, and action items. This is the core product experience.
- `/discover` — Browse current deals and opportunities by store or category. Useful for serendipitous savings discovery.
- `/pantry` — Placeholder for V3 pantry tracking. Currently stub UI.
- `/integrations` — Placeholder for V2 OAuth account linking.
- `/profile` — User preferences: household size, max stores, hassle cost per store, dietary restrictions.

### State Management

No global state library. Optimization results are passed via server-fetched props and client component state (`useState`/`useReducer`). The `/api/optimize` call is made client-side on form submit, with local state holding the result.

---

## Backend Architecture

All API routes live in `src/app/api/`. Each route handler is a standard Next.js App Router route with typed request/response using Zod for input validation.

### Request Flow for /api/optimize

```
Client POST /api/optimize
  → Zod schema validation
  → Parse shopping list (engine/parser.ts)
  → Parallel DB fetch: stores, products, opportunities, priceObservations
  → generateScenarios() — runs all 5 optimization modes concurrently
    → For each mode: optimizeBasket()
      → matchProducts() — Jaccard similarity + keyword overlap
      → For each matched product: buildStoreCandidates()
        → calculateEffectivePrice() — coupon stackability logic
        → scoreConfidence() / combineConfidence()
      → selectBestCandidate() — mode-specific selection logic
  → createOptimizationResult() — bundle into typed response
  → NextResponse.json({ success: true, data: result })
```

### Engine Design Principle

The `src/engine/` directory contains zero database calls. All functions are pure (or near-pure) and operate on typed data structs passed in from the API route. This makes the engine independently testable and potentially extractable to a separate service in future.

---

## Provider Abstraction Layer

The `src/providers/` directory implements a pluggable data ingestion system.

```
BaseProvider (abstract class)
  ├── fetchPrices(products, stores): Promise<ProviderFetchResult<ProviderPriceData>>
  ├── fetchOpportunities(products, stores): Promise<ProviderFetchResult<ProviderOpportunityData>>
  ├── getHealth(): ProviderHealth
  └── validateOpportunity(opportunity): { valid, reason }
```

In the MVP, all providers are seed/demo providers that return hardcoded data representative of real-world pricing. The `registry.ts` file maintains a map of instantiated providers and a static health summary for all known providers (including future ones not yet integrated).

---

## Database Architecture

PostgreSQL via Prisma ORM. Single database, single schema. See `DATA_MODEL.md` for full entity documentation.

### Connection

- Local development: `DATABASE_URL` pointing to local PostgreSQL or a Neon/Supabase dev branch
- Production (Vercel): Vercel Postgres (Neon-backed) via `DATABASE_URL` environment variable
- Docker: PostgreSQL container defined in `docker-compose.yml`, accessed at `postgres:5432`

### Prisma Client

A singleton Prisma client is exported from `src/lib/db.ts` with the standard Next.js dev-mode workaround to prevent connection pool exhaustion during hot reloads.

---

## Deployment: Vercel (Primary)

Vercel is the primary deployment target for the MVP. Next.js deploys as a serverless function bundle.

**Characteristics in this mode:**
- API routes run as Vercel serverless functions (cold starts possible on free tier)
- No persistent background processes — all ingestion is on-demand or at request time
- Database: Vercel Postgres (Neon) or external PostgreSQL (Neon/Supabase)
- Static assets served from Vercel CDN

**Deployment steps:** See `DEPLOYMENT.md`.

---

## Deployment: Docker Compose (Self-Hosted/Dev)

A `docker-compose.yml` provides a full local environment including:
- `app` service: Next.js application (Node 20 Alpine)
- `postgres` service: PostgreSQL 16
- `pgadmin` service: pgAdmin 4 on port 8080

This is the recommended path for development and for self-hosted staging environments.

---

## Future Architecture: Background Ingestion (V1/V2)

The MVP fetches all data from the database synchronously at request time. As real provider integrations are added, a background ingestion layer becomes necessary.

**Planned architecture (V1+):**

```
Ingestion Workers (separate Node.js processes or serverless crons)
  → Pull from provider APIs on schedule (e.g. every 15 minutes for Kroger)
  → Write PriceObservation and Opportunity records to PostgreSQL
  → Update ProviderSyncRun records

Redis (V2+)
  → Cache hot query results (top products, active opportunities)
  → Rate limit buckets per user/IP
  → Session cache for optimization results

Queue (V2+, BullMQ or similar)
  → Receipt OCR jobs submitted by user upload
  → Provider sync jobs triggered on schedule or webhook
  → Background scenario pre-computation for popular lists
```

The engine and API route code does not need to change for this migration — the API routes will continue reading from PostgreSQL, but the data will be fresher because ingestion workers populate it continuously rather than via the seed script.

---

## Scaling Considerations

| Concern | MVP Approach | Future Approach |
|---|---|---|
| Database connections | Prisma singleton, connection pooling via Prisma | PgBouncer or Neon branching |
| Concurrent optimize requests | Synchronous, single-thread per request | Pre-computed result cache in Redis |
| Provider data freshness | Seed data (static) | Background cron ingestion per provider |
| Receipt OCR | Not implemented | Queue-based, async processing |
| Rate limiting | None (MVP) | Redis sliding window per IP/user |
| Multi-region | Not needed (MVP) | Vercel Edge for global latency |
| API auth | None (MVP demo) | JWT or NextAuth session tokens |

---

## Key Design Decisions

1. **Monorepo, no microservices:** Seed stage is too early to justify operational complexity of separate services. Engine extracted to pure functions for future portability.

2. **Engine purity:** Zero DB calls in `src/engine/`. The optimizer receives data arrays and returns data arrays. Easy to test, easy to move.

3. **Seed data over scraping:** MVP uses curated demo data rather than scraping, which is both legally safer and faster to ship. Real integrations added in V1 via official APIs.

4. **All 5 scenarios on every request:** `generateScenarios()` runs all optimization modes concurrently. This is slightly wasteful for users who only care about one mode but gives the UI the data needed to show comparisons without a second round trip.

5. **Confidence as a first-class value:** Every price observation and opportunity has a `confidence` float. The UI uses this to render appropriate language and warnings rather than presenting all savings claims with equal authority.
