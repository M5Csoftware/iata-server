import { FastifyInstance } from "fastify";
import { Docket } from "../models/Docket.js";
import { AwbStock } from "../models/AwbStock.js";
import { Mawb } from "../models/Mawb.js";
import { CassInvoice } from "../models/CassInvoice.js";
import { AgentProfile } from "../models/MasterData.js";
import { AuditLog } from "../models/AuditLog.js";
import {
  calculateVolumetricWeight,
  calculateChargeableWeight,
  calculateFreightCharges,
} from "../utils/volumetric.js";

const today = () => new Date().toISOString().split("T")[0];

/**
 * Issues the MAWB + CASS invoice for a docket using an AWB stock record that
 * has ALREADY been marked ISSUED, then marks the docket AWB_ASSIGNED.
 * Shared by "create docket" (when an AWB is chosen) and "assign-awb".
 */
async function issueMawbForDocket(
  docket: any,
  stock: any,
  performedBy: string,
) {
  const agentProfile = await AgentProfile.findOne();

  docket.status = "AWB_ASSIGNED";
  docket.assignedAwb = stock.fullAwbNumber;
  await docket.save();

  const mawb = await Mawb.create({
    mawbNumber: stock.fullAwbNumber,
    airlinePrefix: stock.airlinePrefix,
    serialNumber: stock.airlineNumber,
    docketId: docket._id.toString(),
    shipperName: docket.consignorName,
    shipperAddress: docket.consignorAddress,
    consigneeName: docket.consigneeName,
    consigneeAddress: docket.consigneeAddress,
    issuingAgentName: agentProfile?.name || "",
    issuingAgentIataCode: agentProfile?.iataNumericCode || "",
    origin: docket.origin,
    destination: docket.destination,
    pieces: docket.pieces,
    grossWeightKg: docket.actualWeightKg,
    chargeableWeightKg: docket.chargeableWeightKg,
    rateClass: "Q",
    ratePerKg: docket.ratePerKg,
    freightAmount: docket.freightAmount,
    fuelSurcharge: docket.fuelSurcharge,
    securitySurcharge: docket.securitySurcharge,
    totalCharges: docket.subtotal,
    natureOfGoods: docket.natureOfGoods,
    handlingCode: docket.handlingCode,
    flightNumber: "AI-121",
    flightDate: new Date(Date.now() + 86400000 * 2).toISOString().split("T")[0],
    status: "ISSUED",
    issuedAt: today(),
    hawbs: [],
  });

  const invoice = await CassInvoice.create({
    invoiceNumber: `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    mawbNumber: mawb.mawbNumber,
    customerName: docket.consignorName,
    date: today(),
    freightCharges: docket.freightAmount,
    fuelSurcharge: docket.fuelSurcharge,
    securitySurcharge: docket.securitySurcharge,
    handlingCharges: docket.docketFee,
    subtotal: docket.subtotal,
    gstAmount: docket.gstAmount,
    totalAmount: docket.totalAmount,
    cassReconciliationStatus: "PENDING_MATCH",
    paymentStatus: docket.paymentMode === "PREPAID" ? "PAID" : "UNPAID",
  });

  await AuditLog.create({
    entityType: "MAWB",
    entityId: mawb.mawbNumber,
    action: "ASSIGN",
    performedBy,
    details: {
      docketNumber: docket.docketNumber,
      invoiceNumber: invoice.invoiceNumber,
    },
  });

  return { mawb, invoice };
}

export default async function docketRoutes(fastify: FastifyInstance) {
  // Get all dockets
  fastify.get("/api/dockets", {
    schema: {
      tags: ["Cargo Dockets & Consignments"],
      summary: "List all cargo consignment dockets",
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

      if (query.status) filter.status = query.status;
      if (query.search) {
        filter.$or = [
          { docketNumber: { $regex: query.search, $options: "i" } },
          { consignorName: { $regex: query.search, $options: "i" } },
          { consigneeName: { $regex: query.search, $options: "i" } },
          { assignedAwb: { $regex: query.search, $options: "i" } },
        ];
      }

      const dockets = await Docket.find(filter).sort({ createdAt: -1 });
      return reply.send({ success: true, count: dockets.length, dockets });
    },
  });

  // Get docket by ID
  fastify.get("/api/dockets/:id", {
    schema: {
      tags: ["Cargo Dockets & Consignments"],
      summary: "Get details of a specific consignment docket",
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const docket = await Docket.findById(id);
      if (!docket) {
        return reply
          .status(404)
          .send({ success: false, error: "Docket not found." });
      }
      return reply.send({ success: true, docket: docket.toJSON() });
    },
  });

  // Create new consignment docket
  fastify.post("/api/dockets", {
    schema: {
      tags: ["Cargo Dockets & Consignments"],
      summary:
        "Register cargo consignment docket with dimensional cubing & GST",
    },
    handler: async (request, reply) => {
      const body = request.body as any;
      const performedBy =
        (request.headers["x-user-name"] as string) || "system";

      const volumetricWeightKg = calculateVolumetricWeight(
        body.dimensions || [],
      );
      const actualWeightKg = Number(body.actualWeightKg) || 0;
      const chargeableWeightKg = calculateChargeableWeight(
        actualWeightKg,
        volumetricWeightKg,
      );

      const pricing = calculateFreightCharges({
        chargeableWeightKg,
        ratePerKg: body.ratePerKg,
        handlingFee: body.docketFee || 250,
      });

      // ✅ Auto-generate docket number based on DB count + Origin/Destination
      const count = await Docket.countDocuments();
      const sequenceNum = (count + 101).toString().padStart(4, "0");
      const originCode = (body.origin || "DEL").toUpperCase().slice(0, 3);
      const destCode = (body.destination || "LHR").toUpperCase().slice(0, 3);
      const generatedDocketNumber = `DKT-${originCode}-${destCode}-${sequenceNum}`;

      // If the form picked an AWB, claim it atomically BEFORE saving the docket
      let claimedStock: any = null;
      if (body.assignedAwb) {
        claimedStock = await AwbStock.findOneAndUpdate(
          { fullAwbNumber: body.assignedAwb, status: "AVAILABLE" },
          { $set: { status: "ISSUED", issuedAt: today() } },
          { new: true },
        );
        if (!claimedStock) {
          return reply.status(409).send({
            success: false,
            error: "AWB Unavailable",
            message: `AWB ${body.assignedAwb} is no longer available. Please pick another AWB.`,
          });
        }
      }

      let docket: any;
      try {
        docket = await Docket.create({
          ...body,
          assignedAwb: undefined, // set below once the MAWB is issued
          docketNumber: generatedDocketNumber, // Overrides any fake frontend number
          bookingDate: body.bookingDate || today(),
          volumetricWeightKg,
          actualWeightKg,
          chargeableWeightKg,
          ratePerKg: body.ratePerKg || pricing.ratePerKg,
          freightAmount: body.freightAmount || pricing.freightAmount,
          docketFee: body.docketFee || pricing.handlingFee,
          fuelSurcharge: body.fuelSurcharge || pricing.fuelSurcharge,
          securitySurcharge:
            body.securitySurcharge || pricing.securitySurcharge,
          subtotal: body.subtotal || pricing.subtotal,
          gstAmount: body.gstAmount || pricing.gstAmount,
          totalAmount: body.totalAmount || pricing.totalAmount,
          status: "BOOKED",
        });
      } catch (err) {
        if (claimedStock) {
          await AwbStock.updateOne(
            { _id: claimedStock._id },
            { $set: { status: "AVAILABLE" }, $unset: { issuedAt: "" } },
          );
        }
        throw err;
      }

      await AuditLog.create({
        entityType: "DOCKET",
        entityId: docket.docketNumber,
        action: "CREATE",
        performedBy,
        details: { chargeableWeightKg, totalAmount: docket.totalAmount },
      });

      let mawb: any = null;
      let invoice: any = null;
      if (claimedStock) {
        const issued = await issueMawbForDocket(
          docket,
          claimedStock,
          performedBy,
        );
        mawb = issued.mawb;
        invoice = issued.invoice;
      }

      return reply.status(201).send({
        success: true,
        docket: docket.toJSON(),
        mawb: mawb ? mawb.toJSON() : null,
        invoice: invoice ? invoice.toJSON() : null,
      });
    },
  });

  // Assign AWB to docket
  fastify.post("/api/dockets/:id/assign-awb", {
    schema: {
      tags: ["Cargo Dockets & Consignments"],
      summary:
        "Assign available AWB number to docket, issuing MAWB and GST Invoice",
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      body: {
        type: "object",
        properties: {
          airlinePrefix: {
            type: "string",
            description: "Optional airline prefix preference",
          },
        },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const { airlinePrefix } =
        (request.body as { airlinePrefix?: string }) || {};

      const docket = await Docket.findById(id);
      if (!docket) {
        return reply
          .status(404)
          .send({ success: false, error: "Docket not found." });
      }

      if (docket.status === "AWB_ASSIGNED" && docket.assignedAwb) {
        return reply.status(400).send({
          success: false,
          error: "AWB Already Assigned",
          message: `Docket already has AWB ${docket.assignedAwb} allocated.`,
        });
      }

      const stockFilter: any = { status: "AVAILABLE" };
      if (airlinePrefix) stockFilter.airlinePrefix = airlinePrefix;

      const availableStock = await AwbStock.findOneAndUpdate(
        stockFilter,
        { $set: { status: "ISSUED", issuedAt: today() } },
        { new: true, sort: { createdAt: 1 } },
      );
      if (!availableStock) {
        return reply.status(400).send({
          success: false,
          error: "Out of Stock",
          message:
            "No available AWB numbers in stock. Please generate a new stock series first.",
        });
      }

      const { mawb, invoice } = await issueMawbForDocket(
        docket,
        availableStock,
        (request.headers["x-user-name"] as string) || "system",
      );

      return reply.send({
        success: true,
        message: `AWB ${mawb.mawbNumber} allocated to Docket ${docket.docketNumber}.`,
        docket: docket.toJSON(),
        mawb: mawb.toJSON(),
        invoice: invoice.toJSON(),
      });
    },
  });
}
