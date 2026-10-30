import mongoose, { Schema, Document } from 'mongoose';

export type AwbStatus =
  | 'AVAILABLE'
  | 'ALLOTTED'
  | 'ISSUED'
  | 'MANIFESTED'
  | 'DEPARTED'
  | 'ARRIVED'
  | 'DELIVERED'
  | 'VOID';

export interface IHawb {
  id: string;
  hawbNumber: string;
  mawbNumber: string;
  shipperName: string;
  consigneeName: string;
  origin: string;
  destination: string;
  pieces: number;
  grossWeightKg: number;
  chargeableWeightKg: number;
  natureOfGoods: string;
  status: AwbStatus;
}

export interface IMawb extends Document {
  mawbNumber: string;
  airlinePrefix: string;
  serialNumber: string;
  bookingId?: string;
  docketId?: string;
  shipperName: string;
  shipperAddress: string;
  consigneeName: string;
  consigneeAddress: string;
  issuingAgentName: string;
  issuingAgentIataCode: string;
  origin: string;
  destination: string;
  pieces: number;
  grossWeightKg: number;
  chargeableWeightKg: number;
  rateClass: 'M' | 'N' | 'Q' | 'C';
  ratePerKg: number;
  freightAmount: number;
  fuelSurcharge: number;
  securitySurcharge: number;
  totalCharges: number;
  natureOfGoods: string;
  handlingCode: string;
  flightNumber?: string;
  flightDate?: string;
  hawbs: IHawb[];
  status: AwbStatus;
  issuedAt: string;
  fwbSent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const HawbSchema = new Schema<IHawb>(
  {
    hawbNumber: { type: String, required: true },
    mawbNumber: { type: String, required: true },
    shipperName: { type: String, required: true },
    consigneeName: { type: String, required: true },
    origin: { type: String, required: true, uppercase: true },
    destination: { type: String, required: true, uppercase: true },
    pieces: { type: Number, required: true, default: 1 },
    grossWeightKg: { type: Number, required: true, default: 0 },
    chargeableWeightKg: { type: Number, required: true, default: 0 },
    natureOfGoods: { type: String, default: 'Consolidated Cargo' },
    status: {
      type: String,
      enum: ['AVAILABLE', 'ALLOTTED', 'ISSUED', 'MANIFESTED', 'DEPARTED', 'ARRIVED', 'DELIVERED', 'VOID'],
      default: 'ISSUED',
    },
  },
  {
    _id: true,
    toJSON: {
      transform(_doc, ret: Record<string, any>) {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret._id;
        return ret;
      },
    },
  }
);

const MawbSchema = new Schema<IMawb>(
  {
    mawbNumber: { type: String, required: true, unique: true, index: true },
    airlinePrefix: { type: String, required: true },
    serialNumber: { type: String, required: true },
    bookingId: { type: String },
    docketId: { type: String },
    shipperName: { type: String, required: true },
    shipperAddress: { type: String, default: '' },
    consigneeName: { type: String, required: true },
    consigneeAddress: { type: String, default: '' },
    issuingAgentName: { type: String, default: '' },
    issuingAgentIataCode: { type: String, default: '' },
    origin: { type: String, required: true, uppercase: true },
    destination: { type: String, required: true, uppercase: true },
    pieces: { type: Number, required: true, default: 1 },
    grossWeightKg: { type: Number, required: true, default: 0 },
    chargeableWeightKg: { type: Number, required: true, default: 0 },
    rateClass: { type: String, enum: ['M', 'N', 'Q', 'C'], default: 'Q' },
    ratePerKg: { type: Number, default: 0 },
    freightAmount: { type: Number, default: 0 },
    fuelSurcharge: { type: Number, default: 0 },
    securitySurcharge: { type: Number, default: 0 },
    totalCharges: { type: Number, default: 0 },
    natureOfGoods: { type: String, default: 'General Cargo' },
    handlingCode: { type: String, default: 'GEN' },
    flightNumber: { type: String },
    flightDate: { type: String },
    hawbs: [HawbSchema],
    status: {
      type: String,
      enum: ['AVAILABLE', 'ALLOTTED', 'ISSUED', 'MANIFESTED', 'DEPARTED', 'ARRIVED', 'DELIVERED', 'VOID'],
      default: 'ISSUED',
      index: true,
    },
    issuedAt: { type: String, default: () => new Date().toISOString().split('T')[0] },
    fwbSent: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, any>) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        if (Array.isArray(ret.hawbs)) {
          ret.hawbs = ret.hawbs.map((h: any) => ({
            ...h,
            id: h._id ? h._id.toString() : h.id,
          }));
        }
        return ret;
      },
    },
  }
);

export const Mawb = mongoose.model<IMawb>('Mawb', MawbSchema);

