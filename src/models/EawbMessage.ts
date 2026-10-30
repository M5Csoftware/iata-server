import mongoose, { Schema, Document } from 'mongoose';

export type EawbMessageType = 'FWB' | 'FHL' | 'FFM' | 'FSU';
export type EawbDirection = 'OUTBOUND' | 'INBOUND';
export type EawbStatus = 'ACKNOWLEDGED' | 'SENT' | 'FAILED' | 'RETRYING';

export interface IEawbMessage extends Document {
  messageType: EawbMessageType;
  awbNumber: string;
  airline: string;
  flightNumber?: string;
  direction: EawbDirection;
  status: EawbStatus;
  timestamp: string;
  rawCargoImp: string;
  createdAt: Date;
  updatedAt: Date;
}

const EawbMessageSchema = new Schema<IEawbMessage>(
  {
    messageType: {
      type: String,
      enum: ['FWB', 'FHL', 'FFM', 'FSU'],
      required: true,
      index: true,
    },
    awbNumber: { type: String, required: true, index: true },
    airline: { type: String, required: true },
    flightNumber: { type: String },
    direction: { type: String, enum: ['OUTBOUND', 'INBOUND'], default: 'OUTBOUND' },
    status: {
      type: String,
      enum: ['ACKNOWLEDGED', 'SENT', 'FAILED', 'RETRYING'],
      default: 'ACKNOWLEDGED',
      index: true,
    },
    timestamp: { type: String, default: () => new Date().toISOString() },
    rawCargoImp: { type: String, required: true },
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

export const EawbMessage = mongoose.model<IEawbMessage>('EawbMessage', EawbMessageSchema);

