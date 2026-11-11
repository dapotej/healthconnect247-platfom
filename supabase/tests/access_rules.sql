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

-- Expect a statement to be refused for lack of privileges.
create function tests.expect_denied(label text, statement text) returns void
language plpgsql as $$
begin
  execute statement;
  raise exception 'FAILED: % (statement was allowed)', label;
exception when insufficient_privilege then
  raise notice 'ok: %', label;
end $$;
grant execute on function tests.expect_denied(text, text) to anon, authenticated;

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
  (client_id, member_id, contract_id, source, external_ref, occurred_at, type, diagnosis_code, diagnosis_label, charge_kobo, billing)
values
  ('00000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1',
   'call_centre_import', 'C-1', '2026-11-10 21:12+01', 'gp', 'BA00', 'Essential hypertension', 380000, 'credit'),
  ('00000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1',
   'call_centre_import', 'C-2', '2026-11-10 19:48+01', 'therapy', '6B00', 'Generalised anxiety disorder', 1000000, 'credit'),
  ('00000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1',
   'call_centre_import', 'C-3', '2026-11-10 18:05+01', 'gp', '1F4Z', 'Malaria, unspecified', 450000, 'invoice');

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

do $$
begin
  insert into public.consultations (client_id, member_id, contract_id, source, external_ref, occurred_at, type, diagnosis_code, charge_kobo, billing)
  values ('00000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1',
          'emr_import', 'E-9', '2026-11-10 10:00+01', 'gp', 'I10', 0, 'credit');
  raise exception 'FAILED: an ICD-10 code was accepted as ICD-11';
exception when check_violation then
  raise notice 'ok: diagnosis codes must match their coding system';
end $$;

insert into public.consultations
  (client_id, member_id, contract_id, source, external_ref, occurred_at, type, diagnosis_code, diagnosis_code_system, charge_kobo, billing)
values
  ('00000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1',
   'emr_import', '5001', '2026-11-03 10:54+01', 'gp', 'FA01.Z', 'icd11', 380000, 'invoice'),
  ('00000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1',
   'emr_import', '5002', '2026-11-03 11:10+01', 'gp', '1F40&XN69B', 'icd11', 380000, 'invoice');
select tests.expect('ICD-11 codes from the EMR are accepted', (select count(*) from public.consultations where source = 'emr_import'), 2);
delete from public.consultations where source = 'emr_import';

-- ── [HMO A] client admin ────────────────────────────────────────────────
select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.expect('client sees only its own organisation', (select count(*) from public.clients), 1);
select tests.expect('client sees only its own members', (select count(*) from public.members), 1);
select tests.expect('client cannot read the consultations table directly', (select count(*) from public.consultations), 0);
select tests.expect('client sees its own consultations in the portal view', (select count(*) from public.client_consultations), 2);
select tests.expect('client never sees therapy diagnoses',
  (select count(*) from public.client_consultations where type = 'therapy' and (diagnosis_code is not null or diagnosis_label is not null)), 0);
select tests.expect('client sees GP diagnosis codes for claims',
  (select count(*) from public.client_consultations where type = 'gp' and diagnosis_code = 'BA00'), 1);
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
select tests.expect_denied('ops cannot change charges through the billing view', 'update public.billing_consultations set charge_kobo = 0');
select tests.expect_denied('ops cannot delete through the billing view', 'delete from public.billing_consultations');
reset role;

select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.expect('client has no write rights on the client view', (select count(*) from unnest(array['INSERT','UPDATE','DELETE']) p where has_table_privilege('public.client_consultations', p)), 0);
reset role;

-- Signed-out visitors (the API's anon role) see nothing.
grant usage on schema tests to anon;
set role anon;
select tests.expect_denied('signed-out visitor cannot read the client view', 'select 1 from public.client_consultations');
select tests.expect_denied('signed-out visitor cannot read the billing view', 'select 1 from public.billing_consultations');
select tests.expect_denied('signed-out visitor cannot read credit balances', 'select 1 from public.client_credit_balances');
select tests.expect_denied('signed-out visitor cannot call the role helper', 'select public.has_role(''ops_admin'')');
reset role;

select tests.login('d0000000-0000-0000-0000-000000000002');
select tests.expect('finance sees invoices', (select count(*) from public.invoices), 1);
select tests.expect('finance cannot read diagnoses', (select count(*) from public.consultations), 0);
reset role;

-- ── Invoice payments ────────────────────────────────────────────────────
update public.invoices set status = 'sent', due_on = '2026-10-20' where number = 'INV-0142';

select tests.login('d0000000-0000-0000-0000-000000000002');
insert into public.invoice_payments (invoice_id, amount_kobo, paid_on, reference, recorded_by)
select id, 100000000, '2026-11-05', 'TRF-1', auth.uid() from public.invoices where number = 'INV-0142';
select tests.expect('a part payment updates the amount paid',
  (select paid_kobo from public.invoices where number = 'INV-0142'), 100000000);
select tests.expect('a part payment marks the invoice part-paid',
  (select count(*) from public.invoices where number = 'INV-0142' and status = 'part_paid'), 1);
do $$
begin
  insert into public.invoice_payments (invoice_id, amount_kobo, paid_on, recorded_by)
  select id, 300000000, '2026-11-06', auth.uid() from public.invoices where number = 'INV-0142';
  raise exception 'FAILED: an overpayment was accepted';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: payments cannot exceed the invoice total';
end $$;
insert into public.invoice_payments (invoice_id, amount_kobo, paid_on, recorded_by)
select id, 233250000, '2026-11-07', auth.uid() from public.invoices where number = 'INV-0142';
select tests.expect('paying the balance marks the invoice paid',
  (select count(*) from public.invoices where number = 'INV-0142' and status = 'paid' and paid_kobo = total_kobo), 1);
reset role;

select tests.login('d0000000-0000-0000-0000-000000000001');
do $$
begin
  insert into public.invoice_payments (invoice_id, amount_kobo, paid_on, recorded_by)
  select id, 100, '2026-11-07', auth.uid() from public.invoices where number = 'INV-0142';
  raise exception 'FAILED: operations recorded a payment';
exception when insufficient_privilege then
  raise notice 'ok: only finance records payments';
end $$;
select tests.expect('ops can read payments', (select count(*) from public.invoice_payments), 2);
reset role;

select tests.login('b0000000-0000-0000-0000-000000000001');
select tests.expect('client viewers cannot read payments', (select count(*) from public.invoice_payments), 0);
reset role;

-- ── Staff profiles ──────────────────────────────────────────────────────
select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.expect('client admins cannot see our staff list', (select count(*) from public.profiles where client_id is null), 0);
reset role;
select tests.login('d0000000-0000-0000-0000-000000000001');
select tests.expect('ops sees every profile', (select count(*) from public.profiles), 8);
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
