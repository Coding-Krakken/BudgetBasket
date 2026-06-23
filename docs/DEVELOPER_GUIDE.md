# Developer Guide

This guide is the practical map for working inside CartWise AI. Start with `README.md` for the product overview and use this file when you need to add behavior.

## Local Setup

1. Install Node.js 22+, npm 10+, and PostgreSQL 16.
2. Clone the repository and run `npm install`.
3. Copy `.env.example` to `.env`.
4. Set `DATABASE_URL` to your local PostgreSQL database.
5. Run `npm run db:push && npm run db:seed && npm run dev`.

The app runs at `http://localhost:3000`. The seed data creates the MVP demo catalog, stores, prices, and opportunities.

## Test Workflow

Use the smallest useful check while you work:

```bash
npm run test              # Fast unit tests
npm run test:integration  # Real PostgreSQL integration tests
npm run test:e2e          # Browser tests
npm run typecheck
npm run lint
```

Integration tests require `DATABASE_URL` to point at a disposable database. They clean their own rows before each test, but they are intentionally destructive to the target database.

## Adding Providers

Providers live in `src/providers` and implement `BaseProvider` from `src/providers/base.ts`.

1. Create a provider class with stable `id`, `name`, `type`, `capabilities`, and `isDemo` values.
2. Implement `fetchPrices()` when the provider can return product/store price observations.
3. Implement `fetchOpportunities()` when the provider can return sales, coupons, rebates, or weekly ad deals.
4. Register the provider in `src/providers/registry.ts`.
5. Add it to `src/providers/provider-contract.test.ts`.
6. Add sync integration coverage when it writes or maps database records differently from existing providers.

Provider payloads use slugs to map external data to local rows. `syncProviderData()` resolves those slugs and records unmapped items as failures, so provider implementations should return predictable product and store slugs.

Do not scrape retailer websites. Use official APIs, partner feeds, seed data, or user-authorized data sources.

## Adding Pages

Pages use the Next.js App Router under `src/app`.

1. Add a route folder such as `src/app/example/page.tsx`.
2. Keep the page as a Server Component unless it needs browser state or event handlers.
3. Put interactive UI in a nearby client component with `"use client"`.
4. Reuse components from `src/components/ui` and navigation from `src/components/layout/navbar.tsx`.
5. Add tests at the right level: unit tests for pure logic, integration tests for API/database behavior, and Playwright tests for critical user flows.

## API Route Patterns

API routes validate inputs with Zod, read and write through `src/lib/db.ts`, and return consistent `success` JSON envelopes. Expiring data should be filtered with `expiresAt: null OR expiresAt >= now` unless the route explicitly asks for historical rows.

When an API writes a user-facing record, prefer best-effort persistence only when the response can still be useful without that record. Log persistence failures with `src/lib/logger.ts`.

## Pull Request Checklist

- The PR has a narrow issue-linked scope.
- New logic has tests at the right level.
- `npm run test`, `npm run test:integration`, `npm run typecheck`, and `npm run lint` pass.
- Docs are updated when setup, commands, routes, or provider behavior changes.
- The PR body includes `Closes #...` for completed issues.
