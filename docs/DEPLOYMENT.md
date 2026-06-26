# CartWise AI — Deployment Guide

**App version:** 0.1.0
**Node.js requirement:** 20.x LTS or later
**Database:** PostgreSQL 15+ (or Neon/Supabase hosted PostgreSQL)

---

## Local Development Setup

### Prerequisites

- Node.js 20+ (use nvm or volta for version management)
- PostgreSQL 15+ running locally, or a free Neon/Supabase project for the database
- npm 10+ (comes with Node 20)

### Steps

**1. Clone the repository**

```bash
git clone https://github.com/your-org/cartwise-ai.git
cd cartwise-ai
```

**2. Install dependencies**

```bash
npm install
```

**3. Configure environment variables**

```bash
cp .env.example .env
```

Open `.env` and fill in the required values (see Environment Variables section below). At minimum, set `DATABASE_URL`.

**4. Run database migrations**

```bash
npm run db:migrate
```

This applies all Prisma migrations to your database. Safe to run multiple times — it only applies new migrations.

**5. Seed the database**

```bash
npm run db:seed
```

This populates the database with demo data: 8 stores, ~50 products, ~75 opportunities, and representative price observations. Takes about 5–10 seconds.

**6. Start the development server**

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

### Development Commands

| Command | Description |
|---|---|
| `npm run dev` | Start Next.js development server with hot reload |
| `npm run build` | Build production bundle |
| `npm run start` | Start production server (after build) |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type checker (no emit) |
| `npm test` | Run unit tests with Vitest (single pass) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:e2e` | Run Playwright end-to-end tests |

---

## Database Commands

| Command | Description |
|---|---|
| `npm run db:migrate` | Apply pending migrations (production-safe) |
| `npm run db:migrate:dev` | Create and apply a new migration during development |
| `npm run db:seed` | Seed demo data (safe to re-run — uses upsert) |
| `npm run db:reset` | **Destructive.** Drop all tables, re-migrate, re-seed |
| `npm run db:generate` | Regenerate Prisma client after schema change |
| `npm run db:studio` | Open Prisma Studio (local DB browser) at `http://localhost:5555` |

### Creating a New Migration

When you change `prisma/schema.prisma`:

```bash
npm run db:migrate:dev -- --name describe_your_change
```

This creates a new migration file in `prisma/migrations/` and applies it to your local database. Commit the migration file to version control.

### Applying Migrations to Production

```bash
npm run db:migrate
```

This uses `prisma migrate deploy` (not `migrate dev`) — it applies existing migration files without creating new ones. Safe for CI/CD pipelines.

---

## Vercel Deployment (Recommended for MVP)

### One-Click Setup

1. Fork or push the repository to GitHub
2. Go to [vercel.com](https://vercel.com) and click "Add New Project"
3. Import your GitHub repository
4. Vercel auto-detects Next.js — no framework configuration needed

### Database Setup (Vercel Postgres / Neon)

**Option A: Vercel Postgres (built-in)**
1. In your Vercel project dashboard, go to Storage → Create Database → Postgres
2. Vercel automatically sets `DATABASE_URL` and `POSTGRES_*` environment variables
3. No additional configuration needed

**Option B: External Neon / Supabase**
1. Create a free PostgreSQL project at [neon.tech](https://neon.tech) or [supabase.com](https://supabase.com)
2. Copy the connection string (pooled connection recommended for serverless)
3. Add to Vercel: Project Settings → Environment Variables → `DATABASE_URL`

### Running Migrations on Vercel

Migrations must be run explicitly after deployment. Two approaches:

**Approach A: Vercel Build Command (automatic)**

In `vercel.json` or Project Settings → Build Command:
```
prisma migrate deploy && next build
```

This runs migrations before each deploy. Safe for `migrate deploy`.

**Approach B: Manual via CLI**

```bash
DATABASE_URL="your-production-url" npx prisma migrate deploy
DATABASE_URL="your-production-url" npx tsx prisma/seed.ts
```

Run once after initial deployment.

### Setting Environment Variables in Vercel

Go to Project Settings → Environment Variables:

```
DATABASE_URL          = postgres://user:pass@host/db?sslmode=require
NEXT_PUBLIC_APP_NAME  = CartWise AI
```

Vercel encrypts all environment variable values at rest. Variables are injected at build and runtime.

### Deployment Verification

After deploying:
1. Visit `https://your-app.vercel.app/api/health` — expect `status: "healthy"`
2. Visit `https://your-app.vercel.app/api/stores` — expect the list of 8 stores
3. Visit `https://your-app.vercel.app` — try the shopping planner

---

## Staging Environment (INFRA-01)

The `budgetbasket` Vercel project is connected to the `Coding-Krakken/BudgetBasket` GitHub repo, which gives every PR an automatic, isolated preview deployment and auto-deploys `main` to production — no extra workflow needed for that part, it's Vercel's standard GitHub integration behavior.

| Environment | Trigger | Database | URL |
|---|---|---|---|
| Production | push/merge to `main` | dedicated `budgetbasket` database | `https://budgetbasket-two.vercel.app` |
| Preview ("staging") | every open PR | dedicated `budgetbasket_staging` database | unique per-PR URL, posted as a PR comment by the Vercel bot |

**Database isolation:** Production and Preview point at two separate Postgres databases within the same Neon project — `budgetbasket` and `budgetbasket_staging` respectively (`DATABASE_URL` / `DATABASE_URL_UNPOOLED`, set per-environment in Vercel Project Settings → Environment Variables). This means PR previews can never read or write production data.

> **Found and fixed while building this feature (2026-06-26):** this Vercel project's Neon integration was shared with an unrelated project (`cnyfamilybike`), and both Production and Preview were pointed at that same shared `neondb` database, which held the *other* project's tables, not CartWise's. The dedicated `budgetbasket` and `budgetbasket_staging` databases were created within the same Neon project to fix this, and Production/Preview env vars were repointed accordingly. If you provision a fresh Neon project for this app in the future, migrate to that and decommission this workaround.

**Feature flags:** `src/lib/feature-flags.ts` provides `isFeatureEnabled(flag)`, which defaults a flag **on** in Preview/development and **off** in production unless explicitly overridden via a `NEXT_PUBLIC_FEATURE_<FLAG>=true` env var. This lets unreleased features get exercised on every PR preview without a separate release step.

---

## Docker Compose Deployment (Self-Hosted / Staging)

Docker Compose provides a complete self-contained environment with PostgreSQL, pgAdmin, and the Next.js application.

### Prerequisites

- Docker Desktop or Docker Engine + Docker Compose v2

### Start the Environment

```bash
docker compose up --build
```

First run takes 2–3 minutes (downloads images, builds the app). Subsequent starts are faster.

**Services:**
| Service | URL | Notes |
|---|---|---|
| CartWise app | `http://localhost:3000` | Main application |
| PostgreSQL | `localhost:5432` | Internal access only |
| pgAdmin | `http://localhost:8080` | DB browser (dev only) |

### Docker Commands

```bash
# Start in background
docker compose up -d

# View logs
docker compose logs -f app

# Stop
docker compose down

# Full reset (wipe database)
docker compose down -v && docker compose up --build
```

### First-Time Database Setup

After `docker compose up --build`, the database is empty. Run:

```bash
docker compose exec app npm run db:migrate
docker compose exec app npm run db:seed
```

Or use the npm shortcut:

```bash
npm run docker:reset
```

This is equivalent to `docker compose down -v && docker compose up --build` followed by migrate and seed.

### pgAdmin Access

Navigate to `http://localhost:8080`:
- Email: `admin@cartwise.local` (configurable in docker-compose.yml)
- Password: `admin` (configurable in docker-compose.yml)
- Add server: host `postgres`, port `5432`, database `cartwise`, user/password from your `.env`

---

## Environment Variables Reference

### Required

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@localhost:5432/cartwise` |

### Optional / Defaults Provided

| Variable | Description | Default |
|---|---|---|
| `NEXT_PUBLIC_APP_NAME` | App display name shown in UI and health endpoint | `CartWise AI` |
| `NEXT_PUBLIC_APP_VERSION` | Version string | `0.1.0` |
| `NODE_ENV` | `development` or `production` | Set by Next.js automatically |
| `DATABASE_URL_UNPOOLED` | Direct (non-pgbouncer) connection string, used by backup/restore scripts | Falls back to `DATABASE_URL` |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Sentry error monitoring (server/client) — see [RUNBOOK.md](./RUNBOOK.md) | Disabled (no-op) if unset |
| `NEXT_PUBLIC_APP_ENV` | Overrides environment detection for Sentry tagging and feature flags | Falls back to `VERCEL_ENV` / `NODE_ENV` |

### Planned (V1+)

| Variable | Description |
|---|---|
| `NEXTAUTH_URL` | Full URL of the app (e.g. `https://cartwise.ai`) |
| `NEXTAUTH_SECRET` | Random secret for session token signing (generate with `openssl rand -base64 32`) |
| `KROGER_CLIENT_ID` | Kroger OAuth app client ID |
| `KROGER_CLIENT_SECRET` | Kroger OAuth app client secret |
| `IBOTTA_API_KEY` | Ibotta Publisher API key |
| `FLIPP_API_KEY` | Flipp Partner API key |
| `REDIS_URL` | Redis connection string for caching and queues (V2+) |
| `RECEIPT_STORAGE_BUCKET` | S3/R2 bucket name for receipt image uploads (V2+) |

---

## Troubleshooting

### "PrismaClientInitializationError: Can't reach database server"

**Cause:** `DATABASE_URL` is not set or the database is not running.

**Fix:**
```bash
# Verify the variable is set
echo $DATABASE_URL

# For Docker: ensure the postgres container is running
docker compose ps

# For local: check PostgreSQL is running
pg_isready -h localhost -p 5432
```

### "The table `main.Store` does not exist"

**Cause:** Migrations have not been run.

**Fix:**
```bash
npm run db:migrate
npm run db:seed
```

### "Error: P1001 Can't reach database server at `postgres:5432`"

**Cause:** You are running `npm run dev` outside of Docker but `DATABASE_URL` points to the Docker-internal hostname `postgres`.

**Fix:** Change `DATABASE_URL` in your local `.env` to use `localhost:5432` when running outside Docker.

### "Module not found: @prisma/client"

**Cause:** Prisma client has not been generated, or `node_modules` is missing.

**Fix:**
```bash
npm install
npm run db:generate
```

### Build fails on Vercel with "P3009 migrate found failed migrations"

**Cause:** A migration in `prisma/migrations/` has a failed status in the production database.

**Fix:** This requires manual intervention. Connect to the production database via Prisma Studio or psql and check the `_prisma_migrations` table for failed records. Resolve the underlying issue before re-deploying.

### Seed fails with "Unique constraint failed"

**Cause:** Trying to re-seed when data already exists and the seed script lacks upsert for that record.

**Fix:** The seed script uses `upsert` for most records. If a specific record is failing, check the seed script for that entity. Full reset:
```bash
npm run db:reset
```

### "Cannot find module 'tsx'" (during seed)

**Cause:** `tsx` is a devDependency and may not be installed in a production-only install.

**Fix:**
```bash
npm install --include=dev
npm run db:seed
```

---

## Production Checklist

Before announcing a production deployment:

- [ ] `DATABASE_URL` set to a production database (not a dev/local instance)
- [ ] Migrations applied: `npm run db:migrate`
- [ ] Seed data loaded: `npm run db:seed`
- [ ] `GET /api/health` returns `status: "healthy"`
- [ ] `GET /api/stores` returns all 8 expected stores
- [ ] Manual smoke test: enter a shopping list on the `/plan` page and confirm results render
- [ ] `NEXT_PUBLIC_APP_NAME` set to `CartWise AI` (not a test name)
- [ ] No `.env` file or credentials committed to git (`git log --all -- .env` should be empty)
