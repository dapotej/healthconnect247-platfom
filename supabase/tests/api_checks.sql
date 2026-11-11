-- Checks for the app_* database API (supabase/migrations/*_app_api.sql).
-- Runs after access_rules.sql, reusing its users, members and helpers.

-- Expect a statement to be refused with one of our rule codes.
create function tests.expect_refused(label text, statement text, code text) returns void
language plpgsql as $$
begin
  execute statement;
  raise exception 'FAILED: % (statement was allowed)', label;
exception when raise_exception then
  if sqlerrm <> code then
    raise exception 'FAILED: % (refused with "%", expected "%")', label, sqlerrm, code;
  end if;
  raise notice 'ok: %', label;
end $$;
grant execute on function tests.expect_refused(text, text, text) to authenticated;

create function tests.json_expect(label text, actual jsonb, expected jsonb) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAILED: % (expected %, got %)', label, expected, actual;
  end if;
  raise notice 'ok: %', label;
end $$;
grant execute on function tests.json_expect(text, jsonb, jsonb) to authenticated;

-- ── Who is signed in ────────────────────────────────────────────────────
select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.json_expect('whoami gives a client user their organisation',
  (select public.app_whoami() - 'id' - 'email' - 'fullName' - 'status'),
  '{"role": "client_admin", "clientId": "00000000-0000-0000-0000-0000000000a1", "clientName": "[HMO A]"}');
select tests.expect('a client user lists only their own organisation', (select jsonb_array_length(public.app_list_clients())), 1);
select tests.expect('a client user cannot search another client''s members',
  (select (public.app_search_members('00000000-0000-0000-0000-0000000000b1', 'all', null, 0, 50)->>'total')::bigint), 0);
reset role;

select tests.login('d0000000-0000-0000-0000-000000000001');
select tests.expect('operations list every client', (select jsonb_array_length(public.app_list_clients())), 5);
reset role;

do $$
begin
  set local role anon;
  perform public.app_whoami();
  raise exception 'FAILED: signed-out visitors could call the API';
exception when insufficient_privilege then
  raise notice 'ok: signed-out visitors cannot call the API';
end $$;
reset role;

-- ── Member uploads ──────────────────────────────────────────────────────
select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.json_expect('a client admin''s upload adds new members and updates existing ones',
  (select public.app_save_member_import('00000000-0000-0000-0000-0000000000a1', 'members.csv', 3,
     '[{"externalMemberId": "HC-100001", "fullName": "Bisi Adebayo-Cole", "phoneE164": "+2348034567812", "dateOfBirth": "1972-09-04", "planCode": "GP + therapy"},
       {"externalMemberId": "HC-100002", "fullName": "Tunde Bakare", "phoneE164": "+2348030000002", "dateOfBirth": null, "planCode": null}]',
     '[{"row": 4, "name": "Ada", "problem": "Phone number missing"}]') - 'uploadedAt'),
  '{"filename": "members.csv", "rowsTotal": 3, "added": 1, "updated": 1, "errors": [{"row": 4, "name": "Ada", "problem": "Phone number missing"}]}');
select tests.expect('the last upload and its problems are kept',
  (select jsonb_array_length(public.app_last_member_import('00000000-0000-0000-0000-0000000000a1')->'errors')), 1);
select tests.expect('member search finds by name, ignoring case',
  (select (public.app_search_members('00000000-0000-0000-0000-0000000000a1', 'all', 'BAKARE', 0, 50)->>'total')::bigint), 1);
select tests.expect('member search finds by phone digits',
  (select (public.app_search_members('00000000-0000-0000-0000-0000000000a1', 'active', '0803 456', 0, 50)->>'total')::bigint), 1);
select tests.expect_denied('a client admin cannot upload members for another client',
  $q$select public.app_save_member_import('00000000-0000-0000-0000-0000000000b1', 'x.csv', 1,
     '[{"externalMemberId": "HB-999", "fullName": "X", "phoneE164": "+2348030000009", "dateOfBirth": null, "planCode": null}]', '[]')$q$);
reset role;

select tests.login('d0000000-0000-0000-0000-000000000001');
select public.app_set_member_status('00000000-0000-0000-0000-0000000000a1',
  (select id from public.members where external_member_id = 'HC-100002'), 'suspended');
select tests.json_expect('operations can suspend a member',
  public.app_member_counts('00000000-0000-0000-0000-0000000000a1'), '{"active": 1, "suspended": 1, "notOnApp": 1}');
select tests.expect_refused('suspending a member of a different client is refused',
  $q$select public.app_set_member_status('00000000-0000-0000-0000-0000000000b1',
     (select id from public.members where external_member_id = 'HC-100002'), 'active')$q$, 'member_not_found');
reset role;

-- ── EMR import ──────────────────────────────────────────────────────────
select tests.login('d0000000-0000-0000-0000-000000000001');
select public.app_set_client_emr_names('00000000-0000-0000-0000-0000000000a1', array['HMO A EMR', ' HMO-A ']);
select public.app_set_client_emr_names('00000000-0000-0000-0000-0000000000b1', array['HMO B']);
select tests.expect_refused('an EMR name can belong to one client only',
  $q$select public.app_set_client_emr_names('00000000-0000-0000-0000-0000000000b1', array['hmo a emr'])$q$, 'emr_name_taken');

create temporary table import_rows as
select jsonb_build_array(
  jsonb_build_object('clientId', '00000000-0000-0000-0000-0000000000a1',
    'memberId', (select id from public.members where external_member_id = 'HC-100001'),
    'contractId', '10000000-0000-0000-0000-0000000000a1', 'externalRef', '7001', 'occurredAt', '2026-11-03T10:54:00+01:00',
    'type', 'gp', 'channel', 'phone', 'language', null, 'clinicianName', 'Dr. Test', 'clinicianLicence', null,
    'diagnosisCode', '1F40', 'diagnosisCodeSystem', 'icd11', 'diagnosisLabel', 'Malaria due to Plasmodium falciparum',
    'outcome', 'prescription', 'chargeKobo', 380000, 'billing', 'credit'),
  jsonb_build_object('clientId', '00000000-0000-0000-0000-0000000000a1',
    'memberId', (select id from public.members where external_member_id = 'HC-100001'),
    'contractId', '10000000-0000-0000-0000-0000000000a1', 'externalRef', '7002', 'occurredAt', '2026-11-03T18:00:00+01:00',
    'type', 'therapy', 'channel', 'app_video', 'diagnosisCode', '6B00', 'diagnosisLabel', 'Generalised anxiety disorder',
    'outcome', 'session_held', 'chargeKobo', 1000000, 'billing', 'credit'),
  jsonb_build_object('clientId', '00000000-0000-0000-0000-0000000000b1',
    'memberId', (select id from public.members where external_member_id = 'HB-200001'),
    'contractId', '10000000-0000-0000-0000-0000000000b1', 'externalRef', '7003', 'occurredAt', '2026-11-04T09:00:00+01:00',
    'type', 'gp', 'channel', 'phone', 'diagnosisCode', 'CA0Z', 'outcome', 'advice', 'chargeKobo', 450000, 'billing', 'invoice')
) as rows;
grant select on import_rows to authenticated;

select tests.json_expect('an EMR import saves consultations',
  (select public.app_record_consultation_import('HealthConnect EMR', 'encounters.xlsx', 5, rows,
     jsonb_build_array(jsonb_build_object('memberId', (select id from public.members where external_member_id = 'HC-100001'),
                                          'patientCode', '2611000001')),
     '[{"row": 6, "name": "7004", "problem": "Client \"SELF PAID\" isn''t set up."}]') - 'id' from import_rows),
  '{"imported": 3, "skippedDuplicates": 0}');
select tests.json_expect('importing the same rows again skips them',
  (select public.app_record_consultation_import('HealthConnect EMR', 'encounters.xlsx', 3, rows, '[]', '[]') - 'id' from import_rows),
  '{"imported": 0, "skippedDuplicates": 3}');
select tests.json_expect('already-imported references are found',
  public.app_existing_refs('emr_import', array['7001', '7003', '9999']) , '["7001", "7003"]');
select tests.expect('the EMR patient code is remembered on the member',
  (select count(*) from public.members where emr_patient_code = '2611000001'), 1);
select tests.json_expect('rows the app already skipped are counted in the history',
  (select public.app_record_consultation_import('HealthConnect EMR', 'encounters.xlsx', 3, '[]', '[]', '[]', 3) - 'id'),
  '{"imported": 0, "skippedDuplicates": 3}');
select tests.expect('import history keeps the problem rows',
  (select jsonb_array_length(public.app_consultation_imports(5)->2->'problems')), 1);
select tests.expect('operations see imported consultations in the billing view, without diagnoses',
  (select count(*) from jsonb_array_elements(public.app_billing_consultations('2026-11-03', '2026-11-04'))
   where value ? 'diagnosisCode'), 0);
select tests.expect('billing view covers both clients',
  (select jsonb_array_length(public.app_billing_consultations('2026-11-03', '2026-11-04'))), 3);
reset role;

select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.expect('the client sees its imported consultations for the period (Lagos dates)',
  (select jsonb_array_length(public.app_client_consultations('00000000-0000-0000-0000-0000000000a1', '2026-11-03', '2026-11-03'))), 2);
select tests.expect('the client sees ICD-11 codes for GP consultations',
  (select count(*) from jsonb_array_elements(public.app_client_consultations('00000000-0000-0000-0000-0000000000a1', '2026-11-03', '2026-11-03'))
   where value->>'diagnosisCode' = '1F40'), 1);
select tests.expect('the client never sees therapy diagnoses',
  (select count(*) from jsonb_array_elements(public.app_client_consultations('00000000-0000-0000-0000-0000000000a1', '2026-11-01', '2026-11-30'))
   where value->>'type' = 'therapy' and (value->>'diagnosisCode' is not null or value->>'diagnosisLabel' is not null)), 0);
select tests.json_expect('Flex consultations are taken from credit, one line per day',
  (select value - 'occurredAt' from jsonb_array_elements(public.app_credit_ledger('00000000-0000-0000-0000-0000000000a1'))
   where value->>'kind' = 'usage'),
  '{"kind": "usage", "amountKobo": -1380000, "consultationCount": 2}');
reset role;

-- ── Flex top-ups ────────────────────────────────────────────────────────
select tests.login('d0000000-0000-0000-0000-000000000002');
select public.app_record_topup('00000000-0000-0000-0000-0000000000a1', 200000000, '2026-11-05', 'TRF-1');
select tests.expect('finance records a top-up',
  (select count(*) from jsonb_array_elements(public.app_credit_ledger('00000000-0000-0000-0000-0000000000a1'))
   where value->>'reference' = 'TRF-1' and (value->>'amountKobo')::bigint = 200000000), 1);
select tests.expect_refused('top-ups are refused for clients not on Flex',
  $q$select public.app_record_topup('00000000-0000-0000-0000-0000000000b1', 100, '2026-11-05', 'TRF-2')$q$, 'not_flex');
reset role;

-- ── Invoices ────────────────────────────────────────────────────────────
select tests.login('d0000000-0000-0000-0000-000000000002');
create temporary table draft as
select public.app_create_invoice_draft('00000000-0000-0000-0000-0000000000d1', '2026-11-01', '2026-11-30',
  '[{"description": "Platform fee", "quantity": 1, "unitKobo": 25000000, "amountKobo": 25000000},
    {"description": "GP consultations", "quantity": 10, "unitKobo": 450000, "amountKobo": 4500000, "consultationType": "gp"}]',
  29500000, 2212500, 31712500) as inv;
select tests.json_expect('finance creates a numbered draft invoice with its lines',
  (select jsonb_build_object('number', inv->'number', 'status', inv->'status', 'lines', jsonb_array_length(inv->'lines')) from draft),
  '{"number": "INV-0001", "status": "draft", "lines": 2}');
select tests.expect_refused('a second invoice for the same month is refused',
  $q$select public.app_create_invoice_draft('00000000-0000-0000-0000-0000000000d1', '2026-11-01', '2026-11-30', '[]', 0, 0, 0)$q$,
  'invoice_exists');
select tests.expect_refused('a draft cannot be paid',
  format('select public.app_record_payment(%L, 100, %L, %L)', (select inv->>'id' from draft), '2026-11-20', 'X'), 'not_sent');
select tests.json_expect('finance sends the invoice',
  (select public.app_send_invoice((inv->>'id')::uuid, '2026-12-14')->'status' from draft), '"sent"');
select tests.expect_refused('a sent invoice cannot be sent again',
  format('select public.app_send_invoice(%L, %L)', (select inv->>'id' from draft), '2026-12-14'), 'not_draft');
select tests.json_expect('a part payment makes the invoice part-paid',
  (select public.app_record_payment((inv->>'id')::uuid, 10000000, '2026-11-20', 'TRF-9')->'status' from draft), '"part_paid"');
select tests.expect_refused('overpayment is refused',
  format('select public.app_record_payment(%L, 31712500, %L, %L)', (select inv->>'id' from draft), '2026-11-21', 'X'), 'overpayment');
select tests.json_expect('paying the rest marks it paid, with the date',
  (select jsonb_build_object('status', j->'status', 'paidOn', j->'paidOn', 'payments', jsonb_array_length(j->'payments'))
   from draft, public.app_record_payment((inv->>'id')::uuid, 21712500, '2026-11-25', 'TRF-10') j),
  '{"status": "paid", "paidOn": "2026-11-25", "payments": 2}');
reset role;

select tests.login('d0000000-0000-0000-0000-000000000001');
select tests.expect_denied('operations cannot create invoices',
  $q$select public.app_create_invoice_draft('00000000-0000-0000-0000-0000000000c1', '2026-11-01', '2026-11-30', '[]', 0, 0, 0)$q$);
reset role;

select tests.login('b0000000-0000-0000-0000-000000000001');
select tests.expect('client viewers cannot see invoices', (select jsonb_array_length(public.app_invoices())), 0);
reset role;

-- ── Staff ───────────────────────────────────────────────────────────────
insert into auth.users (id) values ('f0000000-0000-0000-0000-000000000001');

select tests.login('d0000000-0000-0000-0000-000000000001');
select tests.json_expect('operations add an invited staff member',
  (select public.app_add_staff_profile('f0000000-0000-0000-0000-000000000001', ' Ngozi Eze ', 'Ngozi@Example.org', 'gp',
     array['english', 'igbo']::public.call_language[], 'MDCN/12345', '2027-06-30') - 'id'),
  '{"fullName": "Ngozi Eze", "email": "ngozi@example.org", "role": "gp", "languages": ["english", "igbo"],
    "licenceNumber": "MDCN/12345", "licenceExpiresOn": "2027-06-30", "status": "invited"}');
select tests.expect('the email is then taken', (select public.app_staff_email_taken('NGOZI@example.org')::int), 1);
select tests.expect_refused('client roles cannot be given from the staff page',
  $q$select public.app_add_staff_profile('f0000000-0000-0000-0000-000000000001', 'X', 'x@example.org', 'client_admin', '{}', null, null)$q$,
  'bad_role');
reset role;

select tests.login('d0000000-0000-0000-0000-000000000002');
select tests.expect('finance can see the staff list', (select jsonb_array_length(public.app_list_staff())), 7);
reset role;
select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.expect('client users cannot see the staff list', (select jsonb_array_length(public.app_list_staff())), 0);
reset role;

select tests.login('f0000000-0000-0000-0000-000000000001');
select public.app_mark_active();
select tests.json_expect('an invited person becomes active once they set a password', public.app_whoami()->'status', '"active"');
reset role;

-- A disabled account loses all access.
update public.profiles set status = 'disabled' where id = 'c0000000-0000-0000-0000-000000000001';
select tests.login('c0000000-0000-0000-0000-000000000001');
select tests.expect('a disabled account sees no members', (select count(*) from public.members), 0);
reset role;
update public.profiles set status = 'active' where id = 'c0000000-0000-0000-0000-000000000001';
