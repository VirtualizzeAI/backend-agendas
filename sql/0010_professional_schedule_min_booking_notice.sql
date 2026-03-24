begin;

alter table if exists public.professional_schedule_settings
  add column if not exists min_booking_notice_minutes integer not null default 0;

alter table if exists public.professional_schedule_settings
  drop constraint if exists professional_schedule_settings_min_booking_notice_check;

alter table if exists public.professional_schedule_settings
  add constraint professional_schedule_settings_min_booking_notice_check
    check (min_booking_notice_minutes >= 0 and min_booking_notice_minutes <= 43200);

commit;
