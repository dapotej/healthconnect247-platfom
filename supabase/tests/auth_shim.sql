-- Local test stand-in for the parts of Supabase the migrations depend on.
-- NOT applied to real Supabase projects, which already provide all of this.

create role anon nologin;
create role authenticated nologin;

create schema auth;
create table auth.users (id uuid primary key);

-- Supabase's auth.uid() reads the signed-in user's id from the request JWT.
create function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
