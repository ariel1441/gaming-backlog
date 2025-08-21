// backend/config/cors.js

const isProd = process.env.NODE_ENV === "production";

function parseList(val) {
  return String(val || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function getAllowedOrigins() {
  if (isProd) {
    return parseList(process.env.ALLOWED_ORIGINS);
  }
  // Dev defaults — match your Vite/React common ports
  return [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ];
}

const allowedOrigins = new Set(getAllowedOrigins());
// Optional suffix allow for preview environments (e.g., ".vercel.app")
const allowedSuffixes = new Set(parseList(process.env.ALLOWED_ORIGIN_SUFFIXES));

const corsOptions = {
  origin(origin, callback) {
    // Allow non-browser or same-origin requests (no Origin header)
    if (!origin) return callback(null, true);

    if (allowedOrigins.has(origin)) return callback(null, true);

    // If configured, allow trusted subdomains by suffix (e.g., *.vercel.app)
    // Accept both ".vercel.app" and "vercel.app" in env.
    try {
      const { hostname } = new URL(origin);
      for (const sufRaw of allowedSuffixes) {
        const suf = sufRaw.startsWith(".") ? sufRaw : `.${sufRaw}`;
        if (hostname === suf.slice(1) || hostname.endsWith(suf)) {
          return callback(null, true);
        }
      }
    } catch {
      // Ignore bad origins; fall through to deny
    }

    const err = new Error(`CORS: origin not allowed: ${origin}`);
    // Tag the error so your central error handler can convert to a clean 403 JSON
    err.code = "origin_not_allowed";
    return callback(err);
  },

  // You use JWT in Authorization header, not cookies → keep credentials off.
  credentials: false,

  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
  // Useful for pagination & request tracing (if you set X-Request-Id upstream)
  exposedHeaders: ["X-Total-Count", "X-Request-Id"],

  // Fast, cacheable preflights
  optionsSuccessStatus: 204,
  maxAge: 86_400, // 24 hours
};

export default corsOptions;
