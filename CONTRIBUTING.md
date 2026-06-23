# Contributing to CartWise AI

## Local Development Setup

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
   npm run db:migrate
   npm run db:seed
   ```

3. Start the dev server:
   ```bash
   npm run dev
   ```

## Running Tests

```bash
npm run test          # Unit tests
npm run typecheck     # TypeScript check
npm run lint          # ESLint
```

All three must pass before submitting a PR.

## Adding a Provider

1. Create `src/providers/seed/my-provider.ts` extending `BaseProvider`
2. Implement `fetchOpportunities()` and `fetchPrices()`
3. Register it in `src/providers/registry.ts`
4. Add seed data to `prisma/seed.ts`
5. Write a contract test in `src/providers/provider-contract.test.ts`

See `src/providers/seed/walmart.ts` as the reference implementation.

**Important**: Never scrape retailer websites. Only use official APIs, seed data, or user-uploaded receipts.

## Adding a Page

1. Create `src/app/your-page/page.tsx` (Server Component)
2. Add interactive parts to `your-page-client.tsx` with `"use client"`
3. Add the route to the navigation in `src/components/layout/nav.tsx`

## PR Process

1. Branch from `main`
2. Write tests for new logic
3. Ensure `npm run test && npm run typecheck && npm run lint` all pass
4. Open a PR with a clear description of what changed and why
5. Reference the relevant GitHub issue

## Code Style

- TypeScript strict mode throughout
- No `any` types
- Comments only when the WHY is non-obvious
- No inline styles — use Tailwind utility classes
- Server Components by default; add `"use client"` only when needed
