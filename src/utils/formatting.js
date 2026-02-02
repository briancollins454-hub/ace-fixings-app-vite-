/**
 * src/utils/formatting.js
 * Format values for display (currency, dates, etc)
 */

/**
 * Format number as British Pounds
 */
export function formatGBP(n) {
  if (Number.isNaN(n) || n === null || n === undefined) return "£—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
}

/**
 * Format Shopify Money V2 object (amount + currencyCode)
 */
export function formatMoneyV2(m) {
  if (!m || m.amount === undefined || m.amount === null) return "—";
  const amt = Number(m.amount || 0);
  const cc = m.currencyCode || "GBP";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: cc }).format(amt);
}

/**
 * Format ISO date string to readable format
 * e.g. "03 Jan 2026 14:30"
 */
export function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Clamp number between min and max
 */
export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
