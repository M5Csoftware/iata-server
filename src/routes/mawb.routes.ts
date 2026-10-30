import { FastifyInstance } from 'fastify';
import { mockStore, MawbItem, HawbItem } from '../store/mockStore.js';

export default async function mawbRoutes(fastify: FastifyInstance) {
  // Get all MAWBs
  fastify.get('/api/mawbs', {
    schema: {
      tags: ['MAWB & Consolidation (HAWB)'],
      summary: 'List Master Air Waybills with nested House AWBs from mock store',
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          search: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const query = request.query as { status?: string; search?: string };
      let list = [...mockStore.mawbs];

      if (query.status) {
        list = list.filter((m) => m.status === query.status?.toUpperCase());
      }
      if (query.search) {
        const q = query.search.toLowerCase();
        list = list.filter(
          (m) =>
            m.mawbNumber.toLowerCase().includes(q) ||
            m.shipperName.toLowerCase().includes(q) ||
            m.consigneeName.toLowerCase().includes(q) ||
            (m.flightNumber && m.flightNumber.toLowerCase().includes(q))
        );
      }

      return reply.send({ success: true, count: list.length, mawbs: list });
    },
  });

  // Get single MAWB by ID
  fastify.get('/api/mawbs/:id', {
    schema: {
      tags: ['MAWB & Consolidation (HAWB)'],
      summary: 'Get full details of a Master Air Waybill by ID',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const mawb = mockStore.mawbs.find((m) => m.id === id || m.mawbNumber === id);
      if (!mawb) {
        return reply.status(404).send({ success: false, error: 'MAWB not found.' });
      }
      return reply.send({ success: true, mawb });
    },
  });

  // Create direct MAWB
  fastify.post('/api/mawbs', {
    schema: {
      tags: ['MAWB & Consolidation (HAWB)'],
      summary: 'Create a new Master Air Waybill directly in mock store',
    },
    handler: async (request, reply) => {
      const body = request.body as any;
      const newMawb: MawbItem = {
        ...body,
        id: `mawb-${Date.now()}`,
        status: body.status || 'ISSUED',
        issuedAt: body.issuedAt || new Date().toISOString().split('T')[0],
        hawbs: body.hawbs || [],
        fwbSent: false,
        createdAt: new Date().toISOString(),
      };

      mockStore.mawbs.unshift(newMawb);

      mockStore.auditLogs.push({
        id: `aud-${Date.now()}`,
        entityType: 'MAWB',
        entityId: newMawb.mawbNumber,
        action: 'CREATE',
        performedBy: (request.headers['x-user-name'] as string) || 'system',
        details: { mawbNumber: newMawb.mawbNumber, destination: newMawb.destination },
        timestamp: new Date().toISOString(),
      });

      return reply.status(201).send({ success: true, mawb: newMawb });
    },
  });

  // Add HAWB to MAWB
  fastify.post('/api/mawbs/:id/hawbs', {
    schema: {
      tags: ['MAWB & Consolidation (HAWB)'],
      summary: 'Add consolidated House AWB (HAWB) under Master AWB',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['hawbNumber', 'shipperName', 'consigneeName', 'origin', 'destination', 'pieces', 'grossWeightKg'],
        properties: {
          hawbNumber: { type: 'string' },
          shipperName: { type: 'string' },
          consigneeName: { type: 'string' },
          origin: { type: 'string' },
          destination: { type: 'string' },
          pieces: { type: 'number' },
          grossWeightKg: { type: 'number' },
          chargeableWeightKg: { type: 'number' },
          natureOfGoods: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as any;

      const mawb = mockStore.mawbs.find((m) => m.id === id || m.mawbNumber === id);
      if (!mawb) {
        return reply.status(404).send({ success: false, error: 'MAWB not found.' });
      }

      if (mawb.status === 'MANIFESTED' || mawb.status === 'DEPARTED') {
        return reply.status(400).send({
          success: false,
          error: 'Flight Locked',
          message: 'Cannot add HAWBs to a manifested or departed MAWB.',
        });
      }

      const duplicate = mawb.hawbs.some((h) => h.hawbNumber === body.hawbNumber);
      if (duplicate) {
        return reply.status(409).send({
          success: false,
          error: 'Duplicate HAWB',
          message: `HAWB ${body.hawbNumber} already exists in this consolidation.`,
        });
      }

      const newHawb: HawbItem = {
        id: `hawb-${Date.now()}`,
        hawbNumber: body.hawbNumber,
        mawbNumber: mawb.mawbNumber,
        shipperName: body.shipperName,
        consigneeName: body.consigneeName,
        origin: body.origin,
        destination: body.destination,
        pieces: body.pieces,
        grossWeightKg: body.grossWeightKg,
        chargeableWeightKg: body.chargeableWeightKg || body.grossWeightKg,
        natureOfGoods: body.natureOfGoods || 'Consolidated Cargo',
        status: 'ISSUED',
      };

      mawb.hawbs.push(newHawb);

      const totalHawbPieces = mawb.hawbs.reduce((sum, h) => sum + h.pieces, 0);
      const totalHawbWeight = mawb.hawbs.reduce((sum, h) => sum + h.grossWeightKg, 0);
      const parityWarning =
        totalHawbPieces !== mawb.pieces || totalHawbWeight !== mawb.grossWeightKg
          ? `Consolidation Parity Alert: HAWB totals (${totalHawbPieces} pcs, ${totalHawbWeight} kg) differ from MAWB totals (${mawb.pieces} pcs, ${mawb.grossWeightKg} kg).`
          : null;

      mockStore.auditLogs.push({
        id: `aud-${Date.now()}`,
        entityType: 'HAWB',
        entityId: newHawb.hawbNumber,
        action: 'CREATE',
        performedBy: (request.headers['x-user-name'] as string) || 'system',
        details: { mawbNumber: mawb.mawbNumber, pieces: newHawb.pieces },
        timestamp: new Date().toISOString(),
      });

      return reply.status(201).send({
        success: true,
        hawb: newHawb,
        mawb,
        parityWarning,
      });
    },
  });

  // Remove HAWB from MAWB
  fastify.delete('/api/mawbs/:id/hawbs/:hawbId', {
    schema: {
      tags: ['MAWB & Consolidation (HAWB)'],
      summary: 'Remove HAWB from consolidation (if not manifested)',
      params: {
        type: 'object',
        required: ['id', 'hawbId'],
        properties: { id: { type: 'string' }, hawbId: { type: 'string' } },
      },
    },
    handler: async (request, reply) => {
      const { id, hawbId } = request.params as { id: string; hawbId: string };
      const mawb = mockStore.mawbs.find((m) => m.id === id || m.mawbNumber === id);
      if (!mawb) {
        return reply.status(404).send({ success: false, error: 'MAWB not found.' });
      }

      if (mawb.status === 'MANIFESTED' || mawb.status === 'DEPARTED') {
        return reply.status(400).send({
          success: false,
          error: 'Flight Locked',
          message: 'Cannot modify consolidation of a manifested or departed MAWB.',
        });
      }

      mawb.hawbs = mawb.hawbs.filter((h) => h.id !== hawbId && h.hawbNumber !== hawbId);
      return reply.send({ success: true, message: 'HAWB removed.', mawb });
    },
  });

  // Void MAWB
  fastify.post('/api/mawbs/:id/void', {
    schema: {
      tags: ['MAWB & Consolidation (HAWB)'],
      summary: 'Permanently void MAWB and retire its serial from future stock',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const { reason = 'Cancelled by operator' } = (request.body as { reason?: string }) || {};

      const mawb = mockStore.mawbs.find((m) => m.id === id || m.mawbNumber === id);
      if (!mawb) {
        return reply.status(404).send({ success: false, error: 'MAWB not found.' });
      }

      if (mawb.status === 'DEPARTED' || mawb.status === 'ARRIVED') {
        return reply.status(400).send({
          success: false,
          error: 'Cannot Void',
          message: 'Cannot void an in-flight or delivered Air Waybill.',
        });
      }

      mawb.status = 'VOID';

      const stock = mockStore.stock.find((s) => s.fullAwbNumber === mawb.mawbNumber);
      if (stock) {
        stock.status = 'VOID';
        stock.voidReason = reason;
      }

      mockStore.auditLogs.push({
        id: `aud-${Date.now()}`,
        entityType: 'MAWB',
        entityId: mawb.mawbNumber,
        action: 'VOID',
        performedBy: (request.headers['x-user-name'] as string) || 'system',
        reason,
        timestamp: new Date().toISOString(),
      });

      return reply.send({
        success: true,
        message: `MAWB ${mawb.mawbNumber} permanently voided. Serial retired.`,
        mawb,
      });
    },
  });
}
