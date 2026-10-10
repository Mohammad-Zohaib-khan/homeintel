// Validates (and strips/rejects) untrusted input with Zod. Only parsed values reach controllers via req.valid.
export const validate = (schemas) => (req, _res, next) => {
  try {
    req.valid = {};
    for (const part of ['body', 'query', 'params']) if (schemas[part]) req.valid[part] = schemas[part].parse(req[part] ?? {});
    next();
  } catch (e) { next(e); }
};
