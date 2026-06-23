# Contributing to CartWise AI

## Local Development Setup

The fastest path from a clean machine to a running app is:

```bash
git clone https://github.com/Coding-Krakken/BudgetBasket.git
cd BudgetBasket
npm install
cp .env.example .env
npm run db:push && npm run db:seed && npm run dev
```

Set `DATABASE_URL` in `.env` before the final command if your local PostgreSQL credentials differ from the example.

### Step-by-step

1. Clone and install:
   ```bash
   git clone https://github.com/Coding-Krakken/BudgetBasket.git
   cd BudgetBasket
   npm install
   ```

2. Set up the database:
   ```bash
   cp .env.example .env
   # Edit .env — set DATABASE_URL to a local PostgreSQL instance
   npm run db:push
   npm run db:seed
   ```

3. Start the dev server:
   ```bash
   npm run dev
   ```

## Running Tests

```bash
npm run test          # Unit tests
npm run test:integration  # PostgreSQL-backed API/provider tests
npm run typecheck     # TypeScript check
npm run lint          # ESLint
```

Run integration tests with a real PostgreSQL database available at `DATABASE_URL`. For an empty local database, apply the schema first:

```bash
npm run db:push
npm run test:integration
```

Unit tests, integration tests, typecheck, and lint must pass before submitting a PR.

## Adding a Provider

1. Create `src/providers/my-provider.ts` extending `BaseProvider`
2. Implement `fetchOpportunities()` and `fetchPrices()`
3. Register it in `src/providers/registry.ts`
4. Add representative seed data to `prisma/seed.ts` when the provider needs demo records
5. Add the provider to `src/providers/provider-contract.test.ts`
6. Add an integration test if sync behavior or database writes change

See `src/providers/seed-walmart.ts` as the reference implementation.

**Important**: Never scrape retailer websites. Only use official APIs, seed data, or user-uploaded receipts.

## Adding a Page

1. Create `src/app/your-page/page.tsx` (Server Component)
2. Add interactive parts to `your-page-client.tsx` with `"use client"`
3. Add the route to the navigation in `src/components/layout/navbar.tsx`
4. Add API, component, or Playwright coverage for user-visible behavior

## PR Process

1. Branch from `main`
2. Write tests for new logic
3. Ensure `npm run test && npm run test:integration && npm run typecheck && npm run lint` all pass
4. Open a PR with a clear description of what changed and why
5. Reference the relevant GitHub issue

## Code Style

- TypeScript strict mode throughout
- No `any` types
- Comments only when the WHY is non-obvious
- No inline styles — use Tailwind utility classes
- Server Components by default; add `"use client"` only when needed
