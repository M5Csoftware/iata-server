import { FastifyInstance } from "fastify";
import { AwbStock } from "../models/AwbStock.js";
import { AuditLog } from "../models/AuditLog.js";
import { generateAwbSeries, validateIataAwbNumber } from "../utils/iataMod7.js";

export default async function stockRoutes(fastify: FastifyInstance) {
  /* ------------------------------------------------------------------ */
  /* GET /api/stock — list with filters                                 */
  /* ------------------------------------------------------------------ */
  fastify.get("/api/stock", {
    schema: {
      tags: ["AWB Stock Management"],
      summary: "Get AWB stock inventory with filtering",
      querystring: {
        type: "object",
        properties: {
          airlinePrefix: { type: "string" },
          status: { type: "string" },
          search: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const query = request.query as {
        airlinePrefix?: string;
        status?: string;
        search?: string;
      };
      const filter: Record<string, any> = {};

      if (query.airlinePrefix) filter.airlinePrefix = query.airlinePrefix;
      if (query.status) filter.status = query.status.toUpperCase();
      if (query.search) {
        filter.$or = [
          { fullAwbNumber: { $regex: query.search, $options: "i" } },
          { airlineNumber: { $regex: query.search, $options: "i" } },
        ];
      }

      const stock = await AwbStock.find(filter).sort({ createdAt: -1 });
      return reply.send({ success: true, count: stock.length, stock });
    },
  });

  /* ------------------------------------------------------------------ */
  /* POST /api/stock/series — generate Mod-7 series                     */
  /* ------------------------------------------------------------------ */
  fastify.post("/api/stock/series", {
    schema: {
      tags: ["AWB Stock Management"],
      summary: "Generate IATA Resolution 600b Mod-7 serial number series",
      body: {
        type: "object",
        required: ["airlinePrefix", "fromSerial7", "toSerial7"],
        properties: {
          airlinePrefix: {
            type: "string",
            description: "3-digit airline prefix (e.g. 098)",
          },
          airlineCode: {
            type: "string",
            description: "2-letter IATA code (e.g. AI)",
          },
          airlineName: {
            type: "string",
            description: "Airline name (e.g. Air India)",
          },
          fromSerial7: {
            type: "integer",
            description: "Starting 7-digit number",
          },
          toSerial7: { type: "integer", description: "Ending 7-digit number" },
        },
      },
    },
    handler: async (request, reply) => {
      const {
        airlinePrefix,
        airlineCode = "",
        airlineName = "",
        fromSerial7,
        toSerial7,
      } = request.body as {
        airlinePrefix: string;
        airlineCode?: string;
        airlineName?: string;
        fromSerial7: number;
        toSerial7: number;
      };

      // --- Validation -------------------------------------------------
      if (!/^\d{1,3}$/.test(airlinePrefix)) {
        return reply.status(400).send({
          success: false,
          error: "Invalid Airline Prefix",
          message: 'airlinePrefix must be 1–3 digits (e.g. "098").',
        });
      }
      if (!Number.isInteger(fromSerial7) || !Number.isInteger(toSerial7)) {
        return reply.status(400).send({
          success: false,
          error: "Invalid Range",
          message: "fromSerial7 and toSerial7 must be integers.",
        });
      }
      if (fromSerial7 < 0 || toSerial7 > 9_999_999) {
        return reply.status(400).send({
          success: false,
          error: "Range Out Of Bounds",
          message: "7-digit serials must be in 0 … 9,999,999.",
        });
      }
      if (fromSerial7 > toSerial7) {
        return reply.status(400).send({
          success: false,
          error: "Invalid Range",
          message: "fromSerial7 cannot be greater than toSerial7.",
        });
      }
      if (toSerial7 - fromSerial7 > 1000) {
        return reply.status(400).send({
          success: false,
          error: "Range Limit Exceeded",
          message: "Cannot generate more than 1000 AWB numbers at a time.",
        });
      }

      // --- Generate ---------------------------------------------------
      const generated = generateAwbSeries(
        airlinePrefix.padStart(3, "0"),
        fromSerial7,
        toSerial7,
      );

      // Sanity check that the util returned what the schema needs.
      if (
        generated.length === 0 ||
        !generated[0].airlinePrefix ||
        !generated[0].airlineNumber ||
        !generated[0].fullAwbNumber
      ) {
        request.log.error(
          { sample: generated[0] },
          "generateAwbSeries returned bad shape",
        );
        return reply.status(500).send({
          success: false,
          error: "Generator Error",
          message: "generateAwbSeries returned an unexpected shape.",
        });
      }

      // --- Deduplicate against DB -------------------------------------
      const fullNumbers = generated.map((g) => g.fullAwbNumber);
      const existingAwbs = await AwbStock.find({
        fullAwbNumber: { $in: fullNumbers },
      }).select("fullAwbNumber");

      const existingSet = new Set(existingAwbs.map((e) => e.fullAwbNumber));

      // --- Insert only the new ones, with airline code + name ---------
      const toInsert = generated
        .filter((g) => !existingSet.has(g.fullAwbNumber))
        .map((g) => ({
          airlinePrefix: g.airlinePrefix,
          airlineCode: airlineCode.trim().toUpperCase(),
          airlineName: airlineName.trim(),
          airlineNumber: g.airlineNumber,
          fullAwbNumber: g.fullAwbNumber,
          status: "AVAILABLE" as const,
        }));

      if (toInsert.length > 0) {
        await AwbStock.insertMany(toInsert, { ordered: false });
      }

      request.log.info(
        {
          airlinePrefix,
          airlineCode,
          airlineName,
          requested: generated.length,
          added: toInsert.length,
          existing: existingSet.size,
        },
        "AWB series ingested",
      );

      return reply.status(201).send({
        success: true,
        totalRequested: generated.length,
        addedCount: toInsert.length,
        alreadyExistedCount: existingSet.size,
        message: `Generated ${toInsert.length} new Resolution 600b AWB numbers.`,
      });
    },
  });

  /* ------------------------------------------------------------------ */
  /* POST /api/stock/validate — Mod-7 check                              */
  /* ------------------------------------------------------------------ */
  fastify.post("/api/stock/validate", {
    schema: {
      tags: ["AWB Stock Management"],
      summary: "Verify 8-digit serial check digit via Modulo-7 formula",
      body: {
        type: "object",
        required: ["eightDigitSerial"],
        properties: { eightDigitSerial: { type: "string" } },
      },
    },
    handler: async (request, reply) => {
      const { eightDigitSerial } = request.body as { eightDigitSerial: string };
      const valid = validateIataAwbNumber(eightDigitSerial);
      const firstSeven = (eightDigitSerial || "").slice(0, 7);
      const expected = parseInt(firstSeven || "0", 10) % 7;
      return reply.send({
        success: true,
        valid,
        expectedCheckDigit: expected,
        actualCheckDigit: parseInt((eightDigitSerial || "").slice(7), 10),
      });
    },
  });

  /* ------------------------------------------------------------------ */
  /* POST /api/stock/:id/void                                            */
  /* ------------------------------------------------------------------ */
  fastify.post("/api/stock/:id/void", {
    schema: {
      tags: ["AWB Stock Management"],
      summary:
        "Permanently void an AWB number with mandatory audit justification",
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      body: {
        type: "object",
        required: ["reason"],
        properties: { reason: { type: "string", minLength: 1 } },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const { reason } = request.body as { reason: string };

      const stockItem = await AwbStock.findById(id);
      if (!stockItem) {
        return reply
          .status(404)
          .send({ success: false, error: "AWB stock number not found." });
      }
      if (stockItem.status === "VOID") {
        return reply
          .status(400)
          .send({ success: false, error: "AWB is already voided." });
      }

      stockItem.status = "VOID";
      stockItem.voidReason = reason.trim();
      await stockItem.save();

      await AuditLog.create({
        entityType: "AWB_STOCK",
        entityId: stockItem.fullAwbNumber,
        action: "VOID",
        performedBy: (request.headers["x-user-name"] as string) || "operator",
        reason: reason.trim(),
        details: {
          fullAwbNumber: stockItem.fullAwbNumber,
          airlinePrefix: stockItem.airlinePrefix,
          airlineCode: stockItem.airlineCode,
          airlineName: stockItem.airlineName,
        },
      });

      return reply.send({
        success: true,
        message: `AWB ${stockItem.fullAwbNumber} permanently voided. Number cannot be reissued.`,
        stock: stockItem.toJSON(),
      });
    },
  });

  /* ------------------------------------------------------------------ */
  /* GET /api/stock/next-available                                       */
  /* ------------------------------------------------------------------ */
  fastify.get("/api/stock/next-available", {
    schema: {
      tags: ["AWB Stock Management"],
      summary: "Get next available AWB stock number",
      querystring: {
        type: "object",
        properties: { airlinePrefix: { type: "string" } },
      },
    },
    handler: async (request, reply) => {
      const query = request.query as { airlinePrefix?: string };
      const filter: Record<string, any> = { status: "AVAILABLE" };
      if (query.airlinePrefix) filter.airlinePrefix = query.airlinePrefix;

      const available = await AwbStock.findOne(filter).sort({ createdAt: 1 });
      if (!available) {
        return reply.status(404).send({
          success: false,
          error: "No Stock Available",
          message:
            "No available AWB numbers in inventory. Please generate or allocate stock.",
        });
      }
      return reply.send({ success: true, stock: available.toJSON() });
    },
  });
}
