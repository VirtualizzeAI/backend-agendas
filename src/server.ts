import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env.js';
import { healthRoutes } from './routes/health.js';
import { bootstrapRoutes } from './routes/bootstrap.js';

async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN,
    credentials: true,
  });

  await app.register(healthRoutes);
  await app.register(bootstrapRoutes);

  return app;
}

async function start() {
  const app = await buildServer();

  try {
    await app.listen({
      port: Number(env.PORT),
      host: '0.0.0.0',
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();
