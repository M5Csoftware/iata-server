import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export type UserRole = 'admin' | 'user';

export interface IUser extends Document {
  username: string;
  password?: string;
  fullName: string;
  role: UserRole;
  email: string;
  stationCode: string;
  isActive: boolean;
  permissions: string[];
  avatar?: string;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true },
    fullName: { type: String, required: true },
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    stationCode: { type: String, default: 'DEL' },
    isActive: { type: Boolean, default: true },
    permissions: {
      type: [String],
      default: ['dashboard', 'docket', 'stock', 'bookings', 'mawb', 'manifest', 'eawb', 'billing', 'master', 'settings'],
    },
    avatar: { type: String, default: '' },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, any>) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.password;
        return ret;
      },
    },
  }
);

UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  if (this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
});

UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.model<IUser>('User', UserSchema);

