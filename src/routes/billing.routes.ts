// src/routes/billing.routes.ts
import { FastifyInstance } from "fastify";
import { Invoice, IPayment } from "../models/Invoice.js";
import { InvoiceSequence } from "../models/InvoiceSequence.js";
import { AuditLog } from "../models/AuditLog.js";

export default async function billingRoutes(fastify: FastifyInstance) {
  const getFinancialYear = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    if (month >= 3) {
      return `${year.toString().slice(-2)}-${(year + 1).toString().slice(-2)}`;
    }
    return `${(year - 1).toString().slice(-2)}-${year.toString().slice(-2)}`;
  };

  // ============================================================
  // 1. GET ALL INVOICES  →  GET /api/invoices
  // ============================================================
  fastify.get("/", {
    schema: { tags: ["Billing & CASS"] },
    handler: async (request, reply) => {
      const query = request.query as {
        paymentStatus?: string;
        cassStatus?: string;
        search?: string;
      };
      const filter: any = {};

      if (query.paymentStatus)
        filter.paymentStatus = query.paymentStatus.toUpperCase();
      if (query.cassStatus)
        filter.cassReconciliationStatus = query.cassStatus.toUpperCase();
      if (query.search) {
        filter.$or = [
          { invoiceNumber: { $regex: query.search, $options: "i" } },
          { mawbNumber: { $regex: query.search, $options: "i" } },
          { customerName: { $regex: query.search, $options: "i" } },
        ];
      }

      const invoices = await Invoice.find(filter).sort({ createdAt: -1 });
      return reply.send({ success: true, count: invoices.length, invoices });
    },
  });

  // ============================================================
  // 2. DRAFT & INVOICE LIFECYCLE
  // ============================================================
  fastify.post("/drafts", async (request, reply) => {
    try {
      const body: any = request.body;
      const { actor, ...draftData } = body;
      const newDraft = new Invoice({
        ...draftData,
        invoiceStatus: "DRAFT",
        auditLog: [
          {
            action: "CREATED_DRAFT",
            actor: actor || "System",
            timestamp: new Date().toISOString(),
          },
        ],
      });
      await newDraft.save();
      return { success: true, invoice: newDraft };
    } catch (error: any) {
      reply.status(500);
      return { success: false, message: error.message };
    }
  });

  fastify.put("/drafts/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { actor, updates } = request.body as any;
      const invoice = await Invoice.findById(id);
      if (!invoice) throw new Error("Invoice not found");
      if (invoice.invoiceStatus !== "DRAFT")
        throw new Error("Final invoices cannot be edited.");

      Object.assign(invoice, updates);
      invoice.auditLog.push({
        action: "UPDATED_DRAFT",
        actor: actor || "System",
        timestamp: new Date().toISOString(),
      });
      await invoice.save();
      return { success: true, invoice };
    } catch (error: any) {
      reply.status(500);
      return { success: false, message: error.message };
    }
  });

  fastify.post("/:id/approve", async (request, reply) => {
    const session = await Invoice.startSession();
    session.startTransaction();
    try {
      const { id } = request.params as { id: string };
      const { actor } = request.body as { actor: string };
      const invoice = await Invoice.findById(id).session(session);
      if (!invoice || invoice.invoiceStatus !== "DRAFT")
        throw new Error("Invalid state");

      const fy = getFinancialYear(new Date());
      const sequence = await InvoiceSequence.findOneAndUpdate(
        { financialYear: fy },
        { $inc: { lastNumber: 1 } },
        { new: true, upsert: true, session },
      );

      invoice.invoiceNumber = `INV/${fy}/${sequence.lastNumber
        .toString()
        .padStart(4, "0")}`;
      invoice.invoiceStatus = "APPROVED";
      invoice.balanceDue = invoice.totalAmount;
      invoice.auditLog.push({
        action: "APPROVED",
        actor: actor || "System",
        timestamp: new Date().toISOString(),
      });

      await invoice.save({ session });
      await session.commitTransaction();
      return { success: true, invoice };
    } catch (error: any) {
      await session.abortTransaction();
      reply.status(500);
      return { success: false, message: error.message };
    } finally {
      session.endSession();
    }
  });

  fastify.post("/:id/send", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const invoice = await Invoice.findById(id);
      if (!invoice || invoice.invoiceStatus !== "APPROVED")
        throw new Error("Invalid state");
      invoice.invoiceStatus = "SENT";
      await invoice.save();
      return { success: true, invoice };
    } catch (error: any) {
      reply.status(500);
      return { success: false, message: error.message };
    }
  });

  fastify.post("/:id/payments", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { actor, payment } = request.body as any;
      const invoice = await Invoice.findById(id);
      if (
        !invoice ||
        ["DRAFT", "CANCELLED", "PAID"].includes(invoice.invoiceStatus)
      )
        throw new Error("Invalid state");

      invoice.payments.push({
        id: `PAY-${Date.now()}`,
        date: new Date().toISOString().slice(0, 10),
        ...payment,
      });
      const totalPaid = invoice.payments.reduce(
        (sum: number, p: IPayment) => sum + p.amount + p.tdsAmount,
        0,
      );
      invoice.balanceDue = Number((invoice.totalAmount - totalPaid).toFixed(2));

      if (invoice.balanceDue <= 0) {
        invoice.invoiceStatus = "PAID";
        invoice.paymentStatus = "PAID";
      } else {
        invoice.invoiceStatus = "PARTIALLY_PAID";
        invoice.paymentStatus = "PARTIAL";
      }
      invoice.auditLog.push({
        action: "PAYMENT",
        actor: actor || "System",
        timestamp: new Date().toISOString(),
      });

      await invoice.save();
      return { success: true, invoice };
    } catch (error: any) {
      reply.status(500);
      return { success: false, message: error.message };
    }
  });

  fastify.post("/:id/cancel", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { actor, reason } = request.body as any;
      const invoice = await Invoice.findById(id);
      if (!invoice || invoice.invoiceStatus === "CANCELLED")
        throw new Error("Invalid state");

      invoice.invoiceStatus = "CANCELLED";
      invoice.cancellationReason = reason;
      invoice.auditLog.push({
        action: "CANCELLED",
        actor: actor || "System",
        timestamp: new Date().toISOString(),
      });
      await invoice.save();
      return { success: true, invoice };
    } catch (error: any) {
      reply.status(500);
      return { success: false, message: error.message };
    }
  });

  fastify.post("/:id/corrections", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { actor, correction } = request.body as any;
      const invoice = await Invoice.findById(id);
      if (!invoice || ["DRAFT", "CANCELLED"].includes(invoice.invoiceStatus))
        throw new Error("Invalid state");

      const fy = getFinancialYear(new Date());
      const type = correction.type === "CREDIT_NOTE" ? "CN" : "DN";
      const sequence = await InvoiceSequence.findOneAndUpdate(
        { financialYear: `${type}-${fy}` },
        { $inc: { lastNumber: 1 } },
        { new: true, upsert: true },
      );

      invoice.corrections.push({
        id: `COR-${Date.now()}`,
        number: `${type}/${fy}/${sequence.lastNumber
          .toString()
          .padStart(4, "0")}`,
        date: new Date().toISOString().slice(0, 10),
        ...correction,
      });

      if (correction.type === "CREDIT_NOTE") {
        invoice.balanceDue = Math.max(
          0,
          invoice.balanceDue - correction.amount,
        );
        invoice.totalAmount = Math.max(
          0,
          invoice.totalAmount - correction.amount,
        );
      }
      invoice.auditLog.push({
        action: "CORRECTION",
        actor: actor || "System",
        timestamp: new Date().toISOString(),
      });
      await invoice.save();
      return { success: true, invoice };
    } catch (error: any) {
      reply.status(500);
      return { success: false, message: error.message };
    }
  });

  // ============================================================
  // 3. CASS SETTLEMENT ROUTES (BillingCassView uses these)
  // ============================================================
  fastify.patch("/:id/payment", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { paymentStatus } = request.body as any;

    const invoice = await Invoice.findByIdAndUpdate(
      id,
      { $set: { paymentStatus } },
      { new: true },
    );
    if (!invoice)
      return reply
        .status(404)
        .send({ success: false, error: "Invoice not found." });

    await AuditLog.create({
      entityType: "INVOICE",
      entityId: invoice.invoiceNumber,
      action: "UPDATE",
      performedBy: (request.headers["x-user-name"] as string) || "system",
      details: { paymentStatus },
    });
    return reply.send({ success: true, invoice });
  });

  fastify.patch("/:id/cass-reconcile", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { cassStatus } = request.body as any;

    const invoice = await Invoice.findByIdAndUpdate(
      id,
      { $set: { cassReconciliationStatus: cassStatus } },
      { new: true },
    );
    if (!invoice)
      return reply
        .status(404)
        .send({ success: false, error: "Invoice not found." });

    await AuditLog.create({
      entityType: "INVOICE",
      entityId: invoice.invoiceNumber,
      action: "RECONCILE",
      performedBy: (request.headers["x-user-name"] as string) || "system",
      details: { cassReconciliationStatus: cassStatus },
    });
    return reply.send({ success: true, invoice });
  });
}
