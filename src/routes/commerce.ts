import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getTenantIdFromQuery, requireAuthenticatedClient } from '../lib/request.js';

const createOrderSchema = z.object({
  tenant_id: z.uuid(),
  client_id: z.uuid().optional().nullable(),
  professional_id: z.uuid().optional().nullable(),
  item_summary: z.string().min(2),
  total: z.number().nonnegative(),
  status: z.enum(['open', 'closed', 'canceled']).default('open'),
  notes: z.string().optional().nullable(),
});

const updateOrderSchema = createOrderSchema.partial().omit({ tenant_id: true });

const createBillingSchema = z.object({
  tenant_id: z.uuid(),
  client_id: z.uuid().optional().nullable(),
  reference: z.string().min(2),
  amount: z.number().nonnegative(),
  paid_amount: z.number().nonnegative().default(0),
  due_date: z.string().min(10),
  status: z.enum(['pending', 'partial', 'paid', 'overdue']).default('pending'),
  method: z.enum(['pix', 'card', 'cash', 'transfer']).default('pix'),
  notes: z.string().optional().nullable(),
});

const updateBillingSchema = createBillingSchema.partial().omit({ tenant_id: true });

export async function commerceRoutes(app: FastifyInstance) {
  app.get('/v1/orders', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const tenantId = getTenantIdFromQuery(request, reply);
    if (!tenantId) return;

    const { supabase } = auth;
    const { data, error } = await supabase
      .from('orders')
      .select('*, clients(name), professionals(name)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      request.log.error(error);
      return reply.code(500).send({ message: error.message });
    }

    return { records: data ?? [] };
  });

  app.post('/v1/orders', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const payload = createOrderSchema.safeParse(request.body ?? {});
    if (!payload.success) {
      return reply.code(400).send({ message: 'Payload invalido', issues: payload.error.issues });
    }

    const { supabase } = auth;
    const { data, error } = await supabase.from('orders').insert(payload.data).select('*').single();

    if (error) {
      request.log.error(error);
      return reply.code(400).send({ message: error.message });
    }

    return reply.code(201).send(data);
  });

  app.put('/v1/orders/:id', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const { id } = request.params as { id: string };
    const payload = updateOrderSchema.safeParse(request.body ?? {});
    if (!payload.success) {
      return reply.code(400).send({ message: 'Payload invalido', issues: payload.error.issues });
    }

    const { supabase } = auth;
    const { data, error } = await supabase
      .from('orders')
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

  app.delete('/v1/orders/:id', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const { id } = request.params as { id: string };
    const { supabase } = auth;
    const { error } = await supabase.from('orders').delete().eq('id', id);

    if (error) {
      request.log.error(error);
      return reply.code(400).send({ message: error.message });
    }

    return reply.code(204).send();
  });

  app.get('/v1/billing', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const tenantId = getTenantIdFromQuery(request, reply);
    if (!tenantId) return;

    const { supabase } = auth;
    const { data, error } = await supabase
      .from('billing_charges')
      .select('*, clients(name)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      request.log.error(error);
      return reply.code(500).send({ message: error.message });
    }

    return { records: data ?? [] };
  });

  app.post('/v1/billing', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const payload = createBillingSchema.safeParse(request.body ?? {});
    if (!payload.success) {
      return reply.code(400).send({ message: 'Payload invalido', issues: payload.error.issues });
    }

    const { supabase } = auth;
    const { data, error } = await supabase.from('billing_charges').insert(payload.data).select('*').single();

    if (error) {
      request.log.error(error);
      return reply.code(400).send({ message: error.message });
    }

    return reply.code(201).send(data);
  });

  app.put('/v1/billing/:id', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const { id } = request.params as { id: string };
    const payload = updateBillingSchema.safeParse(request.body ?? {});
    if (!payload.success) {
      return reply.code(400).send({ message: 'Payload invalido', issues: payload.error.issues });
    }

    const { supabase } = auth;
    const { data, error } = await supabase
      .from('billing_charges')
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

  app.delete('/v1/billing/:id', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const { id } = request.params as { id: string };
    const { supabase } = auth;
    const { error } = await supabase.from('billing_charges').delete().eq('id', id);

    if (error) {
      request.log.error(error);
      return reply.code(400).send({ message: error.message });
    }

    return reply.code(204).send();
  });
}
