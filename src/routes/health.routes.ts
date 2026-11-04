import { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/api/health', {
    schema: {
      tags: ['System'],
      summary: 'System health check and database status',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            uptime: { type: 'number' },
            timestamp: { type: 'string' },
            database: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                host: { type: 'string' },
                name: { type: 'string' },
              },
            },
          },
        },
      },
    },
    handler: async (_request, reply) => {
      const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
      return reply.send({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database: {
          status: dbStatus,
          host: mongoose.connection.host || 'unknown',
          name: mongoose.connection.name || 'unknown',
        },
      });
    },
  });
}

