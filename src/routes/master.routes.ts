import { FastifyInstance } from "fastify";
import {
  Airline,
  Airport,
  ShipperConsignee,
  AgentProfile,
} from "../models/MasterData.js";

export default async function masterRoutes(fastify: FastifyInstance) {
  // --- Airlines ---
  fastify.get("/api/master/airlines", {
    schema: { tags: ["IATA Master Data"], summary: "Get all airlines" },
    handler: async (_request, reply) => {
      const airlines = await Airline.find().sort({ prefix: 1 });
      return reply.send({ success: true, count: airlines.length, airlines });
    },
  });

  fastify.post("/api/master/airlines", {
    schema: {
      tags: ["IATA Master Data"],
      body: {
        type: "object",
        required: ["prefix", "code", "name", "country"],
        properties: {
          prefix: { type: "string" },
          code: { type: "string" },
          name: { type: "string" },
          country: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const body = request.body as any;
      const existing = await Airline.findOne({ prefix: body.prefix });
      if (existing) {
        return reply
          .status(409)
          .send({
            success: false,
            message: `Airline with prefix ${body.prefix} already exists.`,
          });
      }
      const airline = await Airline.create(body);
      return reply
        .status(201)
        .send({ success: true, airline: airline.toJSON() });
    },
  });

  fastify.put("/api/master/airlines/:id", {
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as any;
      const airline = await Airline.findByIdAndUpdate(id, body, { new: true });
      if (!airline)
        return reply
          .status(404)
          .send({ success: false, message: "Airline not found" });
      return reply.send({ success: true, airline });
    },
  });

  // --- Airports ---
  fastify.get("/api/master/airports", {
    schema: { tags: ["IATA Master Data"], summary: "Get all airports" },
    handler: async (_request, reply) => {
      const airports = await Airport.find().sort({ iataCode: 1 });
      return reply.send({ success: true, count: airports.length, airports });
    },
  });

  fastify.post("/api/master/airports", {
    schema: {
      tags: ["IATA Master Data"],
      body: {
        type: "object",
        required: ["iataCode", "name", "city", "country"],
        properties: {
          iataCode: { type: "string" },
          name: { type: "string" },
          city: { type: "string" },
          country: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const body = request.body as any;
      const existing = await Airport.findOne({
        iataCode: body.iataCode.toUpperCase(),
      });
      if (existing) {
        return reply
          .status(409)
          .send({
            success: false,
            message: `Airport ${body.iataCode} already exists.`,
          });
      }
      const airport = await Airport.create({
        ...body,
        iataCode: body.iataCode.toUpperCase(),
      });
      return reply
        .status(201)
        .send({ success: true, airport: airport.toJSON() });
    },
  });

  fastify.put("/api/master/airports/:id", {
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as any;
      if (body.iataCode) body.iataCode = body.iataCode.toUpperCase();
      const airport = await Airport.findByIdAndUpdate(id, body, { new: true });
      if (!airport)
        return reply
          .status(404)
          .send({ success: false, message: "Airport not found" });
      return reply.send({ success: true, airport });
    },
  });

  // --- Partners (Shipper / Consignee) ---
  fastify.get("/api/master/partners", {
    schema: {
      tags: ["IATA Master Data"],
      querystring: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["SHIPPER", "CONSIGNEE", "BOTH"] },
        },
      },
    },
    handler: async (request, reply) => {
      const query = request.query as { type?: string };
      const filter: any = {};
      if (query.type) filter.type = { $in: [query.type, "BOTH"] };
      const partners = await ShipperConsignee.find(filter).sort({ name: 1 });
      return reply.send({ success: true, count: partners.length, partners });
    },
  });

  fastify.post("/api/master/partners", {
    schema: {
      tags: ["IATA Master Data"],
      body: {
        type: "object",
        required: ["name", "type"],
        properties: {
          type: { type: "string", enum: ["SHIPPER", "CONSIGNEE", "BOTH"] },
          name: { type: "string" },
          accountNumber: { type: "string" },
          address: { type: "string" },
          city: { type: "string" },
          country: { type: "string" },
          contactPerson: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
          taxOrGstId: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const body = request.body as any;
      const partner = await ShipperConsignee.create(body);
      return reply
        .status(201)
        .send({ success: true, partner: partner.toJSON() });
    },
  });

  fastify.put("/api/master/partners/:id", {
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as any;
      const partner = await ShipperConsignee.findByIdAndUpdate(id, body, {
        new: true,
      });
      if (!partner)
        return reply
          .status(404)
          .send({ success: false, message: "Partner not found" });
      return reply.send({ success: true, partner });
    },
  });

  // --- Agent Profile ---
  fastify.get("/api/master/agent-profile", {
    schema: { tags: ["IATA Master Data"], summary: "Get agent profile" },
    handler: async (_request, reply) => {
      const profile = await AgentProfile.findOne();
      return reply.send({ success: true, profile: profile?.toJSON() ?? null });
    },
  });

  fastify.put("/api/master/agent-profile", {
    schema: { tags: ["IATA Master Data"], summary: "Update agent profile" },
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
