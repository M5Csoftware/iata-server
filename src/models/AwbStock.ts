import mongoose, { Schema, Document } from 'mongoose';

export type AwbStockStatus = 'AVAILABLE' | 'ALLOTTED' | 'ISSUED' | 'VOID';

export interface IAwbStock extends Document {
  airlinePrefix: string;
  airlineNumber: string;
  fullAwbNumber: string;
  status: AwbStockStatus;
  allocatedTo?: string;
  issuedAt?: string;
  voidReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AwbStockSchema = new Schema<IAwbStock>(
  {
    airlinePrefix: { type: String, required: true, trim: true },
    airlineNumber: { type: String, required: true, trim: true },
    fullAwbNumber: { type: String, required: true, unique: true, trim: true, index: true },
    status: {
      type: String,
      enum: ['AVAILABLE', 'ALLOTTED', 'ISSUED', 'VOID'],
      default: 'AVAILABLE',
      index: true,
    },
    allocatedTo: { type: String, default: '' },
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
  }
);

export const AwbStock = mongoose.model<IAwbStock>('AwbStock', AwbStockSchema);

