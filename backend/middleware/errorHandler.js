import { isCelebrateError } from "celebrate";

// Map common Postgres SQLSTATE codes to HTTP status and app error codes.
function pgToHttp(err) {
  switch (err.code) {
    case "23505":
      return {
        status: 409,
        code: "conflict",
        message: "Resource already exists",
      };
    case "23503":
      return {
        status: 409,
        code: "conflict",
        message: "Related resource constraint",
      };
    case "23514":
      return {
        status: 422,
        code: "constraint_violation",
        message: "Constraint violated",
      };
    case "22P02":
      return {
        status: 400,
        code: "bad_request",
        message: "Invalid parameter format",
      };
    default:
      return null;
  }
}

function toValidationDetails(err) {
  const details = [];
  for (const [, joiErr] of err.details.entries()) {
    for (const d of joiErr?.details || []) {
      details.push({
        message: d.message,
        path: Array.isArray(d.path) ? d.path.join(".") : String(d.path || ""),
        type: d.type,
      });
    }
  }
  return details;
}

export default function errorHandler(err, req, res, _next) {
  const requestId = req.requestId || null;
  const isProd = process.env.NODE_ENV === "production";

  let status = 500;
  let code = "internal";
  let message = "Internal server error";
  let body;

  if (
    err?.type === "entity.parse.failed" ||
    (err instanceof SyntaxError && "body" in err)
  ) {
    status = 400;
    code = "invalid_json";
    message = "Request body must be valid JSON";
  } else if (isCelebrateError(err)) {
    status = 422;
    code = "validation_error";
    message = "Validation failed";
    body = {
      error: { code, message, details: toValidationDetails(err), requestId },
    };
  } else if (err?.code === "origin_not_allowed") {
    status = 403;
    code = "forbidden";
    message = "Origin not allowed";
  } else if (
    err?.code &&
    typeof err.code === "string" &&
    !(err?.status || err?.statusCode)
  ) {
    const mapped = pgToHttp(err);
    if (mapped) {
      ({ status, code, message } = mapped);
    } else {
      status = 500;
      code = "internal";
      message = "Database error";
    }
  } else if (err?.status || err?.statusCode) {
    const s = err.status || err.statusCode;
    status = s;
    if (typeof err.code === "string") code = err.code;
    if (s === 401) {
      if (!err.code) code = "unauthorized";
      message = err.message || "Unauthorized";
    } else if (s === 403) {
      if (!err.code) code = "forbidden";
      message = err.message || "Forbidden";
    } else if (s === 404) {
      if (!err.code) code = "not_found";
      message = err.message || "Not found";
    } else if (s >= 400 && s < 500) {
      if (!err.code) code = "bad_request";
      message = err.message || "Bad request";
    } else {
      if (!err.code) code = "internal";
      message = err.message || "Internal server error";
    }
  }

  if (!body) body = { error: { code, message, requestId } };
  if (!isProd && err?.stack) body.error.stack = err.stack;

  if (!isProd) {
    console.error(
      `[${requestId}] ${req.method} ${req.originalUrl} -> ${status} ${code}: ${message}\n${err.stack || err}`
    );
  } else {
    console.error(
      `[${requestId}] ${req.method} ${req.originalUrl} -> ${status} ${code}: ${message}`
    );
  }

  res.status(status).json(body);
}
