begin;

create table if not exists public.professional_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  weekday smallint not null,
  start_time text not null,
  end_time text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint professional_schedules_weekday_check check (weekday between 0 and 6),
  constraint professional_schedules_time_check check (start_time < end_time)
);

create unique index if not exists uq_professional_schedules_slot
  on public.professional_schedules (professional_id, weekday, start_time, end_time);

create index if not exists idx_professional_schedules_lookup
  on public.professional_schedules (tenant_id, professional_id, weekday);

create or replace function public.set_professional_schedule_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_professional_schedules_updated_at on public.professional_schedules;
create trigger trg_professional_schedules_updated_at
before update on public.professional_schedules
for each row execute function public.set_professional_schedule_updated_at();

commit;
