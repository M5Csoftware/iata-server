import { FastifyInstance } from 'fastify';
import { FlightManifest } from '../models/FlightManifest.js';
import { Mawb } from '../models/Mawb.js';
import { AuditLog } from '../models/AuditLog.js';

export default async function manifestRoutes(fastify: FastifyInstance) {
  // Get all flight manifests
  fastify.get('/api/manifests', {
    schema: {
      tags: ['Flight Manifests (FFM)'],
      summary: 'List all flight cargo manifests',
      querystring: {
        type: 'object',
        properties: {
          flightNumber: { type: 'string' },
          status: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const query = request.query as { flightNumber?: string; status?: string };
      const filter: any = {};

      if (query.flightNumber) filter.flightNumber = query.flightNumber;
      if (query.status) filter.status = query.status.toUpperCase();

      const manifests = await FlightManifest.find(filter).sort({ createdAt: -1 });
      return reply.send({ success: true, count: manifests.length, manifests });
    },
  });

  // Create flight manifest
  fastify.post('/api/manifests', {
    schema: {
      tags: ['Flight Manifests (FFM)'],
      summary: 'Create flight cargo manifest and transition linked MAWBs to MANIFESTED',
      body: {
        type: 'object',
        required: ['flightNumber', 'airline', 'flightDate', 'origin', 'destination', 'mawbs'],
        properties: {
          manifestNumber: { type: 'string' },
          flightNumber: { type: 'string' },
          airline: { type: 'string' },
          flightDate: { type: 'string' },
          origin: { type: 'string' },
          destination: { type: 'string' },
          mawbs: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    handler: async (request, reply) => {
      const body = request.body as any;
      const mawbNumbers: string[] = body.mawbs || [];

      // Fetch linked MAWBs to calculate aggregate metrics
      const linkedMawbs = await Mawb.find({ mawbNumber: { $in: mawbNumbers } });

      const totalMawbs = linkedMawbs.length;
      const totalHawbs = linkedMawbs.reduce((sum, m) => sum + (m.hawbs?.length || 0), 0);
      const totalPieces = linkedMawbs.reduce((sum, m) => sum + (m.pieces || 0), 0);
      const totalGrossWeightKg = linkedMawbs.reduce((sum, m) => sum + (m.grossWeightKg || 0), 0);

      const manifestNumber =
        body.manifestNumber || `MNF-${new Date().getFullYear()}-${body.origin}-${body.destination}-${Math.floor(10 + Math.random() * 90)}`;

      const manifest = await FlightManifest.create({
        ...body,
        manifestNumber,
        totalMawbs,
        totalHawbs,
        totalPieces,
        totalGrossWeightKg,
        status: 'DRAFT',
      });

      // Update status of all linked MAWBs to MANIFESTED
      await Mawb.updateMany(
        { mawbNumber: { $in: mawbNumbers } },
        {
          $set: {
            status: 'MANIFESTED',
            flightNumber: body.flightNumber,
            flightDate: body.flightDate,
          },
        }
      );

      await AuditLog.create({
        entityType: 'MANIFEST',
        entityId: manifest.manifestNumber,
        action: 'CREATE',
        performedBy: (request.headers['x-user-name'] as string) || 'system',
        details: { flightNumber: manifest.flightNumber, totalMawbs },
      });

      return reply.status(201).send({ success: true, manifest: manifest.toJSON() });
    },
  });

  // Finalize manifest lock
  fastify.post('/api/manifests/:id/finalize', {
    schema: {
      tags: ['Flight Manifests (FFM)'],
      summary: 'Finalize and lock flight manifest for ramp handover & customs',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };

      const manifest = await FlightManifest.findById(id);
      if (!manifest) {
        return reply.status(404).send({ success: false, error: 'Manifest not found.' });
      }

      manifest.status = 'FINALIZED';
      manifest.finalizedAt = new Date().toISOString();
      await manifest.save();

      await AuditLog.create({
        entityType: 'MANIFEST',
        entityId: manifest.manifestNumber,
        action: 'UPDATE',
        performedBy: (request.headers['x-user-name'] as string) || 'system',
        details: { status: 'FINALIZED', finalizedAt: manifest.finalizedAt },
      });

      return reply.send({
        success: true,
        message: `Manifest ${manifest.manifestNumber} finalized and ramp-locked.`,
        manifest: manifest.toJSON(),
      });
    },
  });
}

