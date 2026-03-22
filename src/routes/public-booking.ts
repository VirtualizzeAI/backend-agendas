import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getTenantIdFromQuery, requireAuthenticatedClient } from '../lib/request.js';
import { supabaseAdmin } from '../lib/supabase.js';

const slotQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  professionalId: z.uuid(),
  serviceDurationMinutes: z.coerce.number().int().min(10).max(600).optional(),
  serviceIds: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) return [] as string[];
      return value.split(',').map((id) => id.trim()).filter(Boolean);
    }),
});

const createPublicAppointmentSchema = z.object({
  professionalId: z.uuid(),
  serviceId: z.uuid().optional(),
  serviceIds: z.array(z.uuid()).min(1).optional(),
  startAt: z.iso.datetime(),
  clientName: z.string().min(2),
  clientPhone: z.string().min(8),
  clientCpf: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

function randomSlug(size = 20) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < size; i += 1) {
    const idx = Math.floor(Math.random() * chars.length);
    out += chars[idx] ?? 'a';
  }
  return out;
}

function toMinuteOfDay(dateIso: string): number {
  const d = new Date(dateIso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function normalizeDigits(value?: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

export async function publicBookingRoutes(app: FastifyInstance) {
  app.get('/v1/booking-links/current', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const tenantId = getTenantIdFromQuery(request, reply);
    if (!tenantId) return;

    const { data: membership, error: membershipError } = await auth.supabase
      .from('tenant_users')
      .select('tenant_id')
      .eq('tenant_id', tenantId)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (membershipError) {
      request.log.error(membershipError);
      return reply.code(500).send({ message: membershipError.message });
    }

    if (!membership) {
      return reply.code(403).send({ message: 'Sem acesso ao tenant' });
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('booking_links')
      .select('id, tenant_id, slug, active, expires_at, created_at')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .is('expires_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      request.log.error(existingError);
      return reply.code(500).send({ message: existingError.message });
    }

    if (existing) {
      return { slug: existing.slug, urlPath: `/agendar/${existing.slug}` };
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = randomSlug();
      const { data: created, error: createError } = await supabaseAdmin
        .from('booking_links')
        .insert({
          tenant_id: tenantId,
          slug,
          active: true,
          created_by: auth.user.id,
        })
        .select('slug')
        .single();

      if (!createError && created) {
        return reply.code(201).send({ slug: created.slug, urlPath: `/agendar/${created.slug}` });
      }

      if (createError && !createError.message.toLowerCase().includes('duplicate')) {
        request.log.error(createError);
        return reply.code(500).send({ message: createError.message });
      }
    }

    return reply.code(500).send({ message: 'Nao foi possivel gerar o link de agendamento' });
  });

  app.get('/v1/public/booking/:slug/bootstrap', async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const { data: link, error: linkError } = await supabaseAdmin
      .from('booking_links')
      .select('tenant_id, active, expires_at')
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle();

    if (linkError) {
      request.log.error(linkError);
      return reply.code(500).send({ message: linkError.message });
    }

    if (!link) {
      return reply.code(404).send({ message: 'Link de agendamento nao encontrado' });
    }

    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      return reply.code(410).send({ message: 'Link de agendamento expirado' });
    }

    const [{ data: tenant, error: tenantError }, { data: professionals, error: professionalsError }, { data: services, error: servicesError }] = await Promise.all([
      supabaseAdmin
        .from('tenants')
        .select('id, name')
        .eq('id', link.tenant_id)
        .single(),
      supabaseAdmin
        .from('professionals')
        .select('id, name, specialty')
        .eq('tenant_id', link.tenant_id)
        .or('active.eq.true,active.is.null')
        .order('name', { ascending: true }),
      supabaseAdmin
        .from('services')
        .select('id, name, duration_minutes, price')
        .eq('tenant_id', link.tenant_id)
        .or('active.eq.true,active.is.null')
        .order('name', { ascending: true }),
    ]);

    if (tenantError || professionalsError || servicesError) {
      request.log.error(tenantError ?? professionalsError ?? servicesError);
      return reply.code(500).send({ message: (tenantError ?? professionalsError ?? servicesError)?.message });
    }

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
      },
      professionals: professionals ?? [],
      services: services ?? [],
    };
  });

  app.get('/v1/public/booking/:slug/slots', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const parsed = slotQuerySchema.safeParse(request.query ?? {});

    if (!parsed.success) {
      return reply.code(400).send({ message: 'Parametros invalidos', issues: parsed.error.issues });
    }

    const { data: link, error: linkError } = await supabaseAdmin
      .from('booking_links')
      .select('tenant_id, active, expires_at')
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle();

    if (linkError) {
      request.log.error(linkError);
      return reply.code(500).send({ message: linkError.message });
    }

    if (!link) {
      return reply.code(404).send({ message: 'Link de agendamento nao encontrado' });
    }

    const { date, professionalId } = parsed.data;
    const queryServiceIds = parsed.data.serviceIds;

    let resolvedServiceDurationMinutes = parsed.data.serviceDurationMinutes ?? null;
    if (queryServiceIds.length > 0) {
      const { data: services, error: servicesError } = await supabaseAdmin
        .from('services')
        .select('id, duration_minutes')
        .eq('tenant_id', link.tenant_id)
        .in('id', queryServiceIds);

      if (servicesError) {
        request.log.error(servicesError);
        return reply.code(500).send({ message: servicesError.message });
      }

      if (!services || services.length !== queryServiceIds.length) {
        return reply.code(400).send({ message: 'Serviço inválido para este link' });
      }

      resolvedServiceDurationMinutes = services.reduce((sum, service) => sum + service.duration_minutes, 0);
    }

    if (!resolvedServiceDurationMinutes) {
      resolvedServiceDurationMinutes = 30;
    }
    const dayStart = `${date}T00:00:00.000Z`;
    const dayEnd = `${date}T23:59:59.999Z`;

    const { data: appointments, error: apptError } = await supabaseAdmin
      .from('appointments')
      .select('start_at, end_at')
      .eq('tenant_id', link.tenant_id)
      .eq('professional_id', professionalId)
      .gte('start_at', dayStart)
      .lte('start_at', dayEnd)
      .order('start_at', { ascending: true });

    if (apptError) {
      request.log.error(apptError);
      return reply.code(500).send({ message: apptError.message });
    }

    const slotStartMinutes = 8 * 60;
    const slotEndMinutes = 19 * 60;
    const step = 30;

    const occupied = (appointments ?? []).map((item) => ({
      start: toMinuteOfDay(item.start_at),
      end: toMinuteOfDay(item.end_at),
    }));

    const slots: Array<{ value: string; label: string }> = [];

    for (let start = slotStartMinutes; start + resolvedServiceDurationMinutes <= slotEndMinutes; start += step) {
      const end = start + resolvedServiceDurationMinutes;
      const hasConflict = occupied.some((o) => start < o.end && end > o.start);
      if (hasConflict) continue;

      const h = String(Math.floor(start / 60)).padStart(2, '0');
      const m = String(start % 60).padStart(2, '0');
      slots.push({ value: `${h}:${m}`, label: `${h}:${m}` });
    }

    return { date, slots };
  });

  app.post('/v1/public/booking/:slug/appointments', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const parsed = createPublicAppointmentSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.code(400).send({ message: 'Payload invalido', issues: parsed.error.issues });
    }

    const { data: link, error: linkError } = await supabaseAdmin
      .from('booking_links')
      .select('tenant_id, active, expires_at')
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle();

    if (linkError) {
      request.log.error(linkError);
      return reply.code(500).send({ message: linkError.message });
    }

    if (!link) {
      return reply.code(404).send({ message: 'Link de agendamento nao encontrado' });
    }

    const payload = parsed.data;
    const effectiveServiceIds = payload.serviceIds?.length
      ? payload.serviceIds
      : payload.serviceId
        ? [payload.serviceId]
        : [];

    if (effectiveServiceIds.length === 0) {
      return reply.code(400).send({ message: 'Selecione ao menos um serviço' });
    }

    const { data: services, error: serviceError } = await supabaseAdmin
      .from('services')
      .select('id, tenant_id, name, duration_minutes, price')
      .in('id', effectiveServiceIds)
      .eq('tenant_id', link.tenant_id)
      .order('name', { ascending: true });

    if (serviceError || !services || services.length !== effectiveServiceIds.length) {
      request.log.error(serviceError);
      return reply.code(400).send({ message: 'Serviço inválido para este link' });
    }

    const totalDurationMinutes = services.reduce((sum, service) => sum + service.duration_minutes, 0);
    const serviceNames = services.map((service) => service.name);
    const serviceSummary = serviceNames.join(' + ');
    const totalPrice = services.reduce((sum, service) => sum + Number(service.price ?? 0), 0);

    const startDate = new Date(payload.startAt);
    if (Number.isNaN(startDate.getTime())) {
      return reply.code(400).send({ message: 'Horario inicial invalido' });
    }

    const endDate = new Date(startDate.getTime() + totalDurationMinutes * 60 * 1000);
    const datePart = payload.startAt.slice(0, 10);
    const dayStart = `${datePart}T00:00:00.000Z`;
    const dayEnd = `${datePart}T23:59:59.999Z`;

    const { data: dayAppointments, error: dayAppointmentsError } = await supabaseAdmin
      .from('appointments')
      .select('start_at, end_at')
      .eq('tenant_id', link.tenant_id)
      .eq('professional_id', payload.professionalId)
      .gte('start_at', dayStart)
      .lte('start_at', dayEnd);

    if (dayAppointmentsError) {
      request.log.error(dayAppointmentsError);
      return reply.code(500).send({ message: dayAppointmentsError.message });
    }

    const startMinutes = toMinuteOfDay(payload.startAt);
    const endMinutes = toMinuteOfDay(endDate.toISOString());

    const hasConflict = (dayAppointments ?? []).some((row) => {
      const rowStart = toMinuteOfDay(row.start_at);
      const rowEnd = toMinuteOfDay(row.end_at);
      return startMinutes < rowEnd && endMinutes > rowStart;
    });

    if (hasConflict) {
      return reply.code(409).send({ message: 'Horario indisponivel. Escolha outro horario.' });
    }

    const cpfDigits = normalizeDigits(payload.clientCpf);
    const phoneDigits = normalizeDigits(payload.clientPhone);

    let clientId: string | null = null;

    if (cpfDigits) {
      const { data: foundByCpf } = await supabaseAdmin
        .from('clients')
        .select('id')
        .eq('tenant_id', link.tenant_id)
        .eq('cpf', cpfDigits)
        .limit(1)
        .maybeSingle();

      clientId = foundByCpf?.id ?? null;
    }

    if (!clientId && phoneDigits) {
      const { data: foundByPhone } = await supabaseAdmin
        .from('clients')
        .select('id')
        .eq('tenant_id', link.tenant_id)
        .eq('phone', phoneDigits)
        .limit(1)
        .maybeSingle();

      clientId = foundByPhone?.id ?? null;
    }

    if (!clientId) {
      const { data: createdClient, error: createClientError } = await supabaseAdmin
        .from('clients')
        .insert({
          tenant_id: link.tenant_id,
          name: payload.clientName.trim(),
          phone: phoneDigits ?? payload.clientPhone.trim(),
          cpf: cpfDigits,
          tags: ['new'],
          is_incomplete: false,
        })
        .select('id')
        .single();

      if (createClientError || !createdClient) {
        request.log.error(createClientError);
        return reply.code(400).send({ message: createClientError?.message ?? 'Erro ao criar cliente' });
      }

      clientId = createdClient.id;
    }

    const { data: createdAppointment, error: createAppointmentError } = await supabaseAdmin
      .from('appointments')
      .insert({
        tenant_id: link.tenant_id,
        client_id: clientId,
        professional_id: payload.professionalId,
        service_id: services[0]?.id ?? null,
        client_name: payload.clientName.trim(),
        service_name: serviceSummary,
        start_at: startDate.toISOString(),
        end_at: endDate.toISOString(),
        status: 'confirmed',
        notes:
          payload.notes?.trim() ||
          `Serviços: ${serviceSummary} | Valor total: R$ ${totalPrice.toFixed(2).replace('.', ',')}`,
      })
      .select('id, start_at, end_at')
      .single();

    if (createAppointmentError || !createdAppointment) {
      request.log.error(createAppointmentError);
      return reply.code(400).send({ message: createAppointmentError?.message ?? 'Erro ao criar agendamento' });
    }

    return reply.code(201).send({
      appointmentId: createdAppointment.id,
      startAt: createdAppointment.start_at,
      endAt: createdAppointment.end_at,
    });
  });
}
