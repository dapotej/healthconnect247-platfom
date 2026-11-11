-- HealthConnect247 foundation schema.
--
-- Conventions
--   * Money is bigint kobo (₦1 = 100 kobo).
--   * Timestamps are timestamptz; business dates are Lagos dates (UTC+01:00).
--   * Row-level security is on for every table. Access rules:
--       - Client users (HMO staff) see only their own organisation's data, and
--         consultations only through public.client_consultations, which never
--         shows therapy diagnoses.
--       - Operations and finance staff see no diagnoses: they read
--         consultations through public.billing_consultations.
--       - GPs and coordinators cannot read therapy consultations; therapists
--         read only therapy; the clinical lead reads all.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- ── Types ───────────────────────────────────────────────────────────────
create type public.client_type as enum ('hmo', 'government', 'employer');
create type public.pricing_model as enum ('payg', 'flex', 'unlimited');
create type public.consultation_type as enum ('coordinator_resolved', 'gp', 'follow_up', 'therapy');
create type public.call_channel as enum ('app_voice', 'app_video', 'toll_free', 'callback');
create type public.call_language as enum ('english', 'yoruba', 'igbo', 'hausa', 'other');
create type public.consultation_outcome as enum
  ('advice', 'prescription', 'lab_test', 'referral', 'session_held', 'callback_booked', 'other');
create type public.billing_method as enum ('credit', 'invoice', 'included');
create type public.member_status as enum ('active', 'suspended');
create type public.ledger_kind as enum ('opening', 'topup', 'usage', 'adjustment');
create type public.invoice_status as enum ('draft', 'sent', 'part_paid', 'paid', 'void');
create type public.app_role as enum (
  'ops_admin', 'finance', 'clinical_lead', 'coordinator', 'gp', 'therapist',
  'client_admin', 'client_finance', 'client_viewer'
);

-- ── Organisations and contracts ─────────────────────────────────────────
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type public.client_type not null,
  is_pilot boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  pricing_model public.pricing_model not null,
  starts_on date not null,
  ends_on date not null,
  platform_fee_kobo bigint not null default 0 check (platform_fee_kobo >= 0),
  pmpm_kobo bigint not null default 0 check (pmpm_kobo >= 0),
  therapy_addon_pmpm_kobo bigint check (therapy_addon_pmpm_kobo >= 0),
  credit_validity_months integer not null default 12 check (credit_validity_months > 0),
  low_balance_threshold_kobo bigint not null default 50000000 check (low_balance_threshold_kobo >= 0),
  vat_rate numeric(5, 4) not null default 0.0750 check (vat_rate between 0 and 1),
  answer_target_seconds integer not null default 60,
  answer_target_share numeric(4, 3) not null default 0.900,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  -- A client has at most one contract in force on any day.
  exclude using gist (client_id with =, daterange(starts_on, ends_on, '[]') with &&)
);

create table public.contract_rates (
  contract_id uuid not null references public.contracts (id) on delete cascade,
  consultation_type public.consultation_type not null,
  rate_kobo bigint not null check (rate_kobo >= 0),
  primary key (contract_id, consultation_type)
);

-- ── Staff and client users ──────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role public.app_role not null,
  client_id uuid references public.clients (id) on delete cascade,
  clinician_licence text,
  created_at timestamptz not null default now(),
  -- Client roles belong to exactly one client; staff roles to none.
  check ((role::text like 'client\_%') = (client_id is not null))
);

-- ── Members ─────────────────────────────────────────────────────────────
create table public.members (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  external_member_id text not null,
  full_name text not null,
  date_of_birth date,
  phone_e164 text not null check (phone_e164 ~ '^\+234[1-9][0-9]{9}$'),
  plan_code text,
  status public.member_status not null default 'active',
  uses_app boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, external_member_id)
);
create index members_phone_idx on public.members (client_id, phone_e164);

create table public.member_imports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  filename text not null,
  uploaded_by uuid references auth.users (id) on delete set null,
  rows_total integer not null,
  added integer not null,
  updated integer not null,
  error_count integer not null,
  created_at timestamptz not null default now()
);

create table public.member_import_errors (
  id bigint generated always as identity primary key,
  import_id uuid not null references public.member_imports (id) on delete cascade,
  row_number integer not null,
  member_name text not null,
  problem text not null
);

-- ── Invoices ────────────────────────────────────────────────────────────
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  number text not null unique,
  period_start date not null,
  period_end date not null,
  status public.invoice_status not null default 'draft',
  subtotal_kobo bigint not null check (subtotal_kobo >= 0),
  vat_kobo bigint not null check (vat_kobo >= 0),
  total_kobo bigint not null check (total_kobo = subtotal_kobo + vat_kobo),
  paid_kobo bigint not null default 0 check (paid_kobo >= 0),
  due_on date,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table public.invoice_lines (
  id bigint generated always as identity primary key,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  description text not null,
  quantity integer not null check (quantity >= 0),
  unit_kobo bigint not null check (unit_kobo >= 0),
  amount_kobo bigint not null check (amount_kobo >= 0),
  consultation_type public.consultation_type
);

-- ── Consultations ───────────────────────────────────────────────────────
create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  member_id uuid not null references public.members (id) on delete restrict,
  contract_id uuid not null references public.contracts (id) on delete restrict,
  source text not null check (source in ('call_centre_import', 'console')),
  external_ref text,
  occurred_at timestamptz not null,
  type public.consultation_type not null,
  channel public.call_channel,
  language public.call_language,
  clinician_name text,
  clinician_licence text,
  icd10_code text check (icd10_code ~ '^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$'),
  diagnosis_label text,
  outcome public.consultation_outcome,
  charge_kobo bigint not null check (charge_kobo >= 0),
  billing public.billing_method not null,
  invoice_id uuid references public.invoices (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (source, external_ref)
);
create index consultations_client_time_idx on public.consultations (client_id, occurred_at);
create index consultations_member_idx on public.consultations (member_id);

create table public.consultation_imports (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  filename text not null,
  imported_by uuid references auth.users (id) on delete set null,
  rows_total integer not null,
  imported integer not null,
  skipped_duplicates integer not null,
  error_count integer not null,
  created_at timestamptz not null default now()
);

create table public.consultation_import_errors (
  id bigint generated always as identity primary key,
  import_id uuid not null references public.consultation_imports (id) on delete cascade,
  row_number integer not null,
  reference text not null,
  problem text not null
);

-- ── Flex credit ledger ──────────────────────────────────────────────────
create table public.credit_ledger (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients (id) on delete restrict,
  occurred_at timestamptz not null,
  kind public.ledger_kind not null,
  amount_kobo bigint not null,
  reference text,
  consultation_id uuid unique references public.consultations (id) on delete restrict,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (kind = 'usage' and amount_kobo < 0)
    or (kind in ('opening', 'topup') and amount_kobo >= 0)
    or kind = 'adjustment'
  )
);
create index credit_ledger_client_idx on public.credit_ledger (client_id, occurred_at);

-- ── Audit log ───────────────────────────────────────────────────────────
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  reason text,
  at timestamptz not null default now()
);

-- ── Access helpers ──────────────────────────────────────────────────────
create function public.current_app_role() returns public.app_role
language sql stable security definer set search_path = ''
as $$ select role from public.profiles where id = auth.uid() $$;

create function public.current_client_id() returns uuid
language sql stable security definer set search_path = ''
as $$ select client_id from public.profiles where id = auth.uid() $$;

create function public.has_role(variadic roles public.app_role[]) returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.current_app_role() = any (roles), false) $$;

-- ── Row-level security ──────────────────────────────────────────────────
alter table public.clients enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_rates enable row level security;
alter table public.profiles enable row level security;
alter table public.members enable row level security;
alter table public.member_imports enable row level security;
alter table public.member_import_errors enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.consultations enable row level security;
alter table public.consultation_imports enable row level security;
alter table public.consultation_import_errors enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.audit_log enable row level security;

-- Clients and contracts
create policy clients_read on public.clients for select to authenticated
  using (public.has_role('ops_admin', 'finance', 'clinical_lead') or id = public.current_client_id());
create policy clients_write on public.clients for all to authenticated
  using (public.has_role('ops_admin')) with check (public.has_role('ops_admin'));

create policy contracts_read on public.contracts for select to authenticated
  using (public.has_role('ops_admin', 'finance') or client_id = public.current_client_id());
create policy contracts_write on public.contracts for all to authenticated
  using (public.has_role('ops_admin', 'finance')) with check (public.has_role('ops_admin', 'finance'));

create policy contract_rates_read on public.contract_rates for select to authenticated
  using (exists (
    select 1 from public.contracts c where c.id = contract_id
      and (public.has_role('ops_admin', 'finance') or c.client_id = public.current_client_id())
  ));
create policy contract_rates_write on public.contract_rates for all to authenticated
  using (public.has_role('ops_admin', 'finance')) with check (public.has_role('ops_admin', 'finance'));

-- Profiles
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_role('ops_admin')
         or (client_id is not null and client_id = public.current_client_id() and public.has_role('client_admin')));
create policy profiles_write on public.profiles for all to authenticated
  using (public.has_role('ops_admin')) with check (public.has_role('ops_admin'));

-- Members: staff who verify callers, and the client's own users
create policy members_read on public.members for select to authenticated
  using (public.has_role('ops_admin', 'finance', 'clinical_lead', 'coordinator', 'gp', 'therapist')
         or client_id = public.current_client_id());
create policy members_insert on public.members for insert to authenticated
  with check (public.has_role('ops_admin')
              or (public.has_role('client_admin') and client_id = public.current_client_id()));
create policy members_update on public.members for update to authenticated
  using (public.has_role('ops_admin')
         or (public.has_role('client_admin') and client_id = public.current_client_id()))
  with check (public.has_role('ops_admin')
              or (public.has_role('client_admin') and client_id = public.current_client_id()));

create policy member_imports_read on public.member_imports for select to authenticated
  using (public.has_role('ops_admin') or client_id = public.current_client_id());
create policy member_imports_insert on public.member_imports for insert to authenticated
  with check (public.has_role('ops_admin')
              or (public.has_role('client_admin') and client_id = public.current_client_id()));
create policy member_import_errors_read on public.member_import_errors for select to authenticated
  using (exists (select 1 from public.member_imports i where i.id = import_id
                 and (public.has_role('ops_admin') or i.client_id = public.current_client_id())));
create policy member_import_errors_insert on public.member_import_errors for insert to authenticated
  with check (exists (select 1 from public.member_imports i where i.id = import_id
                      and (public.has_role('ops_admin')
                           or (public.has_role('client_admin') and i.client_id = public.current_client_id()))));

-- Invoices and credit
create policy invoices_read on public.invoices for select to authenticated
  using (public.has_role('ops_admin', 'finance')
         or (client_id = public.current_client_id() and public.has_role('client_admin', 'client_finance')));
create policy invoices_write on public.invoices for all to authenticated
  using (public.has_role('finance')) with check (public.has_role('finance'));
create policy invoice_lines_read on public.invoice_lines for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id
                 and (public.has_role('ops_admin', 'finance')
                      or (i.client_id = public.current_client_id() and public.has_role('client_admin', 'client_finance')))));
create policy invoice_lines_write on public.invoice_lines for all to authenticated
  using (public.has_role('finance')) with check (public.has_role('finance'));

create policy credit_ledger_read on public.credit_ledger for select to authenticated
  using (public.has_role('ops_admin', 'finance') or client_id = public.current_client_id());
create policy credit_ledger_insert on public.credit_ledger for insert to authenticated
  with check (public.has_role('ops_admin', 'finance'));

-- Consultations: clinical staff only, and never therapy for GPs or coordinators.
create policy consultations_clinical_read on public.consultations for select to authenticated
  using (
    public.has_role('clinical_lead')
    or (public.has_role('gp', 'coordinator') and type <> 'therapy')
    or (public.has_role('therapist') and type = 'therapy')
  );
create policy consultations_insert on public.consultations for insert to authenticated
  with check (public.has_role('ops_admin', 'clinical_lead', 'coordinator', 'gp', 'therapist'));

create policy consultation_imports_read on public.consultation_imports for select to authenticated
  using (public.has_role('ops_admin', 'clinical_lead'));
create policy consultation_imports_insert on public.consultation_imports for insert to authenticated
  with check (public.has_role('ops_admin'));
create policy consultation_import_errors_read on public.consultation_import_errors for select to authenticated
  using (public.has_role('ops_admin', 'clinical_lead'));
create policy consultation_import_errors_insert on public.consultation_import_errors for insert to authenticated
  with check (public.has_role('ops_admin'));

-- Audit log: anyone signed in can record their own actions; only leads read it.
create policy audit_insert on public.audit_log for insert to authenticated
  with check (actor_id = auth.uid());
create policy audit_read on public.audit_log for select to authenticated
  using (public.has_role('ops_admin', 'clinical_lead'));

-- ── Views for people who must not see diagnoses ─────────────────────────
-- These run with the view owner's rights, so each filters rows itself.

-- What a client's portal users see: their own consultations, no therapy diagnoses.
create view public.client_consultations with (security_barrier = true) as
select
  c.id, c.client_id, c.occurred_at, c.type, c.channel, c.language,
  m.external_member_id, m.full_name as member_name,
  c.clinician_name, c.clinician_licence,
  case when c.type = 'therapy' then null else c.icd10_code end as icd10_code,
  case when c.type = 'therapy' then null else c.diagnosis_label end as diagnosis_label,
  c.outcome, c.charge_kobo, c.billing, c.invoice_id, c.external_ref
from public.consultations c
join public.members m on m.id = c.member_id
where c.client_id = public.current_client_id();

-- What operations and finance see: everything needed for billing, no diagnoses.
create view public.billing_consultations with (security_barrier = true) as
select
  c.id, c.client_id, c.member_id, c.contract_id, c.occurred_at, c.type, c.channel, c.language,
  c.clinician_name, c.outcome, c.charge_kobo, c.billing, c.invoice_id, c.source, c.external_ref
from public.consultations c
where public.has_role('ops_admin', 'finance');

-- Current Flex credit balance per client.
create view public.client_credit_balances with (security_barrier = true) as
select l.client_id, sum(l.amount_kobo)::bigint as balance_kobo
from public.credit_ledger l
where public.has_role('ops_admin', 'finance') or l.client_id = public.current_client_id()
group by l.client_id;

revoke all on public.client_consultations, public.billing_consultations, public.client_credit_balances from anon;
grant select on public.client_consultations, public.billing_consultations, public.client_credit_balances to authenticated;
