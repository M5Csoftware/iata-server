// src/routes/invoices.ts
import { FastifyInstance } from "fastify";
import { Invoice, IPayment } from "../models/Invoice.js";
import { InvoiceSequence } from "../models/InvoiceSequence.js";
import { buildInvoicePdf } from "../lib/invoice-pdf.js";
import { sendInvoiceEmail } from "../lib/email-sender.js";

export async function invoiceRoutes(fastify: FastifyInstance) {
  const getFinancialYear = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    if (month >= 3) {
      return `${year.toString().slice(-2)}-${(year + 1).toString().slice(-2)}`;
    }
    return `${(year - 1).toString().slice(-2)}-${year.toString().slice(-2)}`;
  };

  // 1. GET ALL
  fastify.get("/", async (request, reply) => {
    try {
      const invoices = await Invoice.find().sort({ createdAt: -1 });
      return { success: true, invoices };
    } catch (error: any) {
      reply.status(500);
      return { success: false, message: error.message };
    }
  });

  // 2. CREATE DRAFT
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
            details: "Unnumbered draft created",
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

  // 3. UPDATE DRAFT
  fastify.put("/drafts/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body: any = request.body;
      const { actor, updates } = body;

      const invoice = await Invoice.findById(id);
      if (!invoice) {
        reply.status(404);
        return { success: false, message: "Invoice not found" };
      }

      if (invoice.invoiceStatus !== "DRAFT") {
        reply.status(403);
        return {
          success: false,
          message: "Final invoices cannot be edited. Use corrections.",
        };
      }

      Object.assign(invoice, updates);
      invoice.auditLog.push({
        action: "UPDATED_DRAFT",
        actor: actor || "System",
        timestamp: new Date().toISOString(),
        details: "Draft charges or details modified",
      });

      await invoice.save();
      return { success: true, invoice };
    } catch (error: any) {
      reply.status(500);
      return { success: false, message: error.message };
    }
  });

  // 4. APPROVE (FY-wise numbering)
  fastify.post("/:id/approve", async (request, reply) => {
    const session = await Invoice.startSession();
    session.startTransaction();

    try {
      const { id } = request.params as { id: string };
      const { actor } = request.body as { actor: string };

      const invoice = await Invoice.findById(id).session(session);
      if (!invoice) throw new Error("Invoice not found");
      if (invoice.invoiceStatus !== "DRAFT")
        throw new Error("Only drafts can be approved");

      const fy = getFinancialYear(new Date());

      const sequence = await InvoiceSequence.findOneAndUpdate(
        { financialYear: fy },
        { $inc: { lastNumber: 1 } },
        { new: true, upsert: true, session },
      );

      const numberStr = sequence.lastNumber.toString().padStart(4, "0");
      invoice.invoiceNumber = `INV/${fy}/${numberStr}`;

      invoice.invoiceStatus = "APPROVED";
      invoice.balanceDue = invoice.totalAmount;
      invoice.auditLog.push({
        action: "APPROVED",
        actor: actor || "System",
        timestamp: new Date().toISOString(),
        details: `Assigned number ${invoice.invoiceNumber}`,
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

  // 5. SEND
  fastify.post("/:id/send", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { actor } = request.body as { actor: string };

      const invoice = await Invoice.findById(id);
      if (!invoice || invoice.invoiceStatus !== "APPROVED") {
        reply.status(400);
        return { success: false, message: "Invalid state for sending" };
      }

      invoice.invoiceStatus = "SENT";
      invoice.auditLog.push({
        action: "SENT_TO_CUSTOMER",
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

  // 6. PAYMENTS
  fastify.post("/:id/payments", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { actor, payment } = request.body as {
        actor: string;
        payment: any;
      };

      const invoice = await Invoice.findById(id);
      if (!invoice) throw new Error("Not found");
      if (["DRAFT", "CANCELLED", "PAID"].includes(invoice.invoiceStatus)) {
        throw new Error("Cannot receive payment for this invoice status");
      }

      const newPayment = {
        id: `PAY-${Date.now()}`,
        date: new Date().toISOString().slice(0, 10),
        ...payment,
      };

      invoice.payments.push(newPayment);

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
        action: "PAYMENT_RECEIVED",
        actor: actor || "System",
        timestamp: new Date().toISOString(),
        details: `Amount: ${payment.amount}, TDS: ${payment.tdsAmount}`,
      });

      await invoice.save();
      return { success: true, invoice };
    } catch (error: any) {
      reply.status(500);
      return { success: false, message: error.message };
    }
  });

  // 7. CORRECTIONS
  fastify.post("/:id/corrections", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { actor, correction } = request.body as {
        actor: string;
        correction: any;
      };

      const invoice = await Invoice.findById(id);
      if (!invoice) throw new Error("Not found");
      if (
        invoice.invoiceStatus === "DRAFT" ||
        invoice.invoiceStatus === "CANCELLED"
      ) {
        throw new Error("Cannot issue correction for this status");
      }

      const fy = getFinancialYear(new Date());
      const typePrefix = correction.type === "CREDIT_NOTE" ? "CN" : "DN";
      const seqKey = `${typePrefix}-${fy}`;

      const sequence = await InvoiceSequence.findOneAndUpdate(
        { financialYear: seqKey },
        { $inc: { lastNumber: 1 } },
        { new: true, upsert: true },
      );

      const number = `${typePrefix}/${fy}/${sequence.lastNumber
        .toString()
        .padStart(4, "0")}`;

      invoice.corrections.push({
        id: `COR-${Date.now()}`,
        number,
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
        action: "CORRECTION_ISSUED",
        actor: actor || "System",
        timestamp: new Date().toISOString(),
        details: `${correction.type} issued for ${correction.amount}`,
      });

      await invoice.save();
      return { success: true, invoice };
    } catch (error: any) {
      reply.status(500);
      return { success: false, message: error.message };
    }
  });

  // 8. CANCEL
  fastify.post("/:id/cancel", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { actor, reason } = request.body as {
        actor: string;
        reason: string;
      };

      const invoice = await Invoice.findById(id);
      if (!invoice) throw new Error("Not found");
      if (invoice.invoiceStatus === "CANCELLED")
        throw new Error("Already cancelled");

      invoice.invoiceStatus = "CANCELLED";
      invoice.cancellationReason = reason;

      invoice.auditLog.push({
        action: "CANCELLED",
        actor: actor || "System",
        timestamp: new Date().toISOString(),
        details: `Reason: ${reason}`,
      });

      await invoice.save();
      return { success: true, invoice };
    } catch (error: any) {
      reply.status(500);
      return { success: false, message: error.message };
    }
  });

  // 9. EMAIL PDF ✅
  fastify.post("/:id/email", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { to, actor, agentProfile } = request.body as any;

      const invoice = await Invoice.findById(id);
      if (!invoice) throw new Error("Invoice not found");
      if (!to) throw new Error("Recipient email required");

      const pdfBuffer: Buffer = await buildInvoicePdf(invoice, agentProfile);

      await sendInvoiceEmail({
        to,
        invoiceNumber: invoice.invoiceNumber!,
        customerName: invoice.customerName,
        totalAmount: invoice.totalAmount,
        pdfBuffer,
        companyName: agentProfile?.name || "Cargo Agency",
      });

      invoice.auditLog.push({
        action: "EMAILED",
        actor: actor || "System",
        timestamp: new Date().toISOString(),
        details: `Sent to ${to}`,
      });
      if (invoice.invoiceStatus === "APPROVED") {
        invoice.invoiceStatus = "SENT";
      }
      await invoice.save();

      return { success: true };
    } catch (error: any) {
      reply.status(500);
      return { success: false, message: error.message };
    }
  });
}
