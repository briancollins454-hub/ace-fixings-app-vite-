/**
 * src/components/Badge.jsx
 * Status and info badges
 */

import React from "react";
import { BRAND } from "../config/constants.js";

export function Badge({ children, variant = "default" }) {
  const variants = {
    default: {
      background: "linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.06))",
      border: "1px solid rgba(255,255,255,0.12)",
      color: "#fff",
    },
    primary: {
      background: `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.secondary})`,
      border: "1px solid rgba(255,255,255,0.1)",
      color: "#fff",
    },
    success: {
      background: "linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,197,94,0.12))",
      border: "1px solid rgba(34,197,94,0.3)",
      color: "#4ade80",
    },
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 22,
        height: 22,
        padding: "0 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.02em",
        lineHeight: 1,
        ...variants[variant],
      }}
    >
      {children}
    </span>
  );
}

export function StockBadge({ available, quantity, isTracked }) {
  if (!available) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "6px 10px",
          borderRadius: 10,
          background: isTracked ? "rgba(59,130,246,0.15)" : "rgba(220,38,38,0.1)",
          border: isTracked ? "1px solid rgba(59,130,246,0.3)" : "1px solid rgba(220,38,38,0.2)",
          fontSize: 11,
          fontWeight: 600,
          color: isTracked ? "#60a5fa" : "#f87171",
        }}
      >
        <span style={{ fontSize: 8 }}>●</span>
        {isTracked ? "📬 Tracking..." : "Out of Stock"}
      </span>
    );
  }

  const isLow = quantity && quantity < 5;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "6px 10px",
        borderRadius: 10,
        background: isLow ? "rgba(251,146,60,0.1)" : "rgba(34,197,94,0.1)",
        border: isLow ? "1px solid rgba(251,146,60,0.2)" : "1px solid rgba(34,197,94,0.2)",
        fontSize: 11,
        fontWeight: 600,
        color: isLow ? "#fb923c" : "#4ade80",
      }}
    >
      <span style={{ fontSize: 8, animation: isLow ? "pulse 2s infinite" : "none" }}>●</span>
      {isLow ? "Low Stock" : "In Stock"}
    </span>
  );
}

export function SavingsIndicator({ compareAtPrice, price }) {
  if (!compareAtPrice || compareAtPrice <= price) return null;
  const savings = compareAtPrice - price;
  const percent = Math.round((savings / compareAtPrice) * 100);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "6px 10px",
        borderRadius: 10,
        background: "linear-gradient(135deg, rgba(251,146,60,0.15), rgba(239,68,68,0.15))",
        border: "1px solid rgba(251,146,60,0.25)",
        fontSize: 11,
        fontWeight: 700,
        color: "#fb923c",
      }}
    >
      🔥 Save {percent}%
    </span>
  );
}
