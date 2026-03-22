import { FastifyInstance } from 'fastify';
import { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireAuthenticatedClient } from '../lib/request.js';
import { supabaseAdmin } from '../lib/supabase.js';

const createPlanSchema = z.object({
  name: z.string().min(2),
  price: z.number().positive(),
});

const createCustomerSchema = z.object({
  name: z.string().min(2),
  plan_id: z.uuid(),
  due_date: z.string().min(10),
  contact: z.string().min(2),
  saas_email: z.string().email().transform((value) => value.trim().toLowerCase()),
  saas_password: z.string().min(6),
});

const customerIdParamsSchema = z.object({
  id: z.uuid(),
});

const updateCustomerSchema = z.object({
  name: z.string().min(2),
  plan_id: z.uuid(),
  due_date: z.string().min(10),
  contact: z.string().min(2),
  saas_email: z.string().email().transform((value) => value.trim().toLowerCase()),
});

function slugifyTenantName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length >= 3) return slug;
  return `tenant-${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureAdminAccess(
  userScopedSupabase: SupabaseClient,
  userId: string,
) {
  const { data, error } = await userScopedSupabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    return { ok: false as const, error: error.message, statusCode: 500 };
  }

  if (!data) {
    return { ok: false as const, error: 'Acesso admin nao autorizado', statusCode: 403 };
  }

  return { ok: true as const };
}

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

    const { supabase, user } = auth;
    const access = await ensureAdminAccess(supabase, user.id);
    if (!access.ok) {
      return reply.code(access.statusCode).send({ message: access.error });
    }

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

    const { supabase, user } = auth;
    const access = await ensureAdminAccess(supabase, user.id);
    if (!access.ok) {
      return reply.code(access.statusCode).send({ message: access.error });
    }

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

    const { supabase, user } = auth;
    const access = await ensureAdminAccess(supabase, user.id);
    if (!access.ok) {
      return reply.code(access.statusCode).send({ message: access.error });
    }

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

    const { supabase, user } = auth;
    const access = await ensureAdminAccess(supabase, user.id);
    if (!access.ok) {
      return reply.code(access.statusCode).send({ message: access.error });
    }

    const { name, plan_id, due_date, contact, saas_email, saas_password } = payload.data;

    const createdAuth = await supabaseAdmin.auth.admin.createUser({
      email: saas_email,
      password: saas_password,
      email_confirm: true,
      user_metadata: {
        full_name: name,
      },
    });

    if (createdAuth.error || !createdAuth.data.user) {
      return reply.code(400).send({ message: createdAuth.error?.message ?? 'Nao foi possivel criar usuario SaaS' });
    }

    const saasUserId = createdAuth.data.user.id;
    const tenantSlug = `${slugifyTenantName(name)}-${Math.random().toString(36).slice(2, 7)}`;

    const { data: createdTenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({
        name,
        slug: tenantSlug,
        owner_user_id: saasUserId,
      })
      .select('id')
      .single();

    if (tenantError || !createdTenant) {
      await supabaseAdmin.auth.admin.deleteUser(saasUserId);
      request.log.error(tenantError);
      return reply.code(400).send({ message: tenantError?.message ?? 'Nao foi possivel criar tenant SaaS' });
    }

    const { error: membershipError } = await supabaseAdmin
      .from('tenant_users')
      .insert({
        tenant_id: createdTenant.id,
        user_id: saasUserId,
        role: 'owner',
      });

    if (membershipError) {
      await supabaseAdmin.from('tenants').delete().eq('id', createdTenant.id);
      await supabaseAdmin.auth.admin.deleteUser(saasUserId);
      request.log.error(membershipError);
      return reply.code(400).send({ message: membershipError.message });
    }

    const { data, error } = await supabase
      .from('admin_customers')
      .insert({
        name,
        plan_id,
        due_date,
        contact,
        saas_email,
        saas_user_id: saasUserId,
        tenant_id: createdTenant.id,
      })
      .select('id, name, plan_id, due_date, contact, saas_email, saas_user_id, tenant_id, active, created_at, updated_at')
      .single();

    if (error) {
      await supabaseAdmin.from('tenant_users').delete().eq('tenant_id', createdTenant.id).eq('user_id', saasUserId);
      await supabaseAdmin.from('tenants').delete().eq('id', createdTenant.id);
      await supabaseAdmin.auth.admin.deleteUser(saasUserId);
      request.log.error(error);
      return reply.code(400).send({ message: error.message });
    }

    return reply.code(201).send({
      ...data,
      saas_user_id: saasUserId,
      saas_email,
      tenant_id: createdTenant.id,
    });
  });

  app.put('/v1/admin/customers/:id', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const params = customerIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: 'Parametros invalidos', issues: params.error.issues });
    }

    const payload = updateCustomerSchema.safeParse(request.body ?? {});
    if (!payload.success) {
      return reply.code(400).send({ message: 'Payload invalido', issues: payload.error.issues });
    }

    const { supabase, user } = auth;
    const access = await ensureAdminAccess(supabase, user.id);
    if (!access.ok) {
      return reply.code(access.statusCode).send({ message: access.error });
    }

    const customerId = params.data.id;
    const { data: existingCustomer, error: existingError } = await supabase
      .from('admin_customers')
      .select('id, saas_user_id, saas_email')
      .eq('id', customerId)
      .maybeSingle();

    if (existingError) {
      request.log.error(existingError);
      return reply.code(400).send({ message: existingError.message });
    }

    if (!existingCustomer) {
      return reply.code(404).send({ message: 'Cliente nao encontrado' });
    }

    const { name, plan_id, due_date, contact, saas_email } = payload.data;
    const previousEmail = (existingCustomer.saas_email ?? '').toLowerCase();
    const emailChanged = previousEmail !== saas_email;

    if (emailChanged) {
      if (!existingCustomer.saas_user_id) {
        return reply.code(400).send({ message: 'Cliente sem vinculo de usuario SaaS para alterar e-mail' });
      }

      const updatedAuthUser = await supabaseAdmin.auth.admin.updateUserById(existingCustomer.saas_user_id, {
        email: saas_email,
      });

      if (updatedAuthUser.error) {
        request.log.error(updatedAuthUser.error);
        return reply.code(400).send({ message: updatedAuthUser.error.message });
      }
    }

    const { data, error } = await supabase
      .from('admin_customers')
      .update({
        name,
        plan_id,
        due_date,
        contact,
        saas_email,
      })
      .eq('id', customerId)
      .select('id, name, plan_id, due_date, contact, saas_email, active, created_at, updated_at')
      .single();

    if (error) {
      request.log.error(error);
      return reply.code(400).send({ message: error.message });
    }

    return { record: data };
  });

  app.post('/v1/admin/customers/:id/send-password-reset', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const params = customerIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: 'Parametros invalidos', issues: params.error.issues });
    }

    const { supabase, user } = auth;
    const access = await ensureAdminAccess(supabase, user.id);
    if (!access.ok) {
      return reply.code(access.statusCode).send({ message: access.error });
    }

    const { data: customer, error: customerError } = await supabase
      .from('admin_customers')
      .select('id, saas_email')
      .eq('id', params.data.id)
      .maybeSingle();

    if (customerError) {
      request.log.error(customerError);
      return reply.code(400).send({ message: customerError.message });
    }

    if (!customer || !customer.saas_email) {
      return reply.code(400).send({ message: 'Cliente sem e-mail SaaS cadastrado' });
    }

    const resetResult = await supabaseAdmin.auth.resetPasswordForEmail(customer.saas_email);
    if (resetResult.error) {
      request.log.error(resetResult.error);
      return reply.code(400).send({ message: resetResult.error.message });
    }

    return { sent: true };
  });
}
