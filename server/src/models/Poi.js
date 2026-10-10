import mongoose from 'mongoose';
import { ORIGINS } from '@homeintel/shared';

const schema = new mongoose.Schema({
  neighborhoodId: { type: mongoose.Schema.Types.ObjectId, ref: 'Neighborhood', required: true, index: true },
  ref: { type: String, required: true, maxlength: 80 },             // stable source id, e.g. "osm:node/123"
  type: { type: String, required: true, maxlength: 40 },            // normalized type: school, hospital, bus_stop...
  name: { type: String, maxlength: 200 },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  distanceM: { type: Number, required: true, min: 0 },
  origin: { type: String, enum: ORIGINS, required: true },
  sourceKey: { type: String, required: true },
  collectedAt: { type: Date, required: true },
}, { timestamps: false });
schema.index({ neighborhoodId: 1, ref: 1 }, { unique: true });
schema.index({ neighborhoodId: 1, type: 1, distanceM: 1 });

export const Poi = mongoose.models.Poi || mongoose.model('Poi', schema);
