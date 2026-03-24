import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getTenantIdFromQuery, requireAuthenticatedClient } from '../lib/request.js';

const createClientSchema = z.object({
  tenant_id: z.uuid(),
  name: z.string().min(2),
  cpf: z.string().optional().nullable(),
  phone: z.string().min(8),
  email: z.email().optional().nullable(),
  birth_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
  is_incomplete: z.boolean().default(false),
});

const createProfessionalSchema = z.object({
  tenant_id: z.uuid(),
  name: z.string().min(2),
  specialty: z.string().min(2),
  short_name: z.string().min(1),
  phone: z.string().optional().nullable(),
  commission_rate: z.number().min(0).max(100).default(0),
  active: z.boolean().default(true),
});

const createServiceSchema = z.object({
  tenant_id: z.uuid(),
  name: z.string().min(2),
  category: z.string().min(2),
  duration_minutes: z.number().int().min(10),
  price: z.number().positive(),
  active: z.boolean().default(true),
  description: z.string().optional().nullable(),
});

const scheduleSlotSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

const saveProfessionalSchedulesSchema = z.object({
  tenant_id: z.uuid(),
  slot_interval_minutes: z.number().int().min(1).max(1440).default(30),
  min_booking_notice_minutes: z.number().int().min(0).max(43200).default(0),
  schedules: z.array(scheduleSlotSchema).default([]),
});

const updateClientSchema = createClientSchema.partial().omit({ tenant_id: true });
const updateProfessionalSchema = createProfessionalSchema.partial().omit({ tenant_id: true });
const updateServiceSchema = createServiceSchema.partial().omit({ tenant_id: true });

function toMinute(time: string): number {
  const [h, m] = time.split(':');
  return Number(h) * 60 + Number(m);
}

export async function catalogRoutes(app: FastifyInstance) {
  app.get('/v1/clients', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const tenantId = getTenantIdFromQuery(request, reply);
    if (!tenantId) return;

    const { supabase } = auth;
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      request.log.error(error);
      return reply.code(500).send({ message: error.message });
    }

    return { records: data ?? [] };
  });

  app.post('/v1/clients', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const payload = createClientSchema.safeParse(request.body ?? {});
    if (!payload.success) {
      return reply.code(400).send({ message: 'Payload invalido', issues: payload.error.issues });
    }

    const { supabase } = auth;
    const { data, error } = await supabase.from('clients').insert(payload.data).select('*').single();

    if (error) {
      request.log.error(error);
      return reply.code(400).send({ message: error.message });
    }

    return reply.code(201).send(data);
  });

  app.get('/v1/professionals', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const tenantId = getTenantIdFromQuery(request, reply);
    if (!tenantId) return;

    const { supabase } = auth;
    const { data, error } = await supabase
      .from('professionals')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      request.log.error(error);
      return reply.code(500).send({ message: error.message });
    }

    return { records: data ?? [] };
  });

  app.post('/v1/professionals', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const payload = createProfessionalSchema.safeParse(request.body ?? {});
    if (!payload.success) {
      return reply.code(400).send({ message: 'Payload invalido', issues: payload.error.issues });
    }

    const { supabase } = auth;
    const { data, error } = await supabase.from('professionals').insert(payload.data).select('*').single();

    if (error) {
      request.log.error(error);
      return reply.code(400).send({ message: error.message });
    }

    return reply.code(201).send(data);
  });

  app.get('/v1/services', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const tenantId = getTenantIdFromQuery(request, reply);
    if (!tenantId) return;

    const { supabase } = auth;
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      request.log.error(error);
      return reply.code(500).send({ message: error.message });
    }

    return { records: data ?? [] };
  });

  app.post('/v1/services', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const payload = createServiceSchema.safeParse(request.body ?? {});
    if (!payload.success) {
      return reply.code(400).send({ message: 'Payload invalido', issues: payload.error.issues });
    }

    const { supabase } = auth;
    const { data, error } = await supabase.from('services').insert(payload.data).select('*').single();

    if (error) {
      request.log.error(error);
      return reply.code(400).send({ message: error.message });
    }

    return reply.code(201).send(data);
  });

  // ── Clients PUT/DELETE ─────────────────────────────────────────────────────
  app.put('/v1/clients/:id', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const { id } = request.params as { id: string };
    const payload = updateClientSchema.safeParse(request.body ?? {});
    if (!payload.success) {
      return reply.code(400).send({ message: 'Payload invalido', issues: payload.error.issues });
    }

    const { supabase } = auth;
    const { data, error } = await supabase
      .from('clients')
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

  app.delete('/v1/clients/:id', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const { id } = request.params as { id: string };
    const { supabase } = auth;
    const { error } = await supabase.from('clients').delete().eq('id', id);

    if (error) {
      request.log.error(error);
      return reply.code(400).send({ message: error.message });
    }

    return reply.code(204).send();
  });

  // ── Professionals PUT/DELETE ───────────────────────────────────────────────
  app.put('/v1/professionals/:id', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const { id } = request.params as { id: string };
    const payload = updateProfessionalSchema.safeParse(request.body ?? {});
    if (!payload.success) {
      return reply.code(400).send({ message: 'Payload invalido', issues: payload.error.issues });
    }

    const { supabase } = auth;
    const { data, error } = await supabase
      .from('professionals')
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

  app.delete('/v1/professionals/:id', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const { id } = request.params as { id: string };
    const { supabase } = auth;
    const { error } = await supabase.from('professionals').delete().eq('id', id);

    if (error) {
      request.log.error(error);
      return reply.code(400).send({ message: error.message });
    }

    return reply.code(204).send();
  });

  // ── Professional schedules (weekly windows) ───────────────────────────────
  app.get('/v1/professionals/:id/schedules', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const tenantId = getTenantIdFromQuery(request, reply);
    if (!tenantId) return;

    const { id } = request.params as { id: string };
    const { supabase } = auth;

    const { data, error } = await supabase
      .from('professional_schedules')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('professional_id', id)
      .order('weekday', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) {
      request.log.error(error);
      return reply.code(500).send({ message: error.message });
    }

    const { data: settings, error: settingsError } = await supabase
      .from('professional_schedule_settings')
      .select('slot_interval_minutes, min_booking_notice_minutes')
      .eq('tenant_id', tenantId)
      .eq('professional_id', id)
      .maybeSingle();

    if (settingsError) {
      request.log.error(settingsError);
      return reply.code(500).send({ message: settingsError.message });
    }

    return {
      slot_interval_minutes: settings?.slot_interval_minutes ?? 30,
      min_booking_notice_minutes: settings?.min_booking_notice_minutes ?? 0,
      records: data ?? [],
    };
  });

  app.put('/v1/professionals/:id/schedules', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const { id } = request.params as { id: string };
    const payload = saveProfessionalSchedulesSchema.safeParse(request.body ?? {});
    if (!payload.success) {
      return reply.code(400).send({ message: 'Payload invalido', issues: payload.error.issues });
    }

    const invalid = payload.data.schedules.find((s) => toMinute(s.end_time) <= toMinute(s.start_time));
    if (invalid) {
      return reply.code(400).send({ message: 'Horario final deve ser maior que inicial em todos os turnos' });
    }

    const { supabase } = auth;

    const { data: prof, error: profError } = await supabase
      .from('professionals')
      .select('id')
      .eq('id', id)
      .eq('tenant_id', payload.data.tenant_id)
      .maybeSingle();

    if (profError) {
      request.log.error(profError);
      return reply.code(500).send({ message: profError.message });
    }

    if (!prof) {
      return reply.code(404).send({ message: 'Profissional nao encontrado para este tenant' });
    }

    const { error: deleteError } = await supabase
      .from('professional_schedules')
      .delete()
      .eq('tenant_id', payload.data.tenant_id)
      .eq('professional_id', id);

    if (deleteError) {
      request.log.error(deleteError);
      return reply.code(500).send({ message: deleteError.message });
    }

    const { error: settingsUpsertError } = await supabase
      .from('professional_schedule_settings')
      .upsert(
        {
          tenant_id: payload.data.tenant_id,
          professional_id: id,
          slot_interval_minutes: payload.data.slot_interval_minutes,
          min_booking_notice_minutes: payload.data.min_booking_notice_minutes,
        },
        { onConflict: 'professional_id' },
      );

    if (settingsUpsertError) {
      request.log.error(settingsUpsertError);
      return reply.code(500).send({ message: settingsUpsertError.message });
    }

    if (payload.data.schedules.length > 0) {
      const rows = payload.data.schedules.map((slot) => ({
        tenant_id: payload.data.tenant_id,
        professional_id: id,
        weekday: slot.weekday,
        start_time: slot.start_time,
        end_time: slot.end_time,
      }));

      const { error: insertError } = await supabase.from('professional_schedules').insert(rows);
      if (insertError) {
        request.log.error(insertError);
        return reply.code(400).send({ message: insertError.message });
      }
    }

    const { data: updatedRows, error: listError } = await supabase
      .from('professional_schedules')
      .select('*')
      .eq('tenant_id', payload.data.tenant_id)
      .eq('professional_id', id)
      .order('weekday', { ascending: true })
      .order('start_time', { ascending: true });

    if (listError) {
      request.log.error(listError);
      return reply.code(500).send({ message: listError.message });
    }

    return {
      slot_interval_minutes: payload.data.slot_interval_minutes,
      min_booking_notice_minutes: payload.data.min_booking_notice_minutes,
      records: updatedRows ?? [],
    };
  });

  // ── Services PUT/DELETE ────────────────────────────────────────────────────
  app.put('/v1/services/:id', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const { id } = request.params as { id: string };
    const payload = updateServiceSchema.safeParse(request.body ?? {});
    if (!payload.success) {
      return reply.code(400).send({ message: 'Payload invalido', issues: payload.error.issues });
    }

    const { supabase } = auth;
    const { data, error } = await supabase
      .from('services')
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

  app.delete('/v1/services/:id', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const { id } = request.params as { id: string };
    const { supabase } = auth;
    const { error } = await supabase.from('services').delete().eq('id', id);

    if (error) {
      request.log.error(error);
      return reply.code(400).send({ message: error.message });
    }

    return reply.code(204).send();
  });
}
