import multer from 'multer';
import { AppError } from '../utils/AppError.js';

/*
 * Upload policy: one file, ≤64 KB, .csv only, allowlisted MIME types, kept in memory (never touches disk, never
 * executed, never served back). Content is validated again by the parser (UTF-8, no NUL bytes, row cap).
 */
const MIME = new Set(['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 64 * 1024, files: 1, fields: 0, parts: 1, headerPairs: 50 },
  fileFilter: (_req, file, cb) => {
    const okExt = /\.csv$/i.test(file.originalname || '');
    if (!okExt || !MIME.has(file.mimetype)) return cb(new AppError(415, 'UNSUPPORTED_FILE', 'Upload a .csv file.'));
    cb(null, true);
  },
}).single('file');

export function csvUpload(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return req.file ? next() : next(AppError.badRequest('Attach a .csv file in the "file" field.'));
    if (err instanceof AppError) return next(err);
    if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, 'FILE_TOO_LARGE', 'The file is larger than 64 KB.'));
    return next(AppError.badRequest('The upload could not be read. Attach one .csv file.'));
  });
}
