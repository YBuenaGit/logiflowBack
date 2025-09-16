function httpError(res, code, message, extra = {}) {
  const body = { message, ...extra };
  return res.status(code).json(body);
}
module.exports = { httpError };

