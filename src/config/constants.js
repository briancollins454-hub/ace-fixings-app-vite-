/**
 * src/config/constants.js
 * App-wide constants and configuration
 */

// ==========================
// ONESIGNAL (PUSH NOTIFICATIONS)
// ==========================
export const ONESIGNAL_APP_ID = "2bec67b0-c645-4c7d-a9bf-ddae18afc651";

// ==========================
// VAT CONFIG
// ==========================
export const VAT_RATE = 0.2;

// ==========================
// BRAND COLORS
// ==========================
export const BRAND = {
  primary: "#991b1b",      // Deep red
  secondary: "#1f2937",    // Dark gray
  bg: "#0f0f0f",           // Almost black
  muted: "#9ca3af",        // Medium gray
  text: "#ffffff",         // White
  border: "#1f2937",       // Dark border
  success: "#22c55e",      // Green
  error: "#ef4444",        // Red
};

// ==========================
// BULK PRICING TIERS
// ==========================
export const BULK_PRICING_TIERS = {
  "25": 0.95,   // 5% off
  "50": 0.90,   // 10% off
  "100": 0.85,  // 15% off
};
