# HealthConnect247 platform

Telemedicine for Nigerian HMOs, employers and state health schemes: a client portal, an admin console, a clinician console and a member app, on one Supabase backend.

## Status

| Part | State |
|---|---|
| Business rules (`packages/core`): pricing, Flex credit, invoices, VAT, phone/date handling | Done, tested |
| Member-list upload validation | Done, tested |
| EMR consultation import (`/admin/imports`) | Done: Excel or CSV upload, client and member matching, ICD-11, re-imports skip duplicates |
| Database schema, access rules and API (`supabase/`) | Done, tested locally (88 checks), applied to the Supabase project |
| Client portal (`apps/web/app/portal`): dashboard, members and upload, consultations and claims export, billing and credit | Done, running on demo data |
| Admin console (`apps/web/app/admin`): overview, clients, client details, members (upload, suspend), billing (create, send and record payments on invoices; Flex top-ups), staff (licences, invitations) | Done, running on demo data |
| Supabase data source and real sign-in | Done: all pages read and write through `app_*` database functions as the signed-in user; email and password sign-in, invitations, password reset |
| Clinician console | Later |
| Member app (`apps/mobile`) | Later |

## Getting started

Requires Node 22+ and pnpm 10.

```bash
pnpm install
pnpm test        # unit tests
pnpm typecheck
pnpm test:db     # migrations + access-rule checks on a throwaway Postgres
```

### Run the web app in demo mode

```bash
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @hc247/web dev
```

Open http://localhost:3000 and pick a demo account: an HMO's head of claims, an HMO claims manager, a Lagos State viewer, the operations manager or finance. Demo mode uses generated sample data (no real people) with "today" fixed at 10 November 2026, so the numbers match the mockups. Member uploads are kept in memory until the server restarts.

### Run against Supabase

Set the Supabase variables in `apps/web/.env.local` (see `.env.example`) and leave `HC247_DEMO_MODE` unset.

## Sites

| Site | Address | Data |
|---|---|---|
| Demo | healthconnect247-demo.vercel.app | Generated sample data (`HC247_DEMO_MODE=true`) |
| Staging | healthconnect247.vercel.app | The current Supabase project (HC247, eu-west-1), made-up test data only (`HC247_SITE=staging` shows a warning on every page) |
| Live | Not set up yet | A new Supabase project on a paid plan with backups, created when going live |

Every push to the branch redeploys the demo and staging sites.

## Setting up the live site

1. **Supabase → Authentication → Sign In / Providers**: turn off "Allow new users to sign up". Accounts are created by invitation only.
2. **Supabase → Authentication → URL Configuration**: set the Site URL to the live address, and add `<live address>/auth/callback` to the redirect URLs.
3. **Hosting settings**: set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SITE_URL`; add `SUPABASE_SECRET_KEY` as a sensitive variable (needed for staff invitations).
4. **First operations admin**: invite yourself from Supabase → Authentication → Users, then give that account the `ops_admin` role (a row in `public.profiles`). After that, staff are invited from the admin console.
5. **Clients**: add each client, its contract and rates (`clients`, `contracts`, `contract_rates`), and its names in the EMR on the client's page.

## Before going live

- Create the Supabase project on a paid plan with backups, and apply `supabase/migrations`.
- Confirm with a lawyer that hosting health data outside Nigeria meets the Nigeria Data Protection Act's cross-border transfer rules, and that member consent covers sharing diagnosis codes with HMOs for claims.
- Confirm the VAT rate (contracts default to 7.5%) with your accountant.

See `CLAUDE.md` for conventions and the privacy rules every change must keep.
