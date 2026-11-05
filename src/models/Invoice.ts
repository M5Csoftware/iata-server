// src/models/Invoice.ts
import mongoose, { Document, Schema } from "mongoose";

export interface IChargeLine {
  id: string;
  description: string;
  amount: number;
  overrideReason?: string;
}

export interface IPayment {
  id: string;
  date: string;
  amount: number;
  mode: "CASH" | "CHEQUE" | "BANK_TRANSFER" | "UPI";
  tdsAmount: number;
  reference?: string;
}

export interface ICorrection {
  id: string;
  type: "CREDIT_NOTE" | "DEBIT_NOTE";
  number: string;
  amount: number;
  reason: string;
  date: string;
}

export interface IAuditEntry {
  action: string;
  actor: string;
  timestamp: string;
  details?: string;
}

export interface IInvoice extends Document {
  invoiceNumber?: string;
  mawbNumber: string;
  customerName: string;
  customerAddress?: string;
  customerGstId?: string;
  sacCode?: string;
  billToParty: "SHIPPER" | "CONSIGNEE" | "AGENT";
  date: string;
  dueDate?: string;

  companyName?: string;
  companyLogoUrl?: string;
  companyBankDetails?: string;
  companyTerms?: string;

  irn?: string;
  qrCodeUrl?: string;
  eInvoiceStatus?: "NOT_GENERATED" | "GENERATED" | "CANCELLED";

  freightCharges: number;
  fuelSurcharge: number;
  securitySurcharge: number;
  handlingCharges: number;
  subtotal: number;
  discountAmount: number;
  gstRate: number;
  gstType: "CGST_SGST" | "IGST" | "ZERO_RATED" | "UNREGISTERED";
  gstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
  balanceDue: number;

  chargeLines: IChargeLine[];
  shipmentDetails: mongoose.Schema.Types.Mixed;
  remarks?: string;

  invoiceStatus:
    | "DRAFT"
    | "APPROVED"
    | "SENT"
    | "PARTIALLY_PAID"
    | "PAID"
    | "CANCELLED";
  cassReconciliationStatus: "RECONCILED" | "PENDING_MATCH" | "DISCREPANCY";
  paymentStatus: "PAID" | "UNPAID" | "PARTIAL";
  cancellationReason?: string;

  payments: IPayment[];
  corrections: ICorrection[];
  auditLog: IAuditEntry[];

  createdAt: Date;
  updatedAt: Date;
}

const InvoiceSchema = new Schema<IInvoice>(
  {
    invoiceNumber: { type: String, unique: true, sparse: true },
    mawbNumber: { type: String, required: true },
    customerName: { type: String, required: true },
    customerAddress: String,
    customerGstId: String,
    sacCode: String,
    billToParty: {
      type: String,
      enum: ["SHIPPER", "CONSIGNEE", "AGENT"],
      required: true,
    },
    date: { type: String, required: true },
    dueDate: String,

    companyName: String,
    companyLogoUrl: String,
    companyBankDetails: String,
    companyTerms: String,

    irn: String,
    qrCodeUrl: String,
    eInvoiceStatus: {
      type: String,
      enum: ["NOT_GENERATED", "GENERATED", "CANCELLED"],
      default: "NOT_GENERATED",
    },

    freightCharges: { type: Number, default: 0 },
    fuelSurcharge: { type: Number, default: 0 },
    securitySurcharge: { type: Number, default: 0 },
    handlingCharges: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    gstRate: { type: Number, default: 18 },
    gstType: {
      type: String,
      enum: ["CGST_SGST", "IGST", "ZERO_RATED", "UNREGISTERED"],
      default: "IGST",
    },
    gstAmount: { type: Number, default: 0 },
    cgstAmount: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 },

    chargeLines: [
      {
        id: String,
        description: String,
        amount: Number,
        overrideReason: String,
      },
    ],
    shipmentDetails: { type: Schema.Types.Mixed, default: [] },
    remarks: String,

    invoiceStatus: {
      type: String,
      enum: [
        "DRAFT",
        "APPROVED",
        "SENT",
        "PARTIALLY_PAID",
        "PAID",
        "CANCELLED",
      ],
      default: "DRAFT",
    },
    cassReconciliationStatus: {
      type: String,
      enum: ["RECONCILED", "PENDING_MATCH", "DISCREPANCY"],
      default: "PENDING_MATCH",
    },
    paymentStatus: {
      type: String,
      enum: ["PAID", "UNPAID", "PARTIAL"],
      default: "UNPAID",
    },
    cancellationReason: String,

    payments: [
      {
        id: String,
        date: String,
        amount: Number,
        mode: {
          type: String,
          enum: ["CASH", "CHEQUE", "BANK_TRANSFER", "UPI"],
        },
        tdsAmount: Number,
        reference: String,
      },
    ],
    corrections: [
      {
        id: String,
        type: { type: String, enum: ["CREDIT_NOTE", "DEBIT_NOTE"] },
        number: String,
        amount: Number,
        reason: String,
        date: String,
      },
    ],
    auditLog: [
      {
        action: String,
        actor: String,
        timestamp: String,
        details: String,
      },
    ],
  },
  {
    timestamps: true,
    // ✅ ADDED THIS TOJSON TRANSFORM
    toJSON: {
      transform(_doc, ret: Record<string, any>) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

export const Invoice =
  mongoose.models.Invoice || mongoose.model<IInvoice>("Invoice", InvoiceSchema);
