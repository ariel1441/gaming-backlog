// backend/middleware/auth.js
import jwt from "jsonwebtoken";
import { unauthorized } from "../utils/httpError.js";

export function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(unauthorized("No token provided"));
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // contains { id, username }
    next();
  } catch (error) {
    return next(unauthorized("Invalid or expired token"));
  }
}
