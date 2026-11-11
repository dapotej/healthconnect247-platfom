-- Sample data for local development only. Client names are placeholders,
-- matching the mockups. Never put real member or patient data here.

insert into public.clients (id, name, type, is_pilot) values
  ('00000000-0000-0000-0000-00000000000a', 'Lagos State Government', 'government', false),
  ('00000000-0000-0000-0000-0000000000a1', '[HMO A]', 'hmo', false),
  ('00000000-0000-0000-0000-0000000000b1', '[HMO B]', 'hmo', false),
  ('00000000-0000-0000-0000-0000000000c1', '[HMO C]', 'hmo', false),
  ('00000000-0000-0000-0000-0000000000d1', '[HMO D]', 'hmo', true);

-- Rates from the sales deck, in kobo.
insert into public.contracts (id, client_id, pricing_model, starts_on, ends_on, platform_fee_kobo, pmpm_kobo) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'unlimited', '2026-01-01', '2026-12-31', 0, 35000),
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'flex', '2026-07-01', '2027-06-30', 0, 0),
  ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'payg', '2026-04-01', '2027-03-31', 25000000, 0),
  ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'flex', '2026-10-01', '2027-09-30', 0, 0),
  ('10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'payg', '2026-11-01', '2027-01-31', 25000000, 0);

insert into public.contract_rates (contract_id, consultation_type, rate_kobo)
select c.id, r.type::public.consultation_type, r.rate
from public.contracts c
cross join lateral (values
  ('coordinator_resolved', case c.pricing_model when 'flex' then 70000 else 80000 end),
  ('gp',                   case c.pricing_model when 'flex' then 380000 else 450000 end),
  ('follow_up',            case c.pricing_model when 'flex' then 170000 else 200000 end),
  ('therapy',              case c.pricing_model when 'flex' then 1000000 else 1200000 end)
) as r(type, rate)
where c.pricing_model in ('flex', 'payg');
