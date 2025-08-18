// backend/config/cors.js
// Usage: import cors from "cors"; app.use(cors(corsOptions));
const isProd = process.env.NODE_ENV === "production";

function getAllowedOrigins() {
  if (isProd) {
    // Comma-separated, e.g. "https://app.example.com,https://www.example.com"
    const raw = process.env.ALLOWED_ORIGINS || "";
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  // Dev defaults
  return [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
  ];
}

const allowedOrigins = new Set(getAllowedOrigins());

const corsOptions = {
  origin(origin, callback) {
    // Allow same-origin / server-to-server (no Origin header)
    if (!origin) return callback(null, true);

    if (allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    const err = new Error(`CORS: origin not allowed: ${origin}`);
    // Tag for centralized error handler → returns 403 with uniform JSON
    err.code = "origin_not_allowed";
    return callback(err);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "Cache-Control",
  ],
  exposedHeaders: ["X-Total-Count"],
  maxAge: 86_400, // 24h preflight cache
};

export default corsOptions;
