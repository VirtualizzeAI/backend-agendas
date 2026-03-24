begin;

alter table if exists public.tenants
  add column if not exists whatsapp_wuzapi_enabled boolean not null default false,
  add column if not exists whatsapp_wuzapi_connected_number text,
  add column if not exists whatsapp_confirmation_template text;

commit;