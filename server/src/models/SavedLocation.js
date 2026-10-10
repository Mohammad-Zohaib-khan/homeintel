import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  neighborhoodId: { type: mongoose.Schema.Types.ObjectId, ref: 'Neighborhood', required: true },
  note: { type: String, maxlength: 500, default: '' },
  tags: { type: [{ type: String, maxlength: 30 }], default: [], validate: (v) => v.length <= 8 },
}, { timestamps: true });
schema.index({ userId: 1, neighborhoodId: 1 }, { unique: true });

export const SavedLocation = mongoose.models.SavedLocation || mongoose.model('SavedLocation', schema);
