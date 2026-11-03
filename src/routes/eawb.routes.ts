import { FastifyInstance } from 'fastify';
import { EawbMessage } from '../models/EawbMessage.js';
import { Mawb, AwbStatus } from '../models/Mawb.js';
import { FlightManifest } from '../models/FlightManifest.js';
import { AuditLog } from '../models/AuditLog.js';
import { generateFwbMessage, generateFhlMessage, generateFfmMessage, generateFsuMessage } from '../utils/cargoImp.js';

export default async function eawbRoutes(fastify: FastifyInstance) {
  // Get all e-AWB messages
  fastify.get('/api/eawb', {
    schema: {
      tags: ['e-AWB & Cargo-IMP EDI'],
      summary: 'List all Cargo-IMP/XML teletype messages (FWB, FHL, FFM, FSU)',
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
      const filter: any = {};

      if (query.messageType) filter.messageType = query.messageType.toUpperCase();
      if (query.awbNumber) filter.awbNumber = query.awbNumber;

      const messages = await EawbMessage.find(filter).sort({ createdAt: -1 });
      return reply.send({ success: true, count: messages.length, messages });
    },
  });

  // Dispatch FWB (Freight Waybill)
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
      const mawb = await Mawb.findOne({ mawbNumber });

      if (!mawb) {
        return reply.status(404).send({ success: false, error: 'MAWB not found.' });
      }

      const rawCargoImp = generateFwbMessage(mawb);
      const airlineName = mawb.airlinePrefix === '098' ? 'Air India Cargo' : mawb.airlinePrefix === '176' ? 'Emirates SkyCargo' : 'Lufthansa Cargo';

      const message = await EawbMessage.create({
        messageType: 'FWB',
        awbNumber: mawb.mawbNumber,
        airline: airlineName,
        flightNumber: mawb.flightNumber,
        direction: 'OUTBOUND',
        status: 'ACKNOWLEDGED',
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
        rawCargoImp,
      });

      mawb.fwbSent = true;
      await mawb.save();

      await AuditLog.create({
        entityType: 'EAWB',
        entityId: mawb.mawbNumber,
        action: 'DISPATCH',
        performedBy: (request.headers['x-user-name'] as string) || 'system',
        details: { messageType: 'FWB', rawCargoImp },
      });

      return reply.status(201).send({
        success: true,
        message: `Cargo-IMP FWB message transmitted to airline host for ${mawbNumber}.`,
        eawbMessage: message.toJSON(),
      });
    },
  });

  // Dispatch FHL (Freight House List)
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
      const mawb = await Mawb.findOne({ mawbNumber });

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
      const airlineName = mawb.airlinePrefix === '098' ? 'Air India Cargo' : mawb.airlinePrefix === '176' ? 'Emirates SkyCargo' : 'Lufthansa Cargo';

      const message = await EawbMessage.create({
        messageType: 'FHL',
        awbNumber: mawb.mawbNumber,
        airline: airlineName,
        flightNumber: mawb.flightNumber,
        direction: 'OUTBOUND',
        status: 'ACKNOWLEDGED',
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
        rawCargoImp,
      });

      await AuditLog.create({
        entityType: 'EAWB',
        entityId: mawb.mawbNumber,
        action: 'DISPATCH',
        performedBy: (request.headers['x-user-name'] as string) || 'system',
        details: { messageType: 'FHL', hawbCount: mawb.hawbs.length },
      });

      return reply.status(201).send({
        success: true,
        message: `Cargo-IMP FHL house manifest transmitted for ${mawbNumber}.`,
        eawbMessage: message.toJSON(),
      });
    },
  });

  // Dispatch FFM (Flight Forward Manifest)
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
      const manifest = await FlightManifest.findOne({ manifestNumber });

      if (!manifest) {
        return reply.status(404).send({ success: false, error: 'Manifest not found.' });
      }

      const rawCargoImp = generateFfmMessage(manifest);

      const message = await EawbMessage.create({
        messageType: 'FFM',
        awbNumber: manifest.manifestNumber,
        airline: manifest.airline,
        flightNumber: manifest.flightNumber,
        direction: 'OUTBOUND',
        status: 'ACKNOWLEDGED',
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
        rawCargoImp,
      });

      return reply.status(201).send({
        success: true,
        message: `Cargo-IMP FFM message transmitted for flight ${manifest.flightNumber}.`,
        eawbMessage: message.toJSON(),
      });
    },
  });

  // Dispatch FSU (Flight Status Update)
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

      const mawb = await Mawb.findOne({ mawbNumber: awbNumber });
      if (!mawb) {
        return reply.status(404).send({ success: false, error: 'MAWB not found.' });
      }

      // Map statusType to AwbStatus
      const statusMap: Record<string, AwbStatus> = {
        RCS: 'ALLOTTED',
        MAN: 'MANIFESTED',
        DEP: 'DEPARTED',
        ARR: 'ARRIVED',
        DLV: 'DELIVERED',
      };

      if (statusMap[statusType]) {
        mawb.status = statusMap[statusType];
        await mawb.save();
      }

      const rawCargoImp = generateFsuMessage({
        awbNumber: mawb.mawbNumber,
        statusType,
        station,
        pieces: mawb.pieces,
        weightKg: mawb.grossWeightKg,
        flightNumber: mawb.flightNumber,
      });

      const message = await EawbMessage.create({
        messageType: 'FSU',
        awbNumber: mawb.mawbNumber,
        airline: mawb.airlinePrefix === '098' ? 'Air India Cargo' : 'Emirates SkyCargo',
        flightNumber: mawb.flightNumber,
        direction: 'OUTBOUND',
        status: 'ACKNOWLEDGED',
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
        rawCargoImp,
      });

      return reply.status(201).send({
        success: true,
        message: `FSU (${statusType}) status update recorded. MAWB transitioned to ${mawb.status}.`,
        eawbMessage: message.toJSON(),
        mawb: mawb.toJSON(),
      });
    },
  });
}

