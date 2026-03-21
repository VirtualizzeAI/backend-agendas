import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUserFromRequest } from './auth.js';

const tenantQuerySchema = z.object({
  tenantId: z.uuid(),
});

export async function requireAuthenticatedClient(request: FastifyRequest, reply: FastifyReply) {
  try {
    return await requireUserFromRequest(request);
  } catch (error) {
    if (error instanceof Error && (error.message === 'missing_token' || error.message === 'invalid_token')) {
      await reply.code(401).send({ message: 'Nao autorizado' });
      return null;
    }

    request.log.error(error);
    await reply.code(500).send({ message: 'Erro interno' });
    return null;
  }
}

export function getTenantIdFromQuery(request: FastifyRequest, reply: FastifyReply) {
  const parsed = tenantQuerySchema.safeParse(request.query);

  if (!parsed.success) {
    void reply.code(400).send({ message: 'tenantId obrigatorio', issues: parsed.error.issues });
    return null;
  }

  return parsed.data.tenantId;
}
