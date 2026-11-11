-- Supabase gives the API roles full rights on every new table, view, sequence
-- and function in the public schema, and relies on row-level security for
-- access control. Reproduce that locally, before the migrations run, so the
-- migrations must revoke anything they don't want exposed, as on Supabase.
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
