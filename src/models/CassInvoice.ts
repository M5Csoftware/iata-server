import mongoose, { Schema, Document } from 'mongoose';

export type CassStatus = 'RECONCILED' | 'PENDING_MATCH' | 'DISCREPANCY';
export type PaymentStatus = 'PAID' | 'UNPAID' | 'PARTIAL';

export interface ICassInvoice extends Document {
  invoiceNumber: string;
  mawbNumber: string;
  customerName: string;
  date: string;
  freightCharges: number;
  fuelSurcharge: number;
  securitySurcharge: number;
  handlingCharges: number;
  subtotal: number;
  gstAmount: number;
  totalAmount: number;
  cassReconciliationStatus: CassStatus;
  paymentStatus: PaymentStatus;
  createdAt: Date;
  updatedAt: Date;
}

const CassInvoiceSchema = new Schema<ICassInvoice>(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    mawbNumber: { type: String, required: true, index: true },
    customerName: { type: String, required: true },
    date: { type: String, required: true },
    freightCharges: { type: Number, default: 0 },
    fuelSurcharge: { type: Number, default: 0 },
    securitySurcharge: { type: Number, default: 0 },
    handlingCharges: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    cassReconciliationStatus: {
      type: String,
      enum: ['RECONCILED', 'PENDING_MATCH', 'DISCREPANCY'],
      default: 'PENDING_MATCH',
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ['PAID', 'UNPAID', 'PARTIAL'],
      default: 'UNPAID',
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, any>) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

export const CassInvoice = mongoose.model<ICassInvoice>('CassInvoice', CassInvoiceSchema);

