-- Staff details for the admin console, and a payment history for invoices.

-- ── Staff profile details ───────────────────────────────────────────────
create type public.account_status as enum ('invited', 'active', 'disabled');

alter table public.profiles
  add column email text,
  add column languages public.call_language[] not null default '{english}',
  add column licence_expires_on date,
  add column status public.account_status not null default 'active';

create unique index profiles_email_idx on public.profiles (lower(email)) where email is not null;

-- ── Invoice payments ────────────────────────────────────────────────────
-- Every payment is kept. The invoice's paid amount and status follow from
-- them, so finance never edits a total by hand.
create table public.invoice_payments (
  id bigint generated always as identity primary key,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  amount_kobo bigint not null check (amount_kobo > 0),
  paid_on date not null,
  reference text,
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index invoice_payments_invoice_idx on public.invoice_payments (invoice_id);

create function public.apply_invoice_payment() returns trigger
language plpgsql set search_path = ''
as $$
declare
  inv public.invoices%rowtype;
  paid bigint;
begin
  select * into inv from public.invoices where id = new.invoice_id for update;
  if inv.status in ('draft', 'void') then
    raise exception 'Invoice % has not been sent, so it cannot be paid', inv.number;
  end if;
  select coalesce(sum(amount_kobo), 0) into paid from public.invoice_payments where invoice_id = new.invoice_id;
  if paid > inv.total_kobo then
    raise exception 'Payments (% kobo) would exceed invoice % total (% kobo)', paid, inv.number, inv.total_kobo;
  end if;
  update public.invoices
     set paid_kobo = paid,
         status = case when paid = inv.total_kobo then 'paid'::public.invoice_status else 'part_paid'::public.invoice_status end
   where id = new.invoice_id;
  return new;
end $$;

create trigger invoice_payments_apply
after insert on public.invoice_payments
for each row execute function public.apply_invoice_payment();

alter table public.invoice_payments enable row level security;

create policy invoice_payments_read on public.invoice_payments for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id
                 and (public.has_role('ops_admin', 'finance')
                      or (i.client_id = public.current_client_id() and public.has_role('client_admin', 'client_finance')))));
create policy invoice_payments_insert on public.invoice_payments for insert to authenticated
  with check (public.has_role('finance') and recorded_by = auth.uid());
