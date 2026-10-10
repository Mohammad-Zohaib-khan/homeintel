import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, maxlength: 120 },
  neighborhoodIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Neighborhood' }], validate: (v) => v.length >= 2 && v.length <= 4 },
  weights: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

export const Comparison = mongoose.models.Comparison || mongoose.model('Comparison', schema);
