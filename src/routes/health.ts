import { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    return {
      ok: true,
      service: 'minha-agenda-backend',
      timestamp: new Date().toISOString(),
    };
  });
}
