import { FastifyInstance } from 'fastify';
import { Booking } from '../models/Booking.js';
import { AwbStock } from '../models/AwbStock.js';
import { Mawb } from '../models/Mawb.js';
import { CassInvoice } from '../models/CassInvoice.js';
import { AgentProfile } from '../models/MasterData.js';
import { AuditLog } from '../models/AuditLog.js';
import { calculateVolumetricWeight, calculateChargeableWeight, calculateFreightCharges } from '../utils/volumetric.js';

export default async function bookingRoutes(fastify: FastifyInstance) {
  // Get all bookings
  fastify.get('/api/bookings', {
    schema: {
      tags: ['Bookings & Dimensional Cubing'],
      summary: 'List all air cargo bookings',
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
          { bookingRef: { $regex: query.search, $options: 'i' } },
          { shipperName: { $regex: query.search, $options: 'i' } },
          { consigneeName: { $regex: query.search, $options: 'i' } },
        ];
      }

      const bookings = await Booking.find(filter).sort({ createdAt: -1 });
      return reply.send({ success: true, count: bookings.length, bookings });
    },
  });

  // Create booking
  fastify.post('/api/bookings', {
    schema: {
      tags: ['Bookings & Dimensional Cubing'],
      summary: 'Create air cargo booking with volumetric weight calculation',
    },
    handler: async (request, reply) => {
      const body = request.body as any;

      const volumetricWeightKg = calculateVolumetricWeight(body.dimensions || []);
      const actualWeightKg = Number(body.actualWeightKg) || 0;
      const chargeableWeightKg = calculateChargeableWeight(actualWeightKg, volumetricWeightKg);
      const bookingRef = body.bookingRef || `BKG-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

      const booking = await Booking.create({
        ...body,
        bookingRef,
        volumetricWeightKg,
        actualWeightKg,
        chargeableWeightKg,
        status: 'PENDING_AWB',
      });

      await AuditLog.create({
        entityType: 'BOOKING',
        entityId: booking.bookingRef,
        action: 'CREATE',
        performedBy: (request.headers['x-user-name'] as string) || 'system',
        details: { chargeableWeightKg },
      });

      return reply.status(201).send({ success: true, booking: booking.toJSON() });
    },
  });

  // Assign AWB to booking
  fastify.post('/api/bookings/:id/assign-awb', {
    schema: {
      tags: ['Bookings & Dimensional Cubing'],
      summary: 'Assign available AWB number to booking, issuing MAWB and CASS invoice',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          airlinePrefix: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const { airlinePrefix } = (request.body as { airlinePrefix?: string }) || {};

      const booking = await Booking.findById(id);
      if (!booking) {
        return reply.status(404).send({ success: false, error: 'Booking not found.' });
      }

      if (booking.status === 'AWB_ISSUED' && booking.assignedAwb) {
        return reply.status(400).send({
          success: false,
          error: 'AWB Already Issued',
          message: `Booking already has AWB ${booking.assignedAwb} allocated.`,
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

      // Update booking
      booking.status = 'AWB_ISSUED';
      booking.assignedAwb = availableStock.fullAwbNumber;
      await booking.save();

      // Pricing
      const pricing = calculateFreightCharges({ chargeableWeightKg: booking.chargeableWeightKg });
      const agentProfile = await AgentProfile.findOne();

      // Create MAWB
      const mawb = await Mawb.create({
        mawbNumber: availableStock.fullAwbNumber,
        airlinePrefix: availableStock.airlinePrefix,
        serialNumber: availableStock.airlineNumber,
        bookingId: booking._id.toString(),
        shipperName: booking.shipperName,
        shipperAddress: `${booking.origin} Air Cargo Logistics Complex`,
        consigneeName: booking.consigneeName,
        consigneeAddress: `${booking.destination} Free Trade Cargo Zone`,
        issuingAgentName: agentProfile?.name || 'Apex Global Logistics Pvt. Ltd.',
        issuingAgentIataCode: agentProfile?.iataNumericCode || '14-3-9821/0014',
        origin: booking.origin,
        destination: booking.destination,
        pieces: booking.pieces,
        grossWeightKg: booking.actualWeightKg,
        chargeableWeightKg: booking.chargeableWeightKg,
        rateClass: 'Q',
        ratePerKg: pricing.ratePerKg,
        freightAmount: pricing.freightAmount,
        fuelSurcharge: pricing.fuelSurcharge,
        securitySurcharge: pricing.securitySurcharge,
        totalCharges: pricing.subtotal - pricing.handlingFee,
        natureOfGoods: booking.natureOfGoods,
        handlingCode: booking.handlingCode,
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
        customerName: booking.shipperName,
        date: new Date().toISOString().split('T')[0],
        freightCharges: pricing.freightAmount,
        fuelSurcharge: pricing.fuelSurcharge,
        securitySurcharge: pricing.securitySurcharge,
        handlingCharges: pricing.handlingFee,
        subtotal: pricing.subtotal,
        gstAmount: pricing.gstAmount,
        totalAmount: pricing.totalAmount,
        cassReconciliationStatus: 'PENDING_MATCH',
        paymentStatus: 'UNPAID',
      });

      return reply.send({
        success: true,
        message: `MAWB ${mawb.mawbNumber} successfully issued for Booking ${booking.bookingRef}.`,
        booking: booking.toJSON(),
        mawb: mawb.toJSON(),
        invoice: invoice.toJSON(),
      });
    },
  });
}

