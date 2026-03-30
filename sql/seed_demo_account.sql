-- Seed de conta de exemplo — Demo Salão
-- Insere tenant, profissionais, serviços, clientes, agendamentos, links e configurações.
-- Execute este arquivo no editor SQL do Supabase ou via psql contra o banco.

BEGIN;

DO $$
DECLARE
  t_id uuid;
BEGIN
  -- Verifica existência da tabela tenants no schema public
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tenants'
  ) THEN
    RAISE NOTICE 'Tabela public.tenants não encontrada — pulando seed para public schema.';
    RETURN;
  END IF;

  -- Cria tenant demo (ou obtém se já existir)
  SELECT id INTO t_id FROM public.tenants WHERE slug = 'demo-salao' LIMIT 1;

  IF t_id IS NULL THEN
    INSERT INTO public.tenants (
      id, name, slug, booking_start_time, booking_end_time, contact, whatsapp, plan, plan_price, city, state, country, created_at
    ) VALUES (
      '11111111-1111-1111-1111-111111111111'::uuid,
      'Demo Salão Virtualizze',
      'demo-salao',
      '08:00',
      '19:00',
      'contato@demo.com',
      '+5511999999999',
      'pro',
      129.00,
      'São Paulo',
      'SP',
      'Brasil',
      now()
    ) RETURNING id INTO t_id;
  END IF;

  -- Profissionais de exemplo
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'professionals') THEN
    INSERT INTO public.professionals (id, tenant_id, name, specialty, short_name, phone, commission_rate, active, created_at)
    VALUES
      ('00000000-0000-0000-0000-000000000011'::uuid, t_id, 'Ana Silva', 'Cabeleireira', 'Ana', '+5511987654321', 20.00, true, now()),
      ('00000000-0000-0000-0000-000000000012'::uuid, t_id, 'Carlos Souza', 'Barbeiro', 'Carlos', '+5511987654322', 15.00, true, now()),
      ('00000000-0000-0000-0000-000000000013'::uuid, t_id, 'Mariana Costa', 'Estética', 'Mariana', '+5511987654323', 18.00, true, now())
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Serviços / procedimentos de exemplo
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'services') THEN
    INSERT INTO public.services (id, tenant_id, name, category, duration_minutes, price, active, description, created_at)
    VALUES
      ('00000000-0000-0000-0000-000000000101'::uuid, t_id, 'Corte Simples', 'cabelo', 30, 45.00, true, 'Corte rápido e estilizado', now()),
      ('00000000-0000-0000-0000-000000000102'::uuid, t_id, 'Coloração', 'cabelo', 90, 250.00, true, 'Coloração com técnica profissional', now()),
      ('00000000-0000-0000-0000-000000000103'::uuid, t_id, 'Manicure', 'unhas', 45, 60.00, true, 'Manicure completa', now()),
      ('00000000-0000-0000-0000-000000000104'::uuid, t_id, 'Limpeza de Pele', 'estetica', 60, 120.00, true, 'Limpeza facial profunda', now())
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Clientes de exemplo
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clients') THEN
    INSERT INTO public.clients (id, tenant_id, name, cpf, phone, email, birth_date, notes, tags, last_visit, created_at)
    VALUES
      ('00000000-0000-0000-0000-000000000201'::uuid, t_id, 'João Pereira', '123.456.789-09', '+5511999888777', 'joao@example.com', '1990-05-12', 'Cliente VIP', ARRAY['vip','recorrente'], now() - INTERVAL '10 days', now()),
      ('00000000-0000-0000-0000-000000000202'::uuid, t_id, 'Maria Oliveira', '987.654.321-00', '+5511999777666', 'maria@example.com', '1985-11-20', 'Prefere horários à tarde', ARRAY['tarde'], now() - INTERVAL '30 days', now()),
      ('00000000-0000-0000-0000-000000000203'::uuid, t_id, 'Lucas Almeida', '111.222.333-44', '+5511999666555', 'lucas@example.com', '1995-08-03', '', ARRAY[]::text[], NULL, now())
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Agendamentos de exemplo (datas relativas ao dia atual)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'appointments') THEN
    INSERT INTO public.appointments (id, tenant_id, client_id, professional_id, service_id, client_name, service_name, room, start_at, end_at, status, notes, created_at)
    VALUES
      ('00000000-0000-0000-0000-000000000301'::uuid, t_id, '00000000-0000-0000-0000-000000000201'::uuid, '00000000-0000-0000-0000-000000000011'::uuid, '00000000-0000-0000-0000-000000000101'::uuid, 'João Pereira', 'Corte Simples', 'Sala 1', ((now()::date + 1)::text || ' 10:00:00-03')::timestamptz, ((now()::date + 1)::text || ' 10:30:00-03')::timestamptz, 'confirmed', 'Chegou 5 minutos adiantado', now()),
      ('00000000-0000-0000-0000-000000000302'::uuid, t_id, '00000000-0000-0000-0000-000000000202'::uuid, '00000000-0000-0000-0000-000000000012'::uuid, '00000000-0000-0000-0000-000000000102'::uuid, 'Maria Oliveira', 'Coloração', 'Sala 2', ((now()::date + 1)::text || ' 14:00:00-03')::timestamptz, ((now()::date + 1)::text || ' 15:30:00-03')::timestamptz, 'confirmed', 'Deseja loiro acinzentado', now()),
      ('00000000-0000-0000-0000-000000000303'::uuid, t_id, '00000000-0000-0000-0000-000000000203'::uuid, '00000000-0000-0000-0000-000000000013'::uuid, '00000000-0000-0000-0000-000000000103'::uuid, 'Lucas Almeida', 'Manicure', 'Sala 3', ((now()::date)::text || ' 16:00:00-03')::timestamptz, ((now()::date)::text || ' 16:45:00-03')::timestamptz, 'confirmed', NULL, now()),
      ('00000000-0000-0000-0000-000000000304'::uuid, t_id, '00000000-0000-0000-0000-000000000201'::uuid, '00000000-0000-0000-0000-000000000013'::uuid, '00000000-0000-0000-0000-000000000104'::uuid, 'João Pereira', 'Limpeza de Pele', 'Sala 3', ((now()::date + 2)::text || ' 09:00:00-03')::timestamptz, ((now()::date + 2)::text || ' 10:00:00-03')::timestamptz, 'confirmed', 'Primeira sessão', now())
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Link de agendamento público
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_links') THEN
    IF NOT EXISTS (SELECT 1 FROM public.booking_links WHERE slug = 'demo-salao') THEN
      INSERT INTO public.booking_links (id, tenant_id, slug, active, created_by, created_at)
      VALUES (gen_random_uuid(), t_id, 'demo-salao', true, NULL, now());
    END IF;
  END IF;

  -- Horários padrão (professional_schedules)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'professional_schedules') THEN
    INSERT INTO public.professional_schedules (id, tenant_id, professional_id, weekday, start_time, end_time, created_at)
    VALUES
      (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000011'::uuid, 1, '08:00', '18:00', now()),
      (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000011'::uuid, 2, '08:00', '18:00', now()),
      (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000012'::uuid, 1, '09:00', '17:00', now()),
      (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000012'::uuid, 3, '09:00', '17:00', now()),
      (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000013'::uuid, 1, '10:00', '18:00', now())
    ON CONFLICT DO NOTHING;
  END IF;

  -- Configurações de agenda (intervalo/min notice)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'professional_schedule_settings') THEN
    INSERT INTO public.professional_schedule_settings (id, tenant_id, professional_id, slot_interval_minutes, min_booking_notice_minutes, created_at)
    VALUES
      (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000011'::uuid, 30, 60, now()),
      (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000012'::uuid, 30, 30, now()),
      (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000013'::uuid, 30, 0, now())
    ON CONFLICT DO NOTHING;
  END IF;

  -- Tenant settings (categorias e status)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenant_settings') THEN
    INSERT INTO public.tenant_settings (tenant_id, service_categories, appointment_statuses, created_at)
    VALUES (t_id, ARRAY['cabelo','estetica','unhas','terapia','pacote'], ARRAY['confirmed','in-progress','attention','available'], now())
    ON CONFLICT (tenant_id) DO UPDATE
    SET service_categories = EXCLUDED.service_categories,
        appointment_statuses = EXCLUDED.appointment_statuses,
        updated_at = now();
  END IF;

  -- Pedido e cobrança de exemplo
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
    INSERT INTO public.orders (id, tenant_id, client_id, professional_id, item_summary, total, status, created_at, notes)
    VALUES (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000201'::uuid, '00000000-0000-0000-0000-000000000011'::uuid, 'Corte + Limpeza de Pele', 165.00, 'open', now(), 'Venda presencial')
    ON CONFLICT DO NOTHING;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'billing_charges') THEN
    INSERT INTO public.billing_charges (id, tenant_id, client_id, reference, amount, paid_amount, due_date, status, method, created_at)
    VALUES (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000201'::uuid, 'Fatura exemplo', 165.00, 0, (now()::date + 7), 'pending', 'pix', now())
    ON CONFLICT DO NOTHING;
  END IF;

  RAISE NOTICE 'Seed concluído para tenant_id=%', t_id;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- =========================
-- Consultas de relatórios de exemplo (execute separadamente)
-- =========================
-- 1) Ocupação por dia (próximos 7 dias)
-- SELECT date(start_at) AS dia, professional_id, count(*) AS agendamentos
-- FROM public.appointments
-- WHERE tenant_id = '11111111-1111-1111-1111-111111111111'::uuid
--   AND start_at >= now()::date
--   AND start_at < now()::date + interval '7 days'
-- GROUP BY dia, professional_id
-- ORDER BY dia, professional_id;

-- 2) Receita por serviço (últimos 30 dias, baseada em orders)
-- SELECT item_summary, sum(total) AS receita
-- FROM public.orders
-- WHERE tenant_id = '11111111-1111-1111-1111-111111111111'::uuid
--   AND created_at >= now() - interval '30 days'
-- GROUP BY item_summary
-- ORDER BY receita DESC;

-- 3) Top clientes por número de visitas
-- SELECT c.name, count(a.*) AS visitas
-- FROM public.clients c
-- JOIN public.appointments a ON a.client_id = c.id
-- WHERE c.tenant_id = '11111111-1111-1111-1111-111111111111'::uuid
-- GROUP BY c.name
-- ORDER BY visitas DESC
-- LIMIT 10;
