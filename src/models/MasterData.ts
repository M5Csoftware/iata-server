import mongoose, { Schema, Document } from 'mongoose';

// --- Airline Model ---
export interface IAirline extends Document {
  prefix: string; // e.g. "098"
  code: string;   // e.g. "AI"
  name: string;
  country: string;
}

const AirlineSchema = new Schema<IAirline>(
  {
    prefix: { type: String, required: true, unique: true, trim: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true },
    country: { type: String, required: true },
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

export const Airline = mongoose.model<IAirline>('Airline', AirlineSchema);

// --- Airport Model ---
export interface IAirport extends Document {
  iataCode: string; // e.g. "DEL"
  name: string;
  city: string;
  country: string;
}

const AirportSchema = new Schema<IAirport>(
  {
    iataCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true },
    city: { type: String, required: true },
    country: { type: String, required: true },
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

export const Airport = mongoose.model<IAirport>('Airport', AirportSchema);

// --- ShipperConsignee Partner Model ---
export type PartnerType = 'SHIPPER' | 'CONSIGNEE' | 'BOTH';

export interface IShipperConsignee extends Document {
  type: PartnerType;
  name: string;
  accountNumber?: string;
  address: string;
  city: string;
  country: string;
  contactPerson: string;
  phone: string;
  email: string;
  taxOrGstId: string;
}

const ShipperConsigneeSchema = new Schema<IShipperConsignee>(
  {
    type: { type: String, enum: ['SHIPPER', 'CONSIGNEE', 'BOTH'], required: true },
    name: { type: String, required: true, trim: true },
    accountNumber: { type: String },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    country: { type: String, default: '' },
    contactPerson: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    taxOrGstId: { type: String, default: '' },
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

export const ShipperConsignee = mongoose.model<IShipperConsignee>('ShipperConsignee', ShipperConsigneeSchema);

// --- Agent Profile Model ---
export interface IIssuingAgentProfile extends Document {
  name: string;
  iataNumericCode: string;
  cassAddress: string;
  headOfficeAddress: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  gstNumber: string;
  panNumber: string;
}

const IssuingAgentProfileSchema = new Schema<IIssuingAgentProfile>(
  {
    name: { type: String, required: true },
    iataNumericCode: { type: String, required: true },
    cassAddress: { type: String, default: '' },
    headOfficeAddress: { type: String, default: '' },
    city: { type: String, default: '' },
    country: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    gstNumber: { type: String, default: '' },
    panNumber: { type: String, default: '' },
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

export const AgentProfile = mongoose.model<IIssuingAgentProfile>('AgentProfile', IssuingAgentProfileSchema);

