import { FastifyInstance } from 'fastify';
import { mockStore, BookingItem, MawbItem, CassInvoiceItem } from '../store/mockStore.js';
import { calculateVolumetricWeight, calculateChargeableWeight, calculateFreightCharges } from '../utils/volumetric.js';

export default async function bookingRoutes(fastify: FastifyInstance) {
  // Get all bookings
  fastify.get('/api/bookings', {
    schema: {
      tags: ['Bookings & Dimensional Cubing'],
      summary: 'List all air cargo bookings from mock store',
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
      let list = [...mockStore.bookings];

      if (query.status) {
        list = list.filter((b) => b.status === query.status);
      }
      if (query.search) {
        const q = query.search.toLowerCase();
        list = list.filter(
          (b) =>
            b.bookingRef.toLowerCase().includes(q) ||
            b.shipperName.toLowerCase().includes(q) ||
            b.consigneeName.toLowerCase().includes(q)
        );
      }

      return reply.send({ success: true, count: list.length, bookings: list });
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
      const bookingRef =
        body.bookingRef || `BKG-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

      const newBooking: BookingItem = {
        ...body,
        id: `bkg-${Date.now()}`,
        bookingRef,
        volumetricWeightKg,
        actualWeightKg,
        chargeableWeightKg,
        status: 'PENDING_AWB',
        createdAt: new Date().toISOString(),
      };

      mockStore.bookings.unshift(newBooking);

      mockStore.auditLogs.push({
        id: `aud-${Date.now()}`,
        entityType: 'BOOKING',
        entityId: newBooking.bookingRef,
        action: 'CREATE',
        performedBy: (request.headers['x-user-name'] as string) || 'system',
        details: { chargeableWeightKg },
        timestamp: new Date().toISOString(),
      });

      return reply.status(201).send({ success: true, booking: newBooking });
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

      const booking = mockStore.bookings.find((b) => b.id === id || b.bookingRef === id);
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

      const availableStock = mockStore.stock.find((s) => {
        if (s.status !== 'AVAILABLE') return false;
        if (airlinePrefix && s.airlinePrefix !== airlinePrefix) return false;
        return true;
      });

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

      // Update booking
      booking.status = 'AWB_ISSUED';
      booking.assignedAwb = availableStock.fullAwbNumber;

      // Pricing
      const pricing = calculateFreightCharges({ chargeableWeightKg: booking.chargeableWeightKg });

      // Create MAWB
      const newMawb: MawbItem = {
        id: `mawb-${Date.now()}`,
        mawbNumber: availableStock.fullAwbNumber,
        airlinePrefix: availableStock.airlinePrefix,
        serialNumber: availableStock.airlineNumber,
        bookingId: booking.id,
        shipperName: booking.shipperName,
        shipperAddress: `${booking.origin} Air Cargo Logistics Complex`,
        consigneeName: booking.consigneeName,
        consigneeAddress: `${booking.destination} Free Trade Cargo Zone`,
        issuingAgentName: mockStore.agentProfile.name,
        issuingAgentIataCode: mockStore.agentProfile.iataNumericCode,
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
        fwbSent: false,
        createdAt: new Date().toISOString(),
      };
      mockStore.mawbs.unshift(newMawb);

      // Create CASS Invoice
      const newInvoice: CassInvoiceItem = {
        id: `inv-${Date.now()}`,
        invoiceNumber: `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        mawbNumber: newMawb.mawbNumber,
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
        createdAt: new Date().toISOString(),
      };
      mockStore.invoices.unshift(newInvoice);

      return reply.send({
        success: true,
        message: `MAWB ${newMawb.mawbNumber} issued for Booking ${booking.bookingRef}.`,
        booking,
        mawb: newMawb,
        invoice: newInvoice,
      });
    },
  });
}
