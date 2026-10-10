import { hash, verify } from '@node-rs/argon2';
import { z } from 'zod';

// Argon2id, OWASP-recommended minimum parameters (19 MiB, t=2, p=1). Tune upward on production hardware.
const OPTS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 };
export const hashPassword = (pw) => hash(pw, OPTS);
export async function verifyPassword(stored, pw) { try { return await verify(stored, pw); } catch { return false; } }

// Burn comparable CPU when the account doesn't exist, so response time doesn't reveal existence.
let dummy;
export async function dummyVerify(pw) { dummy ??= await hashPassword('homeintel-dummy-password'); await verifyPassword(dummy, pw); }

const COMMON = new Set(['password1234', '123456789012', 'qwertyuiop12', 'iloveyou1234', 'welcome12345', 'administrator', 'letmein12345', 'passwordpassword']);
export const passwordSchema = z.string().min(12, 'Use at least 12 characters').max(128, 'Use at most 128 characters')
  .refine((p) => !COMMON.has(p.toLowerCase()), 'That password is too common')
  .refine((p) => new Set(p).size >= 5, 'Use a more varied password');
