-- =====================================================
-- Minha Agenda - Supabase SaaS Schema (multi-tenant)
-- Tabelas + funcoes + triggers + RLS + policies
-- =====================================================

begin;

create extension if not exists pgcrypto;

create schema if not exists app;

-- -----------------------------------------------------
-- Types
-- -----------------------------------------------------

create type app.membership_role as enum ('owner', 'admin', 'staff', 'viewer');
create type app.appointment_status as enum ('confirmed', 'in-progress', 'attention', 'available');
create type app.order_status as enum ('open', 'closed', 'canceled');
create type app.billing_status as enum ('pending', 'partial', 'paid', 'overdue');
create type app.billing_method as enum ('pix', 'card', 'cash', 'transfer');

-- -----------------------------------------------------
-- Helpers
-- -----------------------------------------------------

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function app.has_tenant_access(target_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select exists (
    select 1
    from app.tenant_users tu
    where tu.tenant_id = target_tenant
      and tu.user_id = auth.uid()
  );
$$;

create or replace function app.is_tenant_admin(target_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select exists (
    select 1
    from app.tenant_users tu
    where tu.tenant_id = target_tenant
      and tu.user_id = auth.uid()
      and tu.role in ('owner', 'admin')
  );
$$;

-- -----------------------------------------------------
-- Core SaaS
-- -----------------------------------------------------

create table if not exists app.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  plan text not null default 'starter',
  active boolean not null default true,
  owner_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.tenant_users (
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role app.membership_role not null default 'staff',
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

-- -----------------------------------------------------
-- Domain tables
-- -----------------------------------------------------

create table if not exists app.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  name text not null,
  cpf text,
  phone text not null,
  email text,
  birth_date date,
  notes text,
  tags text[] not null default '{}',
  is_incomplete boolean not null default false,
  last_visit timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.professionals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  name text not null,
  specialty text not null,
  short_name text not null,
  phone text,
  commission_rate numeric(5,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint professionals_commission_check
    check (commission_rate >= 0 and commission_rate <= 100)
);

create table if not exists app.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  name text not null,
  category text not null,
  duration_minutes integer not null,
  price numeric(12,2) not null,
  active boolean not null default true,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_duration_check check (duration_minutes >= 10),
  constraint services_price_check check (price > 0)
);

create table if not exists app.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  client_id uuid references app.clients(id) on delete set null,
  professional_id uuid references app.professionals(id) on delete set null,
  service_id uuid references app.services(id) on delete set null,
  client_name text not null,
  service_name text not null,
  room text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status app.appointment_status not null default 'confirmed',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_time_check check (end_at > start_at)
);

create table if not exists app.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  client_id uuid references app.clients(id) on delete set null,
  professional_id uuid references app.professionals(id) on delete set null,
  item_summary text not null,
  total numeric(12,2) not null,
  status app.order_status not null default 'open',
  created_at timestamptz not null default now(),
  notes text,
  constraint orders_total_check check (total >= 0)
);

create table if not exists app.billing_charges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  client_id uuid references app.clients(id) on delete set null,
  reference text not null,
  amount numeric(12,2) not null,
  paid_amount numeric(12,2) not null default 0,
  due_date date not null,
  status app.billing_status not null default 'pending',
  method app.billing_method not null default 'pix',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_amount_check check (amount >= 0),
  constraint billing_paid_amount_check check (paid_amount >= 0)
);

create table if not exists app.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------
-- Indexes
-- -----------------------------------------------------

create index if not exists idx_tenant_users_user_id on app.tenant_users(user_id);

create index if not exists idx_clients_tenant_id on app.clients(tenant_id);
create index if not exists idx_clients_tenant_name on app.clients(tenant_id, name);
create unique index if not exists idx_clients_tenant_cpf_unique
  on app.clients(tenant_id, cpf)
  where cpf is not null
    and regexp_replace(cpf, '[^0-9]', '', 'g') <> '00000000000';

create index if not exists idx_professionals_tenant_id on app.professionals(tenant_id);
create index if not exists idx_services_tenant_id on app.services(tenant_id);
create index if not exists idx_appointments_tenant_start on app.appointments(tenant_id, start_at);
create index if not exists idx_orders_tenant_created on app.orders(tenant_id, created_at);
create index if not exists idx_billing_tenant_due on app.billing_charges(tenant_id, due_date);
create index if not exists idx_audit_tenant_created on app.audit_logs(tenant_id, created_at);

-- -----------------------------------------------------
-- Triggers
-- -----------------------------------------------------

drop trigger if exists trg_profiles_updated_at on app.profiles;
create trigger trg_profiles_updated_at
before update on app.profiles
for each row execute function app.set_updated_at();

drop trigger if exists trg_tenants_updated_at on app.tenants;
create trigger trg_tenants_updated_at
before update on app.tenants
for each row execute function app.set_updated_at();

drop trigger if exists trg_clients_updated_at on app.clients;
create trigger trg_clients_updated_at
before update on app.clients
for each row execute function app.set_updated_at();

drop trigger if exists trg_professionals_updated_at on app.professionals;
create trigger trg_professionals_updated_at
before update on app.professionals
for each row execute function app.set_updated_at();

drop trigger if exists trg_services_updated_at on app.services;
create trigger trg_services_updated_at
before update on app.services
for each row execute function app.set_updated_at();

drop trigger if exists trg_appointments_updated_at on app.appointments;
create trigger trg_appointments_updated_at
before update on app.appointments
for each row execute function app.set_updated_at();

drop trigger if exists trg_billing_charges_updated_at on app.billing_charges;
create trigger trg_billing_charges_updated_at
before update on app.billing_charges
for each row execute function app.set_updated_at();

-- -----------------------------------------------------
-- Auth onboarding
-- -----------------------------------------------------

create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  insert into app.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function app.handle_new_user();

create or replace function app.create_tenant_with_owner(p_name text, p_slug text default null)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_tenant_id uuid;
  v_slug text;
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'Invalid tenant name';
  end if;

  v_slug := coalesce(nullif(trim(p_slug), ''), lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g')));
  v_slug := trim(both '-' from v_slug);

  if v_slug = '' then
    v_slug := encode(gen_random_bytes(4), 'hex');
  end if;

  insert into app.tenants (name, slug, owner_user_id)
  values (trim(p_name), v_slug, v_user_id)
  returning id into v_tenant_id;

  insert into app.tenant_users (tenant_id, user_id, role)
  values (v_tenant_id, v_user_id, 'owner')
  on conflict do nothing;

  return v_tenant_id;
end;
$$;

-- -----------------------------------------------------
-- Grants
-- -----------------------------------------------------

grant usage on schema app to authenticated, service_role;

grant select, insert, update, delete on all tables in schema app to authenticated;
grant select, insert, update, delete on all tables in schema app to service_role;

alter default privileges in schema app
grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema app
grant select, insert, update, delete on tables to service_role;

grant execute on function app.has_tenant_access(uuid) to authenticated, service_role;
grant execute on function app.is_tenant_admin(uuid) to authenticated, service_role;
grant execute on function app.create_tenant_with_owner(text, text) to authenticated, service_role;

-- -----------------------------------------------------
-- RLS
-- -----------------------------------------------------

alter table app.profiles enable row level security;
alter table app.tenants enable row level security;
alter table app.tenant_users enable row level security;
alter table app.clients enable row level security;
alter table app.professionals enable row level security;
alter table app.services enable row level security;
alter table app.appointments enable row level security;
alter table app.orders enable row level security;
alter table app.billing_charges enable row level security;
alter table app.audit_logs enable row level security;

-- profiles
create policy profiles_select_own
on app.profiles
for select
to authenticated
using (id = auth.uid());

create policy profiles_update_own
on app.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- tenants
create policy tenants_select_member
on app.tenants
for select
to authenticated
using (app.has_tenant_access(id));

create policy tenants_insert_owner
on app.tenants
for insert
to authenticated
with check (owner_user_id = auth.uid());

create policy tenants_update_admin
on app.tenants
for update
to authenticated
using (app.is_tenant_admin(id))
with check (app.is_tenant_admin(id));

-- tenant_users
create policy tenant_users_select_member
on app.tenant_users
for select
to authenticated
using (app.has_tenant_access(tenant_id));

create policy tenant_users_insert_admin
on app.tenant_users
for insert
to authenticated
with check (app.is_tenant_admin(tenant_id));

create policy tenant_users_update_admin
on app.tenant_users
for update
to authenticated
using (app.is_tenant_admin(tenant_id))
with check (app.is_tenant_admin(tenant_id));

create policy tenant_users_delete_admin
on app.tenant_users
for delete
to authenticated
using (app.is_tenant_admin(tenant_id));

-- clients
create policy clients_select_member
on app.clients
for select
to authenticated
using (app.has_tenant_access(tenant_id));

create policy clients_insert_member
on app.clients
for insert
to authenticated
with check (app.has_tenant_access(tenant_id));

create policy clients_update_member
on app.clients
for update
to authenticated
using (app.has_tenant_access(tenant_id))
with check (app.has_tenant_access(tenant_id));

create policy clients_delete_admin
on app.clients
for delete
to authenticated
using (app.is_tenant_admin(tenant_id));

-- professionals
create policy professionals_select_member
on app.professionals
for select
to authenticated
using (app.has_tenant_access(tenant_id));

create policy professionals_insert_member
on app.professionals
for insert
to authenticated
with check (app.has_tenant_access(tenant_id));

create policy professionals_update_member
on app.professionals
for update
to authenticated
using (app.has_tenant_access(tenant_id))
with check (app.has_tenant_access(tenant_id));

create policy professionals_delete_admin
on app.professionals
for delete
to authenticated
using (app.is_tenant_admin(tenant_id));

-- services
create policy services_select_member
on app.services
for select
to authenticated
using (app.has_tenant_access(tenant_id));

create policy services_insert_member
on app.services
for insert
to authenticated
with check (app.has_tenant_access(tenant_id));

create policy services_update_member
on app.services
for update
to authenticated
using (app.has_tenant_access(tenant_id))
with check (app.has_tenant_access(tenant_id));

create policy services_delete_admin
on app.services
for delete
to authenticated
using (app.is_tenant_admin(tenant_id));

-- appointments
create policy appointments_select_member
on app.appointments
for select
to authenticated
using (app.has_tenant_access(tenant_id));

create policy appointments_insert_member
on app.appointments
for insert
to authenticated
with check (app.has_tenant_access(tenant_id));

create policy appointments_update_member
on app.appointments
for update
to authenticated
using (app.has_tenant_access(tenant_id))
with check (app.has_tenant_access(tenant_id));

create policy appointments_delete_member
on app.appointments
for delete
to authenticated
using (app.has_tenant_access(tenant_id));

-- orders
create policy orders_select_member
on app.orders
for select
to authenticated
using (app.has_tenant_access(tenant_id));

create policy orders_insert_member
on app.orders
for insert
to authenticated
with check (app.has_tenant_access(tenant_id));

create policy orders_update_member
on app.orders
for update
to authenticated
using (app.has_tenant_access(tenant_id))
with check (app.has_tenant_access(tenant_id));

create policy orders_delete_admin
on app.orders
for delete
to authenticated
using (app.is_tenant_admin(tenant_id));

-- billing
create policy billing_select_member
on app.billing_charges
for select
to authenticated
using (app.has_tenant_access(tenant_id));

create policy billing_insert_member
on app.billing_charges
for insert
to authenticated
with check (app.has_tenant_access(tenant_id));

create policy billing_update_member
on app.billing_charges
for update
to authenticated
using (app.has_tenant_access(tenant_id))
with check (app.has_tenant_access(tenant_id));

create policy billing_delete_admin
on app.billing_charges
for delete
to authenticated
using (app.is_tenant_admin(tenant_id));

-- audit logs
create policy audit_select_admin
on app.audit_logs
for select
to authenticated
using (app.is_tenant_admin(tenant_id));

create policy audit_insert_member
on app.audit_logs
for insert
to authenticated
with check (app.has_tenant_access(tenant_id));

commit;
