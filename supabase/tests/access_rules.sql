-- Checks that row-level security enforces who can see what.
-- Runs after supabase/seed.sql. Any failed check raises an error.

create schema tests;
grant usage on schema tests to authenticated;

create function tests.expect(label text, actual bigint, expected bigint) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAILED: % (expected %, got %)', label, expected, actual;
  end if;
  raise notice 'ok: %', label;
end $$;
grant execute on function tests.expect(text, bigint, bigint) to authenticated;

-- Act as a signed-in user.
create function tests.login(user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', user_id::text, false);
  execute 'set role authenticated';
end $$;

-- ── Fixtures (as the database owner) ────────────────────────────────────
insert into auth.users (id) values
  ('a0000000-0000-0000-0000-000000000001'), -- [HMO A] client admin
  ('b0000000-0000-0000-0000-000000000001'), -- [HMO B] client viewer
  ('c0000000-0000-0000-0000-000000000001'), -- GP
  ('c0000000-0000-0000-0000-000000000002'), -- therapist
  ('c0000000-0000-0000-0000-000000000003'), -- clinical lead
  ('c0000000-0000-0000-0000-000000000004'), -- coordinator
  ('d0000000-0000-0000-0000-000000000001'), -- operations admin
  ('d0000000-0000-0000-0000-000000000002'); -- finance

insert into public.profiles (id, full_name, role, client_id) values
  ('a0000000-0000-0000-0000-000000000001', 'HMO A admin', 'client_admin', '00000000-0000-0000-0000-0000000000a1'),
  ('b0000000-0000-0000-0000-000000000001', 'HMO B viewer', 'client_viewer', '00000000-0000-0000-0000-0000000000b1'),
  ('c0000000-0000-0000-0000-000000000001', 'GP', 'gp', null),
  ('c0000000-0000-0000-0000-000000000002', 'Therapist', 'therapist', null),
  ('c0000000-0000-0000-0000-000000000003', 'Clinical lead', 'clinical_lead', null),
  ('c0000000-0000-0000-0000-000000000004', 'Coordinator', 'coordinator', null),
  ('d0000000-0000-0000-0000-000000000001', 'Ops', 'ops_admin', null),
  ('d0000000-0000-0000-0000-000000000002', 'Finance', 'finance', null);

insert into public.members (id, client_id, external_member_id, full_name, phone_e164) values
  ('e0000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'HC-100001', 'Bisi Adebayo', '+2348034567812'),
  ('e0000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'HB-200001', 'Emeka Obi', '+2348050003341');

insert into public.consultations
  (client_id, member_id, contract_id, source, external_ref, occurred_at, type, icd10_code, diagnosis_label, charge_kobo, billing)
values
  ('00000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1',
   'call_centre_import', 'C-1', '2026-11-10 21:12+01', 'gp', 'I10', 'Hypertension', 380000, 'credit'),
  ('00000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1',
   'call_centre_import', 'C-2', '2026-11-10 19:48+01', 'therapy', 'F41.1', 'Anxiety', 1000000, 'credit'),
  ('00000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1',
   'call_centre_import', 'C-3', '2026-11-10 18:05+01', 'gp', 'B54', 'Malaria', 450000, 'invoice');

insert into public.credit_ledger (client_id, occurred_at, kind, amount_kobo, reference) values
  ('00000000-0000-0000-0000-0000000000a1', '2026-11-01 09:00+01', 'topup', 500000000, 'TOP-0033');

insert into public.invoices (client_id, number, period_start, period_end, subtotal_kobo, vat_kobo, total_kobo) values
  ('00000000-0000-0000-0000-0000000000b1', 'INV-0142', '2026-10-01', '2026-10-31', 310000000, 23250000, 333250000);

-- ── Schema rules ────────────────────────────────────────────────────────
do $$
begin
  insert into public.contracts (client_id, pricing_model, starts_on, ends_on)
  values ('00000000-0000-0000-0000-0000000000a1', 'payg', '2026-12-01', '2027-02-28');
  raise exception 'FAILED: overlapping contracts were allowed';
exception when exclusion_violation then
  raise notice 'ok: a client cannot have two contracts in force on the same day';
end $$;

-- ── [HMO A] client admin ────────────────────────────────────────────────
select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.expect('client sees only its own organisation', (select count(*) from public.clients), 1);
select tests.expect('client sees only its own members', (select count(*) from public.members), 1);
select tests.expect('client cannot read the consultations table directly', (select count(*) from public.consultations), 0);
select tests.expect('client sees its own consultations in the portal view', (select count(*) from public.client_consultations), 2);
select tests.expect('client never sees therapy diagnoses',
  (select count(*) from public.client_consultations where type = 'therapy' and (icd10_code is not null or diagnosis_label is not null)), 0);
select tests.expect('client sees GP diagnosis codes for claims',
  (select count(*) from public.client_consultations where type = 'gp' and icd10_code = 'I10'), 1);
select tests.expect('client sees its credit balance', (select balance_kobo from public.client_credit_balances), 500000000);
select tests.expect('client cannot see billing view', (select count(*) from public.billing_consultations), 0);
do $$
begin
  insert into public.members (client_id, external_member_id, full_name, phone_e164)
  values ('00000000-0000-0000-0000-0000000000b1', 'X-1', 'Not mine', '+2348000000001');
  raise exception 'FAILED: client added a member to another client';
exception when insufficient_privilege then
  raise notice 'ok: client cannot add members to another client';
end $$;
reset role;

-- ── [HMO B] viewer ──────────────────────────────────────────────────────
select tests.login('b0000000-0000-0000-0000-000000000001');
select tests.expect('viewer sees its own consultations', (select count(*) from public.client_consultations), 1);
select tests.expect('viewer role cannot see invoices', (select count(*) from public.invoices), 0);
select tests.expect('viewer sees no other client credit', (select count(*) from public.client_credit_balances), 0);
reset role;

-- ── Clinical staff ──────────────────────────────────────────────────────
select tests.login('c0000000-0000-0000-0000-000000000001');
select tests.expect('GP sees non-therapy consultations', (select count(*) from public.consultations), 2);
select tests.expect('GP sees no therapy consultations', (select count(*) from public.consultations where type = 'therapy'), 0);
select tests.expect('GP cannot see invoices', (select count(*) from public.invoices), 0);
reset role;

select tests.login('c0000000-0000-0000-0000-000000000002');
select tests.expect('therapist sees only therapy', (select count(*) from public.consultations), 1);
reset role;

select tests.login('c0000000-0000-0000-0000-000000000003');
select tests.expect('clinical lead sees all consultations', (select count(*) from public.consultations), 3);
reset role;

select tests.login('c0000000-0000-0000-0000-000000000004');
select tests.expect('coordinator can verify members of every client', (select count(*) from public.members), 2);
select tests.expect('coordinator sees no therapy consultations', (select count(*) from public.consultations where type = 'therapy'), 0);
reset role;

-- ── Operations and finance ──────────────────────────────────────────────
select tests.login('d0000000-0000-0000-0000-000000000001');
select tests.expect('ops cannot read diagnoses in the consultations table', (select count(*) from public.consultations), 0);
select tests.expect('ops sees every consultation in the billing view', (select count(*) from public.billing_consultations), 3);
select tests.expect('ops sees every client', (select count(*) from public.clients), 5);
reset role;

select tests.login('d0000000-0000-0000-0000-000000000002');
select tests.expect('finance sees invoices', (select count(*) from public.invoices), 1);
select tests.expect('finance cannot read diagnoses', (select count(*) from public.consultations), 0);
reset role;

-- ── Signed out ──────────────────────────────────────────────────────────
do $$
begin
  set local role anon;
  perform 1 from public.client_consultations;
  raise exception 'FAILED: signed-out users could query the portal view';
exception when insufficient_privilege then
  raise notice 'ok: signed-out users cannot read the portal view';
end $$;
reset role;
