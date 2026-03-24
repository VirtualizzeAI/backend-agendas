import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getTenantIdFromQuery, requireAuthenticatedClient } from '../lib/request.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { sendAppointmentCreatedWhatsapp } from '../lib/whatsapp.js';

const createAppointmentSchema = z.object({
  tenant_id: z.uuid(),
  client_id: z.uuid().optional().nullable(),
  professional_id: z.uuid().optional().nullable(),
  service_id: z.uuid().optional().nullable(),
  client_name: z.string().min(2),
  service_name: z.string().min(2),
  room: z.string().optional().nullable(),
  start_at: z.iso.datetime(),
  end_at: z.iso.datetime(),
  status: z.enum(['confirmed', 'in-progress', 'attention', 'available']).default('confirmed'),
  notes: z.string().optional().nullable(),
});

const updateAppointmentSchema = createAppointmentSchema.partial().omit({ tenant_id: true });

export async function appointmentRoutes(app: FastifyInstance) {
  // GET /v1/appointments?tenantId=&date=YYYY-MM-DD&from=ISO&to=ISO&professionalId=
  app.get('/v1/appointments', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const tenantId = getTenantIdFromQuery(request, reply);
    if (!tenantId) return;

    const query = request.query as {
      date?: string;
      from?: string;
      to?: string;
      professionalId?: string;
    };

    const { supabase } = auth;
    let q = supabase
      .from('appointments')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('start_at', { ascending: true });

    // Filter by single day: ?date=2026-03-21
    if (query.date) {
      const dayStart = `${query.date}T00:00:00.000Z`;
      const dayEnd = `${query.date}T23:59:59.999Z`;
      q = q.gte('start_at', dayStart).lte('start_at', dayEnd);
    } else {
      // Filter by range: ?from=ISO&to=ISO
      if (query.from) q = q.gte('start_at', query.from);
      if (query.to) q = q.lte('start_at', query.to);
    }

    // Filter by professional
    if (query.professionalId) {
      q = q.eq('professional_id', query.professionalId);
    }

    const { data, error } = await q;

    if (error) {
      request.log.error(error);
      return reply.code(500).send({ message: error.message });
    }

    return { records: data ?? [] };
  });

  app.post('/v1/appointments', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const payload = createAppointmentSchema.safeParse(request.body ?? {});
    if (!payload.success) {
      return reply.code(400).send({ message: 'Payload invalido', issues: payload.error.issues });
    }

    const { supabase } = auth;
    const { data, error } = await supabase.from('appointments').insert(payload.data).select('*').single();

    if (error) {
      request.log.error(error);
      return reply.code(400).send({ message: error.message });
    }

    let clientPhone: string | null = null;
    if (payload.data.client_id) {
      const { data: clientRow } = await supabaseAdmin
        .from('clients')
        .select('phone')
        .eq('id', payload.data.client_id)
        .eq('tenant_id', payload.data.tenant_id)
        .maybeSingle();

      clientPhone = (clientRow as { phone?: string | null } | null)?.phone ?? null;
    }

    await sendAppointmentCreatedWhatsapp(
      {
        tenantId: payload.data.tenant_id,
        clientName: payload.data.client_name,
        clientPhone,
        serviceName: payload.data.service_name,
        startAtIso: data.start_at,
        endAtIso: data.end_at,
        professionalId: payload.data.professional_id,
      },
      request.log,
    );

    return reply.code(201).send(data);
  });

  app.put('/v1/appointments/:id', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const { id } = request.params as { id: string };
    const payload = updateAppointmentSchema.safeParse(request.body ?? {});
    if (!payload.success) {
      return reply.code(400).send({ message: 'Payload invalido', issues: payload.error.issues });
    }

    const { supabase } = auth;
    const { data, error } = await supabase
      .from('appointments')
      .update(payload.data)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      request.log.error(error);
      return reply.code(400).send({ message: error.message });
    }

    return data;
  });

  app.delete('/v1/appointments/:id', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const { id } = request.params as { id: string };
    const { supabase } = auth;
    const { error } = await supabase.from('appointments').delete().eq('id', id);

    if (error) {
      request.log.error(error);
      return reply.code(400).send({ message: error.message });
    }

    return reply.code(204).send();
  });
}
