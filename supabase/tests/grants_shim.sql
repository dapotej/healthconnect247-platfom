-- Supabase grants table privileges to the API roles by default and relies on
-- row-level security for access control. Reproduce that locally.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
-- The views revoke anon in the migration; re-assert it after the blanket grant.
revoke all on public.client_consultations, public.billing_consultations, public.client_credit_balances from anon;
