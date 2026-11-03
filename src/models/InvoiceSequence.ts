// src/models/InvoiceSequence.ts
import mongoose, { Schema, Document } from "mongoose";

export interface IInvoiceSequence extends Document {
  financialYear: string;
  lastNumber: number;
}

const InvoiceSequenceSchema = new Schema<IInvoiceSequence>({
  financialYear: { type: String, required: true, unique: true },
  lastNumber: { type: Number, default: 0 },
});

export const InvoiceSequence =
  mongoose.models.InvoiceSequence ||
  mongoose.model<IInvoiceSequence>("InvoiceSequence", InvoiceSequenceSchema);
