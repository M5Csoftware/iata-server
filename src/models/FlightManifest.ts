import mongoose, { Schema, Document } from 'mongoose';

export type ManifestStatus = 'DRAFT' | 'FINALIZED' | 'DEPARTED';

export interface IFlightManifest extends Document {
  manifestNumber: string;
  flightNumber: string;
  airline: string;
  flightDate: string;
  origin: string;
  destination: string;
  mawbs: string[];
  totalMawbs: number;
  totalHawbs: number;
  totalPieces: number;
  totalGrossWeightKg: number;
  status: ManifestStatus;
  finalizedAt?: string;
  createdAt: Date;
  updatedAt: Date;
}

const FlightManifestSchema = new Schema<IFlightManifest>(
  {
    manifestNumber: { type: String, required: true, unique: true, index: true },
    flightNumber: { type: String, required: true },
    airline: { type: String, required: true },
    flightDate: { type: String, required: true },
    origin: { type: String, required: true, uppercase: true },
    destination: { type: String, required: true, uppercase: true },
    mawbs: { type: [String], default: [] },
    totalMawbs: { type: Number, default: 0 },
    totalHawbs: { type: Number, default: 0 },
    totalPieces: { type: Number, default: 0 },
    totalGrossWeightKg: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['DRAFT', 'FINALIZED', 'DEPARTED'],
      default: 'DRAFT',
      index: true,
    },
    finalizedAt: { type: String },
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

export const FlightManifest = mongoose.model<IFlightManifest>('FlightManifest', FlightManifestSchema);

