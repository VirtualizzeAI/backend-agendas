import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUserFromRequest } from '../lib/auth.js';

const createTenantSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/).optional(),
});

export async function bootstrapRoutes(app: FastifyInstance) {
  app.get('/v1/me/bootstrap', async (request, reply) => {
    try {
      const { user, supabase } = await requireUserFromRequest(request);

      const { data: memberships, error } = await supabase
        .from('tenant_users')
        .select('tenant_id, role, tenants(id, name, slug, plan, active)')
        .order('created_at', { ascending: true });

      if (error) {
        request.log.error(error);
        return reply.code(500).send({ message: 'Erro ao carregar tenant_users' });
      }

      return {
        user: {
          id: user.id,
          email: user.email,
        },
        memberships: memberships ?? [],
      };
    } catch (error) {
      if (error instanceof Error && (error.message === 'missing_token' || error.message === 'invalid_token')) {
        return reply.code(401).send({ message: 'Nao autorizado' });
      }

      request.log.error(error);
      return reply.code(500).send({ message: 'Erro interno' });
    }
  });

  app.post('/v1/tenants', async (request, reply) => {
    try {
      const { supabase } = await requireUserFromRequest(request);
      const payload = createTenantSchema.parse(request.body ?? {});

      const { data, error } = await supabase.rpc('create_tenant_with_owner', {
        p_name: payload.name,
        p_slug: payload.slug ?? null,
      });

      if (error) {
        request.log.error(error);
        return reply.code(400).send({ message: error.message });
      }

      return reply.code(201).send({ tenantId: data });
    } catch (error) {
      if (error instanceof Error && (error.message === 'missing_token' || error.message === 'invalid_token')) {
        return reply.code(401).send({ message: 'Nao autorizado' });
      }

      if (error instanceof z.ZodError) {
        return reply.code(400).send({ message: 'Payload invalido', issues: error.issues });
      }

      request.log.error(error);
      return reply.code(500).send({ message: 'Erro interno' });
    }
  });
}
