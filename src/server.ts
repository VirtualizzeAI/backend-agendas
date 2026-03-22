import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env.js';
import { healthRoutes } from './routes/health.js';
import { bootstrapRoutes } from './routes/bootstrap.js';
import { adminRoutes } from './routes/admin.js';
import { catalogRoutes } from './routes/catalog.js';
import { appointmentRoutes } from './routes/appointments.js';
import { commerceRoutes } from './routes/commerce.js';
import { publicBookingRoutes } from './routes/public-booking.js';

async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: (origin, callback) => {
      if (env.CORS_ORIGINS === '*') {
        callback(null, true);
        return;
      }

      if (!origin) {
        callback(null, true);
        return;
      }

      callback(null, env.CORS_ORIGINS.includes(origin));
    },
    credentials: true,
  });

  await app.register(healthRoutes);
  await app.register(bootstrapRoutes);
  await app.register(adminRoutes);
  await app.register(catalogRoutes);
  await app.register(appointmentRoutes);
  await app.register(commerceRoutes);
  await app.register(publicBookingRoutes);

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
