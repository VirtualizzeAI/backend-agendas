begin;

create table if not exists public.tenant_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  service_categories text[] not null default array['podologia', 'estetica', 'unhas', 'terapia', 'pacote'],
  appointment_statuses text[] not null default array['confirmed', 'in-progress', 'attention', 'available'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_tenant_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tenant_settings_updated_at on public.tenant_settings;
create trigger trg_tenant_settings_updated_at
before update on public.tenant_settings
for each row execute function public.set_tenant_settings_updated_at();

alter table if exists public.appointments
  alter column status type text using status::text;

alter table if exists public.appointments
  alter column status set default 'confirmed';

commit;
