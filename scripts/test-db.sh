#!/usr/bin/env bash
# Apply the migrations to a throwaway local Postgres and check the access rules.
# Needs PostgreSQL 15+ server binaries (initdb, pg_ctl) and psql.
set -euo pipefail
shopt -s inherit_errexit 2>/dev/null || true

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(dirname "$(command -v pg_ctl 2>/dev/null || ls /usr/lib/postgresql/*/bin/pg_ctl 2>/dev/null | sort -V | tail -1)")}"
PORT="${PGPORT_TEST:-54329}"
DATA="$(mktemp -d)"

# Postgres refuses to run as root; use the postgres system user in that case.
as_pg() {
  if [ "$(id -u)" = "0" ]; then runuser -u postgres -- "$@"; else "$@"; fi
}
[ "$(id -u)" = "0" ] && chown postgres "$DATA"

cleanup() {
  as_pg "$PGBIN/pg_ctl" -D "$DATA" stop -m fast >/dev/null 2>&1 || true
  rm -rf "$DATA"
}
trap cleanup EXIT

as_pg "$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
as_pg "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses=''" -l "$DATA/server.log" -w start >/dev/null

run_sql() {
  # Query results are discarded; checks report through NOTICE/ERROR messages.
  psql -h "$DATA" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -o /dev/null -f "$1" 2>&1 \
    | sed -E 's/^psql:[^ ]+ (NOTICE|ERROR):  /\1: /'
}

run_sql "$ROOT/supabase/tests/auth_shim.sql"
for migration in "$ROOT"/supabase/migrations/*.sql; do
  echo "Applying $(basename "$migration")"
  run_sql "$migration"
done
run_sql "$ROOT/supabase/tests/grants_shim.sql"
run_sql "$ROOT/supabase/seed.sql"
run_sql "$ROOT/supabase/tests/access_rules.sql"

echo "Database tests passed"
