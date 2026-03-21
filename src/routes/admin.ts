import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuthenticatedClient } from '../lib/request.js';

const createPlanSchema = z.object({
  name: z.string().min(2),
  price: z.number().positive(),
});

const createCustomerSchema = z.object({
  name: z.string().min(2),
  plan_id: z.uuid(),
  due_date: z.string().min(10),
  contact: z.string().min(2),
});

export async function adminRoutes(app: FastifyInstance) {
  app.get('/v1/admin/bootstrap', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const { user, supabase } = auth;

    const { data: adminRow, error } = await supabase
      .from('admin_users')
      .select('user_id, full_name, created_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      request.log.error(error);
      return reply.code(500).send({ message: error.message });
    }

    return {
      user: {
        id: user.id,
        email: user.email,
      },
      isAdmin: Boolean(adminRow),
      admin: adminRow,
    };
  });

  app.get('/v1/admin/plans', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const { supabase } = auth;
    const { data, error } = await supabase
      .from('admin_plans')
      .select('id, name, price, active, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      request.log.error(error);
      return reply.code(500).send({ message: error.message });
    }

    return { records: data ?? [] };
  });

  app.post('/v1/admin/plans', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const payload = createPlanSchema.safeParse(request.body ?? {});
    if (!payload.success) {
      return reply.code(400).send({ message: 'Payload invalido', issues: payload.error.issues });
    }

    const { supabase } = auth;
    const { data, error } = await supabase
      .from('admin_plans')
      .insert(payload.data)
      .select('id, name, price, active, created_at, updated_at')
      .single();

    if (error) {
      request.log.error(error);
      return reply.code(400).send({ message: error.message });
    }

    return reply.code(201).send(data);
  });

  app.get('/v1/admin/customers', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const { supabase } = auth;
    const { data, error } = await supabase
      .from('admin_customers')
      .select('id, name, plan_id, due_date, contact, active, created_at, updated_at, admin_plans(id, name, price)')
      .order('created_at', { ascending: false });

    if (error) {
      request.log.error(error);
      return reply.code(500).send({ message: error.message });
    }

    return { records: data ?? [] };
  });

  app.post('/v1/admin/customers', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const payload = createCustomerSchema.safeParse(request.body ?? {});
    if (!payload.success) {
      return reply.code(400).send({ message: 'Payload invalido', issues: payload.error.issues });
    }

    const { supabase } = auth;
    const { data, error } = await supabase
      .from('admin_customers')
      .insert(payload.data)
      .select('id, name, plan_id, due_date, contact, active, created_at, updated_at')
      .single();

    if (error) {
      request.log.error(error);
      return reply.code(400).send({ message: error.message });
    }

    return reply.code(201).send(data);
  });
}
