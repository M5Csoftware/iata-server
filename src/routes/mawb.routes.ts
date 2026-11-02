import { FastifyInstance } from "fastify";
import { Mawb, IHawb } from "../models/Mawb.js";
import { AwbStock } from "../models/AwbStock.js";
import { AuditLog } from "../models/AuditLog.js";

/** Returns a warning string when HAWB totals differ from the MAWB totals (0.1 kg tolerance). */
function parityWarningFor(mawb: {
  hawbs: IHawb[];
  pieces: number;
  grossWeightKg: number;
}): string | null {
  const totalHawbPieces = mawb.hawbs.reduce((sum, h) => sum + h.pieces, 0);
  const totalHawbWeight = mawb.hawbs.reduce(
    (sum, h) => sum + h.grossWeightKg,
    0,
  );
  return totalHawbPieces !== mawb.pieces ||
    Math.abs(totalHawbWeight - mawb.grossWeightKg) >= 0.1
    ? `Consolidation Parity Alert: HAWB totals (${totalHawbPieces} pcs, ${totalHawbWeight} kg) differ from MAWB totals (${mawb.pieces} pcs, ${mawb.grossWeightKg} kg).`
    : null;
}

export default async function mawbRoutes(fastify: FastifyInstance) {
  // Get all MAWBs
  fastify.get("/api/mawbs", {
    schema: {
      tags: ["MAWB & Consolidation (HAWB)"],
      summary: "List Master Air Waybills with nested House AWBs",
      querystring: {
        type: "object",
        properties: {
          status: { type: "string" },
          search: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const query = request.query as { status?: string; search?: string };
      const filter: any = {};

      if (query.status) filter.status = query.status.toUpperCase();
      if (query.search) {
        filter.$or = [
          { mawbNumber: { $regex: query.search, $options: "i" } },
          { shipperName: { $regex: query.search, $options: "i" } },
          { consigneeName: { $regex: query.search, $options: "i" } },
          { flightNumber: { $regex: query.search, $options: "i" } },
        ];
      }

      const mawbs = await Mawb.find(filter).sort({ createdAt: -1 });
      return reply.send({ success: true, count: mawbs.length, mawbs });
    },
  });

  // Get single MAWB by ID
  fastify.get("/api/mawbs/:id", {
    schema: {
      tags: ["MAWB & Consolidation (HAWB)"],
      summary: "Get full details of a Master Air Waybill by ID",
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const mawb = await Mawb.findById(id);
      if (!mawb) {
        return reply
          .status(404)
          .send({ success: false, error: "MAWB not found." });
      }
      return reply.send({ success: true, mawb: mawb.toJSON() });
    },
  });

  // Create direct MAWB
  fastify.post("/api/mawbs", {
    schema: {
      tags: ["MAWB & Consolidation (HAWB)"],
      summary: "Create a new Master Air Waybill directly",
    },
    handler: async (request, reply) => {
      const body = request.body as any;
      const mawb = await Mawb.create({
        ...body,
        status: body.status || "ISSUED",
        issuedAt: body.issuedAt || new Date().toISOString().split("T")[0],
      });

      await AuditLog.create({
        entityType: "MAWB",
        entityId: mawb.mawbNumber,
        action: "CREATE",
        performedBy: (request.headers["x-user-name"] as string) || "system",
        details: { mawbNumber: mawb.mawbNumber, destination: mawb.destination },
      });

      return reply.status(201).send({ success: true, mawb: mawb.toJSON() });
    },
  });

  // Add HAWB to MAWB
  fastify.post("/api/mawbs/:id/hawbs", {
    schema: {
      tags: ["MAWB & Consolidation (HAWB)"],
      summary: "Add consolidated House AWB (HAWB) under Master AWB",
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      body: {
        type: "object",
        required: [
          "hawbNumber",
          "shipperName",
          "consigneeName",
          "origin",
          "destination",
          "pieces",
          "grossWeightKg",
        ],
        properties: {
          hawbNumber: { type: "string" },
          shipperName: { type: "string" },
          shipperAddress: { type: "string" },
          shipperPhone: { type: "string" },
          shipperGst: { type: "string" },
          consigneeName: { type: "string" },
          consigneeAddress: { type: "string" },
          consigneePhone: { type: "string" },
          consigneeGst: { type: "string" },
          origin: { type: "string" },
          destination: { type: "string" },
          pieces: { type: "number" },
          grossWeightKg: { type: "number" },
          chargeableWeightKg: { type: "number" },
          natureOfGoods: { type: "string" },
          handlingInfo: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as any;

      const mawb = await Mawb.findById(id);
      if (!mawb) {
        return reply
          .status(404)
          .send({ success: false, error: "MAWB not found." });
      }

      if (mawb.status === "VOID") {
        return reply.status(400).send({
          success: false,
          error: "MAWB Void",
          message: "Cannot add HAWBs to a voided MAWB.",
        });
      }

      if (mawb.status === "MANIFESTED" || mawb.status === "DEPARTED") {
        return reply.status(400).send({
          success: false,
          error: "Flight Locked",
          message: "Cannot add HAWBs to a manifested or departed MAWB.",
        });
      }

      // Check duplicate HAWB number under this MAWB
      const duplicate = mawb.hawbs.some(
        (h) => h.hawbNumber === body.hawbNumber,
      );
      if (duplicate) {
        return reply.status(409).send({
          success: false,
          error: "Duplicate HAWB",
          message: `HAWB ${body.hawbNumber} already exists in this consolidation.`,
        });
      }

      // `id` is generated by MongoDB (_id) and exposed as `id` in JSON
      const newHawb: IHawb = {
        hawbNumber: body.hawbNumber,
        mawbNumber: mawb.mawbNumber,
        shipperName: body.shipperName,
        shipperAddress: body.shipperAddress || "",
        shipperPhone: body.shipperPhone || "",
        shipperGst: body.shipperGst || "",
        consigneeName: body.consigneeName,
        consigneeAddress: body.consigneeAddress || "",
        consigneePhone: body.consigneePhone || "",
        consigneeGst: body.consigneeGst || "",
        origin: body.origin,
        destination: body.destination,
        pieces: body.pieces,
        grossWeightKg: body.grossWeightKg,
        chargeableWeightKg: body.chargeableWeightKg || body.grossWeightKg,
        natureOfGoods: body.natureOfGoods || "Consolidated Cargo",
        handlingInfo: body.handlingInfo || "",
        status: "ISSUED",
      };

      mawb.hawbs.push(newHawb);
      await mawb.save();

      // The saved sub-document (with its real _id / id)
      const savedHawb = (mawb.hawbs[mawb.hawbs.length - 1] as any).toJSON();

      await AuditLog.create({
        entityType: "HAWB",
        entityId: newHawb.hawbNumber,
        action: "CREATE",
        performedBy: (request.headers["x-user-name"] as string) || "system",
        details: {
          mawbNumber: mawb.mawbNumber,
          pieces: newHawb.pieces,
          handlingInfo: newHawb.handlingInfo,
        },
      });

      return reply.status(201).send({
        success: true,
        hawb: savedHawb,
        mawb: mawb.toJSON(),
        parityWarning: parityWarningFor(mawb),
      });
    },
  });

  // Update (edit) HAWB under a MAWB
  fastify.put("/api/mawbs/:id/hawbs/:hawbId", {
    schema: {
      tags: ["MAWB & Consolidation (HAWB)"],
      summary:
        "Edit a House AWB (addresses, parties, cargo data) before the MAWB is manifested",
      params: {
        type: "object",
        required: ["id", "hawbId"],
        properties: { id: { type: "string" }, hawbId: { type: "string" } },
      },
      body: {
        type: "object",
        properties: {
          hawbNumber: { type: "string", minLength: 1 },
          shipperName: { type: "string", minLength: 1 },
          shipperAddress: { type: "string" },
          shipperPhone: { type: "string" },
          shipperGst: { type: "string" },
          consigneeName: { type: "string", minLength: 1 },
          consigneeAddress: { type: "string" },
          consigneePhone: { type: "string" },
          consigneeGst: { type: "string" },
          origin: { type: "string", minLength: 1 },
          destination: { type: "string", minLength: 1 },
          pieces: { type: "number", minimum: 1 },
          grossWeightKg: { type: "number", minimum: 0 },
          chargeableWeightKg: { type: "number", minimum: 0 },
          natureOfGoods: { type: "string" },
          handlingInfo: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const { id, hawbId } = request.params as { id: string; hawbId: string };
      const body = { ...(request.body as Record<string, any>) };

      const mawb = await Mawb.findById(id);
      if (!mawb) {
        return reply
          .status(404)
          .send({ success: false, error: "MAWB not found." });
      }

      if (mawb.status === "VOID") {
        return reply.status(400).send({
          success: false,
          error: "MAWB Void",
          message: "Cannot edit HAWBs of a voided MAWB.",
        });
      }

      if (
        mawb.status === "MANIFESTED" ||
        mawb.status === "DEPARTED" ||
        mawb.status === "ARRIVED" ||
        mawb.status === "DELIVERED"
      ) {
        return reply.status(400).send({
          success: false,
          error: "Flight Locked",
          message:
            "Cannot edit HAWBs of a manifested, departed or delivered MAWB.",
        });
      }

      const hawb = (mawb.hawbs as any).id(hawbId);
      if (!hawb) {
        return reply
          .status(404)
          .send({ success: false, error: "HAWB not found." });
      }

      // Normalise text input
      for (const key of Object.keys(body)) {
        if (typeof body[key] === "string") body[key] = body[key].trim();
      }
      if (typeof body.origin === "string")
        body.origin = body.origin.toUpperCase();
      if (typeof body.destination === "string")
        body.destination = body.destination.toUpperCase();

      // HAWB number must stay unique within this consolidation
      if (
        body.hawbNumber &&
        body.hawbNumber !== hawb.hawbNumber &&
        mawb.hawbs.some((h) => h.hawbNumber === body.hawbNumber)
      ) {
        return reply.status(409).send({
          success: false,
          error: "Duplicate HAWB",
          message: `HAWB ${body.hawbNumber} already exists in this consolidation.`,
        });
      }

      const editableFields = [
        "hawbNumber",
        "shipperName",
        "shipperAddress",
        "shipperPhone",
        "shipperGst",
        "consigneeName",
        "consigneeAddress",
        "consigneePhone",
        "consigneeGst",
        "origin",
        "destination",
        "pieces",
        "grossWeightKg",
        "chargeableWeightKg",
        "natureOfGoods",
        "handlingInfo",
      ];

      const changes: Record<string, { from: any; to: any }> = {};
      for (const field of editableFields) {
        if (body[field] === undefined) continue;
        if (body[field] === hawb[field]) continue;
        changes[field] = { from: hawb[field], to: body[field] };
        hawb[field] = body[field];
      }

      if (Object.keys(changes).length === 0) {
        return reply.send({
          success: true,
          message: "No changes to save.",
          hawb: hawb.toJSON(),
          mawb: mawb.toJSON(),
          parityWarning: parityWarningFor(mawb),
        });
      }

      await mawb.save();

      await AuditLog.create({
        entityType: "HAWB",
        entityId: hawb.hawbNumber,
        action: "UPDATE",
        performedBy: (request.headers["x-user-name"] as string) || "system",
        details: { mawbNumber: mawb.mawbNumber, changes },
      });

      return reply.send({
        success: true,
        message: `HAWB ${hawb.hawbNumber} updated successfully.`,
        hawb: hawb.toJSON(),
        mawb: mawb.toJSON(),
        parityWarning: parityWarningFor(mawb),
      });
    },
  });

  // Remove HAWB from MAWB
  fastify.delete("/api/mawbs/:id/hawbs/:hawbId", {
    schema: {
      tags: ["MAWB & Consolidation (HAWB)"],
      summary: "Remove HAWB from consolidation (if not manifested)",
      params: {
        type: "object",
        required: ["id", "hawbId"],
        properties: { id: { type: "string" }, hawbId: { type: "string" } },
      },
    },
    handler: async (request, reply) => {
      const { id, hawbId } = request.params as { id: string; hawbId: string };
      const mawb = await Mawb.findById(id);
      if (!mawb) {
        return reply
          .status(404)
          .send({ success: false, error: "MAWB not found." });
      }

      if (mawb.status === "MANIFESTED" || mawb.status === "DEPARTED") {
        return reply.status(400).send({
          success: false,
          error: "Flight Locked",
          message:
            "Cannot modify consolidation of a manifested or departed MAWB.",
        });
      }

      const before = mawb.hawbs.length;
      mawb.hawbs = mawb.hawbs.filter(
        (h) => h.id !== hawbId && (h as any)._id?.toString() !== hawbId,
      ) as any;

      if (mawb.hawbs.length === before) {
        return reply
          .status(404)
          .send({ success: false, error: "HAWB not found." });
      }

      await mawb.save();

      return reply.send({
        success: true,
        message: "HAWB removed.",
        mawb: mawb.toJSON(),
      });
    },
  });

  // Void MAWB
  fastify.post("/api/mawbs/:id/void", {
    schema: {
      tags: ["MAWB & Consolidation (HAWB)"],
      summary: "Permanently void MAWB and retire its serial from future stock",
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      body: {
        type: "object",
        properties: {
          reason: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const { reason = "Cancelled by operator" } =
        (request.body as { reason?: string }) || {};

      const mawb = await Mawb.findById(id);
      if (!mawb) {
        return reply
          .status(404)
          .send({ success: false, error: "MAWB not found." });
      }

      if (mawb.status === "DEPARTED" || mawb.status === "ARRIVED") {
        return reply.status(400).send({
          success: false,
          error: "Cannot Void",
          message: "Cannot void an in-flight or delivered Air Waybill.",
        });
      }

      mawb.status = "VOID";
      await mawb.save();

      // Retire from stock
      await AwbStock.findOneAndUpdate(
        { fullAwbNumber: mawb.mawbNumber },
        { $set: { status: "VOID", voidReason: reason } },
      );

      await AuditLog.create({
        entityType: "MAWB",
        entityId: mawb.mawbNumber,
        action: "VOID",
        performedBy: (request.headers["x-user-name"] as string) || "system",
        reason,
      });

      return reply.send({
        success: true,
        message: `MAWB ${mawb.mawbNumber} permanently voided. Serial number retired.`,
        mawb: mawb.toJSON(),
      });
    },
  });
}
