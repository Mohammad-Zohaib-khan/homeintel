export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
  static badRequest(msg = 'Bad request', details) { return new AppError(400, 'BAD_REQUEST', msg, details); }
  static unauthorized(msg = 'Authentication required') { return new AppError(401, 'UNAUTHORIZED', msg); }
  static forbidden(msg = 'Forbidden') { return new AppError(403, 'FORBIDDEN', msg); }
  static notFound(msg = 'Not found') { return new AppError(404, 'NOT_FOUND', msg); }
  static conflict(msg = 'Conflict') { return new AppError(409, 'CONFLICT', msg); }
}
