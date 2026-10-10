import mongoose from 'mongoose';
import { GRANULARITY, ORIGINS } from '@homeintel/shared';

const schema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, maxlength: 120 },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  searchKey: { type: String, required: true, index: true },          // lowercased "name city state" for prefix search
  locality: { type: String, maxlength: 120 },
  city: { type: String, required: true, maxlength: 80 },
  district: { type: String, maxlength: 80 },
  state: { type: String, required: true, maxlength: 80 },
  country: { type: String, default: 'India', maxlength: 60 },
  lat: { type: Number, required: true, min: -90, max: 90, index: true },
  lng: { type: Number, required: true, min: -180, max: 180, index: true },
  // Analysis area: the circle around the centroid used for amenity counts. Bounding box from the geocoder where available.
  radiusM: { type: Number, default: 1500, min: 300, max: 5000 },
  bbox: { type: [Number], validate: (v) => !v.length || v.length === 4 },  // [south, west, north, east]
  granularity: { type: String, enum: GRANULARITY, default: 'neighborhood' },
  origin: { type: String, enum: ORIGINS, required: true },               // seed rows are demo data
  geocodeSource: { provider: String, ref: String, license: String },
  ingestion: {
    status: { type: String, enum: ['idle', 'queued', 'running', 'complete', 'partial', 'failed'], default: 'idle' },
    lastRunAt: Date,
    lastSuccessAt: Date,
    providers: { type: mongoose.Schema.Types.Mixed, default: {} },       // { overpass: { status, at, error? }, ... }
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

schema.methods.toSummary = function toSummary() {
  return {
    id: String(this._id), slug: this.slug, name: this.name, locality: this.locality, city: this.city, district: this.district,
    state: this.state, country: this.country, lat: this.lat, lng: this.lng, radiusM: this.radiusM, origin: this.origin,
    ingestion: { status: this.ingestion?.status ?? 'idle', lastSuccessAt: this.ingestion?.lastSuccessAt ?? null },
  };
};

export const Neighborhood = mongoose.models.Neighborhood || mongoose.model('Neighborhood', schema);
