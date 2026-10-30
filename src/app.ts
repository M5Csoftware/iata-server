import Fastify, { FastifyInstance } from 'fastify';
import corsPlugin from './plugins/cors.js';
import jwtPlugin from './plugins/jwt.js';
import swaggerPlugin from './plugins/swagger.js';

import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import stockRoutes from './routes/stock.routes.js';
import docketRoutes from './routes/docket.routes.js';
import bookingRoutes from './routes/booking.routes.js';
import mawbRoutes from './routes/mawb.routes.js';
import manifestRoutes from './routes/manifest.routes.js';
import eawbRoutes from './routes/eawb.routes.js';
import billingRoutes from './routes/billing.routes.js';
import masterRoutes from './routes/master.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
    },
  });

  // Core Plugins
  await fastify.register(corsPlugin);
  await fastify.register(jwtPlugin);
  await fastify.register(swaggerPlugin);

  // API Routes
  await fastify.register(healthRoutes);
  await fastify.register(authRoutes);
  await fastify.register(userRoutes);
  await fastify.register(stockRoutes);
  await fastify.register(docketRoutes);
  await fastify.register(bookingRoutes);
  await fastify.register(mawbRoutes);
  await fastify.register(manifestRoutes);
  await fastify.register(eawbRoutes);
  await fastify.register(billingRoutes);
  await fastify.register(masterRoutes);
  await fastify.register(dashboardRoutes);

  // Root welcome route
  fastify.get('/', async (_request, reply) => {
    return reply.send({
      name: 'IATA Air Waybill (AWB) Management Server',
      standard: 'IATA Resolution 600b compliant',
      version: '1.0.0',
      status: 'online',
      documentation: '/documentation',
      health: '/api/health',
    });
  });

  return fastify;
}

