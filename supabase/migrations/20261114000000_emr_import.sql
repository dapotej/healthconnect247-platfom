-- Fit the schema to HealthConnect's EMR export (docs/call-centre-import.md).

-- ── Channels ────────────────────────────────────────────────────────────
-- "phone": a voice call where the EMR can't tell the toll-free line from an
-- in-app call. "web": a web portal (e.g. the student health portal).
alter type public.call_channel add value if not exists 'phone';
alter type public.call_channel add value if not exists 'web';

-- ── Diagnoses are ICD-11 ────────────────────────────────────────────────
-- The EMR records ICD-11 codes (in a column it calls ICD10Code), and HMOs
-- accept them. Keep the code exactly as recorded, with its coding system.
drop view public.client_consultations;

alter table public.consultations rename column icd10_code to diagnosis_code;
alter table public.consultations drop constraint consultations_icd10_code_check;
alter table public.consultations
  add column diagnosis_code_system text not null default 'icd11'
    check (diagnosis_code_system in ('icd10', 'icd11')),
  add constraint consultations_diagnosis_code_check check (
    diagnosis_code is null
    or (diagnosis_code_system = 'icd10' and diagnosis_code ~ '^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$')
    or (diagnosis_code_system = 'icd11' and diagnosis_code ~
      '^([1-9A-HJ-NP-Z][A-HJ-NP-Z][0-9][0-9A-HJ-NP-Z](\.[0-9A-HJ-NP-Z]{1,2})?|X[0-9A-HJ-NP-Z]{4})([&/]([1-9A-HJ-NP-Z][A-HJ-NP-Z][0-9][0-9A-HJ-NP-Z](\.[0-9A-HJ-NP-Z]{1,2})?|X[0-9A-HJ-NP-Z]{4}))*$')
  );

alter table public.consultations drop constraint consultations_source_check;
alter table public.consultations
  add constraint consultations_source_check check (source in ('call_centre_import', 'emr_import', 'console'));

-- What a client's portal users see: their own consultations, no therapy diagnoses.
create view public.client_consultations with (security_barrier = true) as
select
  c.id, c.client_id, c.occurred_at, c.type, c.channel, c.language,
  m.external_member_id, m.full_name as member_name,
  c.clinician_name, c.clinician_licence,
  case when c.type = 'therapy' then null else c.diagnosis_code end as diagnosis_code,
  case when c.type = 'therapy' then null else c.diagnosis_code_system end as diagnosis_code_system,
  case when c.type = 'therapy' then null else c.diagnosis_label end as diagnosis_label,
  c.outcome, c.charge_kobo, c.billing, c.invoice_id, c.external_ref
from public.consultations c
join public.members m on m.id = c.member_id
where c.client_id = public.current_client_id();

-- Read-only, signed-in users only (see the foundation migration for why).
revoke all on public.client_consultations from public, anon, authenticated;
grant select on public.client_consultations to authenticated;

-- ── Matching EMR rows to clients and members ────────────────────────────
-- The names a client goes by in the EMR's "service" column, e.g. 'HYGEIA'.
alter table public.clients add column emr_names text[] not null default '{}';

-- The EMR's patient code, saved once a consultation is matched to a member,
-- so later imports find the member directly.
alter table public.members add column emr_patient_code text;
create unique index members_emr_patient_code_idx on public.members (client_id, emr_patient_code)
  where emr_patient_code is not null;
