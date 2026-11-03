import { FastifyInstance } from 'fastify';
import { AwbStock } from '../models/AwbStock.js';
import { AuditLog } from '../models/AuditLog.js';
import { generateAwbSeries, validateIataAwbNumber } from '../utils/iataMod7.js';

export default async function stockRoutes(fastify: FastifyInstance) {
  // Get all stock with filters
  fastify.get('/api/stock', {
    schema: {
      tags: ['AWB Stock Management'],
      summary: 'Get AWB stock inventory with filtering',
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
      const filter: any = {};

      if (query.airlinePrefix) {
        filter.airlinePrefix = query.airlinePrefix;
      }
      if (query.status) {
        filter.status = query.status.toUpperCase();
      }
      if (query.search) {
        filter.fullAwbNumber = { $regex: query.search, $options: 'i' };
      }

      const stock = await AwbStock.find(filter).sort({ createdAt: -1 });
      return reply.send({ success: true, count: stock.length, stock });
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

      if (toSerial7 - fromSerial7 > 1000) {
        return reply.status(400).send({
          success: false,
          error: 'Range Limit Exceeded',
          message: 'Cannot generate more than 1000 AWB numbers at a time.',
        });
      }

      const generated = generateAwbSeries(airlinePrefix, fromSerial7, toSerial7);
      const existingAwbs = await AwbStock.find({
        fullAwbNumber: { $in: generated.map((g) => g.fullAwbNumber) },
      }).select('fullAwbNumber');

      const existingSet = new Set(existingAwbs.map((e) => e.fullAwbNumber));
      const toInsert = generated
        .filter((g) => !existingSet.has(g.fullAwbNumber))
        .map((g) => ({
          airlinePrefix: g.airlinePrefix,
          airlineNumber: g.airlineNumber,
          fullAwbNumber: g.fullAwbNumber,
          status: 'AVAILABLE',
        }));

      if (toInsert.length > 0) {
        await AwbStock.insertMany(toInsert);
      }

      return reply.status(201).send({
        success: true,
        totalRequested: generated.length,
        addedCount: toInsert.length,
        alreadyExistedCount: existingSet.size,
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

      const stockItem = await AwbStock.findById(id);
      if (!stockItem) {
        return reply.status(404).send({ success: false, error: 'AWB stock number not found.' });
      }

      if (stockItem.status === 'VOID') {
        return reply.status(400).send({ success: false, error: 'AWB is already voided.' });
      }

      stockItem.status = 'VOID';
      stockItem.voidReason = reason;
      await stockItem.save();

      await AuditLog.create({
        entityType: 'AWB_STOCK',
        entityId: stockItem.fullAwbNumber,
        action: 'VOID',
        performedBy: (request.headers['x-user-name'] as string) || 'operator',
        reason,
        details: { fullAwbNumber: stockItem.fullAwbNumber },
      });

      return reply.send({
        success: true,
        message: `AWB ${stockItem.fullAwbNumber} permanently voided. Number cannot be reissued.`,
        stock: stockItem.toJSON(),
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
      const filter: any = { status: 'AVAILABLE' };
      if (query.airlinePrefix) {
        filter.airlinePrefix = query.airlinePrefix;
      }

      const available = await AwbStock.findOne(filter).sort({ createdAt: 1 });
      if (!available) {
        return reply.status(404).send({
          success: false,
          error: 'No Stock Available',
          message: 'No available AWB numbers in inventory. Please generate or allocate stock.',
        });
      }

      return reply.send({ success: true, stock: available.toJSON() });
    },
  });
}

