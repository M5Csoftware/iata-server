import mongoose, { Schema, Document } from 'mongoose';
import { DimensionEntry } from '../utils/volumetric.js';

export type DocketServiceMode = 'EXPRESS_AIR' | 'STANDARD_AIR' | 'PRIORITY_AOG' | 'COLD_CHAIN';
export type DocketPaymentMode = 'PREPAID' | 'TO_PAY' | 'ON_ACCOUNT';
export type DocketStatus = 'BOOKED' | 'AWB_ASSIGNED' | 'MANIFESTED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';

export interface IDocket extends Document {
  docketNumber: string;
  bookingDate: string;
  serviceMode: DocketServiceMode;
  paymentMode: DocketPaymentMode;
  origin: string;
  destination: string;
  consignorName: string;
  consignorAddress: string;
  consignorPhone: string;
  consignorGst: string;
  consigneeName: string;
  consigneeAddress: string;
  consigneePhone: string;
  consigneeGst: string;
  pieces: number;
  packageType: string;
  actualWeightKg: number;
  dimensions: DimensionEntry[];
  volumetricWeightKg: number;
  chargeableWeightKg: number;
  natureOfGoods: string;
  handlingCode: string;
  declaredValue: number;
  ewayBillNumber?: string;
  ratePerKg: number;
  freightAmount: number;
  docketFee: number;
  fuelSurcharge: number;
  securitySurcharge: number;
  subtotal: number;
  gstAmount: number;
  totalAmount: number;
  assignedAwb?: string;
  status: DocketStatus;
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

const DocketSchema = new Schema<IDocket>(
  {
    docketNumber: { type: String, required: true, unique: true, index: true },
    bookingDate: { type: String, required: true },
    serviceMode: {
      type: String,
      enum: ['EXPRESS_AIR', 'STANDARD_AIR', 'PRIORITY_AOG', 'COLD_CHAIN'],
      default: 'STANDARD_AIR',
    },
    paymentMode: {
      type: String,
      enum: ['PREPAID', 'TO_PAY', 'ON_ACCOUNT'],
      default: 'PREPAID',
    },
    origin: { type: String, required: true, uppercase: true },
    destination: { type: String, required: true, uppercase: true },
    consignorName: { type: String, required: true },
    consignorAddress: { type: String, default: '' },
    consignorPhone: { type: String, default: '' },
    consignorGst: { type: String, default: '' },
    consigneeName: { type: String, required: true },
    consigneeAddress: { type: String, default: '' },
    consigneePhone: { type: String, default: '' },
    consigneeGst: { type: String, default: '' },
    pieces: { type: Number, required: true, default: 1 },
    packageType: { type: String, default: 'Boxes' },
    actualWeightKg: { type: Number, required: true, default: 0 },
    dimensions: [DimensionSchema],
    volumetricWeightKg: { type: Number, default: 0 },
    chargeableWeightKg: { type: Number, default: 0 },
    natureOfGoods: { type: String, default: 'General Cargo' },
    handlingCode: { type: String, default: 'GEN' },
    declaredValue: { type: Number, default: 0 },
    ewayBillNumber: { type: String },
    ratePerKg: { type: Number, default: 0 },
    freightAmount: { type: Number, default: 0 },
    docketFee: { type: Number, default: 1200 },
    fuelSurcharge: { type: Number, default: 0 },
    securitySurcharge: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    assignedAwb: { type: String },
    status: {
      type: String,
      enum: ['BOOKED', 'AWB_ASSIGNED', 'MANIFESTED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'],
      default: 'BOOKED',
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

export const Docket = mongoose.model<IDocket>('Docket', DocketSchema);

