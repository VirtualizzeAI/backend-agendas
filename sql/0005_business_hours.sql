begin;

-- Janela de atendimento configurável por empresa (usada no autoagendamento público)
alter table if exists public.tenants
  add column if not exists booking_start_time text not null default '08:00',
  add column if not exists booking_end_time   text not null default '18:00';

commit;
