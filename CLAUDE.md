# HealthConnect247 platform

Telemedicine platform for Nigerian HMOs, employers and state health schemes.
Four products share one backend:

1. **Client portal** (HMO staff): members, usage, consultations/claims export, billing and credit.
2. **Admin console** (our operations and finance team): clients, contracts, members, invoices, staff.
3. **Clinician console** (coordinators, GPs, therapists): call queue, consultations, prescriptions.
4. **Member app** (Expo, Android and iPhone): calls, visit summaries, care plan.

Build order: backend and call-centre import → client portal + admin minimum → clinician console → member app.

## Layout

- `packages/core` – pure TypeScript business rules (pricing, credit, invoicing, imports). No I/O. Fully unit-tested.
- `supabase/migrations` – database schema and row-level security. `supabase/seed.sql` is sample data only.
- `supabase/tests` – local stand-ins for Supabase auth plus access-rule checks.
- `apps/web` (next) – Next.js app hosting the portal, admin and clinician console.
- `apps/mobile` (later) – Expo member app.

## Commands

- `pnpm install`
- `pnpm test` – unit tests (vitest)
- `pnpm typecheck`
- `pnpm test:db` – applies migrations to a throwaway Postgres and checks access rules (needs Postgres 15+ binaries)

Run all three before committing changes to `packages/core` or `supabase/`.

## Rules that must not be broken

- **Money is integer kobo** (`bigint` in SQL, `Kobo` in TS). Never store or compute with floating-point naira. Format only for display (`formatNaira`).
- **Lagos time**: business dates are Lagos calendar dates (UTC+01:00, no DST). Use `lagosDate()`, never the server's local date.
- **Patient privacy (Nigeria Data Protection Act)**:
  - Client (HMO) users read consultations only via `public.client_consultations`. Therapy diagnoses are never shown to them.
  - Operations and finance read consultations only via `public.billing_consultations` (no diagnoses).
  - GPs and coordinators never see therapy consultations.
  - Clinical notes are never exposed to the client portal.
  - Every new table gets row-level security and a check in `supabase/tests/access_rules.sql`.
- Never commit real member or patient data, exports or `.env` files.
- Pricing models: `payg` (platform fee + per-consultation invoice), `flex` (prepaid credit, deducted per consultation), `unlimited` (per member per month; therapy only with the add-on). Rates live in `contract_rates`; don't hard-code prices.
