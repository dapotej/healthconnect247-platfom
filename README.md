# HealthConnect247 platform

Telemedicine for Nigerian HMOs, employers and state health schemes: a client portal, an admin console, a clinician console and a member app, on one Supabase backend.

## Status

| Part | State |
|---|---|
| Business rules (`packages/core`): pricing, Flex credit, invoices, VAT, phone/date handling | Done, tested |
| Member-list upload validation | Done, tested |
| Call-centre export import | Parser done with guessed column names; waiting for a real export sample |
| Database schema and access rules (`supabase/`) | Done, tested locally |
| Client portal (`apps/web/app/portal`): dashboard, members and upload, consultations and claims export, billing and credit | Done, running on demo data |
| Admin console (`apps/web/app/admin`): overview, clients, client details, members (upload, suspend), billing (create, send and record payments on invoices; Flex top-ups), staff (licences, invitations) | Done, running on demo data |
| Supabase data source and real sign-in | Next, once the Supabase project exists |
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

## Before going live

- Create the Supabase project on a paid plan with backups, and apply `supabase/migrations`.
- Confirm with a lawyer that hosting health data outside Nigeria meets the Nigeria Data Protection Act's cross-border transfer rules, and that member consent covers sharing diagnosis codes with HMOs for claims.
- Confirm the VAT rate (contracts default to 7.5%) with your accountant.

See `CLAUDE.md` for conventions and the privacy rules every change must keep.
