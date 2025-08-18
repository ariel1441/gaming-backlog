import { isCelebrateError } from "celebrate";

// Map common Postgres SQLSTATE codes to HTTP + our error codes
function pgToHttp(err) {
  switch (err.code) {
    case "23505": // unique_violation
      return {
        status: 409,
        code: "conflict",
        message: "Resource already exists",
      };
    case "23503": // foreign_key_violation
      return {
        status: 409,
        code: "conflict",
        message: "Related resource constraint",
      };
    case "23514": // check_violation
      return {
        status: 422,
        code: "constraint_violation",
        message: "Constraint violated",
      };
    case "22P02": // invalid_text_representation (bad UUID/number)
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

  // 0) JSON parse errors from express.json()
  if (
    err?.type === "entity.parse.failed" ||
    (err instanceof SyntaxError && "body" in err)
  ) {
    status = 400;
    code = "invalid_json";
    message = "Request body must be valid JSON";
  }
  // 1) Celebrate/Joi validation → 422
  else if (isCelebrateError(err)) {
    status = 422;
    code = "validation_error";
    message = "Validation failed";
    body = {
      error: { code, message, details: toValidationDetails(err), requestId },
    };
  }
  // 2) CORS origin not allowed (we’ll tag it in the CORS middleware)
  else if (err?.code === "origin_not_allowed") {
    status = 403;
    code = "forbidden";
    message = "Origin not allowed";
  }
  // 3) Postgres known errors
  else if (err?.code && typeof err.code === "string") {
    const mapped = pgToHttp(err);
    if (mapped) {
      ({ status, code, message } = mapped);
    } else {
      // Unknown DB error → 500 with generic message
      status = 500;
      code = "internal";
      message = "Database error";
    }
  }
  // 4) Standard HTTP-ish errors
  else if (err?.status || err?.statusCode) {
    const s = err.status || err.statusCode;
    status = s;
    if (s === 401) {
      code = "unauthorized";
      message = err.message || "Unauthorized";
    } else if (s === 403) {
      code = "forbidden";
      message = err.message || "Forbidden";
    } else if (s === 404) {
      code = "not_found";
      message = err.message || "Not found";
    } else if (s >= 400 && s < 500) {
      code = "bad_request";
      message = err.message || "Bad request";
    } else {
      code = "internal";
      message = err.message || "Internal server error";
    }
  }

  if (!body) body = { error: { code, message, requestId } };
  if (!isProd && err?.stack) body.error.stack = err.stack;

  // Minimal safe log (no headers/tokens)
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
