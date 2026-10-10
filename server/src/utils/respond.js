// Envelope: { data, meta? } on success; { error: { code, message, details? } } on failure.
export const ok = (res, data, meta, status = 200) => res.status(status).json(meta ? { data, meta } : { data });
export const created = (res, data) => ok(res, data, undefined, 201);
