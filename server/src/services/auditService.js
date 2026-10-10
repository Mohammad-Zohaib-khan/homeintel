import { AuditLog } from '../models/AuditLog.js';
import { logger } from '../config/logger.js';

// Privacy-conscious: keep only the network prefix (/24 for IPv4, /48-ish for IPv6).
export function ipPrefix(ip = '') {
  if (ip.includes('.')) return ip.replace('::ffff:', '').split('.').slice(0, 3).join('.') + '.0/24';
  return ip.split(':').slice(0, 3).join(':') + '::/48';
}

export async function audit(req, action, { userId = null, outcome = 'success', meta } = {}) {
  try {
    await AuditLog.create({ userId, action, outcome, ipPrefix: ipPrefix(req.ip), userAgent: (req.get('user-agent') || '').slice(0, 200), meta });
  } catch (err) {
    logger.error({ err: { message: err.message }, action }, 'audit write failed');
  }
}
