import mongoose from 'mongoose';

// A citable origin of data (one per provider dataset / endpoint).
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, maxlength: 120 },   // e.g. "osm-overpass", "openaq-v3", "ogd-cpcb-aqi", "demo-fixture"
  provider: { type: String, required: true, maxlength: 80 },
  name: { type: String, required: true, maxlength: 200 },
  url: { type: String, maxlength: 500 },
  license: { type: String, maxlength: 200 },
  attribution: { type: String, maxlength: 300 },
  isDemo: { type: Boolean, default: false },
}, { timestamps: true });

export const Source = mongoose.models.Source || mongoose.model('Source', schema);
