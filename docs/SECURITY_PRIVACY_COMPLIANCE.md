# CartWise AI — Security, Privacy, and Compliance

**Status:** Seed stage — foundational controls in place, SOC2-ready list identified for V3+

---

## Guiding Principles

1. **Collect only what you need.** CartWise does not require users to provide personal information to use the core product. Email is optional. No payment data is ever collected.
2. **Be honest about data quality.** Every price shown carries a confidence level. Demo data is labeled as demo.
3. **No credential scraping, ever.** CartWise integrates with providers through official OAuth or API partnerships only.
4. **Delete what you no longer need.** Receipt images are deleted after OCR processing. Optimization results expire.

---

## Secrets and Configuration Management

### Policy: No Plaintext Secrets

All credentials, API keys, and database connection strings are stored as environment variables. They are never:
- Committed to version control (`.env` is in `.gitignore`)
- Logged to stdout/stderr in production
- Included in client-side bundles (Next.js `NEXT_PUBLIC_` prefix is required for any client-exposed variable)

### Environment Variables (Production)

| Variable | Sensitivity | Notes |
|---|---|---|
| `DATABASE_URL` | High | Full connection string including password; Vercel encrypts at rest |
| `NEXTAUTH_SECRET` | High | Used for session token signing (V2) |
| `KROGER_CLIENT_ID` | High | OAuth client ID for Kroger API (V1) |
| `KROGER_CLIENT_SECRET` | High | OAuth client secret (V1) |
| `IBOTTA_API_KEY` | High | Publisher API key (V1) |
| `NEXT_PUBLIC_APP_NAME` | Low | Safe to expose to client |
| `NEXT_PUBLIC_APP_VERSION` | Low | Safe to expose to client |

### Secret Rotation

API keys and OAuth secrets should be rotated when:
- A team member with access leaves the company
- A key is accidentally committed to git
- A provider requires it (e.g. annual rotation policy)

Vercel environment variables can be updated without redeployment for most secret types.

---

## Authentication and Authorization

### MVP (Current)

The MVP has no user authentication. All API endpoints are publicly accessible. This is intentional for the demo phase — friction-free exploration of the product. No user data is persisted in the MVP demo flow.

### V1: Session-Based Auth (Planned)

NextAuth.js with email/magic-link sign-in. No passwords stored. Sessions stored as HTTP-only cookies with `sameSite: strict`.

### V2: OAuth 2.0 for Provider Account Linking

When users link a store account (Kroger, Target, etc.):

1. User clicks "Connect Kroger" in the integrations UI
2. CartWise initiates an OAuth 2.0 Authorization Code flow — user is redirected to Kroger's own login page
3. CartWise never sees the user's Kroger password
4. Kroger returns an authorization code; CartWise exchanges it for `access_token` and `refresh_token`
5. Tokens are stored encrypted in the `ProviderConnection` table
6. CartWise uses the access token only to fetch prices and personalized offers on the user's behalf

**Token encryption:** Access and refresh tokens are encrypted using AES-256 before storage, with the encryption key stored separately from the database (environment variable). This ensures database-level access does not expose tokens in plaintext.

**Token revocation:** Users can disconnect a provider at any time via the integrations UI. CartWise deletes the stored tokens and revokes the OAuth session with the provider where the API supports it.

---

## No Credential Scraping Policy

CartWise will not, under any circumstances:

- Ask users for their store account username and password
- Store credentials provided to CartWise for use in automated login
- Use browser automation or Puppeteer/Playwright to log into retailer websites on behalf of users
- Bypass CAPTCHA, 2FA, or other authentication mechanisms
- Use undocumented internal APIs (e.g. reverse-engineered mobile app APIs) without written permission

This policy exists for three reasons:
1. **Legal:** Violates the Computer Fraud and Abuse Act (CFAA) and relevant state statutes under most legal interpretations
2. **ToS:** Violates terms of service for virtually all retailers, creating grounds for being blocked or sued
3. **Security:** Storing user credentials creates catastrophic liability if breached

This policy is documented in `PROVIDER_INTEGRATION_STRATEGY.md` as well.

---

## PII Handling

### What CartWise Collects

| Data Element | Required | Retention | Notes |
|---|---|---|---|
| Email address | No (optional) | Until account deletion | Used only for magic-link auth and plan sharing |
| Name | No | Until account deletion | Display purposes only |
| Shopping list text | Yes (for optimization) | 30 days if saved, session only if not | Saved plans stored; unsaved results are session-only |
| Household size | No | Until changed/deleted | Used to calibrate "per-unit" buying suggestions |
| ZIP code | No | Until changed/deleted | Used for regional store/deal filtering |
| Receipt images | Yes (if receipt feature used) | **Deleted after OCR processing** | Not stored permanently; see receipt privacy below |
| Provider OAuth tokens | Only if account linking used | Encrypted; deleted on disconnect | Never stored in plaintext |

### What CartWise Does Not Collect

- Credit card or debit card numbers
- Bank account information
- Purchase transaction history from card networks
- Physical location beyond ZIP code
- Device identifiers or persistent device fingerprints (MVP)

### Children's Privacy

CartWise is not directed at children under 13. No COPPA-specific data collection controls are implemented in MVP; this is acceptable for a seed-stage B2C app with no advertising. V3 will add explicit age gate if household features expand.

---

## Receipt Privacy

Receipt images contain sensitive financial information (store visited, items purchased, prices paid, total spend). CartWise handles them as follows:

1. **Upload only if opted in:** Users explicitly tap "Scan Receipt" to initiate upload. No background collection.
2. **HTTPS only:** Images are transmitted over TLS. Never sent over HTTP.
3. **Process and delete:** After OCR parsing, the original image is deleted from storage. CartWise retains only the structured output (line items, prices, store name, date).
4. **No cross-user sharing:** Receipt data is never aggregated or shared across users, even in anonymized form, without explicit consent.
5. **Retention:** Parsed receipt line items are retained to build purchase history (V3 feature). Users can delete their receipt history at any time.

---

## Data Retention Policy

| Data Type | Default Retention | User Control |
|---|---|---|
| Anonymous optimization results | Session only | N/A |
| Saved CartPlan | 90 days from last access | Delete at any time |
| Receipt images | Deleted after OCR (minutes) | N/A — auto-deleted |
| Receipt line items | 12 months | Delete all at any time |
| Pantry items | Until manually removed | Full control |
| Provider tokens | Until account disconnect | Revoke at any time |
| Audit logs | 12 months | Cannot delete (compliance) |
| Account/profile data | Until account deletion | Request deletion |

Account deletion: Users can request account deletion via the profile page. All associated PII, saved plans, and pantry data are deleted within 30 days. Anonymized aggregate data may be retained.

---

## Provider Terms Compliance

### Kroger API

Use of Kroger Developer API data is subject to Kroger's API Terms of Service. Key restrictions:
- Product and price data may only be used within the CartWise application
- Data may not be resold or shared with third parties
- Rate limits must be respected
- Attribution required in UI (e.g. "Prices from Kroger")

### Flipp

Flipp partner data is licensed for use in the CartWise application only. Weekly ad images and deal details may not be cached for more than 7 days without refreshing from Flipp's feed.

### Ibotta Publisher API

Ibotta data may only be used to facilitate Ibotta rebate redemptions through the CartWise app. CartWise may not use Ibotta data to build a competing rebate tracking product.

---

## Audit Logging

The `AuditLog` table records key user and system actions. Logged events include:

- `OPTIMIZE_BASKET` — User submitted a shopping list for optimization
- `SAVE_PLAN` — User saved a CartPlan
- `CONNECT_PROVIDER` — User connected a provider account
- `DISCONNECT_PROVIDER` — User disconnected a provider account
- `UPLOAD_RECEIPT` — User submitted a receipt image
- `DELETE_ACCOUNT` — User requested account deletion
- `ADMIN_OVERRIDE` — Admin modified data directly

Each log record captures: `userId`, `action`, `entityType`, `entityId`, `ipAddress`, `userAgent`, `metadata`, `createdAt`.

Audit logs are write-only from the application layer. They can only be deleted by a direct database administrator action with a documented reason.

---

## Rate Limiting (Planned — V1)

To prevent abuse of the optimization engine (which is the most compute-intensive endpoint):

- **`POST /api/optimize`:** 20 requests per IP per minute
- **All endpoints:** 500 requests per IP per hour
- Implementation: Redis sliding window counter in V1; in MVP, no rate limiting is active

---

## Future SOC2-Ready Controls

The following controls are identified for implementation in preparation for a SOC2 Type I audit (target: V3/V4 timeline):

| Control | Status | Target Phase |
|---|---|---|
| Secrets management (vault or KMS) | Partial (env vars) | V2 |
| Token encryption at rest | Planned | V2 |
| Audit log immutability | Partial (write-only app layer) | V2 |
| TLS 1.2+ enforcement | Vercel default | Current |
| Rate limiting | Planned | V1 |
| Input validation (Zod) | Implemented | Current |
| SQL injection prevention (Prisma ORM) | Implemented | Current |
| Dependency vulnerability scanning | Not yet | V1 |
| CSP / security headers | Not yet | V1 |
| Penetration testing | Not yet | V3 |
| Employee access controls | Not yet | V2 |
| Backup and disaster recovery | Not yet | V2 |
| Incident response plan | Not yet | V2 |
| Privacy policy published | Not yet | V1 (launch) |
| Terms of service published | Not yet | V1 (launch) |

---

## GDPR and CCPA Considerations

CartWise is initially US-only. However, GDPR and CCPA principles are adopted proactively:

**GDPR (if/when serving EU users):**
- **Lawful basis:** Legitimate interest (optimization service) or explicit consent for analytics
- **Right to erasure:** Account deletion flow removes all PII within 30 days
- **Data portability:** Users can export their saved plans and pantry data (V2)
- **DPA:** Data Processing Agreement template needed before any EU data is processed

**CCPA (California):**
- **No sale of personal data:** CartWise does not sell personal data to third parties
- **Right to know / right to delete:** Handled by account deletion flow
- **Disclosure:** Privacy policy (V1 launch requirement) must list data categories collected

---

## Reporting a Security Issue

Security vulnerabilities should be reported to the engineering team via email (address to be published at launch). Do not file public GitHub issues for security bugs. We target a 48-hour acknowledgment and 14-day remediation for critical issues.
