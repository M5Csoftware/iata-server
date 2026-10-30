import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  entityType: 'AWB_STOCK' | 'DOCKET' | 'BOOKING' | 'MAWB' | 'HAWB' | 'MANIFEST' | 'INVOICE' | 'USER' | 'EAWB';
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'VOID' | 'DELETE' | 'DISPATCH' | 'ASSIGN' | 'RECONCILE';
  performedBy: string; // username or userId
  details?: Record<string, any>;
  reason?: string;
  timestamp: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    entityType: { type: String, required: true, index: true },
    entityId: { type: String, required: true, index: true },
    action: { type: String, required: true, index: true },
    performedBy: { type: String, default: 'system' },
    details: { type: Schema.Types.Mixed },
    reason: { type: String },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: false,
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

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

