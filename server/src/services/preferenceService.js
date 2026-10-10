import { User } from '../models/User.js';
import { normalizeWeights } from '../scoring/engine.js';
import { DEFAULT_WEIGHTS, WEIGHT_PRESETS } from '@homeintel/shared';

export function get(user) {
  const p = user.preferences ?? {};
  return { weights: p.weights ? normalizeWeights(p.weights) : { ...DEFAULT_WEIGHTS }, presetId: p.presetId ?? (p.weights ? null : 'balanced'), updatedAt: p.updatedAt ?? null, isDefault: !p.weights };
}
export async function set(user, { weights, presetId }) {
  const w = normalizeWeights({ ...DEFAULT_WEIGHTS, ...weights });
  const preset = presetId && WEIGHT_PRESETS.find((x) => x.id === presetId);
  const matches = preset && Object.entries(preset.weights).every(([k, v]) => w[k] === v);
  await User.updateOne({ _id: user._id }, { $set: { 'preferences.weights': w, 'preferences.presetId': matches ? presetId : null, 'preferences.updatedAt': new Date() } });
  return get(await User.findById(user._id));
}
export async function reset(user) {
  await User.updateOne({ _id: user._id }, { $set: { 'preferences.weights': null, 'preferences.presetId': null, 'preferences.updatedAt': new Date() } });
  return get(await User.findById(user._id));
}
