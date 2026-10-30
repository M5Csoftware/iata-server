import { FastifyInstance } from 'fastify';
import { CassInvoice, PaymentStatus, CassStatus } from '../models/CassInvoice.js';
import { AuditLog } from '../models/AuditLog.js';

export default async function billingRoutes(fastify: FastifyInstance) {
  // Get all CASS invoices
  fastify.get('/api/invoices', {
    schema: {
      tags: ['Billing & CASS Settlement'],
      summary: 'List all freight invoices and CASS settlement records',
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
      const filter: any = {};

      if (query.paymentStatus) filter.paymentStatus = query.paymentStatus.toUpperCase();
      if (query.cassStatus) filter.cassReconciliationStatus = query.cassStatus.toUpperCase();
      if (query.search) {
        filter.$or = [
          { invoiceNumber: { $regex: query.search, $options: 'i' } },
          { mawbNumber: { $regex: query.search, $options: 'i' } },
          { customerName: { $regex: query.search, $options: 'i' } },
        ];
      }

      const invoices = await CassInvoice.find(filter).sort({ createdAt: -1 });
      return reply.send({ success: true, count: invoices.length, invoices });
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
      const { paymentStatus } = request.body as { paymentStatus: PaymentStatus };

      const invoice = await CassInvoice.findByIdAndUpdate(
        id,
        { $set: { paymentStatus } },
        { new: true }
      );

      if (!invoice) {
        return reply.status(404).send({ success: false, error: 'Invoice not found.' });
      }

      await AuditLog.create({
        entityType: 'INVOICE',
        entityId: invoice.invoiceNumber,
        action: 'UPDATE',
        performedBy: (request.headers['x-user-name'] as string) || 'system',
        details: { paymentStatus },
      });

      return reply.send({ success: true, invoice: invoice.toJSON() });
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
      const { cassStatus } = request.body as { cassStatus: CassStatus };

      const invoice = await CassInvoice.findByIdAndUpdate(
        id,
        { $set: { cassReconciliationStatus: cassStatus } },
        { new: true }
      );

      if (!invoice) {
        return reply.status(404).send({ success: false, error: 'Invoice not found.' });
      }

      await AuditLog.create({
        entityType: 'INVOICE',
        entityId: invoice.invoiceNumber,
        action: 'RECONCILE',
        performedBy: (request.headers['x-user-name'] as string) || 'system',
        details: { cassReconciliationStatus: cassStatus },
      });

      return reply.send({ success: true, invoice: invoice.toJSON() });
    },
  });
}

