import { FastifyInstance } from 'fastify';
import { Airline, Airport, ShipperConsignee, AgentProfile } from '../models/MasterData.js';

export default async function masterRoutes(fastify: FastifyInstance) {
  // --- Airlines ---
  fastify.get('/api/master/airlines', {
    schema: {
      tags: ['IATA Master Data'],
      summary: 'Get all accredited IATA airlines with 3-digit prefix',
    },
    handler: async (_request, reply) => {
      const airlines = await Airline.find().sort({ prefix: 1 });
      return reply.send({ success: true, count: airlines.length, airlines });
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
      const existing = await Airline.findOne({ prefix: body.prefix });
      if (existing) {
        return reply.status(409).send({
          success: false,
          error: 'Prefix Conflict',
          message: `Airline with prefix ${body.prefix} already exists.`,
        });
      }

      const airline = await Airline.create(body);
      return reply.status(201).send({ success: true, airline: airline.toJSON() });
    },
  });

  // --- Airports ---
  fastify.get('/api/master/airports', {
    schema: {
      tags: ['IATA Master Data'],
      summary: 'Get all accredited IATA airports / cargo stations',
    },
    handler: async (_request, reply) => {
      const airports = await Airport.find().sort({ iataCode: 1 });
      return reply.send({ success: true, count: airports.length, airports });
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
      const existing = await Airport.findOne({ iataCode: body.iataCode.toUpperCase() });
      if (existing) {
        return reply.status(409).send({
          success: false,
          error: 'Airport Conflict',
          message: `Airport ${body.iataCode} already exists.`,
        });
      }

      const airport = await Airport.create({
        ...body,
        iataCode: body.iataCode.toUpperCase(),
      });
      return reply.status(201).send({ success: true, airport: airport.toJSON() });
    },
  });

  // --- Partners (Shipper / Consignee) ---
  fastify.get('/api/master/partners', {
    schema: {
      tags: ['IATA Master Data'],
      summary: 'List accredited shippers, consignees and trading partners',
      querystring: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['SHIPPER', 'CONSIGNEE', 'BOTH'] },
        },
      },
    },
    handler: async (request, reply) => {
      const query = request.query as { type?: string };
      const filter: any = {};
      if (query.type) filter.type = { $in: [query.type, 'BOTH'] };

      const partners = await ShipperConsignee.find(filter).sort({ name: 1 });
      return reply.send({ success: true, count: partners.length, partners });
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
      const partner = await ShipperConsignee.create(body);
      return reply.status(201).send({ success: true, partner: partner.toJSON() });
    },
  });

  // --- Agent Profile ---
  fastify.get('/api/master/agent-profile', {
    schema: {
      tags: ['IATA Master Data'],
      summary: 'Get accredited IATA Cargo Issuing Agent profile',
    },
    handler: async (_request, reply) => {
      let profile = await AgentProfile.findOne();
      if (!profile) {
        profile = await AgentProfile.create({
          name: 'Apex Global Logistics Pvt. Ltd.',
          iataNumericCode: '14-3-9821/0014',
          cassAddress: 'CAS-IND-DEL-0941',
          headOfficeAddress: 'Cargo Complex Terminal 3, Indira Gandhi International Airport',
          city: 'New Delhi - 110037',
          country: 'India',
          phone: '+91-11-2565-9800',
          email: 'airfreight@apexlogistics.iata.org',
          gstNumber: '07AAACA9921D1Z8',
          panNumber: 'AAACA9921D',
        });
      }
      return reply.send({ success: true, profile: profile.toJSON() });
    },
  });

  fastify.put('/api/master/agent-profile', {
    schema: {
      tags: ['IATA Master Data'],
      summary: 'Update accredited IATA Cargo Issuing Agent profile',
    },
    handler: async (request, reply) => {
      const body = request.body as any;
      let profile = await AgentProfile.findOne();
      if (!profile) {
        profile = await AgentProfile.create(body);
      } else {
        Object.assign(profile, body);
        await profile.save();
      }
      return reply.send({ success: true, profile: profile.toJSON() });
    },
  });
}

