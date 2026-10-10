import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user', immutable: false },
  tokenVersion: { type: Number, default: 0 },
  failedLogins: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null },
  lastLoginAt: { type: Date, default: null },
  preferences: {
    weights: { type: mongoose.Schema.Types.Mixed, default: null },   // { category: 0–5 }; validated by the service
    presetId: { type: String, maxlength: 40, default: null },
    updatedAt: { type: Date, default: null },
  },
  mfa: {
    enabled: { type: Boolean, default: false },
    secretEnc: { type: String, select: false },
    pendingSecretEnc: { type: String, select: false },
    lastStep: { type: Number, default: 0, select: false },
  },
}, { timestamps: true });

// Public projection: never leak hashes, secrets or counters.
userSchema.methods.toPublic = function toPublic() {
  return { id: String(this._id), email: this.email, name: this.name, role: this.role, mfaEnabled: !!this.mfa?.enabled, createdAt: this.createdAt };
};

export const User = mongoose.models.User || mongoose.model('User', userSchema);
