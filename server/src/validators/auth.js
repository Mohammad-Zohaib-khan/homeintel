import { z } from 'zod';
import { passwordSchema } from '../services/passwordService.js';

const email = z.string().trim().toLowerCase().email().max(254);
const totpCode = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code');
const recovery = z.string().trim().min(8).max(20);

export const registerBody = z.object({ email, name: z.string().trim().min(1, 'Name is required').max(80), password: passwordSchema }).strict();
export const loginBody = z.object({ email, password: z.string().min(1).max(128) }).strict();
export const mfaCodeBody = z.object({ code: totpCode }).strict();
export const mfaLoginBody = z.object({ code: totpCode.optional(), recoveryCode: recovery.optional() }).strict()
  .refine((v) => !!v.code !== !!v.recoveryCode, 'Provide either an authenticator code or a recovery code');
export const mfaDisableBody = z.object({ password: z.string().min(1).max(128), code: totpCode.optional(), recoveryCode: recovery.optional() }).strict();
export const changePasswordBody = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema, code: totpCode.optional(), recoveryCode: recovery.optional() }).strict();
export const deleteAccountBody = z.object({ password: z.string().min(1).max(128), code: totpCode.optional(), recoveryCode: recovery.optional(), confirm: z.literal('DELETE') }).strict();
