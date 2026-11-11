# Importing consultations from the EMR

Until the clinician console replaces it, consultations come from HealthConnect's
EMR: an Excel export of encounters with their doctor's notes, one row per
encounter. A sample (November 2026, names removed) was used to set this up. It
is not in this repository and must never be added.

## What is read, and what is never read

Only these columns are used:

| Field | EMR column | Notes |
|---|---|---|
| Reference | `Encounter_EncounterId` | Re-importing skips references already imported, so overlapping exports are safe |
| Date and time | `Encounter_EncounterDate` | Lagos time |
| Client | `Encounter_ServiceName` | e.g. "HYGEIA", "THT HMO". Matched against each client's EMR names (`clients.emr_names`) |
| Patient code | `Patient_PatientCode` | The EMR's own patient number; remembered on the member once matched |
| Phone | `Encounter_ContactNumber` | Excel drops the leading 0; `8062811030` is read as +234 806 281 1030 |
| Type | `Encounter_EncounterSubType`, else `Encounter_EncounterType` | "Medical Consultation" → GP; "Medical Inquiry" → resolved without a consultation |
| Channel | `Encounter_CommunicationMethod` | Phone → phone call (the EMR can't tell toll-free from in-app calls); Video → app video; Portal → web portal |
| Status | `Encounter_Status`, `DoctorNote_NoteStatus` | Open encounters and draft notes are held back, not imported |
| Clinician | `DocumentingDoctorName`, else `AssignedDoctorName` | |
| Diagnosis | `DoctorNote_ICD10Code`, `DoctorNote_ICD10Description` | **ICD-11**, despite the column name. HMOs accept ICD-11. Kept exactly as recorded |
| Outcome | `Encounter_ClinicalOutcome` | Free text, often the full prescription; only a category is kept (prescription, lab test, referral, advice) |

Everything else is ignored and never stored: the reason for the encounter,
complaint, history, vitals, examination, assessment, plan, follow-up reason,
gender and staff IDs. Clinical notes stay in the EMR.

## How an import works

1. `parseConsultationTable` (packages/core) reads the rows and reports, by
   spreadsheet row number: consultations ready to import, encounters not
   finished yet (import them again once closed), and rows with problems.
2. `matchClient` finds the client from the service name. Names that aren't set
   up on a client (for example "SELF PAID", "Test Hmo" or "Student Health
   Consultation") are listed so operations can add the name or leave the row out.
3. `matchMember` finds the member within that client: a patient code matched
   before, then member ID (if a future export includes the HMO enrollee ID),
   then a phone number exactly one member has. Unmatched rows are listed for
   review. Once matched, the patient code is saved on the member.
4. `contractOn` + `priceConsultation` price it under the client's contract in
   force that day (Flex → credit, pay-as-you-go → invoice, Unlimited → included).
5. The consultation is saved with `source = 'emr_import'` and the encounter ID
   as `external_ref`.

The sample's 159 rows gave 142 consultations ready to import, 17 still open and
no rows with problems.

## Still to confirm

- **Enrollee IDs.** The export has no HMO enrollee/policy number, so first
  matches rely on phone numbers. If the EMR can add the enrollee ID column,
  matching becomes reliable (it's read automatically as `member id` /
  `enrollee id`).
- **Therapy.** Therapy sessions are in the same EMR under an encounter type not
  in the sample. Any type containing "therapy", "counselling", "psych" or
  "mental" is read as therapy; check the real name when the first one appears.
- **Medical Inquiry.** Treated as resolved without a consultation (the
  coordinator rate). Change `mapConsultationType` if it should be billed as a GP
  consultation.
- **Language** isn't in the export, so imported consultations have none.

Never commit EMR exports to this repository.
