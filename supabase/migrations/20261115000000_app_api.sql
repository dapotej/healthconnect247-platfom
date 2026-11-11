-- The web app's database API.
--
-- The web app reads and writes only through these app_* functions. They run
-- with the caller's rights (security invoker), so row-level security still
-- decides what each person can see and change, and consultations are read
-- only through the client_consultations and billing_consultations views.
-- Each call is one transaction, so an import or an invoice is saved whole or
-- not at all. They return JSON shaped like apps/web/lib/data/types.ts.
--
-- A business rule refusal raises an exception whose message is a code from
-- apps/web/lib/notices.ts, with hint 'hc247'.

-- ── Helpers ─────────────────────────────────────────────────────────────
-- Lagos is UTC+01:00 all year. (An interval offset uses the ISO sign convention.)
create function public.lagos_date(ts timestamptz) returns date
language sql immutable set search_path = ''
as $$ select (ts at time zone interval '+01:00')::date $$;

create function public.lagos_day_start(d date) returns timestamptz
language sql immutable set search_path = ''
as $$ select (d::timestamp at time zone interval '+01:00') $$;

create function public.app_refuse(code text) returns void
language plpgsql set search_path = ''
as $$ begin raise exception using message = code, hint = 'hc247'; end $$;

-- Disabled accounts lose all access: their role and client no longer resolve.
create or replace function public.current_app_role() returns public.app_role
language sql stable security definer set search_path = ''
as $$ select role from public.profiles where id = auth.uid() and status <> 'disabled' $$;

create or replace function public.current_client_id() returns uuid
language sql stable security definer set search_path = ''
as $$ select client_id from public.profiles where id = auth.uid() and status <> 'disabled' $$;

-- Operations, finance and the clinical lead can see the staff list.
create policy profiles_staff_read on public.profiles for select to authenticated
  using (client_id is null and public.has_role('ops_admin', 'finance', 'clinical_lead'));

-- Invoice numbers: INV-0001, INV-0002, …
create sequence public.invoice_number_seq;
alter table public.invoices
  alter column number set default ('INV-' || lpad(nextval('public.invoice_number_seq')::text, 4, '0'));

-- ── Who is signed in ────────────────────────────────────────────────────
create function public.app_whoami() returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id, 'fullName', p.full_name, 'email', p.email, 'role', p.role,
    'clientId', p.client_id, 'clientName', c.name, 'status', p.status)
  from public.profiles p
  left join public.clients c on c.id = p.client_id
  where p.id = auth.uid()
$$;

-- An invited person has set their password: their account becomes active.
-- Security definer because people can't otherwise change their own profile;
-- it only ever moves the caller's own account from invited to active.
create function public.app_mark_active() returns void
language sql security definer set search_path = ''
as $$ update public.profiles set status = 'active' where id = auth.uid() and status = 'invited' $$;

-- ── Clients and contracts ───────────────────────────────────────────────
create function public.app_list_clients() returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'type', type, 'isPilot', is_pilot, 'emrNames', to_jsonb(emr_names)) order by name), '[]')
  from public.clients
$$;

create function public.app_contracts(p_client uuid) returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', k.id, 'clientId', k.client_id, 'pricingModel', k.pricing_model,
    'startsOn', k.starts_on, 'endsOn', k.ends_on,
    'platformFeeKobo', k.platform_fee_kobo, 'pmpmKobo', k.pmpm_kobo,
    'therapyAddonPmpmKobo', k.therapy_addon_pmpm_kobo,
    'rates', (select coalesce(jsonb_object_agg(r.consultation_type, r.rate_kobo), '{}')
              from public.contract_rates r where r.contract_id = k.id),
    'lowBalanceThresholdKobo', k.low_balance_threshold_kobo,
    'vatRate', k.vat_rate) order by k.starts_on), '[]')
  from public.contracts k
  where k.client_id = p_client
$$;

-- The names a client goes by in the EMR export. A name can belong to one client only.
create function public.app_set_client_emr_names(p_client uuid, p_names text[]) returns void
language plpgsql set search_path = ''
as $$
declare
  v_names text[] := array(select distinct trim(n) from unnest(p_names) n where trim(n) <> '');
begin
  if exists (
    select 1 from public.clients c, unnest(c.emr_names) existing, unnest(v_names) wanted
    where c.id <> p_client and lower(existing) = lower(wanted)
  ) then
    perform public.app_refuse('emr_name_taken');
  end if;
  update public.clients set emr_names = v_names where id = p_client;
  if not found then perform public.app_refuse('not_allowed'); end if;
end $$;

-- ── Members ─────────────────────────────────────────────────────────────
create function public.app_member_json(m public.members) returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', m.id, 'clientId', m.client_id, 'externalMemberId', m.external_member_id,
    'fullName', m.full_name, 'dateOfBirth', m.date_of_birth, 'phoneE164', m.phone_e164,
    'planCode', m.plan_code, 'status', m.status, 'usesApp', m.uses_app)
$$;

create function public.app_member_counts(p_client uuid) returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'active', count(*) filter (where status = 'active'),
    'suspended', count(*) filter (where status = 'suspended'),
    'notOnApp', count(*) filter (where status = 'active' and not uses_app))
  from public.members
  where client_id = p_client
$$;

create function public.app_search_members(p_client uuid, p_filter text, p_query text, p_offset integer, p_limit integer)
returns jsonb
language sql stable set search_path = ''
as $$
  with params as (
    select nullif(lower(regexp_replace(trim(coalesce(p_query, '')), '\s+', ' ', 'g')), '') as q,
           -- Phone digits as people type them: 0803… or 234803… both match +234803…
           regexp_replace(regexp_replace(coalesce(p_query, ''), '\D', '', 'g'), '^(234|0)', '') as digits
  ),
  matched as (
    select m.*
    from public.members m, params
    where m.client_id = p_client
      and case p_filter
            when 'active' then m.status = 'active'
            when 'suspended' then m.status = 'suspended'
            when 'not_on_app' then m.status = 'active' and not m.uses_app
            else true
          end
      and (params.q is null
           or strpos(lower(m.full_name), params.q) > 0
           or strpos(lower(m.external_member_id), params.q) > 0
           or (length(params.digits) >= 4 and strpos(m.phone_e164, params.digits) > 0))
  )
  select jsonb_build_object(
    'total', (select count(*) from matched),
    'rows', coalesce((
      select jsonb_agg(public.app_member_json(page) order by page.full_name, page.id)
      from (select * from matched order by full_name, id offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 500)) page
    ), '[]'))
$$;

create function public.app_member_ids(p_client uuid) returns jsonb
language sql stable set search_path = ''
as $$ select coalesce(jsonb_agg(external_member_id), '[]') from public.members where client_id = p_client $$;

-- Members as needed to match imported consultations to them.
create function public.app_member_index(p_client uuid) returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'externalMemberId', external_member_id, 'phoneE164', phone_e164, 'patientCode', emr_patient_code)), '[]')
  from public.members
  where client_id = p_client
$$;

create function public.app_set_member_status(p_client uuid, p_member uuid, p_status public.member_status) returns void
language plpgsql set search_path = ''
as $$
begin
  update public.members set status = p_status, updated_at = now() where client_id = p_client and id = p_member;
  if not found then perform public.app_refuse('member_not_found'); end if;
end $$;

-- Save a validated member list: add new members, update existing ones (by member ID).
create function public.app_save_member_import(
  p_client uuid, p_filename text, p_rows_total integer, p_members jsonb, p_errors jsonb
) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_import uuid := gen_random_uuid();
  v_added integer := 0;
  v_updated integer := 0;
  m jsonb;
begin
  for m in select * from jsonb_array_elements(p_members) loop
    update public.members
       set full_name = m->>'fullName', phone_e164 = m->>'phoneE164',
           date_of_birth = (m->>'dateOfBirth')::date, plan_code = m->>'planCode', updated_at = now()
     where client_id = p_client and external_member_id = m->>'externalMemberId';
    if found then
      v_updated := v_updated + 1;
    else
      insert into public.members (client_id, external_member_id, full_name, phone_e164, date_of_birth, plan_code)
      values (p_client, m->>'externalMemberId', m->>'fullName', m->>'phoneE164', (m->>'dateOfBirth')::date, m->>'planCode');
      v_added := v_added + 1;
    end if;
  end loop;

  insert into public.member_imports (id, client_id, filename, uploaded_by, rows_total, added, updated, error_count)
  values (v_import, p_client, p_filename, auth.uid(), p_rows_total, v_added, v_updated, jsonb_array_length(p_errors));
  insert into public.member_import_errors (import_id, row_number, member_name, problem)
  select v_import, (e->>'row')::integer, e->>'name', e->>'problem' from jsonb_array_elements(p_errors) e;

  return jsonb_build_object('filename', p_filename, 'uploadedAt', now(), 'rowsTotal', p_rows_total,
                            'added', v_added, 'updated', v_updated, 'errors', p_errors);
end $$;

create function public.app_last_member_import(p_client uuid) returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'filename', i.filename, 'uploadedAt', i.created_at, 'rowsTotal', i.rows_total,
    'added', i.added, 'updated', i.updated,
    'errors', (select coalesce(jsonb_agg(jsonb_build_object('row', e.row_number, 'name', e.member_name, 'problem', e.problem)
                                         order by e.row_number), '[]')
               from public.member_import_errors e where e.import_id = i.id))
  from public.member_imports i
  where i.client_id = p_client
  order by i.created_at desc
  limit 1
$$;

-- ── Consultations (through the privacy views only) ──────────────────────
create function public.app_client_consultations(p_client uuid, p_from date, p_to date) returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id, 'occurredAt', v.occurred_at, 'type', v.type, 'channel', v.channel, 'language', v.language,
    'memberId', v.external_member_id, 'externalMemberId', v.external_member_id, 'memberName', v.member_name,
    'clinicianName', v.clinician_name, 'clinicianLicence', v.clinician_licence,
    'diagnosisCode', v.diagnosis_code, 'diagnosisLabel', v.diagnosis_label,
    'outcome', v.outcome, 'chargeKobo', v.charge_kobo, 'billing', v.billing, 'externalRef', v.external_ref)
    order by v.occurred_at desc), '[]')
  from public.client_consultations v
  where v.client_id = p_client
    and v.occurred_at >= public.lagos_day_start(p_from)
    and v.occurred_at < public.lagos_day_start(p_to + 1)
$$;

create function public.app_billing_consultations(p_from date, p_to date, p_client uuid default null) returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id, 'clientId', v.client_id, 'occurredAt', v.occurred_at, 'type', v.type, 'channel', v.channel,
    'language', v.language, 'outcome', v.outcome, 'chargeKobo', v.charge_kobo, 'billing', v.billing)
    order by v.occurred_at desc), '[]')
  from public.billing_consultations v
  where (p_client is null or v.client_id = p_client)
    and v.occurred_at >= public.lagos_day_start(p_from)
    and v.occurred_at < public.lagos_day_start(p_to + 1)
$$;

-- Which of these references are already imported (so a re-import skips them).
create function public.app_existing_refs(p_source text, p_refs text[]) returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(v.external_ref), '[]')
  from public.billing_consultations v
  where v.source = p_source and v.external_ref = any (p_refs)
$$;

-- Save an EMR import: consultations already matched to client, member and
-- contract, and priced. Flex consultations use credit. Rows already imported
-- are skipped (p_already_imported counts those the app found before calling).
-- Clinical notes are never passed in.
create function public.app_record_consultation_import(
  p_source_system text, p_filename text, p_rows_total integer,
  p_consultations jsonb, p_member_codes jsonb, p_problems jsonb,
  p_already_imported integer default 0
) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_import uuid := gen_random_uuid();
  v_id uuid;
  v_imported integer := 0;
  v_skipped integer := greatest(coalesce(p_already_imported, 0), 0);
  c jsonb;
  mc jsonb;
begin
  for c in select * from jsonb_array_elements(p_consultations) loop
    -- Operations can't read the consultations table (it holds diagnoses), so
    -- look for an earlier import through the billing view.
    if exists (select 1 from public.billing_consultations b
               where b.source = 'emr_import' and b.external_ref = c->>'externalRef') then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    v_id := gen_random_uuid();
    insert into public.consultations (
      id, client_id, member_id, contract_id, source, external_ref, occurred_at, type, channel, language,
      clinician_name, clinician_licence, diagnosis_code, diagnosis_code_system, diagnosis_label, outcome,
      charge_kobo, billing)
    values (
      v_id, (c->>'clientId')::uuid, (c->>'memberId')::uuid, (c->>'contractId')::uuid, 'emr_import', c->>'externalRef',
      (c->>'occurredAt')::timestamptz, (c->>'type')::public.consultation_type,
      (c->>'channel')::public.call_channel, (c->>'language')::public.call_language,
      c->>'clinicianName', c->>'clinicianLicence', c->>'diagnosisCode', coalesce(c->>'diagnosisCodeSystem', 'icd11'),
      c->>'diagnosisLabel', (c->>'outcome')::public.consultation_outcome,
      (c->>'chargeKobo')::bigint, (c->>'billing')::public.billing_method);
    v_imported := v_imported + 1;
    if c->>'billing' = 'credit' and (c->>'chargeKobo')::bigint > 0 then
      insert into public.credit_ledger (client_id, occurred_at, kind, amount_kobo, consultation_id, created_by)
      values ((c->>'clientId')::uuid, (c->>'occurredAt')::timestamptz, 'usage', -(c->>'chargeKobo')::bigint, v_id, auth.uid());
    end if;
  end loop;

  -- Remember the EMR patient code on members matched by phone or member ID.
  for mc in select * from jsonb_array_elements(p_member_codes) loop
    update public.members m set emr_patient_code = mc->>'patientCode'
     where m.id = (mc->>'memberId')::uuid and m.emr_patient_code is null
       and not exists (select 1 from public.members o
                       where o.client_id = m.client_id and o.emr_patient_code = mc->>'patientCode');
  end loop;

  insert into public.consultation_imports (id, source_system, filename, imported_by, rows_total, imported, skipped_duplicates, error_count)
  values (v_import, p_source_system, p_filename, auth.uid(), p_rows_total, v_imported, v_skipped, jsonb_array_length(p_problems));
  insert into public.consultation_import_errors (import_id, row_number, reference, problem)
  select v_import, (e->>'row')::integer, e->>'name', e->>'problem' from jsonb_array_elements(p_problems) e;

  return jsonb_build_object('id', v_import, 'imported', v_imported, 'skippedDuplicates', v_skipped);
end $$;

create function public.app_consultation_imports(p_limit integer) returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(x.j order by x.created_at desc), '[]')
  from (
    select i.created_at, jsonb_build_object(
      'id', i.id, 'filename', i.filename, 'importedAt', i.created_at, 'rowsTotal', i.rows_total,
      'imported', i.imported, 'skippedDuplicates', i.skipped_duplicates,
      'problems', (select coalesce(jsonb_agg(jsonb_build_object('row', e.row_number, 'name', e.reference, 'problem', e.problem)
                                             order by e.row_number), '[]')
                   from public.consultation_import_errors e where e.import_id = i.id)) as j
    from public.consultation_imports i
    order by i.created_at desc
    limit least(greatest(p_limit, 1), 50)
  ) x
$$;

-- ── Flex credit ─────────────────────────────────────────────────────────
-- Top-ups, adjustments and the opening balance one by one; usage as one line per Lagos day.
create function public.app_credit_ledger(p_client uuid) returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(x.j order by x.at), '[]')
  from (
    select l.occurred_at as at, jsonb_strip_nulls(jsonb_build_object(
      'occurredAt', l.occurred_at, 'kind', l.kind, 'amountKobo', l.amount_kobo, 'reference', l.reference, 'note', l.note)) as j
    from public.credit_ledger l
    where l.client_id = p_client and l.kind <> 'usage'
    union all
    select max(l.occurred_at), jsonb_build_object(
      'occurredAt', max(l.occurred_at), 'kind', 'usage', 'amountKobo', sum(l.amount_kobo), 'consultationCount', count(*))
    from public.credit_ledger l
    where l.client_id = p_client and l.kind = 'usage'
    group by public.lagos_date(l.occurred_at)
  ) x
$$;

create function public.app_record_topup(p_client uuid, p_amount bigint, p_received_on date, p_reference text) returns void
language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from public.contracts k where k.client_id = p_client and k.pricing_model = 'flex'
                 and p_received_on between k.starts_on and k.ends_on) then
    perform public.app_refuse('not_flex');
  end if;
  insert into public.credit_ledger (client_id, occurred_at, kind, amount_kobo, reference, note, created_by)
  values (p_client, public.lagos_day_start(p_received_on) + interval '12 hours', 'topup', p_amount, p_reference,
          'Top-up received', auth.uid());
end $$;

-- ── Invoices ────────────────────────────────────────────────────────────
create function public.app_invoice_json(i public.invoices) returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', i.id, 'clientId', i.client_id, 'number', i.number,
    'periodStart', i.period_start, 'periodEnd', i.period_end, 'status', i.status,
    'lines', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                'description', l.description, 'quantity', l.quantity, 'unitKobo', l.unit_kobo,
                'amountKobo', l.amount_kobo, 'consultationType', l.consultation_type)) order by l.id), '[]')
              from public.invoice_lines l where l.invoice_id = i.id),
    'subtotalKobo', i.subtotal_kobo, 'vatKobo', i.vat_kobo, 'totalKobo', i.total_kobo, 'paidKobo', i.paid_kobo,
    'dueOn', i.due_on,
    'paidOn', case when i.status = 'paid'
                   then (select max(p.paid_on) from public.invoice_payments p where p.invoice_id = i.id) end,
    'payments', (select coalesce(jsonb_agg(jsonb_build_object(
                   'amountKobo', p.amount_kobo, 'paidOn', p.paid_on, 'reference', p.reference) order by p.paid_on, p.id), '[]')
                 from public.invoice_payments p where p.invoice_id = i.id))
$$;

create function public.app_invoices(p_client uuid default null) returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(public.app_invoice_json(i) order by i.number desc), '[]')
  from public.invoices i
  where p_client is null or i.client_id = p_client
$$;

create function public.app_get_invoice(p_invoice uuid) returns jsonb
language sql stable set search_path = ''
as $$ select public.app_invoice_json(i) from public.invoices i where i.id = p_invoice $$;

create function public.app_create_invoice_draft(
  p_client uuid, p_period_start date, p_period_end date, p_lines jsonb,
  p_subtotal bigint, p_vat bigint, p_total bigint
) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  if exists (select 1 from public.invoices where client_id = p_client and period_start = p_period_start and status <> 'void') then
    perform public.app_refuse('invoice_exists');
  end if;
  insert into public.invoices (id, client_id, period_start, period_end, subtotal_kobo, vat_kobo, total_kobo)
  values (v_id, p_client, p_period_start, p_period_end, p_subtotal, p_vat, p_total);
  insert into public.invoice_lines (invoice_id, description, quantity, unit_kobo, amount_kobo, consultation_type)
  select v_id, l->>'description', (l->>'quantity')::integer, (l->>'unitKobo')::bigint, (l->>'amountKobo')::bigint,
         (l->>'consultationType')::public.consultation_type
  from jsonb_array_elements(p_lines) l;
  return public.app_get_invoice(v_id);
end $$;

create function public.app_send_invoice(p_invoice uuid, p_due_on date) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_status public.invoice_status;
begin
  select status into v_status from public.invoices where id = p_invoice;
  if not found then perform public.app_refuse('invoice_not_found'); end if;
  if v_status <> 'draft' then perform public.app_refuse('not_draft'); end if;
  update public.invoices set status = 'sent', due_on = p_due_on, issued_at = now() where id = p_invoice;
  if not found then perform public.app_refuse('not_allowed'); end if;
  return public.app_get_invoice(p_invoice);
end $$;

create function public.app_record_payment(p_invoice uuid, p_amount bigint, p_paid_on date, p_reference text) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  inv public.invoices%rowtype;
begin
  select * into inv from public.invoices where id = p_invoice;
  if not found then perform public.app_refuse('invoice_not_found'); end if;
  if inv.status in ('draft', 'void') then perform public.app_refuse('not_sent'); end if;
  if inv.paid_kobo + p_amount > inv.total_kobo then perform public.app_refuse('overpayment'); end if;
  insert into public.invoice_payments (invoice_id, amount_kobo, paid_on, reference, recorded_by)
  values (p_invoice, p_amount, p_paid_on, p_reference, auth.uid());
  return public.app_get_invoice(p_invoice);
end $$;

-- ── Staff ───────────────────────────────────────────────────────────────
create function public.app_staff_json(p public.profiles) returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id, 'fullName', p.full_name, 'email', coalesce(p.email, ''), 'role', p.role,
    'languages', to_jsonb(p.languages), 'licenceNumber', p.clinician_licence,
    'licenceExpiresOn', p.licence_expires_on, 'status', p.status)
$$;

create function public.app_list_staff() returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(public.app_staff_json(p) order by p.full_name), '[]')
  from public.profiles p
  where p.client_id is null
$$;

create function public.app_staff_email_taken(p_email text) returns boolean
language sql stable set search_path = ''
as $$ select exists (select 1 from public.profiles where lower(email) = lower(trim(p_email))) $$;

-- Record an invited person's profile. The sign-in account itself is created
-- by the server with Supabase Auth's invite, which emails them a link.
create function public.app_add_staff_profile(
  p_user uuid, p_full_name text, p_email text, p_role public.app_role, p_languages public.call_language[],
  p_licence text, p_licence_expires date
) returns jsonb
language plpgsql set search_path = ''
as $$
begin
  if p_role::text like 'client\_%' then perform public.app_refuse('bad_role'); end if;
  begin
    insert into public.profiles (id, full_name, email, role, languages, clinician_licence, licence_expires_on, status)
    values (p_user, trim(p_full_name), lower(trim(p_email)), p_role, p_languages, p_licence, p_licence_expires, 'invited');
  exception when unique_violation then
    perform public.app_refuse('staff_exists');
  end;
  return (select public.app_staff_json(p) from public.profiles p where p.id = p_user);
end $$;

-- ── Who may call what ───────────────────────────────────────────────────
-- Only signed-in users; row-level security then applies inside each function.
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'app\_%' or p.proname in ('lagos_date', 'lagos_day_start'))
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

revoke all on sequence public.invoice_number_seq from public, anon;
grant usage on sequence public.invoice_number_seq to authenticated;
