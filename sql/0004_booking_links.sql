begin;

create table if not exists public.booking_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  slug text not null unique,
  active boolean not null default true,
  expires_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_links_slug_min_length check (length(trim(slug)) >= 8)
);

create index if not exists idx_booking_links_tenant_active
  on public.booking_links (tenant_id, active, created_at desc);

create index if not exists idx_booking_links_slug
  on public.booking_links (slug);

create or replace function public.set_booking_link_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_booking_links_updated_at on public.booking_links;
create trigger trg_booking_links_updated_at
before update on public.booking_links
for each row execute function public.set_booking_link_updated_at();

commit;
