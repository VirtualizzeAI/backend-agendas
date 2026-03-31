begin;

create table if not exists public.professional_specialties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_professional_specialties_tenant_normalized
  on public.professional_specialties (tenant_id, normalized_name);

create index if not exists idx_professional_specialties_tenant
  on public.professional_specialties (tenant_id);

create or replace function public.set_professional_specialties_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_professional_specialties_updated_at on public.professional_specialties;
create trigger trg_professional_specialties_updated_at
before update on public.professional_specialties
for each row execute function public.set_professional_specialties_updated_at();

insert into public.professional_specialties (tenant_id, name, normalized_name)
select distinct p.tenant_id, trim(p.specialty), lower(trim(p.specialty))
from public.professionals p
where trim(coalesce(p.specialty, '')) <> ''
on conflict (tenant_id, normalized_name) do update
set name = excluded.name,
    updated_at = now();

commit;
