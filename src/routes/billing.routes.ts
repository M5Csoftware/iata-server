import { FastifyInstance } from 'fastify';
import { mockStore } from '../store/mockStore.js';

export default async function billingRoutes(fastify: FastifyInstance) {
  // Get all CASS invoices
  fastify.get('/api/invoices', {
    schema: {
      tags: ['Billing & CASS Settlement'],
      summary: 'List all freight invoices and CASS settlement records from mock store',
      querystring: {
        type: 'object',
        properties: {
          paymentStatus: { type: 'string' },
          cassStatus: { type: 'string' },
          search: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const query = request.query as { paymentStatus?: string; cassStatus?: string; search?: string };
      let list = [...mockStore.invoices];

      if (query.paymentStatus) {
        list = list.filter((i) => i.paymentStatus === query.paymentStatus?.toUpperCase());
      }
      if (query.cassStatus) {
        list = list.filter((i) => i.cassReconciliationStatus === query.cassStatus?.toUpperCase());
      }
      if (query.search) {
        const q = query.search.toLowerCase();
        list = list.filter(
          (i) =>
            i.invoiceNumber.toLowerCase().includes(q) ||
            i.mawbNumber.toLowerCase().includes(q) ||
            i.customerName.toLowerCase().includes(q)
        );
      }

      return reply.send({ success: true, count: list.length, invoices: list });
    },
  });

  // Update payment status
  fastify.patch('/api/invoices/:id/payment', {
    schema: {
      tags: ['Billing & CASS Settlement'],
      summary: 'Update invoice payment status (PAID / UNPAID / PARTIAL)',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['paymentStatus'],
        properties: {
          paymentStatus: { type: 'string', enum: ['PAID', 'UNPAID', 'PARTIAL'] },
        },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const { paymentStatus } = request.body as { paymentStatus: 'PAID' | 'UNPAID' | 'PARTIAL' };

      const invoice = mockStore.invoices.find((i) => i.id === id || i.invoiceNumber === id);
      if (!invoice) {
        return reply.status(404).send({ success: false, error: 'Invoice not found.' });
      }

      invoice.paymentStatus = paymentStatus;

      mockStore.auditLogs.push({
        id: `aud-${Date.now()}`,
        entityType: 'INVOICE',
        entityId: invoice.invoiceNumber,
        action: 'UPDATE',
        performedBy: (request.headers['x-user-name'] as string) || 'system',
        details: { paymentStatus },
        timestamp: new Date().toISOString(),
      });

      return reply.send({ success: true, invoice });
    },
  });

  // Reconcile CASS settlement
  fastify.patch('/api/invoices/:id/cass-reconcile', {
    schema: {
      tags: ['Billing & CASS Settlement'],
      summary: 'Reconcile airline CASS clearing status',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['cassStatus'],
        properties: {
          cassStatus: { type: 'string', enum: ['RECONCILED', 'PENDING_MATCH', 'DISCREPANCY'] },
        },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const { cassStatus } = request.body as { cassStatus: 'RECONCILED' | 'PENDING_MATCH' | 'DISCREPANCY' };

      const invoice = mockStore.invoices.find((i) => i.id === id || i.invoiceNumber === id);
      if (!invoice) {
        return reply.status(404).send({ success: false, error: 'Invoice not found.' });
      }

      invoice.cassReconciliationStatus = cassStatus;

      mockStore.auditLogs.push({
        id: `aud-${Date.now()}`,
        entityType: 'INVOICE',
        entityId: invoice.invoiceNumber,
        action: 'RECONCILE',
        performedBy: (request.headers['x-user-name'] as string) || 'system',
        details: { cassReconciliationStatus: cassStatus },
        timestamp: new Date().toISOString(),
      });

      return reply.send({ success: true, invoice });
    },
  });
}
