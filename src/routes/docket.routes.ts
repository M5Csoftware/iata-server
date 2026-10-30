import { FastifyInstance } from 'fastify';
import { mockStore, DocketItem, MawbItem, CassInvoiceItem } from '../store/mockStore.js';
import { calculateVolumetricWeight, calculateChargeableWeight, calculateFreightCharges } from '../utils/volumetric.js';

export default async function docketRoutes(fastify: FastifyInstance) {
  // Get all dockets
  fastify.get('/api/dockets', {
    schema: {
      tags: ['Cargo Dockets & Consignments'],
      summary: 'List all cargo consignment dockets from mock store',
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
      let list = [...mockStore.dockets];

      if (query.status) {
        list = list.filter((d) => d.status === query.status);
      }
      if (query.search) {
        const q = query.search.toLowerCase();
        list = list.filter(
          (d) =>
            d.docketNumber.toLowerCase().includes(q) ||
            d.consignorName.toLowerCase().includes(q) ||
            d.consigneeName.toLowerCase().includes(q) ||
            (d.assignedAwb && d.assignedAwb.toLowerCase().includes(q))
        );
      }

      return reply.send({ success: true, count: list.length, dockets: list });
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
      const docket = mockStore.dockets.find((d) => d.id === id || d.docketNumber === id);
      if (!docket) {
        return reply.status(404).send({ success: false, error: 'Docket not found.' });
      }
      return reply.send({ success: true, docket });
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

      const docketNumber =
        body.docketNumber ||
        `DKT-${body.origin || 'DEL'}-${new Date().getFullYear().toString().slice(2)}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

      const newDocket: DocketItem = {
        ...body,
        id: `dkt-${Date.now()}`,
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
        createdAt: new Date().toISOString(),
      };

      mockStore.dockets.unshift(newDocket);

      mockStore.auditLogs.push({
        id: `aud-${Date.now()}`,
        entityType: 'DOCKET',
        entityId: newDocket.docketNumber,
        action: 'CREATE',
        performedBy: (request.headers['x-user-name'] as string) || 'system',
        details: { chargeableWeightKg, totalAmount: newDocket.totalAmount },
        timestamp: new Date().toISOString(),
      });

      return reply.status(201).send({ success: true, docket: newDocket });
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
          airlinePrefix: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const { airlinePrefix } = (request.body as { airlinePrefix?: string }) || {};

      const docket = mockStore.dockets.find((d) => d.id === id || d.docketNumber === id);
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

      // Update docket
      docket.status = 'AWB_ASSIGNED';
      docket.assignedAwb = availableStock.fullAwbNumber;

      // Create MAWB
      const newMawb: MawbItem = {
        id: `mawb-${Date.now()}`,
        mawbNumber: availableStock.fullAwbNumber,
        airlinePrefix: availableStock.airlinePrefix,
        serialNumber: availableStock.airlineNumber,
        docketId: docket.id,
        shipperName: docket.consignorName,
        shipperAddress: docket.consignorAddress,
        consigneeName: docket.consigneeName,
        consigneeAddress: docket.consigneeAddress,
        issuingAgentName: mockStore.agentProfile.name,
        issuingAgentIataCode: mockStore.agentProfile.iataNumericCode,
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
        fwbSent: false,
        hawbs: [],
        createdAt: new Date().toISOString(),
      };
      mockStore.mawbs.unshift(newMawb);

      // Create CASS Invoice
      const newInvoice: CassInvoiceItem = {
        id: `inv-${Date.now()}`,
        invoiceNumber: `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        mawbNumber: newMawb.mawbNumber,
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
        createdAt: new Date().toISOString(),
      };
      mockStore.invoices.unshift(newInvoice);

      return reply.send({
        success: true,
        message: `AWB ${newMawb.mawbNumber} allocated to Docket ${docket.docketNumber}.`,
        docket,
        mawb: newMawb,
        invoice: newInvoice,
      });
    },
  });
}
