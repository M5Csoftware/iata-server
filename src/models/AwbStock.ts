import mongoose, { Schema, Document } from "mongoose";

export type AwbStockStatus = "AVAILABLE" | "ALLOTTED" | "ISSUED" | "VOID";

export interface IAwbStock extends Document {
  airlinePrefix: string; // 3-digit IATA prefix e.g. "098"
  airlineCode?: string; // 2-letter IATA code  e.g. "AI"
  airlineName?: string; // e.g. "Air India"
  airlineNumber: string; // 8-digit serial (7 digits + Mod-7 check digit)
  fullAwbNumber: string; // "<prefix>-<8-digit>" or "<prefix><8-digit>"
  status: AwbStockStatus;
  allocatedTo?: string;
  issuedAt?: string;
  voidReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AwbStockSchema = new Schema<IAwbStock>(
  {
    airlinePrefix: { type: String, required: true, trim: true, index: true },
    airlineCode: { type: String, trim: true, default: "" },
    airlineName: { type: String, trim: true, default: "" },
    airlineNumber: { type: String, required: true, trim: true },
    fullAwbNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["AVAILABLE", "ALLOTTED", "ISSUED", "VOID"],
      default: "AVAILABLE",
      index: true,
    },
    allocatedTo: { type: String, default: "" },
    issuedAt: { type: String },
    voidReason: { type: String },
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
  },
);

export const AwbStock = mongoose.model<IAwbStock>("AwbStock", AwbStockSchema);
