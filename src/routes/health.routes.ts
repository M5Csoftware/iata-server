import { FastifyInstance } from 'fastify';

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/api/health', {
    schema: {
      tags: ['System'],
      summary: 'System health check and server mode',
    },
    handler: async (_request, reply) => {
      return reply.send({
        status: 'ok',
        mode: 'mock-data (in-memory)',
        database: 'in-memory-mock',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
    },
  });
}
