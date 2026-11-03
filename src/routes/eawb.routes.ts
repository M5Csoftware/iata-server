import { FastifyInstance } from 'fastify';
import { mockStore, EawbMessageItem } from '../store/mockStore.js';
import { generateFwbMessage, generateFhlMessage, generateFfmMessage, generateFsuMessage } from '../utils/cargoImp.js';

export default async function eawbRoutes(fastify: FastifyInstance) {
  // Get all e-AWB messages
  fastify.get('/api/eawb', {
    schema: {
      tags: ['e-AWB & Cargo-IMP EDI'],
      summary: 'List all Cargo-IMP/XML teletype messages from mock store',
      querystring: {
        type: 'object',
        properties: {
          messageType: { type: 'string' },
          awbNumber: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const query = request.query as { messageType?: string; awbNumber?: string };
      let list = [...mockStore.eawbMessages];

      if (query.messageType) list = list.filter((m) => m.messageType === query.messageType?.toUpperCase());
      if (query.awbNumber) list = list.filter((m) => m.awbNumber === query.awbNumber);

      return reply.send({ success: true, count: list.length, messages: list });
    },
  });

  // Dispatch FWB
  fastify.post('/api/eawb/dispatch-fwb', {
    schema: {
      tags: ['e-AWB & Cargo-IMP EDI'],
      summary: 'Generate and transmit Cargo-IMP FWB teletype message to airline host',
      body: {
        type: 'object',
        required: ['mawbNumber'],
        properties: {
          mawbNumber: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const { mawbNumber } = request.body as { mawbNumber: string };
      const mawb = mockStore.mawbs.find((m) => m.mawbNumber === mawbNumber);

      if (!mawb) {
        return reply.status(404).send({ success: false, error: 'MAWB not found.' });
      }

      const rawCargoImp = generateFwbMessage(mawb);
      const airlineName =
        mawb.airlinePrefix === '098'
          ? 'Air India Cargo'
          : mawb.airlinePrefix === '176'
          ? 'Emirates SkyCargo'
          : 'Lufthansa Cargo';

      const message: EawbMessageItem = {
        id: `msg-${Date.now()}`,
        messageType: 'FWB',
        awbNumber: mawb.mawbNumber,
        airline: airlineName,
        flightNumber: mawb.flightNumber,
        direction: 'OUTBOUND',
        status: 'ACKNOWLEDGED',
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
        rawCargoImp,
        createdAt: new Date().toISOString(),
      };

      mockStore.eawbMessages.unshift(message);
      mawb.fwbSent = true;

      mockStore.auditLogs.push({
        id: `aud-${Date.now()}`,
        entityType: 'EAWB',
        entityId: mawb.mawbNumber,
        action: 'DISPATCH',
        performedBy: (request.headers['x-user-name'] as string) || 'system',
        details: { messageType: 'FWB' },
        timestamp: new Date().toISOString(),
      });

      return reply.status(201).send({
        success: true,
        message: `Cargo-IMP FWB message transmitted to airline host for ${mawbNumber}.`,
        eawbMessage: message,
      });
    },
  });

  // Dispatch FHL
  fastify.post('/api/eawb/dispatch-fhl', {
    schema: {
      tags: ['e-AWB & Cargo-IMP EDI'],
      summary: 'Generate and transmit Cargo-IMP FHL consolidated house manifest message',
      body: {
        type: 'object',
        required: ['mawbNumber'],
        properties: {
          mawbNumber: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const { mawbNumber } = request.body as { mawbNumber: string };
      const mawb = mockStore.mawbs.find((m) => m.mawbNumber === mawbNumber);

      if (!mawb) {
        return reply.status(404).send({ success: false, error: 'MAWB not found.' });
      }

      if (!mawb.hawbs || mawb.hawbs.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'No HAWBs',
          message: 'Cannot dispatch FHL: No House AWBs consolidated under this MAWB.',
        });
      }

      const rawCargoImp = generateFhlMessage(mawb, mawb.hawbs);
      const airlineName =
        mawb.airlinePrefix === '098' ? 'Air India Cargo' : 'Emirates SkyCargo';

      const message: EawbMessageItem = {
        id: `msg-${Date.now()}`,
        messageType: 'FHL',
        awbNumber: mawb.mawbNumber,
        airline: airlineName,
        flightNumber: mawb.flightNumber,
        direction: 'OUTBOUND',
        status: 'ACKNOWLEDGED',
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
        rawCargoImp,
        createdAt: new Date().toISOString(),
      };

      mockStore.eawbMessages.unshift(message);

      mockStore.auditLogs.push({
        id: `aud-${Date.now()}`,
        entityType: 'EAWB',
        entityId: mawb.mawbNumber,
        action: 'DISPATCH',
        performedBy: (request.headers['x-user-name'] as string) || 'system',
        details: { messageType: 'FHL', hawbCount: mawb.hawbs.length },
        timestamp: new Date().toISOString(),
      });

      return reply.status(201).send({
        success: true,
        message: `Cargo-IMP FHL house manifest transmitted for ${mawbNumber}.`,
        eawbMessage: message,
      });
    },
  });

  // Dispatch FFM
  fastify.post('/api/eawb/dispatch-ffm', {
    schema: {
      tags: ['e-AWB & Cargo-IMP EDI'],
      summary: 'Generate and transmit Cargo-IMP FFM message for a flight manifest',
      body: {
        type: 'object',
        required: ['manifestNumber'],
        properties: {
          manifestNumber: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const { manifestNumber } = request.body as { manifestNumber: string };
      const manifest = mockStore.manifests.find((m) => m.manifestNumber === manifestNumber);

      if (!manifest) {
        return reply.status(404).send({ success: false, error: 'Manifest not found.' });
      }

      const rawCargoImp = generateFfmMessage(manifest);

      const message: EawbMessageItem = {
        id: `msg-${Date.now()}`,
        messageType: 'FFM',
        awbNumber: manifest.manifestNumber,
        airline: manifest.airline,
        flightNumber: manifest.flightNumber,
        direction: 'OUTBOUND',
        status: 'ACKNOWLEDGED',
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
        rawCargoImp,
        createdAt: new Date().toISOString(),
      };

      mockStore.eawbMessages.unshift(message);

      return reply.status(201).send({
        success: true,
        message: `Cargo-IMP FFM message transmitted for flight ${manifest.flightNumber}.`,
        eawbMessage: message,
      });
    },
  });

  // Dispatch FSU
  fastify.post('/api/eawb/dispatch-fsu', {
    schema: {
      tags: ['e-AWB & Cargo-IMP EDI'],
      summary: 'Send Flight Status Update (RCS, MAN, DEP, ARR, DLV) and update MAWB status',
      body: {
        type: 'object',
        required: ['awbNumber', 'statusType', 'station'],
        properties: {
          awbNumber: { type: 'string' },
          statusType: { type: 'string', enum: ['RCS', 'MAN', 'DEP', 'ARR', 'DLV'] },
          station: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const { awbNumber, statusType, station } = request.body as {
        awbNumber: string;
        statusType: 'RCS' | 'MAN' | 'DEP' | 'ARR' | 'DLV';
        station: string;
      };

      const mawb = mockStore.mawbs.find((m) => m.mawbNumber === awbNumber);
      if (!mawb) {
        return reply.status(404).send({ success: false, error: 'MAWB not found.' });
      }

      const statusMap: Record<string, any> = {
        RCS: 'ALLOTTED',
        MAN: 'MANIFESTED',
        DEP: 'DEPARTED',
        ARR: 'ARRIVED',
        DLV: 'DELIVERED',
      };

      if (statusMap[statusType]) {
        mawb.status = statusMap[statusType];
      }

      const rawCargoImp = generateFsuMessage({
        awbNumber: mawb.mawbNumber,
        statusType,
        station,
        pieces: mawb.pieces,
        weightKg: mawb.grossWeightKg,
        flightNumber: mawb.flightNumber,
      });

      const message: EawbMessageItem = {
        id: `msg-${Date.now()}`,
        messageType: 'FSU',
        awbNumber: mawb.mawbNumber,
        airline: mawb.airlinePrefix === '098' ? 'Air India Cargo' : 'Emirates SkyCargo',
        flightNumber: mawb.flightNumber,
        direction: 'OUTBOUND',
        status: 'ACKNOWLEDGED',
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
        rawCargoImp,
        createdAt: new Date().toISOString(),
      };

      mockStore.eawbMessages.unshift(message);

      return reply.status(201).send({
        success: true,
        message: `FSU (${statusType}) status update recorded. MAWB transitioned to ${mawb.status}.`,
        eawbMessage: message,
        mawb,
      });
    },
  });
}
