begin;

create table if not exists public.professional_schedule_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  slot_interval_minutes integer not null default 30,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint professional_schedule_settings_interval_check
    check (slot_interval_minutes in (5, 10, 15, 20, 30, 45, 60))
);

create unique index if not exists uq_professional_schedule_settings_professional
  on public.professional_schedule_settings (professional_id);

create index if not exists idx_professional_schedule_settings_tenant_professional
  on public.professional_schedule_settings (tenant_id, professional_id);

create or replace function public.set_professional_schedule_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_professional_schedule_settings_updated_at on public.professional_schedule_settings;
create trigger trg_professional_schedule_settings_updated_at
before update on public.professional_schedule_settings
for each row execute function public.set_professional_schedule_settings_updated_at();

commit;
