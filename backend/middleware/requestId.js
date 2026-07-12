import crypto from "node:crypto";

export default function requestId(req, res, next) {
  const incoming = req.get("X-Request-Id");
  const normalized = typeof incoming === "string" ? incoming.trim() : "";
  const id =
    normalized && /^[A-Za-z0-9._:-]{1,128}$/.test(normalized)
      ? normalized
      : crypto.randomUUID();

  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}

