import mongoose from 'mongoose';
import { ORIGINS } from '@homeintel/shared';

const schema = new mongoose.Schema({
  neighborhoodId: { type: mongoose.Schema.Types.ObjectId, ref: 'Neighborhood', required: true, index: true },
  key: { type: String, required: true, maxlength: 64 },
  period: { type: String, enum: ['day', 'month', 'year'], required: true },
  observedAt: { type: Date, required: true },
  value: { type: Number, required: true },
  unit: { type: String, required: true, maxlength: 40 },
  origin: { type: String, enum: ORIGINS, required: true },
  sourceKey: { type: String, required: true },
  collectedAt: { type: Date, required: true },
}, { timestamps: false });
schema.index({ neighborhoodId: 1, key: 1, period: 1, observedAt: 1 }, { unique: true });

export const HistoricalMetric = mongoose.models.HistoricalMetric || mongoose.model('HistoricalMetric', schema);
