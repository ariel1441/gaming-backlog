export function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

export function badRequest(message = "Bad request") {
  return httpError(400, message, "bad_request");
}

export function unauthorized(message = "Unauthorized") {
  return httpError(401, message, "unauthorized");
}

export function forbidden(message = "Forbidden") {
  return httpError(403, message, "forbidden");
}

export function conflict(message = "Conflict") {
  return httpError(409, message, "conflict");
}

export function notFound(message = "Not found") {
  return httpError(404, message, "not_found");
}

export function serviceUnavailable(message = "Service unavailable") {
  return httpError(503, message, "service_unavailable");
}
