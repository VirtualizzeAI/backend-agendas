begin;

alter table if exists public.professional_schedule_settings
  drop constraint if exists professional_schedule_settings_interval_check;

alter table if exists public.professional_schedule_settings
  add constraint professional_schedule_settings_interval_check
    check (slot_interval_minutes >= 1 and slot_interval_minutes <= 1440);

commit;
