# CartWise AI

**AI-powered grocery savings, coupon optimization, and smart shopping planning.**

CartWise AI is an open-source grocery savings platform that finds the best prices across stores, stacks coupons and rebates intelligently, and helps you save money on every shopping trip — while being honest about what's verified and what's estimated.

[![CI](https://github.com/Coding-Krakken/BudgetBasket/actions/workflows/ci.yml/badge.svg)](https://github.com/Coding-Krakken/BudgetBasket/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-target%2080%25-brightgreen.svg)](docs/TESTING_STRATEGY.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Features

- **Multi-store basket optimization** — Split your list across stores for maximum savings
- **5 optimization modes** — Cheapest, One Store, Fastest, Best Verified, Stock Up
- **Honest confidence scoring** — Every deal labeled: Cart Verified, Official API, Demo Data
- **Coupon stacking engine** — Manufacturer + store coupons + rebates + loyalty calculated together
- **Deal discovery** — Browse current sales, coupons, rebates, and weekly ad deals
- **Pantry tracking** — Track inventory, predict restocking needs, reduce waste
- **Provider abstraction** — Ready for real API integrations (Kroger, Walmart, Ibotta)

---

## Quick Start

### Prerequisites

- Node.js 22+
- PostgreSQL 16 (or use Docker Compose)
- npm 10+

### Local Development (5 commands)

```bash
git clone https://github.com/Coding-Krakken/BudgetBasket.git
cd BudgetBasket
npm install
cp .env.example .env        # Then edit DATABASE_URL
npm run db:migrate && npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### With Docker (no PostgreSQL required)

```bash
git clone https://github.com/Coding-Krakken/BudgetBasket.git
cd BudgetBasket
cp .env.example .env
docker compose up -d
docker compose run --rm migrate
docker compose exec app npm run db:seed
```

Open [http://localhost:3000](http://localhost:3000)

---

## Demo

The MVP ships with **demo/seed data** — 8 stores, 52 products, 75+ deals across all opportunity types.

Try optimizing this list on the `/plan` page:
```
milk, eggs, chicken breast, Cheerios, bananas, laundry detergent
```

---

## Architecture

```
src/
├── app/              # Next.js App Router pages + API routes
│   ├── api/          # 6 API routes (optimize, opportunities, stores, products, health, providers)
│   ├── plan/         # Shopping plan + optimizer UI
│   ├── discover/     # Browse deals and coupons
│   ├── pantry/       # Pantry inventory management
│   ├── profile/      # User preferences + savings history
│   └── admin/        # Provider health + sync status
├── engine/           # Core optimization logic
│   ├── optimizer.ts  # Basket optimizer (5 modes)
│   ├── effective-price.ts  # Coupon stacking calculator
│   ├── confidence.ts # Confidence scoring system
│   └── parser.ts     # Shopping list parser + fuzzy matching
├── providers/        # Provider abstraction + seed providers
│   ├── base.ts       # BaseProvider abstract class
│   ├── registry.ts   # Provider registry + health summary
│   └── seed/         # 12 demo providers
└── types/            # Shared TypeScript types
prisma/
├── schema.prisma     # 20+ model database schema
└── seed.ts           # Seed script (8 stores, 52 products, 75+ deals)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full architecture guide.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 App Router |
| Language | TypeScript (strict mode) |
| Database | PostgreSQL 16 + Prisma ORM |
| Styling | Tailwind CSS + Radix UI |
| Validation | Zod |
| Testing | Vitest (unit) + Playwright (e2e) |
| Deployment | Vercel or Docker |

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required
DATABASE_URL="postgresql://user:password@localhost:5432/cartwise"
NEXTAUTH_SECRET="your-secret-here"
NEXTAUTH_URL="http://localhost:3000"

# Optional — real provider integrations
KROGER_CLIENT_ID=""
KROGER_CLIENT_SECRET=""
WALMART_AFFILIATE_KEY=""
IBOTTA_PUBLISHER_TOKEN=""

# Optional — observability
SENTRY_DSN=""

# Required for Docker cron jobs
CRON_SECRET=""
```

---

## npm Scripts

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint
npm run typecheck    # TypeScript type checking
npm run test         # Run unit tests (Vitest)
npm run test:integration # Run PostgreSQL-backed integration tests
npm run test:e2e     # Run e2e tests (Playwright)

npm run db:generate  # Generate Prisma client
npm run db:migrate   # Run database migrations
npm run db:push      # Push schema to local/test database
npm run db:seed      # Seed demo data

docker compose up -d        # Start app + database
docker compose down         # Stop containers
```

---

## Testing

The MVP includes unit, integration, and e2e coverage:

- `src/engine/*.test.ts` — parser, confidence, effective price, and optimizer unit tests
- `src/providers/*.test.ts` — provider contract and sync unit tests
- `src/**/*.integration.test.ts` — API route and provider sync tests against PostgreSQL
- `tests/e2e/*.spec.ts` — browser smoke coverage for the planner

Run tests:
```bash
npm run test              # Unit tests
npm run test:integration  # Requires DATABASE_URL and an applied Prisma schema
npm run test:e2e          # Browser tests
```

---

## Deployment

### Vercel (Recommended)

1. Fork this repository
2. Import to [Vercel](https://vercel.com)
3. Add environment variables
4. Deploy

Vercel auto-detects Next.js. No Docker needed.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for full deployment guide including Docker, environment variables, and production checklist.

---

## Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture, request flow, component design |
| [DATA_MODEL.md](docs/DATA_MODEL.md) | Full database schema with field tables and relationships |
| [OPTIMIZATION_ENGINE.md](docs/OPTIMIZATION_ENGINE.md) | How the optimizer works, all 5 modes, worked examples |
| [OFFER_CONFIDENCE_AND_VALIDATION.md](docs/OFFER_CONFIDENCE_AND_VALIDATION.md) | Confidence scoring system, 9 levels, UI language guide |
| [PROVIDER_INTEGRATION_STRATEGY.md](docs/PROVIDER_INTEGRATION_STRATEGY.md) | Provider abstraction, approved integration paths per retailer |
| [API_SPEC.md](docs/API_SPEC.md) | Full API reference with request/response schemas |
| [SECURITY_PRIVACY_COMPLIANCE.md](docs/SECURITY_PRIVACY_COMPLIANCE.md) | Security model, privacy policy design, compliance notes |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Step-by-step deployment guide for Vercel and Docker |
| [TESTING_STRATEGY.md](docs/TESTING_STRATEGY.md) | Testing pyramid, test inventory, coverage targets |
| [ROADMAP.md](docs/ROADMAP.md) | 6-phase roadmap from MVP to enterprise scale |

---

## Roadmap

| Phase | Milestone | Key Features |
|-------|-----------|--------------|
| ✅ MVP | Stabilization | Optimizer, 5 modes, demo data, 62 tests |
| 🔜 V1 | Verified Savings | Kroger API, Flipp weekly ads, real coupon data |
| 📋 V2 | Account Integrations | OAuth linking, receipt OCR, savings history |
| 🔭 V3 | Predictive Pantry | Price history, buy-now-or-wait, meal planning |
| 🚀 V4 | Community Intelligence | Deal reporting, voting, receipt validation |
| 🏢 V5 | Enterprise Scale | Subscription, partner API, B2B data |

View all [98 open issues on GitHub](https://github.com/Coding-Krakken/BudgetBasket/issues).

---

## Legal & Compliance

CartWise AI does not:
- Scrape retailer websites in violation of ToS
- Bypass authentication or anti-bot protections
- Store or misuse retailer credentials
- Claim offers are guaranteed unless validated

All prices are clearly labeled with confidence levels. Demo data is marked as such. Real integrations will use official APIs and user-authorized OAuth connections.

See [SECURITY_PRIVACY_COMPLIANCE.md](docs/SECURITY_PRIVACY_COMPLIANCE.md) for full details.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, PR process, and adding new providers.

---

## License

MIT License — see [LICENSE](LICENSE) for details.
