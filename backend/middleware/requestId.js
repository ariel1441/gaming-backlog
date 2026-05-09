import crypto from "node:crypto";

export default function requestId(req, res, next) {
  const incoming = req.get("X-Request-Id");
  const id =
    typeof incoming === "string" && incoming.trim()
      ? incoming.trim().slice(0, 128)
      : crypto.randomUUID();

  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}

