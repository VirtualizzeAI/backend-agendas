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

const updateClientSchema = createClientSchema.partial().omit({ tenant_id: true });
const updateProfessionalSchema = createProfessionalSchema.partial().omit({ tenant_id: true });
const updateServiceSchema = createServiceSchema.partial().omit({ tenant_id: true });

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
