// src/routes/invoiceFetch.ts
import { FastifyInstance } from 'fastify';
import { Mawb } from '../models/Mawb.js';

export default async function invoiceFetchRoutes(fastify: FastifyInstance) {
  fastify.post('/api/invoice-fetch/mawbs', {
    schema: {
      tags: ['Invoices'],
      summary: 'Fetch specific MAWBs by an array of MAWB numbers for invoicing',
      body: {
        type: 'object',
        required: ['mawbNumbers'],
        properties: {
          mawbNumbers: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    handler: async (request, reply) => {
      const { mawbNumbers } = request.body as { mawbNumbers: string[] };
      if (!mawbNumbers || mawbNumbers.length === 0) {
        return reply.send({ success: true, mawbs: [] });
      }
      
      // Find the MAWBs in the database
      const mawbs = await Mawb.find({ mawbNumber: { $in: mawbNumbers } });
      
      return reply.send({ success: true, mawbs });
    },
  });
}