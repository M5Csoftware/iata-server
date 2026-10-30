import { FastifyInstance } from 'fastify';
import { mockStore, FlightManifestItem } from '../store/mockStore.js';

export default async function manifestRoutes(fastify: FastifyInstance) {
  // Get all flight manifests
  fastify.get('/api/manifests', {
    schema: {
      tags: ['Flight Manifests (FFM)'],
      summary: 'List all flight cargo manifests from mock store',
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
      let list = [...mockStore.manifests];

      if (query.flightNumber) list = list.filter((m) => m.flightNumber === query.flightNumber);
      if (query.status) list = list.filter((m) => m.status === query.status?.toUpperCase());

      return reply.send({ success: true, count: list.length, manifests: list });
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

      const linkedMawbs = mockStore.mawbs.filter((m) => mawbNumbers.includes(m.mawbNumber));

      const totalMawbs = linkedMawbs.length;
      const totalHawbs = linkedMawbs.reduce((sum, m) => sum + (m.hawbs?.length || 0), 0);
      const totalPieces = linkedMawbs.reduce((sum, m) => sum + (m.pieces || 0), 0);
      const totalGrossWeightKg = linkedMawbs.reduce((sum, m) => sum + (m.grossWeightKg || 0), 0);

      const manifestNumber =
        body.manifestNumber ||
        `MNF-${new Date().getFullYear()}-${body.origin}-${body.destination}-${Math.floor(10 + Math.random() * 90)}`;

      const newManifest: FlightManifestItem = {
        ...body,
        id: `mnf-${Date.now()}`,
        manifestNumber,
        totalMawbs,
        totalHawbs,
        totalPieces,
        totalGrossWeightKg,
        status: 'DRAFT',
        createdAt: new Date().toISOString(),
      };

      mockStore.manifests.unshift(newManifest);

      // Transition linked MAWBs to MANIFESTED
      for (const m of linkedMawbs) {
        m.status = 'MANIFESTED';
        m.flightNumber = body.flightNumber;
        m.flightDate = body.flightDate;
      }

      mockStore.auditLogs.push({
        id: `aud-${Date.now()}`,
        entityType: 'MANIFEST',
        entityId: newManifest.manifestNumber,
        action: 'CREATE',
        performedBy: (request.headers['x-user-name'] as string) || 'system',
        details: { flightNumber: newManifest.flightNumber, totalMawbs },
        timestamp: new Date().toISOString(),
      });

      return reply.status(201).send({ success: true, manifest: newManifest });
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

      const manifest = mockStore.manifests.find((m) => m.id === id || m.manifestNumber === id);
      if (!manifest) {
        return reply.status(404).send({ success: false, error: 'Manifest not found.' });
      }

      manifest.status = 'FINALIZED';
      manifest.finalizedAt = new Date().toISOString();

      mockStore.auditLogs.push({
        id: `aud-${Date.now()}`,
        entityType: 'MANIFEST',
        entityId: manifest.manifestNumber,
        action: 'UPDATE',
        performedBy: (request.headers['x-user-name'] as string) || 'system',
        details: { status: 'FINALIZED', finalizedAt: manifest.finalizedAt },
        timestamp: new Date().toISOString(),
      });

      return reply.send({
        success: true,
        message: `Manifest ${manifest.manifestNumber} finalized and ramp-locked.`,
        manifest,
      });
    },
  });
}
