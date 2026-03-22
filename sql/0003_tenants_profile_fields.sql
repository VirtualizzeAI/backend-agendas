begin;

alter table if exists public.tenants
  add column if not exists document text,
  add column if not exists street text,
  add column if not exists number text,
  add column if not exists district text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists country text default 'Brasil',
  add column if not exists contact text,
  add column if not exists whatsapp text,
  add column if not exists team_size integer default 1,
  add column if not exists plan_price numeric(12,2),
  add column if not exists contract_date date,
  add column if not exists due_date date;

commit;
