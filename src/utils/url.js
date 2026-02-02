/**
 * src/utils/url.js
 * URL parsing and query string utilities
 */

import { safeJsonParse } from "./crypto.js";

/**
 * Convert object to URL query string
 */
export function toQuery(obj) {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    p.set(k, String(v));
  });
  return p.toString();
}

/**
 * Tolerant URL parser that attempts to fix malformed URLs
 */
export function parseUrlLoose(rawUrl) {
  try {
    return new URL(rawUrl);
  } catch {
    const fixed = rawUrl.replace(/^([a-zA-Z][a-zA-Z0-9+\-.]*):\/(?!\/)/, "$1://");
    try {
      return new URL(fixed);
    } catch {
      return null;
    }
  }
}
