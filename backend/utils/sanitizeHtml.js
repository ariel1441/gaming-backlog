// NEW: backend/utils/sanitizeHtml.js
import DOMPurify from "isomorphic-dompurify";

export function sanitizeGameHtml(html) {
  if (!html || typeof html !== "string") return "";
  // Strict variant (what you already have)
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "ul", "ol", "li"],
    ALLOWED_ATTR: [],
  });
}

export function sanitizeGameHtmlWithLinks(html) {
  if (!html || typeof html !== "string") return "";
  // Links-friendly (still safe): allow anchors with safe attrs
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "ul", "ol", "li", "a"],
    ALLOWED_ATTR: ["href", "title", "target", "rel"],
  });
}
