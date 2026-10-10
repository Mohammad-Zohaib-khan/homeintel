import { User } from '../models/User.js';
import { RefreshSession } from '../models/RefreshSession.js';
import { RecoveryCode } from '../models/RecoveryCode.js';
import { SavedLocation } from '../models/SavedLocation.js';
import { Comparison } from '../models/Comparison.js';
import { Report } from '../models/Report.js';
import { AIRun } from '../models/AIRun.js';
import { AuditLog } from '../models/AuditLog.js';
import { Neighborhood } from '../models/Neighborhood.js';

export async function purgeUserData(userId) {
  await Promise.all([
    SavedLocation.deleteMany({ userId }), Comparison.deleteMany({ userId }), Report.deleteMany({ userId }), AIRun.deleteMany({ userId }),
    RefreshSession.deleteMany({ userId }), RecoveryCode.deleteMany({ userId }),
    AuditLog.updateMany({ userId }, { $set: { userId: null } }),            // keep security history, drop the link to the person
    Neighborhood.updateMany({ createdBy: userId }, { $set: { createdBy: null } }), // public localities stay; attribution removed
  ]);
  await User.deleteOne({ _id: userId });
}
