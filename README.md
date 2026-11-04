# BusinessOS AI

Pakistan-first e-commerce finance and profit intelligence SaaS for small sellers
(Shopify, Daraz, Instagram, Facebook, WhatsApp, own website). Built to PRD v1.0
(2026-11-04) — see `~/workspace/user/files/BusinessOS_AI_Complete_PRD.docx` for the
source of truth. This README is the implementation record: what was built, the
defaults chosen when the user approved the plan without answering questions,
and what is intentionally deferred.

**Defaults applied (user said "yes start" without answering clarifying questions):**

- Stack: TypeScript + Next.js App Router + PostgreSQL (real Postgres, not a mock).
- Currency PKR by default, currency code stored on every financial record;
  timestamps stored in UTC, displayed for Asia/Karachi.
- Shipping charged to the customer is shown **separately, NOT included in net
  sales** by default. Owners can flip this in Settings (`shipping_in_net_sales`).
- Inventory: deduct on **Shipped**, restore on a confirmed return-to-stock
  movement, weighted-average cost, low-stock alerts, negative stock blocked by
  default with an owner override that is written to the audit log.
- AI Accountant: **deterministic grounded layer first, no external LLM call,
  no API key required**. The chat endpoint classifies a question into
  allowlisted tools, runs them tenant-scoped, and explains only those numbers.
  A disabled-by-default LLM adapter (`src/lib/llm.ts`) exists for later; it may
  only rephrase tool outputs and must never compute totals or see SQL.
- Subscription: plan/entitlement placeholder enforced server-side only.
  **No payment gateway.**
- Tax: configurable estimates only, with the disclaimer visible in UI and
  reports. Never a filing or compliance claim.
- Integrations (Shopify, Daraz, couriers, Meta Ads, WhatsApp, bank feeds):
  **CSV/manual workflow + documented placeholder only. No live integration is
  claimed anywhere in the UI.**
- Demo data: a clearly labelled demo workspace only (`scripts/seed-demo.ts`),
  never mixed with real workspaces.
- Email verification / password reset: signed, time-limited token hashes in
  the DB. SMTP FINDING (verified 2026-11-04 by reading the auth code, no mail
  sent): there is currently NO mail transport in the codebase — no mailer
  dependency and no send call anywhere. `src/lib/auth.ts` only has
  `devLogLink()`, which logs the link when `SMTP_HOST` is unset and does
  nothing at all when it is set. So setting `SMTP_*` alone does NOT send
  email; a transport must first be wired to the `devLogLink` call sites in
  `src/app/api/auth/signup/route.ts` and `forgot-password/route.ts`. The
  provider-agnostic variables it should use are `SMTP_HOST`, `SMTP_PORT`,
  `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` (already listed, commented out,
  in `.env.example`). Until then the app never claims an email was sent when
  it was not, and login is not blocked by unverified email — but password
  reset by email cannot work in production.

## Quick start (local, with Postgres)

```bash
cp .env.example .env
# Edit DATABASE_URL and SESSION_SECRET (openssl rand -hex 32)
# Option A — Postgres on this machine:
#   apt install postgresql && sudo -u postgres createuser businessos && createdb businessos
# Option B — Docker:
docker compose up -d db
npm install
npm run db:migrate
npm run dev          # http://localhost:3000
# Optional labelled demo workspace only:
npm run db:seed:demo # demo@businessos.example / Demo1234!
```

Production-style run: `npm run build && npm start` (requires `DATABASE_URL`
and `SESSION_SECRET` in the environment, never in the repo).

## Deploying to Vercel (Supabase attached 2026-11-04; deployment tooling blocked — see step 4)

Vercel project `businessos-ai` (framework nextjs, SSO protection OFF) has
Supabase attached via the Vercel Marketplace integration (Free Plan, store
for the integration). The integration injects `POSTGRES_URL`,
`POSTGRES_URL_NON_POOLING`, `POSTGRES_HOST`, `POSTGRES_USER`,
`POSTGRES_PASSWORD`, `POSTGRES_DATABASE`, `POSTGRES_PRISMA_URL` and the
Supabase API keys as sensitive env vars for preview + production.

Database URL mapping — no secret ever leaves Vercel/Supabase to do this:
`src/lib/db.ts` resolves the connection string as `DATABASE_URL` first,
then `POSTGRES_URL_NON_POOLING`, then `POSTGRES_URL`. Vercel marks
integration secrets "sensitive", meaning they are available to deployments
but can never be read back via the Vercel API (`get_project_env` returns
`decrypted: false` with no value) — so no operator step may depend on
copying that value into a separate `DATABASE_URL` env var. A `SESSION_SECRET`
(sensitive, production + preview) has already been created in the Vercel
project with a fresh random value; the app throws and refuses sessions if it
is missing or shorter than 16 characters — it is never defaulted.

`vercel.json` sets the Vercel build command to
`npm run db:migrate && npm run build`, so migrations run idempotently
(already-applied files are skipped) during the Vercel build, using the
injected Supabase variables. There is deliberately no automatic seeding, so
a deploy cannot silently create demo data in production.

1. Supabase attachment: done in the Vercel dashboard (Muse's Vercel tools
   cannot attach an integration resource).
2. `SESSION_SECRET`: already set in Vercel (sensitive, production + preview).
   `APP_URL` is NOT required for the app to function — it is only used to
   build dev-logged verification/reset links while no SMTP transport exists,
   so no extra redeploy is needed just for it.
3. Deploy (omit any team scope argument; a new project's SSO protection
   defaults on, so it was set to null via update_project for this project).
4. KNOWN DEPLOYMENT BLOCKER (2026-11-04): deploying via the Vercel connector
   wrapper (`vercel call-tool create_deployment` with inlined files) fails
   with "Argument list too long" — the wrapper passes the whole payload as a
   single shell argument (limit ~128 KB), while even the essential source
   alone (src/ + db/ + scripts/) is ~207 KB. This is a tooling limit, not an
   app problem. Working routes are: deploy from a Git repository (requires
   connecting GitHub first — currently not connected), or deploy from the
   Vercel dashboard / a live browser session that can upload the repo.
   Until one of those routes is used, there is no live deployment, and no
   live URL should be claimed.
5. NEVER run `npm run db:seed:demo` against production — it creates a
   known-password demo user (`demo@businessos.example`) and a labelled demo
   workspace, for local pilots only.
6. Email still will not work until a mail transport is wired in (see SMTP
   finding above); set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
   `SMTP_FROM` only once that transport exists.

## Environment variables

See `.env.example` — every variable is documented there. The only required
ones are `DATABASE_URL` and `SESSION_SECRET`. `SMTP_*` does NOT yet enable
real email (see the SMTP finding above — a mail transport still has to be
implemented; the variables to supply when it is are `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`); `LLM_*` stays unset in v1 (see above).
`RATE_LIMIT_*` tune the in-memory rate limiter (single instance; move to
Redis for multi-instance deploys).

## How the code is organised

```
db/migrations/001_init.sql   All tables, FKs, unique constraints, indexes
src/lib/
  db.ts          pg pool, parameterised queries only, transactions, pagination
  money.ts       Decimal money layer — no JS float arithmetic on money
  profit.ts      THE profit engine + COD matching + all DB analytics queries
  ai.ts          Allowlisted AI tools + deterministic explainer + classification
  llm.ts         Disabled LLM adapter (rephrase-only, never computes)
  auth.ts        bcrypt (12 rounds), httpOnly session cookies, token hashes
  tenant.ts      requireMembership + role rules — every route must call it
  validation.ts  zod schemas for every API input + HTML escaping helper
  imports.ts     CSV parser, column auto-mapping, duplicate detection, file hash
  audit.ts       Audit log writer (scrubs passwords/tokens/customer contacts)
  rate-limit.ts  In-memory limiter (pilot scale; Redis note above)
  api-helpers.ts getCtx (auth + membership), JSON body, date-range parsing
src/app/api/     One route file per resource; all tenant routes take ?ws=<workspaceId>
  auth/*         signup/login/logout/me/verify/forgot/reset
  workspaces/*   create/list, settings, team invites, audit log
  products, orders, expenses, inventory, couriers, shipments, settlements
  dashboard, reports (json/csv/xlsx/pdf), ai (+ feedback), imports
src/app/         Pages: landing, login/signup/verify/reset, workspaces/new,
                 dashboard, products, orders, expenses, inventory, cod,
                 reports, imports, ai, settings
src/components/  Shell (sidebar, workspace switcher, DEMO badge), AuthForm helpers
scripts/         migrate.ts, seed-demo.ts
tests/           profit.test.ts, cod-imports-validation.test.ts,
                 tenant-isolation.test.ts (runs against real Postgres when
                 DATABASE_URL is set, otherwise skipped)
public/templates/ CSV templates matching the import wizard
```

## Calculation definitions (single source: `src/lib/profit.ts`)

| Metric | Definition |
|---|---|
| Line gross | qty × unit price |
| Line net | line gross − line discount − line refund |
| Net sales | Σ line net − order discount (+ shipping charged only if `shipping_in_net_sales`) |
| COGS | Σ sold qty × **historic unit-cost snapshot** on the order line |
| Gross profit | net sales − COGS |
| Contribution profit | gross profit − variable expenses (posted, not already-included) |
| Estimated operating profit | contribution profit − operating expenses (posted, not already-included) |
| Profit margin | profit ÷ net sales × 100; **N/A (null) when net sales are zero** |
| COD outstanding | expected COD − matched settlement amounts (Matched/Partial/Short Paid/Overpaid) |
| Inventory value | on-hand × weighted-average cost — labelled **estimate** |

Rules that matter: cancelled/voided orders excluded from sales; Draft orders
excluded from profit totals; only **Posted** expenses count; voided expenses
excluded but retained; an expense flagged `already_included_in_order_cost` is
never counted again; a missing unit cost never gets an invented value — the
line is flagged **Incomplete cost data** and COGS/profit are understated until
the cost is added. Order discounts are counted once per order (not per line)
in trend reports.

## Security model

- Passwords: bcrypt via bcryptjs, 12 rounds. Sessions: random token, SHA-256
  hash stored, httpOnly + SameSite=lax cookie, 30-day expiry.
- Every tenant query includes `workspace_id = $workspaceId` **and** the route
  first checks `workspace_members` (active) — hiding a button is not security.
  Roles: owner (all), admin (settings/team), finance (records/reports/COD),
  operations (orders/products/inventory), viewer (read-only).
- SQL: parameterised queries everywhere; table names in the one generic check
  are allowlisted. Inputs: zod-validated; uploaded files limited to 5 MB and
  to CSV/XLSX; React escapes output by default.
- Secrets: only in environment variables / secret manager, never in code,
  never in git (`.gitignore` excludes `.env`; check with `git log -p` before
  sharing the repo). Courier account references are masked on save.
- Rate limits on auth, API and AI endpoints. Error responses never leak stack
  traces or DB errors; details go to structured server logs only.
- AI: no unrestricted SQL, no PII beyond what the tool needs, tool calls
  logged by metric identifier (not raw prompt content in audit logs),
  feedback stored per message, read-only by construction (no write route is
  reachable from the AI endpoint).

## Performance / scale notes (10,000+ users)

Indexes on `(workspace_id, date)`, `(workspace_id, status)`,
`(workspace_id, sku)`, `(workspace_id, tracking_number)` and audit
`(workspace_id, created_at)`; every list is paginated (max 100/page);
dashboard aggregates are single grouped queries, not per-row loops; money is
`NUMERIC(19,2)` in Postgres and `Decimal` in code. Known scale limit: the
rate limiter and the session store are in-process/in-DB — for multi-instance
deploys move rate limiting to Redis and keep sessions in Postgres (already
the case). Large imports are capped at 5 MB in v1; a background job queue
for very large files is deferred (see below).

## Tests

```bash
npm test   # vitest run
```

Coverage: profit engine (discounts/refunds, void/draft exclusion, missing
cost, zero-sales margin, double-count protection, shipping flag, weighted
average), COD matching outcomes + aging buckets, CSV parsing/auto-mapping/
duplicates/money/date validation, zod rejection of bad input, role rules,
and — against real Postgres — cross-workspace membership denial and
per-workspace SKU uniqueness. **A failing test is never deleted to make the
suite pass; fix the code.**

## Known limitations (honest, not silent)

- No mail transport at all (not just "no SMTP by default"): verification and
  password-reset links are dev-logged only when `SMTP_HOST` is unset, and
  silently sent nowhere when it is set. Setting `SMTP_*` alone changes
  nothing until a transport is wired in — this is the one credential-plus-
  code step still needed for production email (see SMTP finding above).
- No real-time email, webhooks, or background job queue yet.
- Receipt attachments: the `attachments` table exists, but file upload/storage
  (signed URLs, object store) is not wired in v1 — expenses record a reference
  instead. Do not claim receipt upload works end to end.
- XLSX import verified end to end 2026-11-04 (see Tests): a real `.xlsx`
  products file with 1 valid, 1 duplicate, and 1 invalid row previewed as
  total 3 / valid 1 / rejected 2 and committed exactly the 1 valid product;
  a comma-in-value XLSX bug found during that check was fixed and covered by
  `tests/xlsx-import.test.ts`. XLSX export uses the `xlsx` package; PDF
  export is a simple tabular report (pdfkit), not a designed invoice.
- The demo seed uses a fixed demo password for local pilots only; change or
  remove it before any shared deployment.
- Analytics events (PRD §16) are represented by audit/log events, not a
  third-party analytics integration — no financial values or PII are sent to
  any analytics tool.

## Intentionally deferred to Phase 2/3 (no silent omissions)

Shopify/Daraz/courier/Meta Ads/WhatsApp/bank integrations; payroll, HR,
procurement, manufacturing; official tax filing; payment gateway/wallet;
native mobile apps; multi-currency conversion (currency is stored, never
converted without an explicit exchange-rate source); Urdu UI (labels are
kept as plain strings ready for a translation-key pass); background jobs for
large imports/reports; Redis rate limiting; attachment object storage;
forecasting beyond the labelled AI scenario note.
