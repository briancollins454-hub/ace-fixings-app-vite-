/**
 * src/components/Button.jsx
 * Reusable button component with multiple variants
 */

import React from "react";
import { BRAND } from "../config/constants.js";

export function Button({
  children,
  onClick,
  disabled,
  style,
  variant = "primary",
  title,
  className,
  type = "button",
  loading = false,
  icon,
  size = "md",
}) {
  const sizes = {
    sm: { padding: "9px 13px", fontSize: 13, borderRadius: 6, gap: 5 },
    md: { padding: "12px 18px", fontSize: 14, borderRadius: 7, gap: 7 },
    lg: { padding: "16px 26px", fontSize: 15, borderRadius: 8, gap: 9 },
  };

  const base = {
    border: "none",
    ...sizes[size],
    fontWeight: 600,
    letterSpacing: "0.01em",
    cursor: disabled || loading ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: "all 0.2s ease",
    userSelect: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    whiteSpace: "nowrap",
    maxWidth: "100%",
    position: "relative",
    overflow: "hidden",
  };

  const variants = {
    primary: {
      background: BRAND.primary,
      color: "#fff",
      border: `1px solid ${BRAND.primary}`,
    },
    ghost: {
      background: "rgba(255,255,255,0.06)",
      color: BRAND.text,
      border: "1px solid rgba(255,255,255,0.1)",
    },
    dark: {
      background: "#1f1f1f",
      color: BRAND.text,
      border: "1px solid rgba(255,255,255,0.06)",
    },
    success: {
      background: "#22c55e",
      color: "#fff",
      border: "1px solid #22c55e",
    },
  };

  return (
    <button
      type={type}
      className={`${className || ""} btn-glow`}
      title={title}
      onClick={disabled || loading ? undefined : onClick}
      style={{ ...base, ...variants[variant], ...style }}
      onMouseDown={(e) => {
        if (!disabled && !loading) e.currentTarget.style.transform = "scale(0.95)";
      }}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onTouchStart={(e) => {
        if (!disabled && !loading) e.currentTarget.style.transform = "scale(0.95)";
      }}
      onTouchEnd={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {loading ? (
        <>
          <span
            style={{
              display: "inline-block",
              width: 16,
              height: 16,
              border: "2px solid rgba(255,255,255,0.2)",
              borderTopColor: "#fff",
              borderRadius: "50%",
              animation: "spin 0.6s linear infinite",
            }}
          />
          {children}
        </>
      ) : (
        <>
          {icon && <span style={{ fontSize: "1.15em" }}>{icon}</span>}
          {children}
        </>
      )}
    </button>
  );
}
