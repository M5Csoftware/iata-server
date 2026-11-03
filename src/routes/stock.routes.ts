import { FastifyInstance } from 'fastify';
import { mockStore, AwbStockItem } from '../store/mockStore.js';
import { generateAwbSeries, validateIataAwbNumber } from '../utils/iataMod7.js';

export default async function stockRoutes(fastify: FastifyInstance) {
  // Get all stock with filters
  fastify.get('/api/stock', {
    schema: {
      tags: ['AWB Stock Management'],
      summary: 'Get AWB stock inventory with filtering from mock store',
      querystring: {
        type: 'object',
        properties: {
          airlinePrefix: { type: 'string' },
          status: { type: 'string' },
          search: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const query = request.query as { airlinePrefix?: string; status?: string; search?: string };
      let list = [...mockStore.stock];

      if (query.airlinePrefix) {
        list = list.filter((s) => s.airlinePrefix === query.airlinePrefix);
      }
      if (query.status) {
        list = list.filter((s) => s.status === query.status?.toUpperCase());
      }
      if (query.search) {
        const q = query.search.toLowerCase();
        list = list.filter((s) => s.fullAwbNumber.toLowerCase().includes(q));
      }

      return reply.send({ success: true, count: list.length, stock: list });
    },
  });

  // Generate Resolution 600b Modulo-7 Series
  fastify.post('/api/stock/series', {
    schema: {
      tags: ['AWB Stock Management'],
      summary: 'Generate IATA Resolution 600b Mod-7 serial number series',
      body: {
        type: 'object',
        required: ['airlinePrefix', 'fromSerial7', 'toSerial7'],
        properties: {
          airlinePrefix: { type: 'string', description: '3-digit airline prefix (e.g. 098)' },
          fromSerial7: { type: 'integer', description: 'Starting 7-digit number' },
          toSerial7: { type: 'integer', description: 'Ending 7-digit number' },
        },
      },
    },
    handler: async (request, reply) => {
      const { airlinePrefix, fromSerial7, toSerial7 } = request.body as {
        airlinePrefix: string;
        fromSerial7: number;
        toSerial7: number;
      };

      if (fromSerial7 > toSerial7) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid Range',
          message: 'fromSerial7 cannot be greater than toSerial7.',
        });
      }

      const generated = generateAwbSeries(airlinePrefix, fromSerial7, toSerial7);
      const existingSet = new Set(mockStore.stock.map((s) => s.fullAwbNumber));

      const toInsert: AwbStockItem[] = [];
      for (const g of generated) {
        if (!existingSet.has(g.fullAwbNumber)) {
          toInsert.push({
            id: `stk-${Date.now()}-${g.airlineNumber}`,
            airlinePrefix: g.airlinePrefix,
            airlineNumber: g.airlineNumber,
            fullAwbNumber: g.fullAwbNumber,
            status: 'AVAILABLE',
            createdAt: new Date().toISOString(),
          });
        }
      }

      mockStore.stock.push(...toInsert);

      return reply.status(201).send({
        success: true,
        totalRequested: generated.length,
        addedCount: toInsert.length,
        alreadyExistedCount: generated.length - toInsert.length,
        message: `Generated ${toInsert.length} new Resolution 600b AWB numbers.`,
      });
    },
  });

  // Validate 8-digit serial using Mod-7
  fastify.post('/api/stock/validate', {
    schema: {
      tags: ['AWB Stock Management'],
      summary: 'Verify 8-digit serial check digit via Modulo-7 formula',
      body: {
        type: 'object',
        required: ['eightDigitSerial'],
        properties: {
          eightDigitSerial: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const { eightDigitSerial } = request.body as { eightDigitSerial: string };
      const result = validateIataAwbNumber(eightDigitSerial);
      return reply.send({ success: true, ...result });
    },
  });

  // Void AWB stock number
  fastify.post('/api/stock/:id/void', {
    schema: {
      tags: ['AWB Stock Management'],
      summary: 'Permanently void an AWB number with mandatory audit justification',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const { reason } = request.body as { reason: string };

      const stockItem = mockStore.stock.find((s) => s.id === id || s.fullAwbNumber === id);
      if (!stockItem) {
        return reply.status(404).send({ success: false, error: 'AWB stock number not found.' });
      }

      if (stockItem.status === 'VOID') {
        return reply.status(400).send({ success: false, error: 'AWB is already voided.' });
      }

      stockItem.status = 'VOID';
      stockItem.voidReason = reason;

      mockStore.auditLogs.push({
        id: `aud-${Date.now()}`,
        entityType: 'AWB_STOCK',
        entityId: stockItem.fullAwbNumber,
        action: 'VOID',
        performedBy: (request.headers['x-user-name'] as string) || 'operator',
        reason,
        details: { fullAwbNumber: stockItem.fullAwbNumber },
        timestamp: new Date().toISOString(),
      });

      return reply.send({
        success: true,
        message: `AWB ${stockItem.fullAwbNumber} permanently voided. Serial cannot be reissued.`,
        stock: stockItem,
      });
    },
  });

  // Get next available AWB number
  fastify.get('/api/stock/next-available', {
    schema: {
      tags: ['AWB Stock Management'],
      summary: 'Get next available AWB stock number',
      querystring: {
        type: 'object',
        properties: {
          airlinePrefix: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const query = request.query as { airlinePrefix?: string };
      const available = mockStore.stock.find((s) => {
        if (s.status !== 'AVAILABLE') return false;
        if (query.airlinePrefix && s.airlinePrefix !== query.airlinePrefix) return false;
        return true;
      });

      if (!available) {
        return reply.status(404).send({
          success: false,
          error: 'No Stock Available',
          message: 'No available AWB numbers in inventory. Please generate or allocate stock.',
        });
      }

      return reply.send({ success: true, stock: available });
    },
  });
}
