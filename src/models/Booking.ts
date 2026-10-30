import mongoose, { Schema, Document } from 'mongoose';
import { DimensionEntry } from '../utils/volumetric.js';

export type BookingStatus = 'PENDING_AWB' | 'AWB_ISSUED' | 'CANCELLED';

export interface IBooking extends Document {
  bookingRef: string;
  shipperName: string;
  consigneeName: string;
  origin: string;
  destination: string;
  pieces: number;
  actualWeightKg: number;
  dimensions: DimensionEntry[];
  volumetricWeightKg: number;
  chargeableWeightKg: number;
  natureOfGoods: string;
  handlingCode: string;
  status: BookingStatus;
  assignedAwb?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DimensionSchema = new Schema<DimensionEntry>(
  {
    lengthCm: { type: Number, required: true },
    widthCm: { type: Number, required: true },
    heightCm: { type: Number, required: true },
    pieces: { type: Number, required: true, default: 1 },
  },
  { _id: false }
);

const BookingSchema = new Schema<IBooking>(
  {
    bookingRef: { type: String, required: true, unique: true, index: true },
    shipperName: { type: String, required: true },
    consigneeName: { type: String, required: true },
    origin: { type: String, required: true, uppercase: true },
    destination: { type: String, required: true, uppercase: true },
    pieces: { type: Number, required: true, default: 1 },
    actualWeightKg: { type: Number, required: true, default: 0 },
    dimensions: [DimensionSchema],
    volumetricWeightKg: { type: Number, default: 0 },
    chargeableWeightKg: { type: Number, default: 0 },
    natureOfGoods: { type: String, default: 'General Cargo' },
    handlingCode: { type: String, default: 'GEN' },
    status: {
      type: String,
      enum: ['PENDING_AWB', 'AWB_ISSUED', 'CANCELLED'],
      default: 'PENDING_AWB',
      index: true,
    },
    assignedAwb: { type: String },
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

export const Booking = mongoose.model<IBooking>('Booking', BookingSchema);

