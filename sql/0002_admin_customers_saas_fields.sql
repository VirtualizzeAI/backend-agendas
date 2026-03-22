begin;

alter table if exists public.admin_customers
  add column if not exists saas_email text,
  add column if not exists saas_user_id uuid references auth.users(id),
  add column if not exists tenant_id uuid references public.tenants(id);

create index if not exists idx_admin_customers_saas_user_id
  on public.admin_customers(saas_user_id);

create index if not exists idx_admin_customers_tenant_id
  on public.admin_customers(tenant_id);

commit;
