import mongoose from 'mongoose';
import { AppError } from '../utils/AppError.js';

/*
 * Object-level authorization (BOLA/IDOR) helpers. Every user-owned document is read and written ONLY through
 * a filter that includes the caller's userId. A miss (wrong owner or nonexistent) is always 404, so object
 * existence never leaks across users.
 */
export const ownedFilter = (user, id) => {
  if (!mongoose.isValidObjectId(id) || String(id).length !== 24) throw AppError.notFound();
  return { _id: id, userId: user._id };
};
export async function findOwned(Model, user, id, projection) {
  const doc = await Model.findOne(ownedFilter(user, id), projection);
  if (!doc) throw AppError.notFound();
  return doc;
}
