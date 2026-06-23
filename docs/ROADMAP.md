# CartWise AI — Product Roadmap

**Last Updated:** 2026-06-23
**Current Phase:** MVP

This roadmap is organized by phase, not by date. Timeline estimates are rough and will be refined as user feedback arrives. MVP is the foundation — each subsequent phase adds integration depth, data quality, and surface area based on what users actually need.

---

## Phase 0 — MVP (Current)

**Theme:** Does the core idea work? Can CartWise help someone save money on a grocery run?

**What it is:** A functional demo of the optimization engine with manually-curated seed data for 8 stores. The product is honest about what it is — estimated prices, not live feeds. The goal is to validate the UX, the optimization approach, and user interest before investing in real provider integrations.

### Key Features

- Plain-text shopping list input (free-form, forgiving parser)
- Five optimization modes: Cheapest, One Store, Fastest, Most Verified, Stock Up
- Multi-scenario comparison: all 5 modes computed and displayed simultaneously
- Per-item breakdown: store assignment, base price, effective price, applied discounts, actions required
- Coupon stackability engine: correct application order for mfg coupons, store coupons, and rebates
- Confidence scoring: every price and offer has a labeled confidence level
- UI language scaled to confidence: "Estimated price" vs. "Verified price"
- 8 stores in demo catalog: Walmart, Target, Kroger, Aldi, Wegmans, CVS, Walgreens, Costco
- 50 representative products across 14 categories
- 75 demo opportunities (sales, coupons, rebates, loyalty offers)
- Provider status dashboard: shows which providers are demo vs. pending
- Health endpoint for uptime monitoring
- Vercel + Docker Compose deployment

### What Is Demo vs. Real

- **Engine:** Real. Parser, effective-price, confidence, and optimizer are production-quality code.
- **Data:** Demo. All prices and offers are manually curated estimates, not live feeds.
- **Savings claims:** Estimates only. Labeled clearly as "Demo data — verify before shopping."
- **Providers:** All 12 providers are seed implementations returning hardcoded data.

### Success Metrics

- 100+ unique users complete a shopping list optimization
- Average basket shows meaningful estimated savings (>10% vs. base price)
- User feedback confirms the UX flow is clear and trustworthy
- No critical bugs in effective-price calculation (correctness)

### Estimated Timeline

**Completed.** MVP is live at time of this writing.

---

## Phase 1 — Verified Savings Platform

**Theme:** Replace demo data with real, live data from actual provider APIs. First dollar of real savings.

### Key Features

**Real Kroger API Integration**
- Apply for Kroger Developer API access (developer.kroger.com)
- Live product prices and loyalty card prices
- Real digital coupon catalog
- Confidence upgrades: Kroger prices → OFFICIAL_API (0.95)
- Covers Kroger, Ralphs, Fred Meyer, King Soopers, Smith's, Fry's (~2,700 US stores)

**Flipp Partner API Integration**
- Weekly circular data for all stores Flipp covers (Walmart, Target, Aldi, Publix, Dollar General, regional chains)
- Automatic weekly ad ingestion on Flipp's refresh schedule
- WeeklyAdDeal records populated from real circulars
- Confidence: WEEKLY_AD (0.80)

**Ibotta Publisher API Integration**
- Live manufacturer rebate catalog
- 1,500+ rebate offers across 20+ retailer chains
- Confidence: OFFICIAL_API (0.95) for Ibotta-sourced rebates

**Coupon Network (Quotient / Coupons.com)**
- Live manufacturer digital coupon feed
- Load-to-card and printable coupons
- Cross-referenced with store acceptance data

**Background Ingestion Infrastructure**
- Provider sync jobs run on schedule (Kroger every 15 min, Flipp weekly, Ibotta daily)
- ProviderSyncRun records for monitoring
- Stale data alerts when sync fails for > 2 hours

**Walmart Affiliate API**
- Product pricing and availability
- Note: No coupon/loyalty data via affiliate API

**User Authentication**
- Email magic-link sign-in (NextAuth.js)
- Save and name CartPlans
- User preference persistence across sessions

**Privacy Policy + Terms of Service**
- Published at `/legal/privacy` and `/legal/terms`
- Required before collecting any user account data

### Success Metrics

- 10+ integrations with real provider APIs live
- >80% of top-50 products have a live price from at least 2 stores
- Average plan confidence >= 0.80 (up from ~0.75 demo)
- User-reported "savings realized" count tracked (via post-shop receipt opt-in)
- 1,000+ MAU

### Estimated Timeline

3–5 months post-MVP launch (dependent on API approval timelines, particularly Kroger and Ibotta)

---

## Phase 2 — Account Integrations and Receipts

**Theme:** Know the user. Personalize based on their actual loyalty accounts and purchase history.

### Key Features

**OAuth Account Linking**
- Kroger Plus Card OAuth integration (personalized digital coupons, fuel points balance)
- Target Circle OAuth integration (personalized offers)
- Walgreens myWalgreens OAuth (myWalgreens cash rewards, personalized deals)
- UI: `/integrations` page showing connected accounts and sync status
- Token encryption at rest

**Receipt OCR and Validation**
- Upload receipt (camera or file) after shopping
- OCR parsing via cloud vision API (Google Vision or AWS Textract)
- Price validation: compare receipt prices to CartWise estimates → confidence upgrades
- RECEIPT_VALIDATED (0.90) applied to confirmed prices
- Receipt images deleted after processing (privacy policy compliance)

**Purchase History and Personalization**
- "You always buy this" suggestions based on past receipts
- Brand preference learning (Great Value vs. Tide learned from receipt history)
- "You bought this at $3.49 last time — today it's $3.99 at Kroger" price alerts
- Re-order list from past plans

**Personalized Coupon Matching**
- Match user's linked Kroger digital coupons to items in their shopping list
- Show personalized vs. generic offer distinctly in the UI
- CONNECTED_ACCOUNT (0.93) confidence for personalized offers

**Savings Tracking Dashboard**
- Running total of CartWise-assisted savings by month
- Verified savings (receipt confirmed) vs. estimated savings
- Breakdown by store and by category

### Success Metrics

- >30% of active users link at least one provider account
- >20% of completed shopping trips have a receipt submitted
- Average plan confidence >= 0.88 for users with linked accounts
- User-reported satisfaction score >= 4.2/5 (post-shop survey)
- 10,000+ MAU

### Estimated Timeline

4–6 months post-V1 launch

---

## Phase 3 — Predictive Pantry and Shopping Agent

**Theme:** CartWise knows what you have and what you're running low on. It's not just an optimizer — it's a shopping assistant.

### Key Features

**Pantry Tracking**
- Manual pantry entry (add items, quantities, expiry dates)
- Auto-populate pantry from receipt OCR
- "Running low" alerts (configurable threshold per item)
- Pantry-aware shopping list: suggest items to replenish based on pantry state

**Price History and Buy Signals**
- 90-day price history stored for top products at each store
- "Buy now or wait?" signal: is this item at/near its historical low?
- "Stock up" alerts when an item hits a local minimum price
- Price trend chart on product detail pages

**Route Optimization**
- Given 2–3 stores in the plan, suggest the most efficient route using Maps API
- Integrate with Google Maps / Apple Maps for turn-by-turn directions
- "All in one trip" mode: estimate distance and time cost alongside dollar savings

**Meal Planning Integration**
- User inputs a weekly meal plan (3 dinners, 5 lunches, etc.)
- CartWise extracts ingredient list and generates shopping list automatically
- Optional: suggest meals based on what's on sale this week

**Smart Notifications**
- "Your Kroger coupon for Tide expires Sunday" push notification
- "Kroger fuel points expiring in 3 days" alert
- "Chicken breast is 30% below average this week at Walmart"

**Store Inventory (Beta)**
- Where providers support it, check in-store availability before routing
- Warn users when an item may be out of stock at the assigned store

### Success Metrics

- 50%+ of active users have at least 5 pantry items tracked
- Users who engage with pantry have 2x higher plan-save rate vs. non-pantry users
- "Stock up" buys verified correct at least 75% of the time (price history signal accuracy)
- 50,000+ MAU

### Estimated Timeline

6–9 months post-V2 launch

---

## Phase 4 — Marketplace and Community Intelligence

**Theme:** Users are a data source. Community-reported deals fill gaps official APIs can't cover.

### Key Features

**Community Deal Submission**
- Users can submit deals they find in-store or online
- Photo evidence required for COMMUNITY_REPORT status
- Deals shown to other nearby users immediately (pending)

**Deal Moderation and Verification**
- Moderation queue: deals reviewed by CartWise staff or automated rules
- Community upvote/downvote for deal quality
- Deal elevation: when 5+ users confirm the same deal within 24h → CROWD_VERIFIED tier (est. 0.78)

**Regional Deal Feeds**
- ZIP-code-based filtering for location-specific deals
- "My area" tab showing what's on sale at stores near you
- Regional price comparison: "Milk is $0.50 cheaper in your zip code than the national average"

**Partner Store API Portal**
- Self-service for smaller regional chains to submit their weekly ads directly
- Chain pays a flat monthly fee for distribution; CartWise validates and ingests

**Deal Expiration Intelligence**
- ML model to predict when a deal will expire based on historical patterns
- "This type of deal usually lasts 7 days — submit your receipt by Sunday"

### Success Metrics

- 10,000+ community-submitted deals per month
- 80%+ community deal accuracy rate (verified by receipts)
- 5+ regional grocery chains in partner API portal
- 200,000+ MAU

### Estimated Timeline

6–9 months post-V3 launch (milestone-driven, not purely time-based)

---

## Phase 5 — Enterprise Scale

**Theme:** CartWise is a platform. Build the infrastructure to support millions of users and open the data layer to partners.

### Key Features

**High-Throughput Ingestion Infrastructure**
- Redis for hot-path caching (top products, current opportunities, user sessions)
- BullMQ queue system for background provider sync jobs
- Distributed ingestion workers (horizontal scale by provider)
- Real-time price update pipeline: Kroger price change → WebSocket push to active users
- Data freshness SLAs: no price older than 30 minutes for OFFICIAL_API sources

**Multi-Region Deployment**
- Vercel Edge + read replicas in US-East and US-West
- CDN for static product images and store logos
- Database connection pooling at scale (PgBouncer or Neon branching)

**SOC2 Type I Certification**
- Full audit log coverage
- Vulnerability scanning in CI/CD
- Penetration test by third party
- Employee access controls (SSO, principle of least privilege)
- Formal incident response plan

**Partner API**
- Authenticated API for third-party apps to query CartWise optimization engine
- Rate-limited tiers (free / pro / enterprise)
- Revenue model: usage-based API billing

**Mobile Application**
- React Native (shared types and engine logic from web)
- Barcode scanner: scan a product in-store to see price comparison across stores
- Push notifications for deal alerts and pantry reminders
- Receipt camera integrated into native mobile flow (better UX than web)

**Enterprise Household Plans**
- Multi-household management for large families or shared living situations
- Split shopping lists across household members
- Shared pantry with individual tracking

**Analytics and Reporting**
- Savings dashboard with month-over-month trends
- Category breakdown (how much saved on meat vs. household products)
- Export savings report (CSV, PDF) for personal budgeting

### Success Metrics

- 1M+ MAU
- p95 API response time < 200ms at load
- 99.9% uptime SLA achievable
- SOC2 Type I report issued
- 3+ enterprise API partners paying for data access
- $1M ARR from combined subscription + API revenue

### Estimated Timeline

12–18 months post-V4 launch; this is the "scale-up" phase driven by revenue and growth milestones

---

## What We Are Not Building (For Now)

The following are explicitly out of scope until at least V3, to keep focus:

- **Cryptocurrency payments or rewards** — Out of scope
- **Grocery delivery integration** — Instacart, DoorDash — possible V4+ partner opportunity
- **Restaurant deals** — CartWise is grocery-focused
- **Generic couponing** — CartWise is not a coupon aggregator; coupons are part of the optimization, not the product
- **Competing grocery store pricing tool for retailers** — CartWise is a consumer app, not a B2B analytics platform

---

## Revision History

| Date | Change |
|---|---|
| 2026-06-23 | Initial roadmap published at MVP launch |
