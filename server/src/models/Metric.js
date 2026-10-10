import mongoose from 'mongoose';
import { CATEGORY_IDS, GRANULARITY, ORIGINS } from '@homeintel/shared';

// One normalized, current value per (neighborhood, metric key). History lives in HistoricalMetric.
const schema = new mongoose.Schema({
  neighborhoodId: { type: mongoose.Schema.Types.ObjectId, ref: 'Neighborhood', required: true, index: true },
  key: { type: String, required: true, maxlength: 64 },           // e.g. "schools_1500m"
  category: { type: String, enum: CATEGORY_IDS, required: true },
  label: { type: String, required: true, maxlength: 120 },
  value: { type: Number, required: true },
  unit: { type: String, required: true, maxlength: 40 },
  granularity: { type: String, enum: GRANULARITY, required: true },
  scope: { type: String, maxlength: 200 },                          // human description: "1.5 km radius", "Pune district", "Station X, 3.2 km away"
  origin: { type: String, enum: ORIGINS, required: true },
  sourceKey: { type: String, required: true, maxlength: 120 },
  sourceRef: { type: String, maxlength: 300 },                      // original identifier / URL fragment where available
  observedAt: { type: Date },                                       // when the underlying measurement applies
  collectedAt: { type: Date, required: true },                      // when HomeIntel fetched it
  confidence: { type: Number, min: 0, max: 1, default: 0.8 },
  distanceKm: { type: Number, min: 0 },
  details: { type: mongoose.Schema.Types.Mixed },                   // small, non-sensitive context (station name, nearest POI name...)
}, { timestamps: true });
schema.index({ neighborhoodId: 1, key: 1 }, { unique: true });

export const Metric = mongoose.models.Metric || mongoose.model('Metric', schema);
