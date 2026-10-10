import { z } from 'zod';
import { weightObj } from './neighborhood.js';

const nbRef = z.string().min(1).max(120).regex(/^[a-z0-9-]+$|^[a-f0-9]{24}$/i, 'Invalid neighborhood');
const tag = z.string().trim().min(1).max(30).regex(/^[\p{L}\p{N} _-]+$/u, 'Tags may contain letters, numbers, spaces, - and _');
export const objectIdParam = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id') }).strict();
export const pageQuery = z.object({ page: z.coerce.number().int().min(1).max(1000).default(1), limit: z.coerce.number().int().min(1).max(50).default(20), tag: tag.optional() }).strict();
export const saveBody = z.object({ neighborhoodId: nbRef, note: z.string().max(500).optional(), tags: z.array(tag).max(8).optional() }).strict();
export const updateSavedBody = z.object({ note: z.string().max(500).optional(), tags: z.array(tag).max(8).optional() }).strict().refine((v) => v.note !== undefined || v.tags !== undefined, 'Nothing to update');
export const statusQuery = z.object({ neighborhoodId: nbRef }).strict();
export const comparisonBody = z.object({ name: z.string().trim().min(1).max(120), neighborhoodIds: z.array(nbRef).min(2).max(4), weights: weightObj.optional() }).strict();
export const reportBody = z.object({ neighborhoodIds: z.array(nbRef).min(1).max(4), title: z.string().trim().min(1).max(140).optional(), includeAi: z.boolean().optional(), weights: weightObj.optional() }).strict();
export const renameBody = z.object({ title: z.string().trim().min(1).max(140) }).strict();
export const shareBody = z.object({ enabled: z.boolean() }).strict();
export const tokenParam = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{32}$/) }).strict();
