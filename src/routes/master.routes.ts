import { FastifyInstance } from 'fastify';
import { mockStore, AirlineItem, AirportItem, PartnerItem, AgentProfileItem } from '../store/mockStore.js';

export default async function masterRoutes(fastify: FastifyInstance) {
  // --- Airlines ---
  fastify.get('/api/master/airlines', {
    schema: {
      tags: ['IATA Master Data'],
      summary: 'Get all accredited IATA airlines with 3-digit prefix from mock store',
    },
    handler: async (_request, reply) => {
      return reply.send({ success: true, count: mockStore.airlines.length, airlines: mockStore.airlines });
    },
  });

  fastify.post('/api/master/airlines', {
    schema: {
      tags: ['IATA Master Data'],
      summary: 'Register a new carrier with 3-digit prefix',
      body: {
        type: 'object',
        required: ['prefix', 'code', 'name', 'country'],
        properties: {
          prefix: { type: 'string' },
          code: { type: 'string' },
          name: { type: 'string' },
          country: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const body = request.body as any;
      const existing = mockStore.airlines.find((a) => a.prefix === body.prefix);
      if (existing) {
        return reply.status(409).send({
          success: false,
          error: 'Prefix Conflict',
          message: `Airline with prefix ${body.prefix} already exists.`,
        });
      }

      const newAirline: AirlineItem = {
        id: `air-${Date.now()}`,
        ...body,
      };
      mockStore.airlines.push(newAirline);
      return reply.status(201).send({ success: true, airline: newAirline });
    },
  });

  // --- Airports ---
  fastify.get('/api/master/airports', {
    schema: {
      tags: ['IATA Master Data'],
      summary: 'Get all accredited IATA airports from mock store',
    },
    handler: async (_request, reply) => {
      return reply.send({ success: true, count: mockStore.airports.length, airports: mockStore.airports });
    },
  });

  fastify.post('/api/master/airports', {
    schema: {
      tags: ['IATA Master Data'],
      summary: 'Register a new 3-letter IATA airport',
      body: {
        type: 'object',
        required: ['iataCode', 'name', 'city', 'country'],
        properties: {
          iataCode: { type: 'string' },
          name: { type: 'string' },
          city: { type: 'string' },
          country: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const body = request.body as any;
      const code = body.iataCode.toUpperCase();
      const existing = mockStore.airports.find((a) => a.iataCode === code);
      if (existing) {
        return reply.status(409).send({
          success: false,
          error: 'Airport Conflict',
          message: `Airport ${body.iataCode} already exists.`,
        });
      }

      const newAirport: AirportItem = {
        id: `apt-${Date.now()}`,
        ...body,
        iataCode: code,
      };
      mockStore.airports.push(newAirport);
      return reply.status(201).send({ success: true, airport: newAirport });
    },
  });

  // --- Partners ---
  fastify.get('/api/master/partners', {
    schema: {
      tags: ['IATA Master Data'],
      summary: 'List accredited shippers, consignees and trading partners from mock store',
      querystring: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['SHIPPER', 'CONSIGNEE', 'BOTH'] },
        },
      },
    },
    handler: async (request, reply) => {
      const query = request.query as { type?: string };
      let list = [...mockStore.partners];
      if (query.type) {
        list = list.filter((p) => p.type === query.type || p.type === 'BOTH');
      }
      return reply.send({ success: true, count: list.length, partners: list });
    },
  });

  fastify.post('/api/master/partners', {
    schema: {
      tags: ['IATA Master Data'],
      summary: 'Register a new shipper or consignee trading partner',
      body: {
        type: 'object',
        required: ['name', 'type'],
        properties: {
          type: { type: 'string', enum: ['SHIPPER', 'CONSIGNEE', 'BOTH'] },
          name: { type: 'string' },
          accountNumber: { type: 'string' },
          address: { type: 'string' },
          city: { type: 'string' },
          country: { type: 'string' },
          contactPerson: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string' },
          taxOrGstId: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const body = request.body as any;
      const newPartner: PartnerItem = {
        id: `prt-${Date.now()}`,
        ...body,
      };
      mockStore.partners.push(newPartner);
      return reply.status(201).send({ success: true, partner: newPartner });
    },
  });

  // --- Agent Profile ---
  fastify.get('/api/master/agent-profile', {
    schema: {
      tags: ['IATA Master Data'],
      summary: 'Get accredited IATA Cargo Issuing Agent profile',
    },
    handler: async (_request, reply) => {
      return reply.send({ success: true, profile: mockStore.agentProfile });
    },
  });

  fastify.put('/api/master/agent-profile', {
    schema: {
      tags: ['IATA Master Data'],
      summary: 'Update accredited IATA Cargo Issuing Agent profile',
    },
    handler: async (request, reply) => {
      const body = request.body as Partial<AgentProfileItem>;
      mockStore.agentProfile = { ...mockStore.agentProfile, ...body };
      return reply.send({ success: true, profile: mockStore.agentProfile });
    },
  });
}
