# Importing consultations from the call-centre system

Until the clinician console replaces it, consultations come from the existing
call-centre software's export.

## How it works

1. `parseConsultationExport` (packages/core) reads the CSV, finds the columns,
   and turns each row into a clean record: Lagos timestamp, consultation type,
   channel, language, ICD-10 code and outcome. Rows it can't read are reported
   with their spreadsheet row number and the reason.
2. `matchMember` finds the member: by member ID first, then by phone number if
   exactly one member has it.
3. `contractOn` + `priceConsultation` price it under the client's contract in
   force that day (Flex → credit, pay-as-you-go → invoice, Unlimited → included).
4. The consultation is saved with `source = 'call_centre_import'` and the
   export's reference as `external_ref`. Re-importing the same file skips rows
   already imported, so overlapping exports are safe.

## What we need from the real export

The parser currently guesses column names (see `CONSULTATION_COLUMN_ALIASES`).
With a sample export (a few rows, with real names and phone numbers replaced),
we set the exact columns and value mappings for the system:

- A unique reference per consultation (call ID, ticket number…)
- Date and time of the call
- Member ID and/or caller phone number
- Consultation type (how the system labels GP calls, coordinator-only calls, follow-ups, therapy)
- Channel (app, toll-free, callback, video), language
- Clinician name and MDCN number
- Diagnosis and ICD-10 code, if recorded
- Outcome (prescription, lab test, referral, advice…)

Never commit real exports to this repository.
