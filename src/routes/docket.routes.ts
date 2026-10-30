import { FastifyInstance } from 'fastify';
import { Docket } from '../models/Docket.js';
import { AwbStock } from '../models/AwbStock.js';
import { Mawb } from '../models/Mawb.js';
import { CassInvoice } from '../models/CassInvoice.js';
import { AgentProfile } from '../models/MasterData.js';
import { AuditLog } from '../models/AuditLog.js';
import { calculateVolumetricWeight, calculateChargeableWeight, calculateFreightCharges } from '../utils/volumetric.js';

export default async function docketRoutes(fastify: FastifyInstance) {
  // Get all dockets
  fastify.get('/api/dockets', {
    schema: {
      tags: ['Cargo Dockets & Consignments'],
      summary: 'List all cargo consignment dockets',
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
      const filter: any = {};

      if (query.status) filter.status = query.status;
      if (query.search) {
        filter.$or = [
          { docketNumber: { $regex: query.search, $options: 'i' } },
          { consignorName: { $regex: query.search, $options: 'i' } },
          { consigneeName: { $regex: query.search, $options: 'i' } },
          { assignedAwb: { $regex: query.search, $options: 'i' } },
        ];
      }

      const dockets = await Docket.find(filter).sort({ createdAt: -1 });
      return reply.send({ success: true, count: dockets.length, dockets });
    },
  });

  // Get docket by ID
  fastify.get('/api/dockets/:id', {
    schema: {
      tags: ['Cargo Dockets & Consignments'],
      summary: 'Get details of a specific consignment docket',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const docket = await Docket.findById(id);
      if (!docket) {
        return reply.status(404).send({ success: false, error: 'Docket not found.' });
      }
      return reply.send({ success: true, docket: docket.toJSON() });
    },
  });

  // Create new consignment docket
  fastify.post('/api/dockets', {
    schema: {
      tags: ['Cargo Dockets & Consignments'],
      summary: 'Register cargo consignment docket with dimensional cubing & GST',
    },
    handler: async (request, reply) => {
      const body = request.body as any;

      const volumetricWeightKg = calculateVolumetricWeight(body.dimensions || []);
      const actualWeightKg = Number(body.actualWeightKg) || 0;
      const chargeableWeightKg = calculateChargeableWeight(actualWeightKg, volumetricWeightKg);

      const pricing = calculateFreightCharges({
        chargeableWeightKg,
        ratePerKg: body.ratePerKg,
        handlingFee: body.docketFee || 250,
      });

      const docketNumber = body.docketNumber || `DKT-${body.origin || 'DEL'}-${new Date().getFullYear().toString().slice(2)}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

      const docket = await Docket.create({
        ...body,
        docketNumber,
        bookingDate: body.bookingDate || new Date().toISOString().split('T')[0],
        volumetricWeightKg,
        actualWeightKg,
        chargeableWeightKg,
        ratePerKg: body.ratePerKg || pricing.ratePerKg,
        freightAmount: body.freightAmount || pricing.freightAmount,
        docketFee: body.docketFee || pricing.handlingFee,
        fuelSurcharge: body.fuelSurcharge || pricing.fuelSurcharge,
        securitySurcharge: body.securitySurcharge || pricing.securitySurcharge,
        subtotal: body.subtotal || pricing.subtotal,
        gstAmount: body.gstAmount || pricing.gstAmount,
        totalAmount: body.totalAmount || pricing.totalAmount,
        status: 'BOOKED',
      });

      await AuditLog.create({
        entityType: 'DOCKET',
        entityId: docket.docketNumber,
        action: 'CREATE',
        performedBy: (request.headers['x-user-name'] as string) || 'system',
        details: { chargeableWeightKg, totalAmount: docket.totalAmount },
      });

      return reply.status(201).send({ success: true, docket: docket.toJSON() });
    },
  });

  // Assign AWB to docket
  fastify.post('/api/dockets/:id/assign-awb', {
    schema: {
      tags: ['Cargo Dockets & Consignments'],
      summary: 'Assign available AWB number to docket, issuing MAWB and GST Invoice',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          airlinePrefix: { type: 'string', description: 'Optional airline prefix preference' },
        },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const { airlinePrefix } = (request.body as { airlinePrefix?: string }) || {};

      const docket = await Docket.findById(id);
      if (!docket) {
        return reply.status(404).send({ success: false, error: 'Docket not found.' });
      }

      if (docket.status === 'AWB_ASSIGNED' && docket.assignedAwb) {
        return reply.status(400).send({
          success: false,
          error: 'AWB Already Assigned',
          message: `Docket already has AWB ${docket.assignedAwb} allocated.`,
        });
      }

      const stockFilter: any = { status: 'AVAILABLE' };
      if (airlinePrefix) stockFilter.airlinePrefix = airlinePrefix;

      const availableStock = await AwbStock.findOne(stockFilter).sort({ createdAt: 1 });
      if (!availableStock) {
        return reply.status(400).send({
          success: false,
          error: 'Out of Stock',
          message: 'No available AWB numbers in stock. Please generate a new stock series first.',
        });
      }

      // Mark stock ISSUED
      availableStock.status = 'ISSUED';
      availableStock.issuedAt = new Date().toISOString().split('T')[0];
      await availableStock.save();

      // Update docket
      docket.status = 'AWB_ASSIGNED';
      docket.assignedAwb = availableStock.fullAwbNumber;
      await docket.save();

      // Fetch agent profile
      const agentProfile = await AgentProfile.findOne();

      // Create MAWB
      const mawb = await Mawb.create({
        mawbNumber: availableStock.fullAwbNumber,
        airlinePrefix: availableStock.airlinePrefix,
        serialNumber: availableStock.airlineNumber,
        docketId: docket._id.toString(),
        shipperName: docket.consignorName,
        shipperAddress: docket.consignorAddress,
        consigneeName: docket.consigneeName,
        consigneeAddress: docket.consigneeAddress,
        issuingAgentName: agentProfile?.name || 'Apex Global Logistics Pvt. Ltd.',
        issuingAgentIataCode: agentProfile?.iataNumericCode || '14-3-9821/0014',
        origin: docket.origin,
        destination: docket.destination,
        pieces: docket.pieces,
        grossWeightKg: docket.actualWeightKg,
        chargeableWeightKg: docket.chargeableWeightKg,
        rateClass: 'Q',
        ratePerKg: docket.ratePerKg,
        freightAmount: docket.freightAmount,
        fuelSurcharge: docket.fuelSurcharge,
        securitySurcharge: docket.securitySurcharge,
        totalCharges: docket.subtotal,
        natureOfGoods: docket.natureOfGoods,
        handlingCode: docket.handlingCode,
        flightNumber: 'AI-121',
        flightDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
        status: 'ISSUED',
        issuedAt: new Date().toISOString().split('T')[0],
        hawbs: [],
      });

      // Create CASS Invoice
      const invoice = await CassInvoice.create({
        invoiceNumber: `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        mawbNumber: mawb.mawbNumber,
        customerName: docket.consignorName,
        date: new Date().toISOString().split('T')[0],
        freightCharges: docket.freightAmount,
        fuelSurcharge: docket.fuelSurcharge,
        securitySurcharge: docket.securitySurcharge,
        handlingCharges: docket.docketFee,
        subtotal: docket.subtotal,
        gstAmount: docket.gstAmount,
        totalAmount: docket.totalAmount,
        cassReconciliationStatus: 'PENDING_MATCH',
        paymentStatus: docket.paymentMode === 'PREPAID' ? 'PAID' : 'UNPAID',
      });

      await AuditLog.create({
        entityType: 'MAWB',
        entityId: mawb.mawbNumber,
        action: 'ASSIGN',
        performedBy: (request.headers['x-user-name'] as string) || 'system',
        details: { docketNumber: docket.docketNumber, invoiceNumber: invoice.invoiceNumber },
      });

      return reply.send({
        success: true,
        message: `AWB ${mawb.mawbNumber} allocated to Docket ${docket.docketNumber}.`,
        docket: docket.toJSON(),
        mawb: mawb.toJSON(),
        invoice: invoice.toJSON(),
      });
    },
  });
}

