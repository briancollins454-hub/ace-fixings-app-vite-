/**
 * src/utils/crypto.js
 * Cryptographic utilities (SHA256, JWT, PKCE, etc)
 */

/**
 * Decode base64url-encoded string
 */
export function base64UrlDecode(str) {
  const pad = "=".repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, "+").replace(/_/g, "/");
  const decoded = atob(b64);
  try {
    return decodeURIComponent(
      decoded
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
  } catch {
    return decoded;
  }
}

/**
 * Decode JWT token and return payload
 */
export function decodeJwt(jwt) {
  if (!jwt || typeof jwt !== "string") return null;
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  const payload = base64UrlDecode(parts[1]);
  return safeJsonParse(payload);
}

/**
 * Generate SHA256 hash and return as base64url
 * Used for PKCE code challenge
 */
export async function sha256Base64Url(input) {
  const enc = new TextEncoder();
  const data = enc.encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * Generate random string (used for PKCE verifier, state, nonce)
 */
export function randomString(len = 64) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => (b % 36).toString(36))
    .join("");
}

/**
 * Safe JSON parse with fallback to null
 */
export function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
