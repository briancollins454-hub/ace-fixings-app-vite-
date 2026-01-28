// App.jsx
import React from "react";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Browser } from "@capacitor/browser";
import { Preferences } from "@capacitor/preferences";
import OneSignal from "onesignal-cordova-plugin";

/**
 * Ace Fixings — Single-file Capacitor + React App.jsx
 *
 * ✅ Runs alongside your AndroidManifest redirect:
 *    shop.90779713878.app://callback
 *
 * ✅ Fixes the “CORS blocked” token exchange by:
 *    - Using CapacitorHttp on NATIVE for token exchange + Customer Account API calls
 *    - On WEB (localhost) login is disabled (because Shopify Customer Accounts token endpoint blocks browser CORS)
 *
 * INCLUDED:
 * ✅ Storefront browse/collections/products/cart
 * ✅ VAT toggle (Inc/Ex)
 * ✅ Customer Accounts login (OAuth + PKCE + deep link) — native only
 * ✅ Customer profile load (name/email) via Customer Account API — native only
 * ✅ Orders hub (previous orders + view + reorder) — native only
 */

const { useEffect, useMemo, useRef, useState } = React;

// ==========================
// BRAND / THEME - ULTRA PREMIUM
// ==========================
const BRAND = {
  name: "Ace Fixings",
  domain: "acefixings.com",
  // Premium color palette - Rich & Vibrant
  primary: "#ef4444",
  primaryLight: "#f87171",
  primaryDark: "#dc2626",
  primaryGlow: "rgba(239, 68, 68, 0.5)",
  secondary: "#f97316",
  secondaryGlow: "rgba(249, 115, 22, 0.4)",
  accent: "#8b5cf6",
  accentGlow: "rgba(139, 92, 246, 0.4)",
  success: "#10b981",
  successGlow: "rgba(16, 185, 129, 0.4)",
  warning: "#f59e0b",
  gold: "#fbbf24",
  goldGlow: "rgba(251, 191, 36, 0.4)",
  // Ultra Dark Premium Theme
  bg: "#030303",
  bgAlt: "#0a0a0a",
  bgGradient: "linear-gradient(180deg, #0a0a0a 0%, #030303 50%, #050505 100%)",
  card: "#0c0c0c",
  cardHover: "#141414",
  cardBorder: "rgba(255,255,255,0.05)",
  cardGlow: "rgba(239, 68, 68, 0.1)",
  // Premium Glass effects
  glass: "rgba(12, 12, 12, 0.8)",
  glassBorder: "rgba(255,255,255,0.1)",
  glassHeavy: "rgba(8, 8, 8, 0.95)",
  glassShine: "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%)",
  // Typography
  text: "#ffffff",
  textSecondary: "#e5e5e5",
  muted: "#737373",
  mutedLight: "#a3a3a3",
  // Premium Shadows
  shadowSm: "0 2px 8px rgba(0,0,0,0.5)",
  shadowMd: "0 8px 32px rgba(0,0,0,0.6)",
  shadowLg: "0 24px 64px rgba(0,0,0,0.7)",
  shadowGlow: "0 0 40px rgba(239,68,68,0.4)",
  shadowGlowHover: "0 0 60px rgba(239,68,68,0.5)",
};

// ==========================
// ONESIGNAL (PUSH)
// ==========================
const ONESIGNAL_APP_ID = "2bec67b0-c645-4c7d-a9bf-ddae18afc651";

// ==========================
// SHOPIFY STOREFRONT CONFIG
// ==========================
const SHOP_DOMAIN = "acefixings.com";
const API_VERSION = "2025-07";

// ⛔ DO NOT paste tokens publicly. Rotate if this file is shared.
const STOREFRONT_TOKEN = "6a03196efa97d2256f8b9b0c0fc148b9";
const STOREFRONT_ENDPOINT = `https://${SHOP_DOMAIN}/api/${API_VERSION}/graphql.json`;

// ==========================
// CUSTOMER ACCOUNTS (OAUTH)
// ==========================
const CUSTOMER_ACCOUNTS_CLIENT_ID = "edc5278a-8942-4645-a802-bdfa625f8dbd";

// ✅ MUST match your AndroidManifest deep link intent-filter
// <data android:scheme="shop.90779713878.app" android:host="callback" />
const REDIRECT_URI = "shop.90779713878.app://callback";

// Discovery endpoints
const OIDC_CONFIG_URL = `https://${SHOP_DOMAIN}/.well-known/openid-configuration`;
const CUSTOMER_ACCOUNT_API_DISCOVERY_URL = `https://${SHOP_DOMAIN}/.well-known/customer-account-api`;

// ==========================
// VAT CONFIG
// ==========================
const VAT_RATE = 0.2;

// ==========================
// HELPERS
// ==========================
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function formatGBP(n) {
  if (Number.isNaN(n) || n === null || n === undefined) return "£—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
}

function formatMoneyV2(m) {
  if (!m || m.amount === undefined || m.amount === null) return "—";
  const amt = Number(m.amount || 0);
  const cc = m.currencyCode || "GBP";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: cc }).format(amt);
}

function formatDateTime(iso) {
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

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function base64UrlDecode(str) {
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

function decodeJwt(jwt) {
  if (!jwt || typeof jwt !== "string") return null;
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  const payload = base64UrlDecode(parts[1]);
  return safeJsonParse(payload);
}

function toQuery(obj) {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    p.set(k, String(v));
  });
  return p.toString();
}

async function sha256Base64Url(input) {
  const enc = new TextEncoder();
  const data = enc.encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomString(len = 64) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => (b % 36).toString(36))
    .join("");
}

function parseUrlLoose(rawUrl) {
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

// ---------- HTTP (Web vs Native) ----------
// Native: CapacitorHttp avoids browser CORS.
// Web: uses fetch (but Shopify token endpoint will be blocked on localhost).
async function httpGetText(url) {
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.request({
      method: "GET",
      url,
      headers: { Accept: "application/json" },
    });
    const data = r?.data;
    if (typeof data === "string") return data;
    if (data && typeof data === "object") return JSON.stringify(data);
    return "";
  } else {
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    return await res.text();
  }
}

async function fetchJson(url) {
  const text = await httpGetText(url);
  const json = safeJsonParse(text);
  if (!json) throw new Error("Invalid JSON from discovery endpoint");
  return json;
}

// POST x-www-form-urlencoded (native + web)
async function httpPostForm(url, formObj) {
  const body = new URLSearchParams(formObj).toString();

  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.request({
      method: "POST",
      url,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: body, // send raw string body
    });

    // CapacitorHttp returns parsed JSON sometimes in r.data
    const data = r?.data;
    const json = typeof data === "string" ? safeJsonParse(data) : data;

    // Shopify token endpoint can return 200 with json error or 4xx
    const status = Number(r?.status || 0);
    if (status && status >= 400) {
      const err = json?.error_description || json?.error || (typeof data === "string" ? data : `HTTP ${status}`);
      throw new Error(err);
    }
    if (json?.error) {
      throw new Error(json.error_description || json.error);
    }
    return json || {};
  }

  // WEB (browser)
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const text = await res.text();
  const json = safeJsonParse(text);

  if (!res.ok) {
    const err = json?.error_description || json?.error || text || `HTTP ${res.status}`;
    throw new Error(err);
  }
  return json || {};
}

async function shopifyStorefront(query, variables = {}) {
  const res = await fetch(STOREFRONT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": STOREFRONT_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  const text = await res.text();
  const json = safeJsonParse(text);

  if (!res.ok) {
    const message = json?.errors?.[0]?.message || json?.error || text || `Storefront HTTP ${res.status}`;
    throw new Error(message);
  }
  if (json?.errors?.length) throw new Error(json.errors[0]?.message || "Storefront API error");
  return json.data;
}

// ==========================
// STORAGE KEYS
// ==========================
const K = {
  VAT_MODE: "acefixings_vat_mode",
  CART_ID: "acefixings_cart_id",
  AUTH: "acefixings_auth",
  PKCE: "acefixings_pkce",
  PROFILE: "acefixings_customer_profile",
  ORDERS_CACHE: "acefixings_orders_cache",
};

// ==========================
// UI COMPONENTS
// ==========================
function Button({ children, onClick, disabled, style, variant = "primary", title, className, type = "button", loading = false, icon, size = "md" }) {
  const sizes = {
    sm: { padding: "10px 14px", fontSize: 13, borderRadius: 14, gap: 6 },
    md: { padding: "14px 20px", fontSize: 14, borderRadius: 16, gap: 8 },
    lg: { padding: "18px 28px", fontSize: 15, borderRadius: 20, gap: 10 },
  };
  const base = {
    border: "none",
    ...sizes[size],
    fontWeight: 700,
    letterSpacing: "0.02em",
    cursor: disabled || loading ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: "all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
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
      background: `linear-gradient(135deg, ${BRAND.primary} 0%, #ff6b6b 40%, ${BRAND.secondary} 100%)`,
      backgroundSize: "200% 200%",
      animation: "gradientShift 4s ease infinite",
      color: "#fff",
      boxShadow: `0 8px 28px ${BRAND.primaryGlow}, inset 0 1px 0 rgba(255,255,255,0.15)`,
      textShadow: "0 2px 4px rgba(0,0,0,0.3)",
      border: "1px solid rgba(255,255,255,0.1)",
    },
    ghost: { 
      background: "rgba(255,255,255,0.03)", 
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      color: "#fff", 
      border: "1px solid rgba(255,255,255,0.08)",
      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    },
    dark: { 
      background: "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))", 
      color: "#fff", 
      border: "1px solid rgba(255,255,255,0.08)",
      boxShadow: "0 4px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05)",
    },
    success: {
      background: "linear-gradient(135deg, #22c55e 0%, #16a34a 50%, #15803d 100%)",
      backgroundSize: "200% 200%",
      animation: "gradientShift 4s ease infinite",
      color: "#fff",
      boxShadow: "0 8px 28px rgba(34,197,94,0.35), inset 0 1px 0 rgba(255,255,255,0.15)",
      textShadow: "0 2px 4px rgba(0,0,0,0.2)",
      border: "1px solid rgba(255,255,255,0.1)",
    },
    accent: {
      background: `linear-gradient(135deg, ${BRAND.accent} 0%, #a78bfa 50%, #c4b5fd 100%)`,
      backgroundSize: "200% 200%",
      animation: "gradientShift 4s ease infinite",
      color: "#fff",
      boxShadow: "0 8px 28px rgba(139,92,246,0.35), inset 0 1px 0 rgba(255,255,255,0.15)",
      textShadow: "0 2px 4px rgba(0,0,0,0.2)",
      border: "1px solid rgba(255,255,255,0.1)",
    },
  };
  return (
    <button
      type={type}
      className={`${className || ''} btn-glow`}
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
          <span style={{ 
            display: "inline-block", 
            width: 16, 
            height: 16, 
            border: "2px solid rgba(255,255,255,0.2)", 
            borderTopColor: "#fff", 
            borderRadius: "50%", 
            animation: "spin 0.6s linear infinite" 
          }} />
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

function Pill({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active 
          ? `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.secondary})`
          : "rgba(255,255,255,0.03)",
        color: active ? "#fff" : BRAND.mutedLight,
        border: active ? "none" : "1px solid rgba(255,255,255,0.06)",
        padding: "10px 14px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "all 0.2s ease",
        boxShadow: active ? `0 4px 15px ${BRAND.primaryGlow}` : "none",
      }}
    >
      {label}
    </button>
  );
}

function Skeleton({ h = 16, w = "100%", r = 16, style }) {
  return (
    <div
      style={{
        height: h,
        width: w,
        borderRadius: r,
        background: "linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 100%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.8s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

function Badge({ children, variant = "default" }) {
  const variants = {
    default: {
      background: "linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.06))",
      border: "1px solid rgba(255,255,255,0.12)",
      color: "#fff",
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
    },
    primary: {
      background: `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.secondary})`,
      border: "1px solid rgba(255,255,255,0.1)",
      color: "#fff",
      boxShadow: `0 4px 12px ${BRAND.primaryGlow}`,
    },
    success: {
      background: "linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,197,94,0.12))",
      border: "1px solid rgba(34,197,94,0.3)",
      color: "#4ade80",
      boxShadow: "0 2px 8px rgba(34,197,94,0.15)",
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

function StockBadge({ available, quantity }) {
  if (!available) {
    return (
      <span style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "6px 10px",
        borderRadius: 10,
        background: "rgba(220,38,38,0.1)",
        border: "1px solid rgba(220,38,38,0.2)",
        fontSize: 11,
        fontWeight: 600,
        color: "#f87171",
      }}>
        <span style={{ fontSize: 8 }}>●</span>
        Out of Stock
      </span>
    );
  }
  const isLow = quantity && quantity < 5;
  return (
    <span style={{
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
    }}>
      <span style={{ fontSize: 8, animation: isLow ? "pulse 2s infinite" : "none" }}>●</span>
      {isLow ? "Low Stock" : "In Stock"}
    </span>
  );
}

function SavingsIndicator({ compareAtPrice, price }) {
  if (!compareAtPrice || compareAtPrice <= price) return null;
  const savings = compareAtPrice - price;
  const percent = Math.round((savings / compareAtPrice) * 100);
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "6px 10px",
      borderRadius: 10,
      background: `linear-gradient(135deg, rgba(251,146,60,0.15), rgba(239,68,68,0.15))`,
      border: "1px solid rgba(251,146,60,0.25)",
      fontSize: 11,
      fontWeight: 700,
      color: "#fb923c",
    }}>
      🔥 Save {percent}%
    </span>
  );
}

function VatToggle({ mode, onChange }) {
  return (
    <div style={{ 
      display: "flex", 
      gap: 3, 
      alignItems: "center",
      background: "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
      padding: 4,
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.06)",
      boxShadow: "0 4px 12px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.03)",
    }}>
      <button
        type="button"
        onClick={() => onChange("inc")}
        style={{
          flex: 1,
          padding: "9px 14px",
          borderRadius: 11,
          background: mode === "inc" 
            ? `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.secondary})`
            : "transparent",
          border: mode === "inc" ? "1px solid rgba(255,255,255,0.1)" : "none",
          color: mode === "inc" ? "#fff" : BRAND.muted,
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: "0.03em",
          cursor: "pointer",
          transition: "all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
          boxShadow: mode === "inc" ? `0 6px 16px ${BRAND.primaryGlow}, inset 0 1px 0 rgba(255,255,255,0.15)` : "none",
          whiteSpace: "nowrap",
          textTransform: "uppercase",
        }}
      >
        Inc VAT
      </button>
      <button
        type="button"
        onClick={() => onChange("ex")}
        style={{
          flex: 1,
          padding: "9px 14px",
          borderRadius: 11,
          background: mode === "ex" 
            ? `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.secondary})`
            : "transparent",
          border: mode === "ex" ? "1px solid rgba(255,255,255,0.1)" : "none",
          color: mode === "ex" ? "#fff" : BRAND.muted,
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: "0.03em",
          cursor: "pointer",
          transition: "all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
          boxShadow: mode === "ex" ? `0 6px 16px ${BRAND.primaryGlow}, inset 0 1px 0 rgba(255,255,255,0.15)` : "none",
          whiteSpace: "nowrap",
          textTransform: "uppercase",
        }}
      >
        Ex VAT
      </button>
    </div>
  );
}

function ImageGallery({ images, altText, onImageClick }) {
  const [currentImageIdx, setCurrentImageIdx] = useState(0);
  const currentImage = images?.[currentImageIdx];

  if (!images || images.length === 0) {
    return (
      <div style={{
        width: "100%",
        aspectRatio: "1",
        borderRadius: 18,
        background: "#161616",
        border: "1px solid #222",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: BRAND.muted,
        fontWeight: 900,
      }}>
        No Image
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        onClick={() => onImageClick?.(currentImage)}
        style={{
          width: "100%",
          aspectRatio: "1",
          borderRadius: 18,
          overflow: "hidden",
          border: "1px solid #222",
          background: "#0f0f0f",
          cursor: "pointer",
          position: "relative",
        }}
      >
        <img
          src={currentImage.url}
          alt={currentImage.altText || altText}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            animation: "fadeIn 0.3s ease",
          }}
        />
      </div>

      {images.length > 1 && (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
          {images.map((img, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setCurrentImageIdx(idx)}
              style={{
                width: 60,
                height: 60,
                minWidth: 60,
                borderRadius: 10,
                border: `2px solid ${idx === currentImageIdx ? BRAND.primary : "#2a2a2a"}`,
                background: "#161616",
                padding: 2,
                cursor: "pointer",
                overflow: "hidden",
                transition: "all 0.2s",
              }}
            >
              <img
                src={img.url}
                alt={img.altText || `thumbnail ${idx}`}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  opacity: idx === currentImageIdx ? 1 : 0.6,
                }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon, title, description, action, actionLabel }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 20px",
      textAlign: "center",
      minHeight: 300,
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>{icon}</div>
      <div style={{ fontSize: 18, fontWeight: 1000, color: "#fff", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: BRAND.muted, marginBottom: 24, maxWidth: 300 }}>{description}</div>
      {action && <Button onClick={action}>{actionLabel || "Get Started"}</Button>}
    </div>
  );
}

// Pro feature components
function FavoriteButton({ isFavorited, onToggle, size = 24 }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: isFavorited ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.1)",
        border: isFavorited ? `1px solid ${BRAND.primary}` : "1px solid #333",
        color: isFavorited ? BRAND.primary : "#fff",
        fontSize: size * 0.5,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.2s",
      }}
    >
      {isFavorited ? "❤️" : "🤍"}
    </button>
  );
}

function StarRating({ rating, size = 12 }) {
  const stars = Array(5)
    .fill(0)
    .map((_, i) => (i < Math.floor(rating) ? "⭐" : "☆"));
  return <span style={{ fontSize: size }}>{stars.join("")}</span>;
}

function BulkPricingBadge({ quantity, discount, onClick }) {
  if (!discount) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 8px",
        borderRadius: 8,
        background: "linear-gradient(135deg, rgba(34,197,94,0.2), rgba(132,204,22,0.2))",
        border: "1px solid rgba(34,197,94,0.4)",
        fontSize: 10,
        fontWeight: 900,
        color: "#66ff66",
        cursor: "pointer",
        transition: "all 0.2s",
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.95)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      💰 Save {discount}%
    </button>
  );
}

function QuickViewButton({ onQuickView }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onQuickView();
      }}
      style={{
        padding: "6px 10px",
        borderRadius: 8,
        background: "rgba(255,255,255,0.1)",
        border: "1px solid #333",
        color: "#fff",
        fontSize: 11,
        fontWeight: 900,
        cursor: "pointer",
        transition: "all 0.2s",
      }}
    >
      👁️ Quick View
    </button>
  );
}

function ComparisonCheckbox({ isSelected, onToggle }) {
  return (
    <input
      type="checkbox"
      checked={isSelected}
      onChange={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      style={{
        width: 18,
        height: 18,
        cursor: "pointer",
      }}
    />
  );
}

function BulkPricingInfoModal({ onClose }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999,
        animation: "fadeIn 0.2s ease",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#0a0a0a",
          borderRadius: 20,
          padding: 20,
          maxWidth: 420,
          width: "90%",
          border: "1px solid #1f1f1f",
          animation: "cardSlideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 1000 }}>💰 Bulk Pricing</div>
          <Button variant="ghost" onClick={onClose}>✕</Button>
        </div>

        <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
          {[
            { qty: "10-24 items", discount: "5% off", color: "#90EE90" },
            { qty: "25-49 items", discount: "10% off", color: "#87CEEB" },
            { qty: "50-99 items", discount: "15% off", color: "#FFD700" },
            { qty: "100+ items", discount: "20% off", color: "#FF6B6B" },
          ].map((tier, i) => (
            <div
              key={i}
              style={{
                padding: 12,
                borderRadius: 12,
                border: `2px solid ${tier.color}`,
                background: "#0f0f0f",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontWeight: 1000, fontSize: 13 }}>{tier.qty}</span>
              <span style={{ fontWeight: 1000, fontSize: 14, color: tier.color }}>{tier.discount}</span>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, color: BRAND.muted, lineHeight: 1.6, marginBottom: 16 }}>
          <strong>Automatic discounts</strong> apply to your cart when you add items. Discounts are calculated on the best combination of quantities.
        </div>

        <Button
          variant="primary"
          onClick={onClose}
          style={{ width: "100%", fontSize: 14, fontWeight: 1000 }}
          icon="→"
        >
          Got it
        </Button>
      </div>
    </div>
  );
}

function AdvancedFiltersPanel({ filters, onFilterChange, allVendors, onClose }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "flex-end",
        zIndex: 998,
        animation: "fadeIn 0.2s ease",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#0a0a0a",
          borderRadius: "20px 20px 0 0",
          width: "100%",
          maxHeight: "80vh",
          overflow: "auto",
          padding: 20,
          borderTop: "1px solid #1f1f1f",
          animation: "slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 1000 }}>Filters</div>
          <Button variant="ghost" onClick={onClose}>✕</Button>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          {/* Price Range Filter */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 1000, color: BRAND.muted, marginBottom: 8 }}>PRICE RANGE</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="number"
                min="0"
                max="999"
                value={filters.minPrice || 0}
                onChange={(e) => onFilterChange({ ...filters, minPrice: Number(e.target.value) })}
                placeholder="Min"
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #1f1f1f",
                  background: "#0b0b0b",
                  color: "#fff",
                  fontWeight: 900,
                }}
              />
              <div style={{ color: BRAND.muted }}>–</div>
              <input
                type="number"
                min="0"
                max="999"
                value={filters.maxPrice || 999}
                onChange={(e) => onFilterChange({ ...filters, maxPrice: Number(e.target.value) })}
                placeholder="Max"
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #1f1f1f",
                  background: "#0b0b0b",
                  color: "#fff",
                  fontWeight: 900,
                }}
              />
            </div>
          </div>

          {/* Vendor Filter */}
          {allVendors.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 1000, color: BRAND.muted, marginBottom: 8 }}>VENDORS</div>
              <div style={{ display: "grid", gap: 8 }}>
                {allVendors.map((vendor) => (
                  <label
                    key={vendor}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #1f1f1f",
                      cursor: "pointer",
                      background: filters.vendors.includes(vendor) ? "#0f0f0f" : "#0b0b0b",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={filters.vendors.includes(vendor)}
                      onChange={(e) => {
                        const newVendors = e.target.checked
                          ? [...filters.vendors, vendor]
                          : filters.vendors.filter((v) => v !== vendor);
                        onFilterChange({ ...filters, vendors: newVendors });
                      }}
                      style={{ width: 16, height: 16, cursor: "pointer" }}
                    />
                    <span style={{ fontSize: 12, fontWeight: 900 }}>{vendor}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Clear Filters Button */}
          <Button
            variant="dark"
            onClick={() => onFilterChange({ minPrice: 0, maxPrice: 999, vendors: [] })}
            style={{ width: "100%", fontSize: 12 }}
          >
            Clear all filters
          </Button>

          <Button
            variant="primary"
            onClick={onClose}
            style={{ width: "100%", fontSize: 14, fontWeight: 1000 }}
            icon="→"
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

// ==========================
// MAIN APP
// ==========================
export default function App() {
  const isNative = Capacitor.isNativePlatform();

  const [booted, setBooted] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [vatMode, setVatMode] = useState("inc");
  const vatLabel = vatMode === "inc" ? "Inc VAT" : "Ex VAT";

  const [auth, setAuth] = useState(null);

  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [isNonVatCustomer, setIsNonVatCustomer] = useState(false);

  const [view, setView] = useState("home"); // home | collection | product | cart | orders | orderDetail | account
  const [activeCollection, setActiveCollection] = useState(null);
  const [activeProduct, setActiveProduct] = useState(null);

  const [collections, setCollections] = useState([]);
  const [loadingCollections, setLoadingCollections] = useState(false);

  const [collectionProducts, setCollectionProducts] = useState([]);
  const [loadingCollectionProducts, setLoadingCollectionProducts] = useState(false);

  const [cartId, setCartId] = useState("");
  const [cart, setCart] = useState(null);
  const [loadingCart, setLoadingCart] = useState(false);

  // Orders hub
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [activeOrder, setActiveOrder] = useState(null);

  const [search, setSearch] = useState("");
  const searchRef = useRef("");
  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  // PRO FEATURES STATE
  // Wishlist/Favorites
  const [favorites, setFavorites] = useState([]);
  
  // Quick reorder from recent
  const [recentlyOrdered, setRecentlyOrdered] = useState([]);
  
  // Product specs/details
  const [productSpecs, setProductSpecs] = useState({});
  
  // Product reviews
  const [productReviews, setProductReviews] = useState({});
  
  // Advanced search filters
  const [searchFilters, setSearchFilters] = useState({ minPrice: 0, maxPrice: 999, vendors: [] });
  const [showFilters, setShowFilters] = useState(false);
  
  // Bulk pricing info modal
  const [showBulkPricingInfo, setShowBulkPricingInfo] = useState(false);
  
  // Quick view modal
  const [quickViewProduct, setQuickViewProduct] = useState(null);
  
  // Product comparison
  const [compareProducts, setCompareProducts] = useState([]);
  
  // B2B company account
  const [companyAccount, setCompanyAccount] = useState(null);
  const [companyName, setCompanyName] = useState("");
  const [customerShopifyId, setCustomerShopifyId] = useState("");
  
  // VAT verification form
  const [vatFormBusinessName, setVatFormBusinessName] = useState("");
  const [vatFormCountry, setVatFormCountry] = useState("Ireland");
  const [vatFormVatNumber, setVatFormVatNumber] = useState("");
  const [vatFormSubmitted, setVatFormSubmitted] = useState(false);
  const [vatFormLoading, setVatFormLoading] = useState(false);
  
  // Simple registration form (no OAuth needed)
  const [regEmail, setRegEmail] = useState("");
  const [regFirstName, setRegFirstName] = useState("");
  const [regLastName, setRegLastName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regAddress1, setRegAddress1] = useState("");
  const [regCity, setRegCity] = useState("");
  const [regCounty, setRegCounty] = useState("");
  const [regPostcode, setRegPostcode] = useState("");
  const [regCountry, setRegCountry] = useState("Ireland");
  const [regVatNumber, setRegVatNumber] = useState("");
  const [regLoading, setRegLoading] = useState(false);
  const [showRegForm, setShowRegForm] = useState(false);
  
  // Collapsible description state
  const [descExpanded, setDescExpanded] = useState(false);
  
  // Bulk pricing multipliers (e.g., { "10-24": 0.95, "25-49": 0.90, "50+": 0.85 })
  const bulkPricingTiers = {
    "10": 0.95,   // 5% off
    "25": 0.90,   // 10% off
    "50": 0.85,   // 15% off
    "100": 0.80,  // 20% off
  };


  const deepLinkHandledRef = useRef(false);

  // Discovery configs
  const [oidc, setOidc] = useState(null);
  const [custApi, setCustApi] = useState(null);

  // Refs for native back/swipe handlers
  const viewRef = useRef(view);
  const activeCollectionRef = useRef(activeCollection);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  useEffect(() => {
    activeCollectionRef.current = activeCollection;
  }, [activeCollection]);

  // Native-style back navigation
  const goBackOne = React.useCallback(() => {
    setError("");
    setSearch("");

    const v = viewRef.current;
    const hasCollection = !!activeCollectionRef.current;

    if (v === "product") {
      setView("collection");
      return;
    }
    if (v === "collection") {
      setView("home");
      setActiveProduct(null);
      return;
    }
    if (v === "cart") {
      setView(hasCollection ? "collection" : "home");
      return;
    }
    if (v === "orderDetail") {
      setView("orders");
      return;
    }
    if (v === "orders") {
      setView("home");
      return;
    }
    if (v === "account") {
      setView("home");
      return;
    }
  }, []);

  // Swipe-back + Android hardware back (registered once)
  useEffect(() => {
    const sub = CapApp.addListener("backButton", () => {
      const v = viewRef.current;
      if (v && v !== "home") {
        goBackOne();
      } else {
        try {
          CapApp.exitApp();
        } catch {}
      }
    });

    let startX = 0,
      startY = 0,
      startT = 0;
    let tracking = false;

    const onStart = (e) => {
      const t = e.touches?.[0];
      if (!t) return;
      if (t.clientX > 18) return;
      tracking = true;
      startX = t.clientX;
      startY = t.clientY;
      startT = Date.now();
    };

    const onMove = (e) => {
      if (!tracking) return;
      const t = e.touches?.[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (dx > 10 && Math.abs(dy) < 60) e.preventDefault();
    };

    const onEnd = (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches?.[0];
      if (!t) return;

      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const dt = Date.now() - startT;

      if (dt < 500 && dx > 80 && Math.abs(dy) < 70) {
        if (viewRef.current !== "home") goBackOne();
      }
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: true });

    return () => {
      try {
        sub?.remove();
      } catch {}
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
    };
  }, [goBackOne]);

  async function discoverOidcAndApi() {
    const [oidcJson, custJson] = await Promise.all([fetchJson(OIDC_CONFIG_URL), fetchJson(CUSTOMER_ACCOUNT_API_DISCOVERY_URL)]);
    setOidc(oidcJson);
    setCustApi(custJson);
    return { oidcJson, custJson };
  }

  async function customerApiGraphql(accessToken, query, variables = {}) {
    const graphqlUrl = custApi?.graphql_api || custApi?.graphql || custApi?.graphqlApi || custApi?.graphql_api_url;
    if (!graphqlUrl) throw new Error("Customer Account API not discovered (missing graphql_api)");

    const headers = {
      "Content-Type": "application/json",
      Authorization: accessToken,
      "X-Shopify-Customer-Access-Token": accessToken,
    };

    // Native: use CapacitorHttp to avoid any webview CORS oddities
    if (isNative) {
      const r = await CapacitorHttp.request({
        method: "POST",
        url: graphqlUrl,
        headers,
        data: JSON.stringify({ query, variables }),
      });
      const status = Number(r?.status || 0);
      const data = r?.data;
      const json = typeof data === "string" ? safeJsonParse(data) : data;

      if (status && status >= 400) {
        const msg = json?.errors?.[0]?.message || (typeof data === "string" ? data : `Customer API HTTP ${status}`);
        throw new Error(msg);
      }
      if (json?.errors?.length) throw new Error(json.errors[0]?.message || "Customer API error");
      return json?.data;
    }

    // Web (only called if you somehow enable login on web)
    const res = await fetch(graphqlUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
    });

    const text = await res.text();
    const json = safeJsonParse(text);
    if (!res.ok) {
      const msg = json?.errors?.[0]?.message || text || `Customer API HTTP ${res.status}`;
      throw new Error(msg);
    }
    if (json?.errors?.length) throw new Error(json.errors[0]?.message || "Customer API error");
    return json.data;
  }

  async function loadCustomerProfile(accessToken) {
    try {
      const q = `query { 
        customer { 
          firstName 
          lastName 
          emailAddress { emailAddress } 
          tags
        } 
      }`;
      const data = await customerApiGraphql(accessToken, q);

      console.warn("=== CUSTOMER API RESPONSE ===");
      console.warn(JSON.stringify(data, null, 2));
      console.warn("=============================");

      const first = data?.customer?.firstName || "";
      const last = data?.customer?.lastName || "";
      const email = data?.customer?.emailAddress?.emailAddress || "";
      const fullName = `${first} ${last}`.trim();
      const tags = data?.customer?.tags || [];
      
      // Try to generate a customer ID from email since GraphQL might not return it
      const customerId = email ? `gid://shopify/Customer/${email.split("@")[0]}` : "";
      
      console.warn("=== EXTRACTED VALUES ===");
      console.warn("Email:", email);
      console.warn("First:", first, "Last:", last);
      console.warn("Tags:", tags);
      console.warn("Generated Customer ID:", customerId);
      console.warn("========================");
      
      // Store customer ID in Preferences AND state
      if (customerId) {
        await Preferences.set({ key: "customer_shopify_id", value: customerId });
      }
      setCustomerShopifyId(customerId);
      
      // Check if customer has "vat-verified" tag (approved for tax exemption)
      const isVatVerified = tags.some(tag => tag?.toLowerCase() === "vat-verified");
      
      if (email) setUserEmail(email);
      if (fullName) setUserName(fullName);
      
      // Check if user already submitted VAT form (stored per-email)
      if (email) {
        const vatSubmittedData = await Preferences.get({ key: `vat_submitted_${email}` });
        if (vatSubmittedData?.value) {
          try {
            const parsed = JSON.parse(vatSubmittedData.value);
            if (parsed?.submitted) {
              setVatFormSubmitted(true);
            }
          } catch (e) {
            // ignore parse errors
          }
        } else {
          setVatFormSubmitted(false); // Reset for new user
        }
      }
      
      // If vat-verified tag exists, activate Ex-VAT mode
      if (isVatVerified) {
        setCompanyAccount({
          id: customerId,
          name: fullName,
          verified: true,
          reverseCharge: true
        });
        setVatMode("ex");
        setToast(`✓ Tax exempt account verified - showing Ex-VAT prices`);
      } else {
        // Not verified - customer can submit VAT form
        // Store customer ID for VAT form submission
        setCompanyAccount({
          id: customerId,
          name: fullName,
          verified: false,
          reverseCharge: false
        });
        setIsNonVatCustomer(false);
      }

      await Preferences.set({
        key: K.PROFILE,
        value: JSON.stringify({ firstName: first, lastName: last, email, fullName, isNonVat, savedAt: Date.now() }),
      });

      return { fullName, email, isNonVat };
    } catch {
      return null;
    }
  }

  async function submitVatVerification(businessName, country, vatNumber) {
    try {
      let customerEmail = userEmail;
      
      console.warn("=== SUBMITTING VAT ===");
      console.warn("Customer Email:", customerEmail);
      console.warn("Business Name:", businessName);
      console.warn("Country:", country);
      console.warn("VAT Number:", vatNumber);
      console.warn("====================");
      
      if (!customerEmail) {
        setToast("❌ Error: Customer email not found. Please log out and log in again.");
        return false;
      }

      // Call Vercel API to submit VAT verification
      // Use CapacitorHttp on native to bypass CORS
      const apiUrl = "https://ace-fixings-app.vercel.app/api/submitVatVerification";
      const payload = JSON.stringify({
        customerEmail: customerEmail,
        businessName,
        country,
        vatNumber,
      });

      let text;
      let status;

      if (Capacitor.isNativePlatform()) {
        // Native: use CapacitorHttp to avoid CORS
        const r = await CapacitorHttp.request({
          method: "POST",
          url: apiUrl,
          headers: { "Content-Type": "application/json" },
          data: payload,
        });
        status = r?.status || 0;
        text = typeof r?.data === "string" ? r.data : JSON.stringify(r?.data || {});
      } else {
        // Web: use fetch
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
        });
        status = response.status;
        text = await response.text();
      }

      let result;
      try {
        result = JSON.parse(text);
      } catch (e) {
        console.error("API response was not JSON:", text);
        setToast("❌ Error: API did not return JSON. See logs for details.");
        return false;
      }

      if (status < 200 || status >= 300) {
        setToast(`❌ Error: ${result.error || "Failed to submit VAT verification"}`);
        return false;
      }

      setToast("✓ VAT verification submitted for review. Your team will verify and approve soon.");
      setVatFormBusinessName("");
      setVatFormVatNumber("");
      setVatFormSubmitted(true);
      
      // Save VAT submission status per user email
      if (customerEmail) {
        await Preferences.set({ 
          key: `vat_submitted_${customerEmail}`, 
          value: JSON.stringify({ submitted: true, date: Date.now() }) 
        });
      }
      
      return true;
    } catch (err) {
      setToast(`❌ Error: ${err?.message || "Failed to submit VAT verification"}`);
      return false;
    }
  }

  // Simple registration - creates customer directly in Shopify
  async function registerCustomer() {
    if (!regEmail) {
      setToast("❌ Email is required");
      return;
    }
    
    setRegLoading(true);
    try {
      const apiUrl = "https://ace-fixings-app.vercel.app/api/registerCustomer";
      const payload = {
        email: regEmail,
        firstName: regFirstName,
        lastName: regLastName,
        phone: regPhone,
        address: {
          address1: regAddress1,
          city: regCity,
          province: regCounty,
          zip: regPostcode,
          country: regCountry,
        },
        vatNumber: regVatNumber,
      };

      let text, status;
      
      if (Capacitor.isNativePlatform()) {
        const r = await CapacitorHttp.request({
          method: "POST",
          url: apiUrl,
          headers: { "Content-Type": "application/json" },
          data: JSON.stringify(payload),
        });
        status = r?.status || 0;
        text = typeof r?.data === "string" ? r.data : JSON.stringify(r?.data || {});
      } else {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        status = response.status;
        text = await response.text();
      }

      let result;
      try {
        result = JSON.parse(text);
      } catch (e) {
        setToast("❌ Server error. Please try again.");
        return;
      }

      if (status < 200 || status >= 300) {
        setToast(`❌ ${result.error || "Registration failed"}`);
        return;
      }

      // Success! But DON'T log them in - they need to verify via email first
      // The API sends an account invite email to set their password

      // If VAT number provided, mark as submitted for this email
      if (regVatNumber) {
        await Preferences.set({ 
          key: `vat_submitted_${regEmail}`, 
          value: JSON.stringify({ submitted: true, date: Date.now() }) 
        });
      }

      // Clear form - DON'T set userEmail, they need to login properly via OAuth
      setRegEmail("");
      setRegFirstName("");
      setRegLastName("");
      setRegPhone("");
      setRegAddress1("");
      setRegCity("");
      setRegCounty("");
      setRegPostcode("");
      setRegVatNumber("");
      setShowRegForm(false);

      // Show success message prompting them to check email
      setToast(`✓ Account created! Check your email to set your password, then login.`);
      // Stay on account page so they can see the login button
      
    } catch (err) {
      setToast(`❌ ${err?.message || "Registration failed"}`);
    } finally {
      setRegLoading(false);
    }
  }

  async function loadOrdersFromApi({ silent = false } = {}) {
    if (!auth?.access_token) {
      if (!silent) setError("Please login to view orders.");
      return [];
    }
    setOrdersLoading(true);
    if (!silent) setError("");
    try {
      const q = `
        query Orders($first:Int!) {
          customer {
            orders(first: $first, sortKey: PROCESSED_AT, reverse: true) {
              nodes {
                id
                name
                number
                createdAt
                financialStatus
                fulfillmentStatus
                subtotal { amount currencyCode }
                totalTax { amount currencyCode }
                totalPrice { amount currencyCode }
                lineItems(first: 50) {
                  nodes {
                    id
                    name
                    quantity
                    sku
                    variantId
                    image { url altText }
                  }
                }
              }
            }
          }
        }
      `;
      const data = await customerApiGraphql(auth.access_token, q, { first: 40 });
      const list = data?.customer?.orders?.nodes || [];
      setOrders(list);

      // Auto-populate recently ordered from latest order
      if (list.length > 0) {
        const lastOrder = list[0];
        const items = lastOrder?.lineItems?.nodes || [];
        const recentItems = items.slice(0, 4).map((li) => ({
          name: li.name || "Item",
          sku: li.sku || null,
          quantity: li.quantity || 1,
          variantId: li.variantId,
        }));
        setRecentlyOrdered(recentItems);
      }

      await Preferences.set({ key: K.ORDERS_CACHE, value: JSON.stringify({ savedAt: Date.now(), orders: list }) });

      return list;
    } catch (e) {
      if (!silent) setError(String(e?.message || e));
      return [];
    } finally {
      setOrdersLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        if (isNative) {
          try {
            await StatusBar.setStyle({ style: Style.Dark });
            await StatusBar.setBackgroundColor({ color: BRAND.bg });
          } catch {}
        }

        if (isNative && ONESIGNAL_APP_ID) {
          try {
            console.log("[OneSignal] Initializing with App ID:", ONESIGNAL_APP_ID);
            
            // OneSignal SDK 5.x API
            OneSignal.initialize(ONESIGNAL_APP_ID);
            
            // Request notification permission
            OneSignal.Notifications.requestPermission(true).then((accepted) => {
              console.log("[OneSignal] Permission accepted:", accepted);
            });
            
            // Log subscription status
            OneSignal.User.pushSubscription.getIdAsync().then((id) => {
              console.log("[OneSignal] Push Subscription ID:", id);
            });
            
            console.log("[OneSignal] Initialization complete");
          } catch (err) {
            console.error("[OneSignal] Init error:", err);
          }
        }

        const savedVat = await Preferences.get({ key: K.VAT_MODE });
        if (savedVat?.value === "inc" || savedVat?.value === "ex") setVatMode(savedVat.value);

        const savedCartId = await Preferences.get({ key: K.CART_ID });
        if (savedCartId?.value) setCartId(savedCartId.value);

        await discoverOidcAndApi();

        const savedProfile = await Preferences.get({ key: K.PROFILE });
        const prof = savedProfile?.value ? safeJsonParse(savedProfile.value) : null;
        if (prof?.email) setUserEmail(prof.email);
        if (prof?.fullName) setUserName(prof.fullName);
        if (prof?.isNonVat) {
          setIsNonVatCustomer(true);
          setVatMode("ex");
        }

        const savedOrders = await Preferences.get({ key: K.ORDERS_CACHE });
        const oc = savedOrders?.value ? safeJsonParse(savedOrders.value) : null;
        if (oc?.orders?.length) setOrders(oc.orders);

        const savedAuth = await Preferences.get({ key: K.AUTH });
        const parsedAuth = savedAuth?.value ? safeJsonParse(savedAuth.value) : null;
        if (parsedAuth?.access_token) {
          setAuth(parsedAuth);

          const payload = decodeJwt(parsedAuth.id_token);
          const email = payload?.email || payload?.email_address || payload?.preferred_username || "";
          if (email) setUserEmail(email);

          if (isNative) await loadCustomerProfile(parsedAuth.access_token);
        }

        // OAuth callback deep link (NATIVE only)
        if (isNative) {
          CapApp.addListener("appUrlOpen", async (event) => {
            try {
              if (!event?.url) return;
              const url = parseUrlLoose(event.url);
              if (!url) return;

              const hrefLower = (url.href || "").toLowerCase();
              const r2 = REDIRECT_URI.toLowerCase();
              if (!hrefLower.startsWith(r2)) return;

              if (deepLinkHandledRef.current) return;
              deepLinkHandledRef.current = true;

              const code = url.searchParams.get("code");
              const state = url.searchParams.get("state");
              const errorParam = url.searchParams.get("error");
              const errorDesc = url.searchParams.get("error_description");

              if (errorParam) throw new Error(errorDesc || errorParam);
              if (!code) throw new Error("Missing authorization code");

              await handleOAuthCallback({ code, state });
            } catch (e) {
              setError(String(e?.message || e));
              deepLinkHandledRef.current = false;
            } finally {
              try {
                await Browser.close();
              } catch {}
            }
          });
        }

        await loadCollections();
        await ensureCartId();

        setBooted(true);
      } catch (e) {
        setError(String(e?.message || e));
        setBooted(true);
      }
    })();

    return () => {
      try {
        CapApp.removeAllListeners();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    Preferences.set({ key: K.VAT_MODE, value: vatMode });
  }, [vatMode]);

  useEffect(() => {
    if (cartId) Preferences.set({ key: K.CART_ID, value: cartId });
  }, [cartId]);

  // Auto-load orders when opening Orders hub (fast)
  useEffect(() => {
    if (view === "orders" && auth?.access_token && isNative) {
      loadOrdersFromApi({ silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  async function loadCollections() {
    setLoadingCollections(true);
    setError("");
    try {
      const q = `
        query Collections($first:Int!) {
          collections(first: $first) {
            edges {
              node {
                id
                title
                handle
                description
                descriptionHtml
                image { url altText }
              }
            }
          }
        }
      `;
      const data = await shopifyStorefront(q, { first: 40 });
      const items =
        data?.collections?.edges?.map((e) => ({
          id: e.node.id,
          title: e.node.title,
          handle: e.node.handle,
          description: e.node.description,
          descriptionHtml: e.node.descriptionHtml,
          imageUrl: e.node.image?.url || "",
          imageAlt: e.node.image?.altText || e.node.title,
        })) || [];
      setCollections(items);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoadingCollections(false);
    }
  }

  async function loadProductsForCollection(handle) {
    setLoadingCollectionProducts(true);
    setError("");
    try {
      const q = `
        query CollectionByHandle($handle:String!, $first:Int!) {
          collectionByHandle(handle:$handle) {
            id
            title
            handle
            description
            descriptionHtml
            products(first:$first) {
              edges {
                node {
                  id
                  title
                  handle
                  vendor
                  productType
                  description
                  descriptionHtml
                  featuredImage { url altText }
                  images(first:6) { edges { node { url altText } } }
                  variants(first:20) {
                    edges {
                      node {
                        id
                        title
                        availableForSale
                        quantityAvailable
                        price { amount currencyCode }
                        compareAtPrice { amount currencyCode }
                        sku
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;
      const data = await shopifyStorefront(q, { handle, first: 40 });
      const c = data?.collectionByHandle;
      if (!c) throw new Error("Collection not found");

      setActiveCollection({
        id: c.id,
        title: c.title,
        handle: c.handle,
        descriptionHtml: c.descriptionHtml || "",
        description: c.description || "",
      });
      setDescExpanded(false); // Reset description collapsed state

      const products = c.products?.edges?.map((e) => normalizeProduct(e.node)) || [];
      setCollectionProducts(products);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoadingCollectionProducts(false);
    }
  }

  function normalizeProduct(p) {
    const variants =
      p?.variants?.edges?.map((v) => ({
        id: v.node.id,
        title: v.node.title,
        availableForSale: !!v.node.availableForSale,
        quantityAvailable: v.node.quantityAvailable ?? null,
        price: Number(v.node.price?.amount || 0),
        currencyCode: v.node.price?.currencyCode || "GBP",
        compareAtPrice: v.node.compareAtPrice ? Number(v.node.compareAtPrice.amount || 0) : null,
        sku: v.node.sku || "",
      })) || [];

    const images = [
      ...(p.featuredImage ? [{ url: p.featuredImage.url, altText: p.featuredImage.altText }] : []),
      ...(p.images?.edges?.map((i) => ({ url: i.node.url, altText: i.node.altText })) || []),
    ].filter((x) => x?.url);

    return {
      id: p.id,
      title: p.title,
      handle: p.handle,
      vendor: p.vendor || "",
      productType: p.productType || "",
      description: p.description || "",
      descriptionHtml: p.descriptionHtml || "",
      images,
      variants,
    };
  }

  async function createCart() {
    const q = `
      mutation CartCreate($input: CartInput) {
        cartCreate(input: $input) {
          cart { id }
          userErrors { message }
        }
      }
    `;
    const data = await shopifyStorefront(q, { input: {} });
    const err = data?.cartCreate?.userErrors?.[0]?.message;
    if (err) throw new Error(err);
    const id = data?.cartCreate?.cart?.id;
    if (!id) throw new Error("Failed to create cart");
    return id;
  }

  async function fetchCart(id) {
    setLoadingCart(true);
    setError("");
    try {
      const q = `
        query CartQuery($id: ID!) {
          cart(id: $id) {
            id
            checkoutUrl
            totalQuantity
            cost {
              subtotalAmount { amount currencyCode }
              totalAmount { amount currencyCode }
              totalTaxAmount { amount currencyCode }
            }
            lines(first: 50) {
              edges {
                node {
                  id
                  quantity
                  merchandise {
                    ... on ProductVariant {
                      id
                      title
                      sku
                      product { title handle featuredImage { url altText } }
                      price { amount currencyCode }
                    }
                  }
                }
              }
            }
          }
        }
      `;
      const data = await shopifyStorefront(q, { id });
      if (!data?.cart?.id) throw new Error("Cart not found (expired).");

      setCart({
        id: data.cart.id,
        checkoutUrl: data.cart.checkoutUrl,
        totalQuantity: data.cart.totalQuantity || 0,
        cost: {
          subtotal: Number(data.cart.cost?.subtotalAmount?.amount || 0),
          total: Number(data.cart.cost?.totalAmount?.amount || 0),
          tax: Number(data.cart.cost?.totalTaxAmount?.amount || 0),
          currency: data.cart.cost?.totalAmount?.currencyCode || "GBP",
        },
        lines:
          data.cart.lines?.edges?.map((e) => ({
            id: e.node.id,
            quantity: e.node.quantity,
            variantId: e.node.merchandise?.id,
            variantTitle: e.node.merchandise?.title,
            sku: e.node.merchandise?.sku || "",
            price: Number(e.node.merchandise?.price?.amount || 0),
            productTitle: e.node.merchandise?.product?.title || "",
            productHandle: e.node.merchandise?.product?.handle || "",
            imageUrl: e.node.merchandise?.product?.featuredImage?.url || "",
            imageAlt: e.node.merchandise?.product?.featuredImage?.altText || "",
          })) || [],
      });
    } finally {
      setLoadingCart(false);
    }
  }

  async function ensureCartId() {
    if (cartId) {
      try {
        await fetchCart(cartId);
        return cartId;
      } catch {}
    }
    const newId = await createCart();
    setCartId(newId);
    await fetchCart(newId);
    return newId;
  }

  async function cartAddLine(variantId, quantity = 1) {
    const id = await ensureCartId();
    const q = `
      mutation CartLinesAdd($cartId:ID!, $lines:[CartLineInput!]!) {
        cartLinesAdd(cartId:$cartId, lines:$lines) {
          cart { id }
          userErrors { message }
        }
      }
    `;
    const data = await shopifyStorefront(q, {
      cartId: id,
      lines: [{ merchandiseId: variantId, quantity }],
    });
    const err = data?.cartLinesAdd?.userErrors?.[0]?.message;
    if (err) throw new Error(err);
    await fetchCart(id);
  }

  async function cartAddLinesBatch(lines) {
    const id = await ensureCartId();
    const q = `
      mutation CartLinesAdd($cartId:ID!, $lines:[CartLineInput!]!) {
        cartLinesAdd(cartId:$cartId, lines:$lines) {
          cart { id }
          userErrors { message }
        }
      }
    `;
    const data = await shopifyStorefront(q, { cartId: id, lines });
    const err = data?.cartLinesAdd?.userErrors?.[0]?.message;
    if (err) throw new Error(err);
    await fetchCart(id);
  }

  async function cartUpdateLine(lineId, quantity) {
    const id = await ensureCartId();
    const q = `
      mutation CartLinesUpdate($cartId:ID!, $lines:[CartLineUpdateInput!]!) {
        cartLinesUpdate(cartId:$cartId, lines:$lines) {
          cart { id }
          userErrors { message }
        }
      }
    `;
    const data = await shopifyStorefront(q, {
      cartId: id,
      lines: [{ id: lineId, quantity }],
    });
    const err = data?.cartLinesUpdate?.userErrors?.[0]?.message;
    if (err) throw new Error(err);
    await fetchCart(id);
  }

  async function cartRemoveLine(lineId) {
    const id = await ensureCartId();
    const q = `
      mutation CartLinesRemove($cartId:ID!, $lineIds:[ID!]!) {
        cartLinesRemove(cartId:$cartId, lineIds:$lineIds) {
          cart { id }
          userErrors { message }
        }
      }
    `;
    const data = await shopifyStorefront(q, { cartId: id, lineIds: [lineId] });
    const err = data?.cartLinesRemove?.userErrors?.[0]?.message;
    if (err) throw new Error(err);
    await fetchCart(id);
  }

  // Shopify returns prices EXCLUDING VAT
  // Inc VAT = base price + 20%
  // Ex VAT = base price as-is
  function displayPrice(basePrice) {
    const num = parseFloat(basePrice) || 0;
    const inc = num * (1 + VAT_RATE); // Add VAT for Inc VAT display
    const ex = num; // Ex VAT is the raw Shopify price
    return vatMode === "inc" ? formatGBP(inc) : formatGBP(ex);
  }

  function displayCompareAt(compareAtPrice) {
    if (!compareAtPrice) return "";
    const num = parseFloat(compareAtPrice) || 0;
    const inc = num * (1 + VAT_RATE); // Add VAT for Inc VAT display
    const ex = num; // Ex VAT is the raw Shopify price
    return vatMode === "inc" ? formatGBP(inc) : formatGBP(ex);
  }

  function getDisplayedCartTotals() {
    if (!cart) return { subtotal: 0, tax: 0, total: 0 };
    // Shopify prices are Ex-VAT; recalculate based on vatMode
    const lineSubtotal = cart.lines.reduce((sum, l) => sum + parseFloat(l.price || 0) * l.quantity, 0);
    if (vatMode === "inc") {
      // Inc-VAT mode: add VAT to subtotal
      const incSubtotal = lineSubtotal * (1 + VAT_RATE);
      const incTax = lineSubtotal * VAT_RATE;
      return {
        subtotal: incSubtotal,
        tax: incTax,
        total: incSubtotal,
      };
    } else {
      // Ex-VAT mode: show raw prices
      return {
        subtotal: lineSubtotal,
        tax: 0,
        total: lineSubtotal,
      };
    }
  }

  // PRO FEATURES HELPERS

  // Wishlist/Favorites
  function getBulkDiscount(quantity) {
    if (quantity >= 100) return "20%";
    if (quantity >= 50) return "15%";
    if (quantity >= 25) return "10%";
    if (quantity >= 10) return "5%";
    return null;
  }

  function getAverageRating(productId) {
    const reviews = productReviews[productId] || [];
    if (reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
    return (sum / reviews.length).toFixed(1);
  }

  function isFavorited(productId) {
    return favorites.some((p) => p.id === productId);
  }

  function toggleFavorite(product) {
    setFavorites((prev) => {
      const isFav = prev.some((p) => p.id === product.id);
      if (isFav) {
        return prev.filter((p) => p.id !== product.id);
      }
      return [...prev, product];
    });
    const isFav = favorites.some((p) => p.id === product.id);
    setToast(`${isFav ? "Removed from" : "Added to"} ❤️ Favorites`);
  }

  // Bulk pricing calculator
  function getBulkPrice(basePrice, quantity) {
    let discount = 1;
    if (quantity >= 100) discount = bulkPricingTiers["100"];
    else if (quantity >= 50) discount = bulkPricingTiers["50"];
    else if (quantity >= 25) discount = bulkPricingTiers["25"];
    else if (quantity >= 10) discount = bulkPricingTiers["10"];
    return basePrice * discount;
  }

  function getBulkDiscount(quantity) {
    if (quantity >= 100) return 20;
    if (quantity >= 50) return 15;
    if (quantity >= 25) return 10;
    if (quantity >= 10) return 5;
    return 0;
  }

  // Add to recently ordered when order is completed
  function addToRecentlyOrdered(productId, title, price, image) {
    setRecentlyOrdered((prev) => {
      const filtered = prev.filter((p) => p.id !== productId);
      return [{ id: productId, title, price, image, addedAt: Date.now() }, ...filtered].slice(0, 10);
    });
  }

  // Get recently ordered products
  function getRecentlyOrderedDisplay() {
    return recentlyOrdered.slice(0, 5);
  }

  // Related products (smart suggestion)
  function getRelatedProducts(product, allProducts) {
    if (!product) return [];
    return allProducts
      .filter(
        (p) =>
          p.id !== product.id &&
          (p.vendor === product.vendor || p.productType === product.productType)
      )
      .slice(0, 4);
  }

  // Product specs mock (in real app, would fetch from custom fields)
  function getProductSpecs(productId) {
    return productSpecs[productId] || {
      sku: "N/A",
      weight: "N/A",
      dimensions: "N/A",
      material: "N/A",
      warranty: "1 Year",
    };
  }

  // Product reviews mock
  function getProductReviews(productId) {
    return productReviews[productId] || [
      { rating: 5, text: "Excellent product!", author: "John D." },
      { rating: 4, text: "Good quality, fast shipping", author: "Sarah M." },
    ];
  }

  function getAverageRating(productId) {
    const reviews = getProductReviews(productId);
    if (!reviews.length) return 0;
    return (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1);
  }

  // Advanced search & filter
  function filterProducts(products, filters) {
    return products.filter((p) => {
      const price = p.variants?.[0]?.price || 0;
      const matchesPrice = price >= filters.minPrice && price <= filters.maxPrice;
      const matchesVendor = filters.vendors.length === 0 || filters.vendors.includes(p.vendor);
      return matchesPrice && matchesVendor;
    });
  }

  // Get all unique vendors for filter dropdown
  function getAllVendors(products) {
    const vendors = new Set(products.map((p) => p.vendor).filter(Boolean));
    return Array.from(vendors).sort();
  }

  // PDF Invoice generation (mock - would use real PDF library)
  function generatePDFInvoice(order) {
    const invoiceContent = `
      INVOICE - ${order.name}
      Date: ${formatDateTime(order.createdAt)}
      Total: ${formatMoneyV2(order.totalPrice)}
      
      Items:
      ${order.lineItems?.map((item) => `- ${item.name} (${item.quantity}x)`).join("\n")}
      
      Thank you for your business!
    `;
    setToast("Invoice PDF ready to download");
    // In real app: download blob or open in new tab
  }

  // Quick reorder from order history
  async function quickReorderFromOrder(order) {
    try {
      await ensureCartId();
      let failedItems = 0;

      for (const lineItem of order.lineItems || []) {
        const variantId = lineItem.variantId;
        if (variantId) {
          try {
            await cartAddLine(variantId, lineItem.quantity);
          } catch {
            failedItems++;
          }
        }
      }

      if (failedItems === 0) {
        setToast(`✓ Order re-added to cart (${order.lineItems?.length || 0} items)`);
      } else {
        setToast(`${order.lineItems?.length - failedItems} items added (${failedItems} out of stock)`);
      }
      setView("cart");
    } catch (e) {
      setError(String(e?.message || e));
    }
  }

  // Add to comparison
  function toggleCompare(product) {
    setCompareProducts((prev) => {
      if (prev.find((p) => p.id === product.id)) {
        return prev.filter((p) => p.id !== product.id);
      }
      return [...prev.slice(-2), product]; // Keep max 3
    });
    setToast(`${compareProducts.find((p) => p.id === product.id) ? "Removed from" : "Added to"} comparison`);
  }

  // Quick reorder from last order
  async function populateRecentlyOrdered() {
    try {
      if (orders.length === 0) return;
      const lastOrder = orders[0];
      const items = lastOrder?.lineItems?.nodes || [];
      const recentItems = items.slice(0, 4).map((li) => ({
        name: li.name || "Item",
        sku: li.sku || null,
        quantity: li.quantity || 1,
        variantId: li.variantId,
      }));
      setRecentlyOrdered(recentItems);
    } catch (e) {
      console.error("Error loading recently ordered:", e);
    }
  }

  function addRecentlyOrderedToCart(item) {
    try {
      if (item?.variantId) {
        ensureCartId();
        cartAddLine(item.variantId, item.quantity || 1);
        setToast(`✓ Added ${item.name} to cart`);
      }
    } catch (e) {
      setError(String(e?.message || e));
    }
  }

  function getProductReviews(productId) {
    return productReviews[productId] || [];
  }

  function addProductReview(productId, rating, comment = "") {
    setProductReviews((prev) => ({
      ...prev,
      [productId]: [
        ...(prev[productId] || []),
        {
          id: `review-${Date.now()}`,
          rating: Math.min(5, Math.max(1, rating)),
          comment,
          createdAt: new Date().toISOString(),
          author: "You",
        },
      ],
    }));
    setToast("✓ Review added!");
  }

  async function startLogin() {
    setError("");

    // ✅ Web cannot do Shopify Customer Accounts token exchange due to CORS
    if (!isNative) {
      setToast("Login works in the Android app (not on localhost)");
      setView("account");
      return;
    }

    try {
      deepLinkHandledRef.current = false;

      const oidcJson = oidc || (await fetchJson(OIDC_CONFIG_URL));
      const custJson = custApi || (await fetchJson(CUSTOMER_ACCOUNT_API_DISCOVERY_URL));
      if (!oidc) setOidc(oidcJson);
      if (!custApi) setCustApi(custJson);

      const verifier = randomString(64);
      const challenge = await sha256Base64Url(verifier);
      const state = randomString(24);
      const nonce = randomString(24);

      await Preferences.set({
        key: K.PKCE,
        value: JSON.stringify({ verifier, state, nonce, redirect: REDIRECT_URI, created_at: Date.now() }),
      });

      const authUrl =
        `${oidcJson.authorization_endpoint}?` +
        toQuery({
          client_id: CUSTOMER_ACCOUNTS_CLIENT_ID,
          response_type: "code",
          redirect_uri: REDIRECT_URI,
          scope: "openid email customer-account-api:full",
          state,
          nonce,
          code_challenge: challenge,
          code_challenge_method: "S256",
        });

      await Browser.open({ url: authUrl, presentationStyle: "fullscreen" });
    } catch (e) {
      setError(String(e?.message || e));
    }
  }

  async function handleOAuthCallback({ code, state }) {
    const pkce = await Preferences.get({ key: K.PKCE });
    const pkceObj = pkce?.value ? safeJsonParse(pkce.value) : null;
    if (!pkceObj?.verifier) throw new Error("Missing PKCE verifier (login session expired)");
    if (pkceObj.state && state && pkceObj.state !== state) throw new Error("State mismatch (possible stale login)");

    const oidcJson = oidc || (await fetchJson(OIDC_CONFIG_URL));
    if (!oidc) setOidc(oidcJson);

    let tokenEndpoint = oidcJson.token_endpoint;
    if (Capacitor.isNativePlatform() && !tokenEndpoint.startsWith("http")) {
      // Use absolute URL for native
      tokenEndpoint = `https://${SHOP_DOMAIN}/account/oauth/token`;
    }
    const tokenJson = await httpPostForm(tokenEndpoint, {
      grant_type: "authorization_code",
      client_id: CUSTOMER_ACCOUNTS_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code,
      code_verifier: pkceObj.verifier,
    });

    const access_token = tokenJson.access_token;
    const id_token = tokenJson.id_token;
    const refresh_token = tokenJson.refresh_token;
    const expires_in = Number(tokenJson.expires_in || 3600);
    if (!access_token) throw new Error("Token exchange failed (missing access_token)");

    const expires_at = Date.now() + expires_in * 1000;

    const authObj = { access_token, id_token, refresh_token, expires_at };
    setAuth(authObj);
    await Preferences.set({ key: K.AUTH, value: JSON.stringify(authObj) });
    await Preferences.remove({ key: K.PKCE });

    const payload = decodeJwt(id_token);
    const email = payload?.email || payload?.email_address || payload?.preferred_username || "";
    if (email) setUserEmail(email);

    await loadCustomerProfile(access_token);

    setToast("Logged in");
    setView("home");
  }

  async function logout() {
    setAuth(null);
    setUserEmail("");
    setUserName("");
    setIsNonVatCustomer(false);
    setVatMode("inc"); // Reset VAT mode on logout
    setVatFormSubmitted(false); // Reset VAT form state on logout
    setCompanyAccount(null); // Reset company account
    setOrders([]);
    setActiveOrder(null);
    await Preferences.remove({ key: K.AUTH });
    await Preferences.remove({ key: K.PROFILE });
    await Preferences.remove({ key: K.ORDERS_CACHE });
    setToast("Logged out");
  }

  const filteredCollections = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    if (!q) return collections;
    return collections.filter((c) => c.title.toLowerCase().includes(q) || c.handle.toLowerCase().includes(q));
  }, [collections, search]);

  const filteredProducts = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    let result = collectionProducts;

    // Text search
    if (q) {
      result = result.filter((p) => {
        const hay = `${p.title} ${p.vendor} ${p.productType}`.toLowerCase();
        return hay.includes(q);
      });
    }

    // Price filter
    if (searchFilters.minPrice > 0 || searchFilters.maxPrice < 999) {
      result = result.filter((p) => {
        const v = p.variants?.[0];
        const price = v?.price ? parseFloat(v.price) : 0;
        return price >= searchFilters.minPrice && price <= searchFilters.maxPrice;
      });
    }

    // Vendor filter
    if (searchFilters.vendors.length > 0) {
      result = result.filter((p) => searchFilters.vendors.includes(p.vendor));
    }

    return result;
  }, [collectionProducts, search, searchFilters]);

  async function openCollection(c) {
    setSearch("");
    setView("collection");
    await loadProductsForCollection(c.handle);
  }

  function openProduct(p) {
    setActiveProduct(p);
    setView("product");
  }

  async function reorderFromOrder(order) {
    try {
      if (!order) return;
      const items = order?.lineItems?.nodes || [];
      const lines = items
        .map((li) => ({
          merchandiseId: li.variantId,
          quantity: clamp(Number(li.quantity || 1), 1, 999),
        }))
        .filter((x) => !!x.merchandiseId);

      if (!lines.length) {
        setToast("Nothing to reorder (no variant IDs found)");
        return;
      }

      await cartAddLinesBatch(lines);
      setToast("Added previous order to cart");
      setView("cart");
    } catch (e) {
      setError(String(e?.message || e));
    }
  }

  // ====== LAYOUT ======
  const layout = {
    minHeight: "100vh",
    background: BRAND.bg,
    backgroundImage: "radial-gradient(ellipse at top center, rgba(239,68,68,0.04) 0%, transparent 60%)",
    color: BRAND.text,
    display: "flex",
    justifyContent: "center",
    overflowX: "hidden",
  };

  const shell = {
    width: "100%",
    maxWidth: 800,
    paddingTop: 12,
    paddingBottom: "calc(80px + env(safe-area-inset-bottom))",
    paddingLeft: "calc(12px + env(safe-area-inset-left))",
    paddingRight: "calc(12px + env(safe-area-inset-right))",
    overflowX: "hidden",
  };

  const topbar = {
    position: "sticky",
    top: 0,
    zIndex: 100,
    background: BRAND.glassHeavy,
    backdropFilter: "blur(20px) saturate(180%)",
    WebkitBackdropFilter: "blur(20px) saturate(180%)",
    borderBottom: `1px solid ${BRAND.glassBorder}`,
    padding: "14px 0",
    marginBottom: 16,
    marginLeft: -12,
    marginRight: -12,
    paddingLeft: 12,
    paddingRight: 12,
  };

  const card = {
    background: "rgba(255,255,255,0.02)",
    border: `1px solid ${BRAND.cardBorder}`,
    borderRadius: 20,
    padding: 16,
    boxShadow: BRAND.shadowMd,
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  };

  const grid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: 12,
  };

  const searchRow = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: 10,
    alignItems: "center",
    width: "100%",
  };

  const bottomNav = {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    background: "linear-gradient(180deg, rgba(15,15,15,0.97) 0%, rgba(8,8,8,0.99) 100%)",
    backdropFilter: "blur(24px) saturate(200%)",
    WebkitBackdropFilter: "blur(24px) saturate(200%)",
    borderTop: "1px solid rgba(255,255,255,0.08)",
    paddingTop: 10,
    paddingBottom: "calc(10px + env(safe-area-inset-bottom))",
    paddingLeft: "calc(8px + env(safe-area-inset-left))",
    paddingRight: "calc(8px + env(safe-area-inset-right))",
    display: "flex",
    justifyContent: "center",
    transform: "translateZ(0)",
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
    boxShadow: "0 -8px 32px rgba(0,0,0,0.4), 0 -1px 0 rgba(239,68,68,0.1) inset",
    animation: "navGlow 4s ease-in-out infinite",
  };

  const navInner = {
    width: "100%",
    maxWidth: 600,
    display: "flex",
    gap: 6,
    justifyContent: "space-around",
    alignItems: "center",
    padding: "0 4px",
  };

  const navBtn = (active) => ({
    flex: "1 1 0",
    minWidth: 0,
    maxWidth: 72,
    height: 56,
    padding: "8px 4px",
    borderRadius: 16,
    background: active 
      ? `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.secondary})`
      : "rgba(255,255,255,0.03)",
    border: active ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(255,255,255,0.04)",
    color: active ? "#fff" : BRAND.mutedLight,
    fontWeight: 700,
    fontSize: 10,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    lineHeight: 1.1,
    overflow: "hidden",
    transition: "all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
    boxShadow: active 
      ? "0 8px 24px rgba(239,68,68,0.4), 0 0 1px rgba(255,255,255,0.2) inset" 
      : "0 2px 8px rgba(0,0,0,0.2)",
    position: "relative",
  });

  const cartCount = cart?.totalQuantity || 0;

  const userLine = useMemo(() => {
    const name = (userName || "").trim();
    const email = (userEmail || "").trim();
    if (name && email) return `${name} • ${email}`;
    if (name) return name;
    if (email) return email;
    return "";
  }, [userName, userEmail]);

  const GLOBAL_CSS = `
    /* ====== ULTRA PREMIUM ANIMATIONS ====== */
    @keyframes shimmer { 
      0% { background-position: -1000px 0; } 
      100% { background-position: 1000px 0; } 
    }
    @keyframes viewIn { 
      from { opacity: 0; transform: translateY(16px) scale(0.96); } 
      to { opacity: 1; transform: translateY(0) scale(1); } 
    }
    @keyframes cardSlideIn { 
      from { opacity: 0; transform: translateY(30px) scale(0.92); } 
      to { opacity: 1; transform: translateY(0) scale(1); } 
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    @keyframes slideInLeft { from { opacity: 0; transform: translateX(-30px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes slideInRight { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes gradientShift { 
      0% { background-position: 0% 50%; } 
      50% { background-position: 100% 50%; } 
      100% { background-position: 0% 50%; } 
    }
    @keyframes glow {
      0%, 100% { box-shadow: 0 0 20px rgba(239,68,68,0.3), 0 0 40px rgba(239,68,68,0.1); }
      50% { box-shadow: 0 0 40px rgba(239,68,68,0.5), 0 0 80px rgba(239,68,68,0.2); }
    }
    @keyframes float {
      0%, 100% { transform: translateY(0) rotate(0deg); }
      25% { transform: translateY(-6px) rotate(1deg); }
      75% { transform: translateY(-3px) rotate(-1deg); }
    }
    @keyframes scaleIn {
      from { opacity: 0; transform: scale(0.85); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes ripple {
      to { transform: scale(4); opacity: 0; }
    }
    @keyframes borderGlow {
      0%, 100% { border-color: rgba(239,68,68,0.2); box-shadow: 0 0 20px rgba(239,68,68,0.1); }
      50% { border-color: rgba(239,68,68,0.5); box-shadow: 0 0 30px rgba(239,68,68,0.2); }
    }
    @keyframes logoReveal {
      0% { opacity: 0; transform: scale(0.5) rotate(-10deg); filter: blur(10px); }
      50% { opacity: 1; transform: scale(1.1) rotate(2deg); filter: blur(0); }
      100% { opacity: 1; transform: scale(1) rotate(0deg); filter: blur(0); }
    }
    @keyframes textReveal {
      0% { opacity: 0; transform: translateY(20px); letter-spacing: 0.3em; }
      100% { opacity: 1; transform: translateY(0); letter-spacing: 0.05em; }
    }
    @keyframes particleFloat {
      0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.6; }
      25% { transform: translate(10px, -20px) scale(1.2); opacity: 0.8; }
      50% { transform: translate(-5px, -40px) scale(0.8); opacity: 0.4; }
      75% { transform: translate(-15px, -20px) scale(1.1); opacity: 0.7; }
    }
    @keyframes shimmerPremium {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    @keyframes pulseRing {
      0% { transform: scale(0.9); opacity: 1; }
      100% { transform: scale(1.8); opacity: 0; }
    }
    @keyframes slideInUp {
      from { opacity: 0; transform: translateY(60px) scale(0.9); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes navGlow {
      0%, 100% { box-shadow: 0 -4px 30px rgba(239,68,68,0.15); }
      50% { box-shadow: 0 -4px 40px rgba(239,68,68,0.25); }
    }
    @keyframes shine {
      0% { left: -100%; }
      100% { left: 200%; }
    }

    /* ====== BASE STYLES - ULTRA PREMIUM ====== */
    html, body, #root {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      background: ${BRAND.bg};
      background-image: 
        radial-gradient(ellipse at top center, rgba(239,68,68,0.06) 0%, transparent 50%),
        radial-gradient(ellipse at bottom right, rgba(139,92,246,0.04) 0%, transparent 40%),
        radial-gradient(ellipse at bottom left, rgba(249,115,22,0.03) 0%, transparent 40%);
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    body {
      overscroll-behavior: none;
      touch-action: pan-y;
      -webkit-overflow-scrolling: touch;
    }

    * {
      box-sizing: border-box;
      font-family: 'SF Pro Display', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      -webkit-tap-highlight-color: transparent;
    }

    input, button, select { 
      outline: none; 
      font-family: inherit;
    }
    
    ::selection { 
      background: rgba(239,68,68,0.4); 
      color: #fff;
    }

    /* ====== PREMIUM SCROLLBAR ====== */
    ::-webkit-scrollbar {
      width: 5px;
      height: 5px;
    }
    ::-webkit-scrollbar-track {
      background: rgba(255,255,255,0.02);
      border-radius: 10px;
    }
    ::-webkit-scrollbar-thumb {
      background: linear-gradient(180deg, rgba(239,68,68,0.4), rgba(249,115,22,0.3));
      border-radius: 10px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: linear-gradient(180deg, rgba(239,68,68,0.6), rgba(249,115,22,0.5));
    }

    /* ====== PREMIUM UTILITY CLASSES ====== */
    .skeleton-shimmer {
      background: linear-gradient(90deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.02) 100%);
      background-size: 1000px 100%;
      animation: shimmer 1.5s infinite;
    }

    .btn-loading {
      pointer-events: none;
      opacity: 0.85;
    }

    .btn-loading::after {
      content: '';
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255,255,255,0.2);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
      margin-left: 8px;
    }

    .card-hover {
      transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      position: relative;
      overflow: hidden;
    }
    
    .card-hover::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 50%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent);
      transition: left 0.5s ease;
      pointer-events: none;
    }

    .card-hover:active {
      transform: scale(0.96);
    }
    
    .card-hover:active::before {
      left: 200%;
    }

    .price-transition {
      transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    }

    a { 
      color: inherit; 
      text-decoration: none;
    }

    .view-anim {
      animation: viewIn 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
      will-change: transform, opacity;
    }

    /* ====== PREMIUM GLASS MORPHISM ====== */
    .glass-card {
      background: rgba(255,255,255,0.03);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 24px;
      position: relative;
      overflow: hidden;
    }
    
    .glass-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
    }

    /* ====== PREMIUM INPUT STYLING ====== */
    .premium-input {
      width: 100%;
      padding: 14px 18px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      color: #fff;
      font-size: 15px;
      font-weight: 500;
      transition: all 0.25s ease;
      position: relative;
    }
    
    .premium-input:focus {
      background: rgba(255,255,255,0.05);
      border-color: rgba(239,68,68,0.5);
      box-shadow: 0 0 0 4px rgba(239,68,68,0.1), 0 8px 32px rgba(0,0,0,0.3);
    }
    
    .premium-input::placeholder {
      color: rgba(255,255,255,0.3);
    }

    /* ====== PREMIUM BUTTON GLOW ====== */
    .btn-glow {
      position: relative;
      overflow: hidden;
    }
    
    .btn-glow::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 0;
      height: 0;
      background: rgba(255,255,255,0.2);
      border-radius: 50%;
      transform: translate(-50%, -50%);
      transition: width 0.4s ease, height 0.4s ease;
    }
    
    .btn-glow:active::after {
      width: 300%;
      height: 300%;
    }

    /* ====== RESPONSIVE - FOLD PHONES ====== */
    @media (max-width: 320px) {
      .search-row { grid-template-columns: 1fr !important; }
      .top-cart-btn { width: 100% !important; }
      .topbar-actions { flex-direction: column !important; gap: 6px !important; }
      .nav-label { display: none !important; }
    }
    
    @media (max-width: 380px) {
      .search-row { grid-template-columns: 1fr; }
      .top-cart-btn { width: 100% !important; }
      .vat-toggle { min-width: 160px !important; }
    }
    
    @media (min-width: 768px) {
      .nav-btn-desktop {
        min-width: 90px !important;
        max-width: 120px !important;
      }
    }
  `;

  if (!booted) {
    return (
      <div style={layout}>
        <style>{GLOBAL_CSS}</style>
        <div style={{
          ...shell,
          background: `linear-gradient(180deg, ${BRAND.bg} 0%, #050505 100%)`,
          position: "relative",
          overflow: "hidden",
        }}>
          {/* ====== ULTRA PREMIUM LOADING SCREEN ====== */}
          
          {/* Animated Background Particles */}
          <div style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            overflow: "hidden",
            pointerEvents: "none",
          }}>
            {[...Array(12)].map((_, i) => (
              <div key={i} style={{
                position: "absolute",
                width: 4 + (i % 3) * 2,
                height: 4 + (i % 3) * 2,
                borderRadius: "50%",
                background: i % 2 === 0 
                  ? `rgba(239,68,68,${0.15 + (i % 3) * 0.1})` 
                  : `rgba(249,115,22,${0.1 + (i % 3) * 0.1})`,
                left: `${10 + (i * 7)}%`,
                top: `${15 + (i * 6)}%`,
                animation: `particleFloat ${3 + (i % 3)}s ease-in-out infinite`,
                animationDelay: `${i * 0.2}s`,
                boxShadow: i % 2 === 0 
                  ? "0 0 15px rgba(239,68,68,0.4)" 
                  : "0 0 12px rgba(249,115,22,0.3)",
              }} />
            ))}
          </div>

          {/* Radial Glow Behind Logo */}
          <div style={{
            position: "absolute",
            top: "30%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 300,
            height: 300,
            borderRadius: "50%",
            background: `radial-gradient(circle, rgba(239,68,68,0.15) 0%, transparent 70%)`,
            animation: "pulseRing 3s ease-in-out infinite",
            pointerEvents: "none",
          }} />

          <div style={{ 
            display: "flex", 
            flexDirection: "column", 
            alignItems: "center", 
            justifyContent: "center",
            minHeight: "70vh",
            gap: 32,
            position: "relative",
            zIndex: 1,
          }}>
            {/* Premium Logo Container with Glow Ring */}
            <div style={{
              position: "relative",
              animation: "logoReveal 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
            }}>
              {/* Outer Glow Ring */}
              <div style={{
                position: "absolute",
                top: -12,
                left: -12,
                right: -12,
                bottom: -12,
                borderRadius: 36,
                border: "2px solid rgba(239,68,68,0.2)",
                animation: "borderGlow 2s ease-in-out infinite",
              }} />
              
              {/* Inner Container */}
              <div style={{
                width: 120,
                height: 120,
                borderRadius: 28,
                background: `linear-gradient(145deg, rgba(239,68,68,0.12), rgba(249,115,22,0.08))`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `
                  0 24px 64px rgba(239,68,68,0.25),
                  0 0 100px rgba(239,68,68,0.15),
                  inset 0 1px 1px rgba(255,255,255,0.1)
                `,
                padding: 18,
                border: `1px solid rgba(239,68,68,0.25)`,
                position: "relative",
                overflow: "hidden",
              }}>
                {/* Shine Effect */}
                <div style={{
                  position: "absolute",
                  top: 0,
                  left: "-100%",
                  width: "60%",
                  height: "100%",
                  background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)",
                  animation: "shine 2.5s ease-in-out infinite",
                  animationDelay: "0.5s",
                }} />
                
                <img 
                  src="/logo.png" 
                  alt="Ace Fixings" 
                  style={{ 
                    width: "100%", 
                    height: "100%", 
                    objectFit: "contain",
                    filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.5))",
                    animation: "float 3s ease-in-out infinite",
                  }}
                />
              </div>
            </div>
            
            {/* Brand Name with Premium Typography */}
            <div style={{ 
              textAlign: "center",
              animation: "textReveal 0.8s ease-out forwards",
              animationDelay: "0.3s",
              opacity: 0,
            }}>
              <div style={{
                fontSize: 32,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                background: `linear-gradient(135deg, #ffffff 0%, ${BRAND.mutedLight} 50%, ${BRAND.primary}50 100%)`,
                backgroundSize: "200% 200%",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                marginBottom: 12,
                animation: "gradientShift 4s ease infinite",
                textShadow: "0 0 40px rgba(239,68,68,0.3)",
              }}>
                {BRAND.name}
              </div>
              <div style={{ 
                fontSize: 13, 
                color: BRAND.muted,
                fontWeight: 500,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                opacity: 0.7,
              }}>
                Premium Fixings & Hardware
              </div>
            </div>
            
            {/* Premium Loading Indicator */}
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              animation: "slideInUp 0.6s ease-out forwards",
              animationDelay: "0.6s",
              opacity: 0,
            }}>
              {/* Spinner with Glow */}
              <div style={{ position: "relative" }}>
                <div style={{
                  position: "absolute",
                  top: -4,
                  left: -4,
                  right: -4,
                  bottom: -4,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(239,68,68,0.2), transparent 70%)",
                  animation: "pulse 1.5s ease-in-out infinite",
                }} />
                <div style={{
                  width: 36,
                  height: 36,
                  border: "3px solid rgba(255,255,255,0.05)",
                  borderTopColor: BRAND.primary,
                  borderRightColor: "rgba(249,115,22,0.6)",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                  boxShadow: "0 0 20px rgba(239,68,68,0.3)",
                }} />
              </div>
              
              <div style={{ 
                fontSize: 13, 
                color: BRAND.muted,
                fontWeight: 500,
                letterSpacing: "0.05em",
              }}>
                Loading your experience...
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={layout}>
      <style>{GLOBAL_CSS}</style>

      <div style={shell}>
        <div style={{
          ...topbar,
          background: "linear-gradient(180deg, rgba(15,15,15,0.98) 0%, rgba(10,10,10,0.95) 100%)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 1px rgba(255,255,255,0.1) inset",
        }}>
          {/* Header Row */}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
            {/* Premium Logo with Glow */}
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              overflow: "hidden",
              flexShrink: 0,
              background: "linear-gradient(135deg, rgba(239,68,68,0.15), rgba(249,115,22,0.1))",
              border: "1px solid rgba(239,68,68,0.25)",
              boxShadow: "0 8px 24px rgba(239,68,68,0.2), 0 0 1px rgba(255,255,255,0.1) inset",
              padding: 4,
              position: "relative",
            }}>
              <div style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: "50%",
                background: "linear-gradient(180deg, rgba(255,255,255,0.1), transparent)",
                borderRadius: "14px 14px 0 0",
                pointerEvents: "none",
              }} />
              <img 
                src="/logo.png" 
                alt="Ace Fixings" 
                style={{ 
                  width: "100%", 
                  height: "100%", 
                  objectFit: "contain",
                  filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))",
                }}
              />
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
              <div style={{ 
                fontSize: 19, 
                fontWeight: 800, 
                letterSpacing: "-0.02em",
                background: `linear-gradient(135deg, #ffffff 0%, #e0e0e0 50%, ${BRAND.primary}80 100%)`,
                backgroundSize: "200% 200%",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                animation: "gradientShift 6s ease infinite",
              }}>
                {BRAND.name}
              </div>
              <div style={{ 
                fontSize: 10, 
                marginTop: 3,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                background: `linear-gradient(90deg, ${BRAND.primary}, ${BRAND.secondary})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}>
                Deal Me An Ace
              </div>
            </div>

            <div className="vat-toggle" style={{ flexShrink: 0 }}>
              <VatToggle mode={vatMode} onChange={setVatMode} />
            </div>
          </div>

          {/* Premium Search Row */}
          <div className="search-row" style={searchRow}>
            <div style={{ position: "relative", width: "100%", minWidth: 0 }}>
              <span style={{ 
                position: "absolute", 
                left: 16, 
                top: "50%", 
                transform: "translateY(-50%)", 
                fontSize: 15,
                opacity: 0.35,
                pointerEvents: "none",
              }}>
                🔍
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={view === "home" ? "Search collections…" : "Search products…"}
                className="premium-input"
                style={{
                  paddingLeft: 44,
                  paddingRight: 16,
                  height: 50,
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.2), inset 0 1px 1px rgba(255,255,255,0.03)",
                }}
              />
            </div>
            <Button
              className="top-cart-btn btn-glow"
              variant="dark"
              size="sm"
              onClick={async () => {
                try {
                  await ensureCartId();
                  setView("cart");
                } catch (e) {
                  setError(String(e?.message || e));
                }
              }}
              title="Open cart"
              style={{ 
                height: 50, 
                minWidth: 95, 
                justifyContent: "center", 
                gap: 8,
                borderRadius: 16,
                background: cartCount > 0 
                  ? `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.secondary})`
                  : "rgba(255,255,255,0.05)",
                boxShadow: cartCount > 0 
                  ? `0 8px 24px ${BRAND.primaryGlow}, 0 0 1px rgba(255,255,255,0.2) inset` 
                  : "0 4px 12px rgba(0,0,0,0.2), inset 0 1px 1px rgba(255,255,255,0.03)",
                border: cartCount > 0 
                  ? "1px solid rgba(255,255,255,0.1)" 
                  : "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 14 }}>🛒</span>
              <Badge variant={cartCount > 0 ? "primary" : "default"}>{cartCount}</Badge>
            </Button>
          </div>

          {error ? (
            <div
              style={{
                marginTop: 14,
                background: "linear-gradient(135deg, rgba(220,38,38,0.12), rgba(220,38,38,0.08))",
                border: "1px solid rgba(220,38,38,0.3)",
                color: "#fca5a5",
                padding: 14,
                borderRadius: 16,
                animation: "scaleIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
                boxShadow: "0 4px 20px rgba(220,38,38,0.15)",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                ⚠️ Error
              </div>
              <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.5 }}>{error}</div>
            </div>
          ) : null}

          {!isNative ? (
            <div
              style={{
                marginTop: 14,
                background: "linear-gradient(135deg, rgba(59,130,246,0.1), rgba(99,102,241,0.08))",
                border: "1px solid rgba(59,130,246,0.25)",
                color: "#93c5fd",
                padding: 12,
                borderRadius: 16,
                boxShadow: "0 4px 16px rgba(59,130,246,0.1)",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 13 }}>Web preview mode</div>
              <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4, lineHeight: 1.4 }}>
                Browsing/cart works here. Login/Orders require the Android app because Shopify Customer Accounts blocks localhost CORS.
              </div>
            </div>
          ) : null}
        </div>

        <div className="view-anim">
          {view === "home" && (
            <div>
              {/* Recently Ordered Section */}
              {auth && orders.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ fontSize: 14, color: BRAND.muted, fontWeight: 800 }}>Quick reorder from last order</div>
                    <Button
                      variant="ghost"
                      onClick={() => populateRecentlyOrdered()}
                      style={{ fontSize: 11 }}
                      icon="↻"
                    >
                      Load
                    </Button>
                  </div>

                  {recentlyOrdered.length > 0 ? (
                    <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8, scrollBehavior: "smooth" }}>
                      {recentlyOrdered.map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            flex: "0 0 140px",
                            padding: 12,
                            borderRadius: 14,
                            border: "1px solid #1f1f1f",
                            background: "#0f0f0f",
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                            animation: `cardSlideIn 0.4s ease ${idx * 60}ms backwards`,
                          }}
                        >
                          <div style={{ fontSize: 11, fontWeight: 1000, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {item.name}
                          </div>
                          {item.sku && (
                            <div style={{ fontSize: 9, color: BRAND.muted, fontWeight: 800 }}>SKU: {item.sku}</div>
                          )}
                          <Badge style={{ alignSelf: "flex-start", fontSize: 10 }}>Qty: {item.quantity}</Badge>
                          <Button
                            variant="dark"
                            onClick={() => addRecentlyOrderedToCart(item)}
                            style={{ fontSize: 10, marginTop: "auto" }}
                            icon="→"
                          >
                            Quick add
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Button variant="dark" onClick={() => populateRecentlyOrdered()} style={{ width: "100%", fontSize: 12 }}>
                      Load recently ordered items
                    </Button>
                  )}

                  <div style={{ height: 16 }} />
                </div>
              )}

              {/* TAX EXEMPT STATUS ON HOME */}
              {companyAccount && companyAccount.reverseCharge && (
                <div style={{ padding: 12, background: "linear-gradient(135deg, #1a2a1a 0%, #0f1a1a 100%)", border: "1px solid #2d5a2d", borderRadius: 14, marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 1000, color: "#7cff7c" }}>🇮🇪 Tax Exempt</div>
                    <Badge style={{ background: "#2d5a2d", color: "#7cff7c", fontSize: 10 }}>Ex-VAT Pricing</Badge>
                  </div>
                  <div style={{ fontSize: 11, color: "#a0d9a0", marginBottom: 10, lineHeight: 1.4 }}>
                    Your account is verified as tax exempt. All prices below are excluding VAT.
                  </div>
                  <Button 
                    variant="ghost"
                    onClick={() => setView("account")}
                    style={{ width: "100%", marginTop: 8, fontSize: 11 }}
                    icon="⚙️"
                  >
                    Account Details
                  </Button>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 14, color: BRAND.muted, fontWeight: 800 }}>Collections ({filteredCollections.length})</div>
                <Button variant="ghost" onClick={loadCollections}>
                  ↻ Refresh
                </Button>
              </div>

              {loadingCollections ? (
                <div style={grid}>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} style={{ ...card, animation: `cardSlideIn 0.4s ease ${i * 50}ms backwards` }}>
                      <Skeleton h={120} r={16} />
                      <div style={{ height: 10 }} />
                      <Skeleton h={14} w={"80%"} />
                      <div style={{ height: 8 }} />
                      <Skeleton h={12} w={"55%"} />
                    </div>
                  ))}
                </div>
              ) : filteredCollections.length === 0 ? (
                <EmptyState icon="📁" title="No Collections" description="Browse our catalog to get started." />
              ) : (
                <div style={grid}>
                  {filteredCollections.map((c, idx) => (
                    <div
                      key={c.id}
                      className="card-hover"
                      style={{
                        ...card,
                        cursor: "pointer",
                        animation: `cardSlideIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) ${idx * 50}ms backwards`,
                        transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
                        background: "linear-gradient(145deg, rgba(20,20,20,0.9), rgba(10,10,10,0.95))",
                        border: "1px solid rgba(255,255,255,0.06)",
                        boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
                      }}
                      onClick={() => openCollection(c)}
                      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
                      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                      role="button"
                    >
                      <div
                        style={{
                          height: 130,
                          borderRadius: 18,
                          background: "linear-gradient(135deg, #080808, #0c0c0c)",
                          border: "1px solid rgba(255,255,255,0.05)",
                          overflow: "hidden",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          position: "relative",
                          boxShadow: "inset 0 2px 4px rgba(0,0,0,0.3)",
                        }}
                      >
                        {c.imageUrl && (
                          <div style={{ 
                            position: "absolute", 
                            inset: 0, 
                            background: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.5) 70%, rgba(0,0,0,0.7) 100%)", 
                            zIndex: 1,
                          }} />
                        )}
                        {c.imageUrl ? (
                          <img src={c.imageUrl} alt={c.imageAlt} style={{ 
                            width: "100%", 
                            height: "100%", 
                            objectFit: "cover",
                            transition: "transform 0.4s ease",
                          }} />
                        ) : (
                          <div style={{ 
                            color: BRAND.muted, 
                            fontWeight: 900, 
                            fontSize: 32,
                            opacity: 0.5,
                          }}>📦</div>
                        )}
                        {/* Premium shine overlay */}
                        <div style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          height: "40%",
                          background: "linear-gradient(180deg, rgba(255,255,255,0.06), transparent)",
                          zIndex: 2,
                          pointerEvents: "none",
                        }} />
                      </div>

                      <div style={{ height: 12 }} />
                      <div style={{ 
                        fontWeight: 800, 
                        fontSize: 15,
                        background: "linear-gradient(135deg, #ffffff, rgba(255,255,255,0.85))",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                      }}>{c.title}</div>
                      <div style={{ 
                        fontSize: 11, 
                        color: BRAND.muted, 
                        marginTop: 6,
                        fontWeight: 600,
                        letterSpacing: "0.02em",
                      }}>{c.handle}</div>

                      <div style={{ height: 14 }} />
                      <Button variant="dark" onClick={(e) => { e.stopPropagation(); openCollection(c); }} style={{ 
                        width: "100%", 
                        fontSize: 12,
                        background: "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
                        border: "1px solid rgba(255,255,255,0.08)",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                      }} icon="→">
                        Browse
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === "collection" && (
            <div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 1000 }}>{activeCollection?.title || "Collection"}</div>
                  <div style={{ fontSize: 12, color: BRAND.muted, fontWeight: 800 }}>
                    Products ({filteredProducts.length}) • {vatLabel}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <Button
                    variant="ghost"
                    onClick={() => setShowFilters(true)}
                    title="Advanced filters"
                    icon="⚙️"
                    style={{ fontSize: 12 }}
                  >
                    Filter
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setView("home");
                      setActiveCollection(null);
                      setCollectionProducts([]);
                      setSearch("");
                    }}
                  >
                    Back
                  </Button>
                </div>
              </div>

              {activeCollection?.descriptionHtml ? (
                <div 
                  style={{ 
                    ...card, 
                    marginBottom: 12, 
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                  onClick={() => setDescExpanded(!descExpanded)}
                >
                  <div style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center",
                    marginBottom: descExpanded ? 10 : 0,
                  }}>
                    <span style={{ 
                      fontSize: 12, 
                      fontWeight: 700, 
                      color: BRAND.muted,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}>
                      {descExpanded ? "Hide Description" : "View Description"}
                    </span>
                    <span style={{ 
                      fontSize: 16, 
                      color: BRAND.primary,
                      transform: descExpanded ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.2s ease",
                    }}>
                      ▼
                    </span>
                  </div>
                  {descExpanded && (
                    <div 
                      style={{ 
                        fontSize: 13, 
                        color: "#e5e5e5", 
                        lineHeight: 1.6,
                        animation: "fadeIn 0.3s ease",
                      }} 
                      dangerouslySetInnerHTML={{ __html: activeCollection.descriptionHtml }} 
                    />
                  )}
                </div>
              ) : null}

              {loadingCollectionProducts ? (
                <div style={grid}>
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} style={{ ...card, animation: `cardSlideIn 0.4s ease ${i * 40}ms backwards` }}>
                      <Skeleton h={120} r={16} />
                      <div style={{ height: 10 }} />
                      <Skeleton h={14} w={"85%"} />
                      <div style={{ height: 8 }} />
                      <Skeleton h={12} w={"55%"} />
                      <div style={{ height: 12 }} />
                      <Skeleton h={40} r={14} />
                    </div>
                  ))}
                </div>
              ) : filteredProducts.length === 0 ? (
                <EmptyState
                  icon="🔍"
                  title="No Products Found"
                  description="Try adjusting your search or browse other collections."
                  action={() => { setSearch(""); setView("home"); }}
                  actionLabel="Browse Collections"
                />
              ) : (
                <div style={grid}>
                  {filteredProducts.map((p, idx) => {
                    const v = p.variants?.[0];
                    const price = v ? displayPrice(v.price) : "£—";
                    const compare = v?.compareAtPrice ? displayCompareAt(v.compareAtPrice) : "";
                    const isFav = isFavorited(p.id);
                    const isComparing = compareProducts.some((cp) => cp.id === p.id);
                    const rating = getAverageRating(p.id);
                    return (
                      <div
                        key={p.id}
                        style={{
                          ...card,
                          cursor: "pointer",
                          animation: `cardSlideIn 0.4s ease ${idx * 40}ms backwards`,
                          transition: "all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
                        }}
                        onClick={() => openProduct(p)}
                        onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
                        onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                        role="button"
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                          <FavoriteButton isFavorited={isFav} onToggle={() => toggleFavorite(p)} size={28} />
                          {compareProducts.length > 0 && (
                            <ComparisonCheckbox
                              isSelected={isComparing}
                              onToggle={() => toggleCompare(p)}
                            />
                          )}
                        </div>

                        <div
                          style={{
                            height: 120,
                            borderRadius: 16,
                            background: "#0b0b0b",
                            border: "1px solid #1f1f1f",
                            overflow: "hidden",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            position: "relative",
                          }}
                        >
                          {p.images?.[0]?.url && (
                            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, transparent 0%, rgba(0,0,0,0.25) 100%)", zIndex: 1 }} />
                          )}
                          {p.images?.[0]?.url ? (
                            <img
                              src={p.images[0].url}
                              alt={p.images[0].altText || p.title}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          ) : (
                            <div style={{ color: BRAND.muted, fontWeight: 900 }}>📦</div>
                          )}
                          {!v?.availableForSale && (
                            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
                              <div style={{ color: "#ff9999", fontWeight: 900, fontSize: 12 }}>OUT OF STOCK</div>
                            </div>
                          )}
                        </div>

                        <div style={{ height: 10 }} />
                        <div style={{ fontWeight: 1000, lineHeight: 1.2, fontSize: 14 }}>{p.title}</div>

                        {rating > 0 && (
                          <div style={{ height: 6, display: "flex", alignItems: "center", gap: 6 }}>
                            <StarRating rating={rating} size={11} />
                            <span style={{ fontSize: 10, color: BRAND.muted, fontWeight: 900 }}>({rating})</span>
                          </div>
                        )}

                        <div style={{ height: 8 }} />
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                          <StockBadge available={v?.availableForSale} quantity={v?.quantityAvailable} />
                          {v && <SavingsIndicator compareAtPrice={v.compareAtPrice} price={v.price} />}
                          <BulkPricingBadge quantity={10} discount={getBulkDiscount(10)} onClick={() => setShowBulkPricingInfo(true)} />
                        </div>

                        <div style={{ height: 8 }} />
                        <div style={{ fontSize: 12, color: BRAND.muted }}>
                          {p.vendor ? `${p.vendor} • ` : ""}
                          <span style={{ color: "#fff", fontWeight: 900, fontSize: 14 }}>
                            {price}
                          </span>
                          {compare ? (
                            <span style={{ marginLeft: 8, color: "#999", textDecoration: "line-through", fontWeight: 800, fontSize: 11 }}>{compare}</span>
                          ) : null}
                        </div>

                        <div style={{ height: 10 }} />
                        <div style={{ display: "flex", gap: 8 }}>
                          <QuickViewButton onQuickView={() => setQuickViewProduct(p)} />
                          <Button variant="dark" onClick={(e) => { e.stopPropagation(); openProduct(p); }} style={{ flex: 1, fontSize: 11 }} icon="→">
                            View
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {view === "product" && activeProduct && (
            <ProductView
              product={activeProduct}
              collectionProducts={collectionProducts}
              setActiveProduct={setActiveProduct}
              setView={setView}
              onBack={() => setView("collection")}
              vatLabel={vatLabel}
              displayPrice={displayPrice}
              displayCompareAt={displayCompareAt}
              onAdd={async (variantId, qty) => {
                try {
                  await cartAddLine(variantId, qty);
                  setToast("Added to cart");
                } catch (e) {
                  setError(String(e?.message || e));
                }
              }}
            />
          )}

          {view === "comparison" && compareProducts.length > 0 && (
            <div style={{ background: BRAND.card, border: "1px solid #202020", borderRadius: 18, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 1000 }}>Compare Products</div>
                  <div style={{ fontSize: 12, color: BRAND.muted, fontWeight: 800 }}>
                    {compareProducts.length} items
                  </div>
                </div>
                <Button variant="ghost" onClick={() => setView("home")} icon="←">
                  Back
                </Button>
              </div>

              {/* Comparison Table */}
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  <thead>
                    <tr style={{ borderBottom: "2px solid #262626" }}>
                      <th style={{ padding: 10, textAlign: "left", color: BRAND.muted }}>Spec</th>
                      {compareProducts.map((p) => (
                        <th key={p.id} style={{ padding: 10, minWidth: 120, textAlign: "center" }}>
                          {p.title.length > 20 ? p.title.substring(0, 17) + "..." : p.title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: "Price", getValue: (p) => displayPrice(p.variants?.[0]?.price || 0) },
                      { label: "Vendor", getValue: (p) => p.vendor || "—" },
                      { label: "Stock", getValue: (p) => (p.variants?.[0]?.availableForSale ? "✓ In Stock" : "Out of Stock") },
                      { label: "SKU", getValue: (p) => p.variants?.[0]?.sku || "—" },
                      { label: "Rating", getValue: (p) => "4.5★" },
                    ].map((row) => (
                      <tr key={row.label} style={{ borderBottom: "1px solid #1f1f1f" }}>
                        <td style={{ padding: 10, color: BRAND.muted }}>{row.label}</td>
                        {compareProducts.map((p) => (
                          <td key={p.id} style={{ padding: 10, textAlign: "center", fontWeight: 1000 }}>
                            {row.getValue(p)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                <Button
                  variant="primary"
                  onClick={() => {
                    compareProducts.forEach((p) => {
                      const v = p.variants?.[0];
                      if (v?.id) cartAddLine(v.id, 1);
                    });
                    setToast(`✓ Added ${compareProducts.length} items to cart`);
                    setCompareProducts([]);
                    setView("cart");
                  }}
                  style={{ flex: 1, minWidth: 140 }}
                  icon="→"
                >
                  Add all to cart
                </Button>
                <Button
                  variant="dark"
                  onClick={() => setCompareProducts([])}
                  style={{ flex: 1, minWidth: 140 }}
                >
                  Clear comparison
                </Button>
              </div>
            </div>
          )}

          {view === "cart" && (
            <CartView
              cart={cart}
              displayedTotals={getDisplayedCartTotals()}
              loading={loadingCart}
              vatLabel={vatLabel}
              onBack={() => setView(activeCollection ? "collection" : "home")}
              onRefresh={async () => {
                try {
                  await ensureCartId();
                } catch (e) {
                  setError(String(e?.message || e));
                }
              }}
              onCheckout={async () => {
                if (!cart?.checkoutUrl) return;
                try {
                  if (isNative) {
                    await Browser.open({ url: cart.checkoutUrl, presentationStyle: "fullscreen" });
                  } else {
                    window.open(cart.checkoutUrl, "_blank");
                  }
                } catch (e) {
                  setError(String(e?.message || e));
                }
              }}
              onInc={async (line) => {
                try {
                  await cartUpdateLine(line.id, clamp(line.quantity + 1, 1, 999));
                } catch (e) {
                  setError(String(e?.message || e));
                }
              }}
              onDec={async (line) => {
                try {
                  const q = clamp(line.quantity - 1, 0, 999);
                  if (q <= 0) await cartRemoveLine(line.id);
                  else await cartUpdateLine(line.id, q);
                } catch (e) {
                  setError(String(e?.message || e));
                }
              }}
              onRemove={async (line) => {
                try {
                  await cartRemoveLine(line.id);
                } catch (e) {
                  setError(String(e?.message || e));
                }
              }}
              displayPrice={displayPrice}
            />
          )}

          {view === "orders" && (
            <OrdersView
              card={card}
              auth={auth}
              orders={orders}
              loading={ordersLoading}
              onLogin={startLogin}
              onRefresh={() => loadOrdersFromApi({ silent: false })}
              onBack={() => setView("home")}
              onOpen={(o) => {
                setActiveOrder(o);
                setView("orderDetail");
              }}
              onReorder={(o) => reorderFromOrder(o)}
              isNative={isNative}
            />
          )}

          {view === "orderDetail" && activeOrder && (
            <OrderDetailView
              card={card}
              order={activeOrder}
              onBack={() => setView("orders")}
              onReorder={() => reorderFromOrder(activeOrder)}
            />
          )}

          {view === "favorites" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 1000 }}>❤️ Favorites</div>
                  <div style={{ fontSize: 12, color: BRAND.muted, fontWeight: 800 }}>
                    {favorites.length} saved items
                  </div>
                </div>
                <Button variant="ghost" onClick={() => setView("home")} icon="←">
                  Back
                </Button>
              </div>

              {favorites.length === 0 ? (
                <EmptyState
                  icon="🤍"
                  title="No favorites yet"
                  description="Save products you love to view them later"
                  action={<Button variant="primary" onClick={() => setView("home")}>Browse collections</Button>}
                />
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
                  {favorites.map((p, idx) => {
                    const v = p.variants?.[0];
                    const price = v ? displayPrice(v.price) : "£—";
                    return (
                      <div
                        key={p.id}
                        style={{
                          padding: 12,
                          borderRadius: 14,
                          border: "1px solid #1f1f1f",
                          background: BRAND.card,
                          cursor: "pointer",
                          animation: `cardSlideIn 0.4s ease ${idx * 40}ms backwards`,
                          transition: "all 0.2s",
                        }}
                        onClick={() => {
                          setActiveProduct(p);
                          setView("product");
                        }}
                      >
                        <div
                          style={{
                            height: 100,
                            borderRadius: 10,
                            background: "#0b0b0b",
                            border: "1px solid #1f1f1f",
                            overflow: "hidden",
                            marginBottom: 8,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {p.images?.[0]?.url ? (
                            <img src={p.images[0].url} alt={p.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <div style={{ color: BRAND.muted }}>📦</div>
                          )}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 1000, lineHeight: 1.2, marginBottom: 6 }}>{p.title}</div>
                        <div style={{ fontSize: 12, fontWeight: 1000, color: "#00ff00", marginBottom: 6 }}>{price}</div>
                        <Button variant="dark" onClick={(e) => { e.stopPropagation(); toggleFavorite(p); }} style={{ width: "100%", fontSize: 10 }} icon="×">
                          Remove
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {view === "account" && (
            <div className="view-anim" style={card}>
              {/* Account Header */}
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: 16,
                paddingBottom: 16,
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                marginBottom: 16,
              }}>
                <div style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  background: auth 
                    ? `linear-gradient(135deg, ${BRAND.success}, #16a34a)`
                    : `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.secondary})`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 24,
                  boxShadow: auth 
                    ? "0 8px 24px rgba(34,197,94,0.3)"
                    : `0 8px 24px ${BRAND.primaryGlow}`,
                }}>
                  {auth ? "✓" : "👤"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ 
                    fontSize: 20, 
                    fontWeight: 700,
                    background: "linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.8) 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}>
                    {auth ? "Welcome Back" : "Your Account"}
                  </div>
                  <div style={{ 
                    fontSize: 13, 
                    color: BRAND.muted, 
                    marginTop: 4,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {auth ? (userLine || "Signed in") : "Sign in to access your orders"}
                  </div>
                </div>
              </div>

              {isNonVatCustomer && (
                <div style={{ 
                  marginBottom: 16, 
                  padding: 12, 
                  background: "rgba(34,197,94,0.1)", 
                  border: "1px solid rgba(34,197,94,0.2)", 
                  borderRadius: 14, 
                  fontSize: 13, 
                  color: "#4ade80", 
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}>
                  <span>✓</span>
                  Non-VAT Account Active
                </div>
              )}

              {/* TAX EXEMPTION STATUS */}
              {companyAccount && companyAccount.reverseCharge && (
                <div style={{ 
                  padding: 16, 
                  background: "rgba(34,197,94,0.08)", 
                  border: "1px solid rgba(34,197,94,0.15)", 
                  borderRadius: 16, 
                  marginBottom: 16,
                }}>
                  <div style={{ 
                    fontSize: 15, 
                    fontWeight: 700, 
                    color: "#4ade80", 
                    marginBottom: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}>
                    <span>🏆</span>
                    Tax Exempt Account
                  </div>
                  <div style={{ fontSize: 13, color: BRAND.mutedLight, marginBottom: 12, lineHeight: 1.5 }}>
                    Your account is verified as tax exempt. All prices shown excluding VAT.
                  </div>
                  <div style={{ 
                    fontSize: 12, 
                    color: "#22c55e", 
                    fontWeight: 600, 
                    padding: "10px 14px", 
                    background: "rgba(34,197,94,0.1)", 
                    borderRadius: 10, 
                    textAlign: "center",
                    border: "1px solid rgba(34,197,94,0.2)",
                  }}>
                    ✓ Reverse charge pricing active
                  </div>
                </div>
              )}

              {/* VAT VERIFICATION FORM - Only show if logged in and NOT vat-verified */}
              {auth && !companyAccount?.reverseCharge && !vatFormSubmitted && (
                <div style={{ 
                  padding: 16, 
                  background: "rgba(34,197,94,0.05)", 
                  border: "1px solid rgba(34,197,94,0.1)", 
                  borderRadius: 16, 
                  marginBottom: 16,
                }}>
                  <div style={{ 
                    fontSize: 15, 
                    fontWeight: 700, 
                    color: "#4ade80", 
                    marginBottom: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}>
                    <span>📋</span>
                    B2B VAT Verification
                  </div>
                  <div style={{ fontSize: 12, color: BRAND.muted, marginBottom: 16 }}>
                    Apply for tax exempt pricing on business orders
                  </div>
                  <div style={{ display: "grid", gap: 12 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: BRAND.mutedLight, marginBottom: 6 }}>
                        Business Name <span style={{ color: BRAND.primary }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={vatFormBusinessName}
                        onChange={(e) => setVatFormBusinessName(e.target.value)}
                        placeholder="e.g., Acme Ltd."
                        className="premium-input"
                        style={{ width: "100%", boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: BRAND.mutedLight, marginBottom: 6 }}>
                        Country <span style={{ color: BRAND.primary }}>*</span>
                      </label>
                      <select
                        value={vatFormCountry}
                        onChange={(e) => setVatFormCountry(e.target.value)}
                        className="premium-input"
                        style={{ width: "100%", boxSizing: "border-box", cursor: "pointer" }}
                      >
                        <option value="Ireland">🇮🇪 Ireland</option>
                        <option value="UK">🇬🇧 United Kingdom</option>
                        <option value="Germany">🇩🇪 Germany</option>
                        <option value="France">🇫🇷 France</option>
                        <option value="Spain">🇪🇸 Spain</option>
                        <option value="Italy">🇮🇹 Italy</option>
                        <option value="Netherlands">🇳🇱 Netherlands</option>
                        <option value="Belgium">🇧🇪 Belgium</option>
                        <option value="Austria">🇦🇹 Austria</option>
                        <option value="Czech Republic">🇨🇿 Czech Republic</option>
                        <option value="Denmark">🇩🇰 Denmark</option>
                        <option value="Finland">🇫🇮 Finland</option>
                        <option value="Greece">🇬🇷 Greece</option>
                        <option value="Hungary">🇭🇺 Hungary</option>
                        <option value="Poland">🇵🇱 Poland</option>
                        <option value="Portugal">🇵🇹 Portugal</option>
                        <option value="Romania">🇷🇴 Romania</option>
                        <option value="Slovakia">🇸🇰 Slovakia</option>
                        <option value="Slovenia">🇸🇮 Slovenia</option>
                        <option value="Sweden">🇸🇪 Sweden</option>
                        <option value="Other EU">🌍 Other EU</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: BRAND.mutedLight, marginBottom: 6 }}>
                        VAT Number <span style={{ color: BRAND.primary }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={vatFormVatNumber}
                        onChange={(e) => setVatFormVatNumber(e.target.value)}
                        placeholder="e.g., IE1234567AB"
                        className="premium-input"
                        style={{ width: "100%", boxSizing: "border-box" }}
                      />
                    </div>
                    <Button
                      onClick={async () => {
                        if (!vatFormBusinessName || !vatFormVatNumber) {
                          setToast("❌ Please fill in all fields");
                          return;
                        }
                        setVatFormLoading(true);
                        try {
                          await submitVatVerification(vatFormBusinessName, vatFormCountry, vatFormVatNumber);
                        } finally {
                          setVatFormLoading(false);
                        }
                      }}
                      loading={vatFormLoading}
                      style={{ width: "100%", marginTop: 8 }}
                      icon={vatFormLoading ? undefined : "✓"}
                      variant="success"
                    >
                      {vatFormLoading ? "Submitting..." : "Submit for Verification"}
                    </Button>
                  </div>
                </div>
              )}

              {/* AWAITING VERIFICATION MESSAGE */}
              {auth && vatFormSubmitted && !companyAccount?.reverseCharge && (
                <div style={{ 
                  padding: 16, 
                  background: "rgba(234,179,8,0.1)", 
                  border: "1px solid rgba(234,179,8,0.2)", 
                  borderRadius: 16, 
                  marginBottom: 16,
                }}>
                  <div style={{ 
                    fontSize: 15, 
                    fontWeight: 700, 
                    color: "#fbbf24", 
                    marginBottom: 6,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}>
                    <span style={{ animation: "pulse 2s infinite" }}>⏳</span>
                    Awaiting Verification
                  </div>
                  <div style={{ fontSize: 13, color: BRAND.mutedLight, lineHeight: 1.5 }}>
                    Your VAT verification has been submitted. Our team will review and verify your details within 1-2 business days.
                  </div>
                </div>
              )}

              {!auth && !userEmail ? (
                <div>
                  {!showRegForm ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <Button onClick={() => setShowRegForm(true)} style={{ width: "100%", padding: "16px 20px" }} icon="✨">
                        Create New Account
                      </Button>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
                        <span style={{ fontSize: 12, color: BRAND.muted }}>or</span>
                        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
                      </div>
                      <Button variant="ghost" onClick={startLogin} style={{ width: "100%", padding: "14px 20px" }} icon="🔐">
                        Login (Existing Customers)
                      </Button>
                    </div>
                  ) : (
                    <div style={{ 
                      background: "rgba(255,255,255,0.02)", 
                      padding: 20, 
                      borderRadius: 20, 
                      border: "1px solid rgba(255,255,255,0.06)",
                      animation: "scaleIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
                    }}>
                      <div style={{ 
                        fontSize: 18, 
                        fontWeight: 700, 
                        color: "#fff", 
                        marginBottom: 6,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}>
                        <span style={{ fontSize: 22 }}>✨</span>
                        Create Your Account
                      </div>
                      <div style={{ fontSize: 13, color: BRAND.muted, marginBottom: 20 }}>
                        Join thousands of happy customers
                      </div>
                      
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {/* Email */}
                        <div>
                          <label style={{ fontSize: 12, color: BRAND.mutedLight, marginBottom: 6, display: "block", fontWeight: 600 }}>
                            Email Address <span style={{ color: BRAND.primary }}>*</span>
                          </label>
                          <input
                            type="email"
                            placeholder="your@email.com"
                            value={regEmail}
                            onChange={(e) => setRegEmail(e.target.value)}
                            className="premium-input"
                            style={{ width: "100%", boxSizing: "border-box" }}
                          />
                        </div>
                        
                        {/* Name Row */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <div>
                            <label style={{ fontSize: 12, color: BRAND.mutedLight, marginBottom: 6, display: "block", fontWeight: 600 }}>
                              First Name
                            </label>
                            <input
                              type="text"
                              placeholder="John"
                              value={regFirstName}
                              onChange={(e) => setRegFirstName(e.target.value)}
                              className="premium-input"
                              style={{ width: "100%", boxSizing: "border-box" }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, color: BRAND.mutedLight, marginBottom: 6, display: "block", fontWeight: 600 }}>
                              Last Name
                            </label>
                            <input
                              type="text"
                              placeholder="Smith"
                              value={regLastName}
                              onChange={(e) => setRegLastName(e.target.value)}
                              className="premium-input"
                              style={{ width: "100%", boxSizing: "border-box" }}
                            />
                          </div>
                        </div>
                        
                        {/* Phone */}
                        <div>
                          <label style={{ fontSize: 12, color: BRAND.mutedLight, marginBottom: 6, display: "block", fontWeight: 600 }}>
                            Phone Number
                          </label>
                          <input
                            type="tel"
                            placeholder="+44 7XXX XXXXXX"
                            value={regPhone}
                            onChange={(e) => setRegPhone(e.target.value)}
                            className="premium-input"
                            style={{ width: "100%", boxSizing: "border-box" }}
                          />
                        </div>
                        
                        {/* Address */}
                        <div>
                          <label style={{ fontSize: 12, color: BRAND.mutedLight, marginBottom: 6, display: "block", fontWeight: 600 }}>
                            Street Address
                          </label>
                          <input
                            type="text"
                            placeholder="123 Main Street"
                            value={regAddress1}
                            onChange={(e) => setRegAddress1(e.target.value)}
                            className="premium-input"
                            style={{ width: "100%", boxSizing: "border-box" }}
                          />
                        </div>
                        
                        {/* City & County */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <div>
                            <label style={{ fontSize: 12, color: BRAND.mutedLight, marginBottom: 6, display: "block", fontWeight: 600 }}>
                              City
                            </label>
                            <input
                              type="text"
                              placeholder="Dublin"
                              value={regCity}
                              onChange={(e) => setRegCity(e.target.value)}
                              className="premium-input"
                              style={{ width: "100%", boxSizing: "border-box" }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, color: BRAND.mutedLight, marginBottom: 6, display: "block", fontWeight: 600 }}>
                              County
                            </label>
                            <input
                              type="text"
                              placeholder="County Dublin"
                              value={regCounty}
                              onChange={(e) => setRegCounty(e.target.value)}
                              className="premium-input"
                              style={{ width: "100%", boxSizing: "border-box" }}
                            />
                          </div>
                        </div>
                        
                        {/* Postcode & Country */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <div>
                            <label style={{ fontSize: 12, color: BRAND.mutedLight, marginBottom: 6, display: "block", fontWeight: 600 }}>
                              Postcode
                            </label>
                            <input
                              type="text"
                              placeholder="D01 ABC"
                              value={regPostcode}
                              onChange={(e) => setRegPostcode(e.target.value)}
                              className="premium-input"
                              style={{ width: "100%", boxSizing: "border-box" }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, color: BRAND.mutedLight, marginBottom: 6, display: "block", fontWeight: 600 }}>
                              Country
                            </label>
                            <select
                              value={regCountry}
                              onChange={(e) => setRegCountry(e.target.value)}
                              className="premium-input"
                              style={{ width: "100%", boxSizing: "border-box", cursor: "pointer" }}
                            >
                              <option value="Ireland">🇮🇪 Ireland</option>
                              <option value="United Kingdom">🇬🇧 United Kingdom</option>
                              <option value="Germany">🇩🇪 Germany</option>
                              <option value="France">🇫🇷 France</option>
                              <option value="Netherlands">🇳🇱 Netherlands</option>
                              <option value="Belgium">🇧🇪 Belgium</option>
                              <option value="Spain">🇪🇸 Spain</option>
                              <option value="Italy">🇮🇹 Italy</option>
                              <option value="Poland">🇵🇱 Poland</option>
                              <option value="Other">🌍 Other EU</option>
                            </select>
                          </div>
                        </div>
                        
                        {/* VAT Section */}
                        <div style={{ 
                          borderTop: "1px solid rgba(255,255,255,0.06)", 
                          marginTop: 8, 
                          paddingTop: 16,
                        }}>
                          <div style={{ 
                            fontSize: 13, 
                            color: BRAND.mutedLight, 
                            marginBottom: 10,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}>
                            <span>🏢</span>
                            <span style={{ fontWeight: 600 }}>Business Customer?</span>
                            <span style={{ 
                              fontSize: 10, 
                              background: "rgba(139,92,246,0.2)", 
                              padding: "2px 8px", 
                              borderRadius: 99,
                              color: "#a78bfa",
                            }}>
                              Optional
                            </span>
                          </div>
                          <input
                            type="text"
                            placeholder="VAT Number (e.g., IE1234567X)"
                            value={regVatNumber}
                            onChange={(e) => setRegVatNumber(e.target.value)}
                            className="premium-input"
                            style={{ width: "100%", boxSizing: "border-box" }}
                          />
                          <div style={{ fontSize: 11, color: BRAND.muted, marginTop: 6 }}>
                            Add your VAT number to apply for tax exemption on B2B orders
                          </div>
                        </div>
                        
                        {/* Buttons */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginTop: 8 }}>
                          <Button 
                            variant="ghost" 
                            onClick={() => setShowRegForm(false)} 
                            style={{ padding: "14px 16px" }}
                          >
                            Cancel
                          </Button>
                          <Button 
                            onClick={registerCustomer} 
                            loading={regLoading}
                            style={{ padding: "14px 16px" }}
                            icon={regLoading ? undefined : "🚀"}
                          >
                            {regLoading ? "Creating..." : "Create Account"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : auth ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <Button variant="ghost" onClick={() => setView("home")} icon="🏠" style={{ padding: "14px" }}>
                      Shop
                    </Button>
                    <Button variant="ghost" onClick={() => setView("orders")} icon="📋" style={{ padding: "14px" }}>
                      My Orders
                    </Button>
                  </div>
                  <Button onClick={logout} variant="dark" icon="👋" style={{ padding: "14px" }}>
                    Sign Out
                  </Button>
                </div>
              ) : userEmail ? (
                <div>
                  <div style={{ background: "#1a2a1a", padding: 12, borderRadius: 8, marginBottom: 12, border: "1px solid #2a3a2a" }}>
                    <div style={{ fontSize: 13, color: "#8c8", marginBottom: 4 }}>✓ Registered as:</div>
                    <div style={{ fontSize: 14, color: "#fff", fontWeight: 600 }}>{userEmail}</div>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Button variant="dark" onClick={() => setView("home")} style={{ flex: 1, minWidth: 120 }}>
                      Shop
                    </Button>
                    <Button 
                      onClick={() => {
                        setUserEmail("");
                        setUserName("");
                        Preferences.remove({ key: K.PROFILE });
                        setToast("Logged out");
                      }} 
                      style={{ flex: 1, minWidth: 120 }}
                    >
                      Logout
                    </Button>
                  </div>
                </div>
              ) : null}

              <div style={{ height: 14 }} />
              <div style={{ fontSize: 12, color: BRAND.muted }}>
                Redirect URI (matches AndroidManifest):
                <div style={{ marginTop: 6, color: "#fff", fontWeight: 900 }}>{REDIRECT_URI}</div>
              </div>

              {!isNative ? (
                <div style={{ marginTop: 10, fontSize: 12, color: "#d8e8ff", background: "#0f1a2a", border: "1px solid #1c2e4a", padding: 10, borderRadius: 14 }}>
                  Login is disabled on localhost (browser CORS). Build/run in Android to test login + orders.
                </div>
              ) : null}

              {/* Privacy Policy Link */}
              <div style={{ 
                marginTop: 20, 
                paddingTop: 16, 
                borderTop: "1px solid rgba(255,255,255,0.06)",
                textAlign: "center",
              }}>
                <a 
                  href="https://briancollins454-hub-ace-fixings-app-vite-moxxikv4u.vercel.app/privacy-policy.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 13,
                    color: BRAND.muted,
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "10px 16px",
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    transition: "all 0.2s ease",
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                    e.currentTarget.style.color = "#fff";
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                    e.currentTarget.style.color = BRAND.muted;
                  }}
                >
                  <span>🔒</span>
                  Privacy Policy
                </a>
                <div style={{ fontSize: 11, color: BRAND.muted, marginTop: 10, opacity: 0.7 }}>
                  Ace Fixings Ltd © {new Date().getFullYear()}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM NAV */}
        <div style={bottomNav}>
          <div style={navInner}>
            <button type="button" style={navBtn(view === "home")} onClick={() => setView("home")}>
              <span style={{ fontSize: 18 }}>🏠</span>
              <span className="nav-label" style={{ fontSize: 10, marginTop: 1 }}>Home</span>
            </button>

            <button
              type="button"
              style={navBtn(view === "collection" || view === "product")}
              onClick={() => {
                if (activeCollection) setView("collection");
                else setView("home");
              }}
            >
              <span style={{ fontSize: 18 }}>📦</span>
              <span className="nav-label" style={{ fontSize: 10, marginTop: 1 }}>Browse</span>
            </button>

            <button
              type="button"
              style={{
                ...navBtn(view === "cart"),
                position: "relative",
              }}
              onClick={async () => {
                try {
                  await ensureCartId();
                  setView("cart");
                } catch (e) {
                  setError(String(e?.message || e));
                }
              }}
            >
              <span style={{ fontSize: 18 }}>🛒</span>
              <span className="nav-label" style={{ fontSize: 10, marginTop: 1 }}>Cart</span>
              {cartCount > 0 && (
                <span style={{
                  position: "absolute",
                  top: 4,
                  right: "calc(50% - 18px)",
                  minWidth: 16,
                  height: 16,
                  padding: "0 4px",
                  background: view === "cart" ? "#fff" : BRAND.primary,
                  color: view === "cart" ? BRAND.primary : "#fff",
                  borderRadius: 99,
                  fontSize: 10,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  {cartCount}
                </span>
              )}
            </button>

            <button
              type="button"
              style={navBtn(view === "orders" || view === "orderDetail")}
              onClick={() => {
                if (!auth) {
                  setToast("Login to view orders");
                  setView("account");
                  return;
                }
                setView("orders");
              }}
            >
              <span style={{ fontSize: 18 }}>📋</span>
              <span className="nav-label" style={{ fontSize: 10, marginTop: 1 }}>Orders</span>
            </button>

            <button type="button" style={navBtn(view === "account")} onClick={() => setView("account")}>
              <span style={{ fontSize: 18 }}>👤</span>
              <span className="nav-label" style={{ fontSize: 10, marginTop: 1 }}>Account</span>
            </button>
          </div>
        </div>

        {/* TOAST */}
        {toast ? (
          <div
            style={{
              position: "fixed",
              left: 16,
              right: 16,
              bottom: "calc(84px + env(safe-area-inset-bottom))",
              display: "flex",
              justifyContent: "center",
              pointerEvents: "none",
              zIndex: 20000,
              animation: "slideUp 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            <div
              style={{
                pointerEvents: "none",
                background: "linear-gradient(135deg, rgba(20,20,20,0.95), rgba(15,15,15,0.98))",
                backdropFilter: "blur(24px) saturate(180%)",
                WebkitBackdropFilter: "blur(24px) saturate(180%)",
                border: "1px solid rgba(255,255,255,0.1)",
                padding: "14px 24px",
                borderRadius: 18,
                color: "#fff",
                fontWeight: 700,
                fontSize: 14,
                boxShadow: "0 12px 40px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.1) inset, 0 0 60px rgba(239,68,68,0.1)",
                maxWidth: "90%",
                textAlign: "center",
                letterSpacing: "0.02em",
              }}
            >
              {toast}
            </div>
          </div>
        ) : null}

        {/* Quick View Modal */}
        {quickViewProduct && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.7)",
              display: "flex",
              alignItems: "flex-end",
              zIndex: 999,
              animation: "fadeIn 0.2s ease",
            }}
            onClick={() => setQuickViewProduct(null)}
          >
            <div
              style={{
                background: "#0a0a0a",
                borderRadius: "20px 20px 0 0",
                width: "100%",
                maxHeight: "80vh",
                overflow: "auto",
                padding: 20,
                borderTop: "1px solid #1f1f1f",
                animation: "slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 18, fontWeight: 1000 }}>Quick View</div>
                <Button variant="ghost" onClick={() => setQuickViewProduct(null)}>
                  ✕
                </Button>
              </div>

              <div style={{ display: "grid", gap: 16 }}>
                {/* Product Image */}
                <div
                  style={{
                    height: 200,
                    borderRadius: 16,
                    background: "#0b0b0b",
                    border: "1px solid #1f1f1f",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {quickViewProduct?.images?.[0]?.url ? (
                    <img
                      src={quickViewProduct.images[0].url}
                      alt={quickViewProduct.images[0].altText || quickViewProduct.title}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <div style={{ color: BRAND.muted, fontWeight: 900, fontSize: 32 }}>📦</div>
                  )}
                </div>

                {/* Title & Rating */}
                <div>
                  <div style={{ fontSize: 16, fontWeight: 1000, marginBottom: 8 }}>{quickViewProduct?.title}</div>
                  {quickViewProduct && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <StarRating rating={getAverageRating(quickViewProduct.id)} size={14} />
                      <span style={{ fontSize: 12, color: BRAND.muted, fontWeight: 900 }}>({getAverageRating(quickViewProduct.id)}★)</span>
                    </div>
                  )}
                </div>

                {/* Price & Vendor */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 12, color: BRAND.muted, fontWeight: 800 }}>Price</div>
                    <div style={{ fontSize: 18, fontWeight: 1000, color: "#00ff00" }}>
                      {quickViewProduct?.variants?.[0] ? displayPrice(quickViewProduct.variants[0].price) : "£—"}
                    </div>
                  </div>
                  {quickViewProduct?.vendor && (
                    <Badge style={{ fontWeight: 900, fontSize: 11 }}>{quickViewProduct.vendor}</Badge>
                  )}
                </div>

                {/* Stock & Bulk Pricing */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {quickViewProduct?.variants?.[0] && (
                    <>
                      <StockBadge available={quickViewProduct.variants[0].availableForSale} quantity={quickViewProduct.variants[0].quantityAvailable} />
                      <BulkPricingBadge quantity={10} discount={getBulkDiscount(10)} onClick={() => setShowBulkPricingInfo(true)} />
                    </>
                  )}
                </div>

                {/* Description / Details */}
                {quickViewProduct?.description && (
                  <div style={{ fontSize: 12, color: BRAND.muted, lineHeight: 1.6, maxHeight: 100, overflow: "auto" }}>
                    {quickViewProduct.description}
                  </div>
                )}

                {/* Add to Cart Button */}
                <Button
                  variant="primary"
                  onClick={() => {
                    ensureCartId();
                    const v = quickViewProduct?.variants?.[0];
                    if (v?.id) {
                      cartAddLine(v.id, 1);
                      setQuickViewProduct(null);
                      setToast("✓ Added to cart!");
                    }
                  }}
                  style={{ width: "100%", fontSize: 14, fontWeight: 1000 }}
                  icon="→"
                >
                  Add to Cart
                </Button>

                {/* Full Product View */}
                <Button
                  variant="dark"
                  onClick={() => {
                    openProduct(quickViewProduct);
                    setQuickViewProduct(null);
                  }}
                  style={{ width: "100%", fontSize: 14 }}
                >
                  Full Details
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Advanced Filters Panel */}
        {showFilters && (
          <AdvancedFiltersPanel
            filters={searchFilters}
            onFilterChange={setSearchFilters}
            allVendors={getAllVendors(collectionProducts)}
            onClose={() => setShowFilters(false)}
          />
        )}

        {/* Bulk Pricing Info Modal */}
        {showBulkPricingInfo && <BulkPricingInfoModal onClose={() => setShowBulkPricingInfo(false)} />}
      </div>
    </div>
  );
}

// ==========================
// PRODUCT VIEW COMPONENT
// ==========================
function ProductView({ product, collectionProducts, setActiveProduct, setView, onBack, vatLabel, displayPrice, displayCompareAt, onAdd }) {
  const [qty, setQty] = useState(1);
  const [variantId, setVariantId] = useState(product?.variants?.[0]?.id || "");
  const [isAdding, setIsAdding] = useState(false);

  const variant = useMemo(() => product.variants.find((v) => v.id === variantId) || product.variants[0], [product, variantId]);

  return (
    <div style={{ background: BRAND.card, border: "1px solid #202020", borderRadius: 18, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 1000 }}>{product.title}</div>
          <div style={{ fontSize: 12, color: BRAND.muted, fontWeight: 800 }}>
            {product.vendor ? `${product.vendor} • ` : ""}
            {vatLabel}
          </div>
        </div>
        <Button variant="ghost" onClick={onBack} icon="←">
          Back
        </Button>
      </div>

      <div style={{ height: 12 }} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <div>
          <ImageGallery images={product.images} altText={product.title} />
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
            <div style={{ fontSize: 28, fontWeight: 1100, background: `linear-gradient(135deg, #fff, ${BRAND.primary})`, backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent" }}>
              {displayPrice(variant?.price || 0)}
            </div>
            {variant?.compareAtPrice ? (
              <div style={{ color: "#666", textDecoration: "line-through", fontWeight: 900, fontSize: 16 }}>{displayCompareAt(variant.compareAtPrice)}</div>
            ) : null}
          </div>

          <div style={{ height: 4 }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <StockBadge available={variant?.availableForSale} quantity={variant?.quantityAvailable} />
            {variant && <SavingsIndicator compareAtPrice={variant.compareAtPrice} price={variant.price} />}
          </div>

          <div style={{ height: 12 }} />

          {product.variants.length > 1 && (
            <div>
              <div style={{ fontSize: 12, color: BRAND.muted, fontWeight: 900, marginBottom: 8 }}>Select Variant</div>
              <select
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 14,
                  background: "#0f0f0f",
                  color: "#fff",
                  border: "1px solid #262626",
                  fontWeight: 800,
                  fontSize: 13,
                }}
              >
                {product.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title} {v.availableForSale ? "" : "(Out of stock)"}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ height: 12 }} />

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", background: "#101010", border: "1px solid #262626", borderRadius: 14, padding: 4 }}>
              <button
                type="button"
                onClick={() => setQty((q) => clamp(q - 1, 1, 999))}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  border: "1px solid #2a2a2a",
                  background: "#161616",
                  color: "#fff",
                  fontWeight: 1000,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.95)")}
                onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                −
              </button>
              <div style={{ minWidth: 36, textAlign: "center", fontWeight: 1000, fontSize: 14 }}>{qty}</div>
              <button
                type="button"
                onClick={() => setQty((q) => clamp(q + 1, 1, 999))}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  border: "1px solid #2a2a2a",
                  background: "#161616",
                  color: "#fff",
                  fontWeight: 1000,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.95)")}
                onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                +
              </button>
            </div>

            <Button
              onClick={async () => {
                setIsAdding(true);
                try {
                  await onAdd(variant.id, qty);
                } finally {
                  setIsAdding(false);
                }
              }}
              disabled={!variant?.availableForSale}
              loading={isAdding}
              style={{ flex: 1 }}
              title={variant?.availableForSale ? "Add to cart" : "Out of stock"}
              icon={variant?.availableForSale && !isAdding ? "🛒" : undefined}
            >
              {variant?.availableForSale ? "Add to cart" : "Out of stock"}
            </Button>
          </div>

          <div style={{ height: 14 }} />

          {product.descriptionHtml ? (
            <div style={{ fontSize: 13, color: "#e5e5e5", lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} />
          ) : product.description ? (
            <div style={{ fontSize: 13, color: "#e5e5e5", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{product.description}</div>
          ) : null}

          {variant?.sku && (
            <div style={{ marginTop: 14, padding: 10, background: "#0a0a0a", borderRadius: 12, fontSize: 12, color: BRAND.muted, fontWeight: 900 }}>
              SKU: <span style={{ color: "#fff" }}>{variant.sku}</span>
            </div>
          )}

          {/* Related Products Section */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #1f1f1f" }}>
            <div style={{ fontSize: 14, fontWeight: 1000, marginBottom: 10 }}>Similar Products</div>
            <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8 }}>
              {collectionProducts.slice(0, 4).map((relatedProduct) => {
                const relatedV = relatedProduct.variants?.[0];
                return (
                  <div
                    key={relatedProduct.id}
                    onClick={() => {
                      setActiveProduct(relatedProduct);
                      setView("product");
                    }}
                    style={{
                      flex: "0 0 140px",
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #1f1f1f",
                      background: "#0f0f0f",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                    onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.95)")}
                    onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                  >
                    {relatedProduct.images?.[0]?.url ? (
                      <img src={relatedProduct.images[0].url} alt={relatedProduct.title} style={{ width: "100%", height: 80, borderRadius: 8, objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "100%", height: 80, borderRadius: 8, background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", color: BRAND.muted }}>📦</div>
                    )}
                    <div style={{ fontSize: 10, fontWeight: 1000, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {relatedProduct.title}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 1000, color: "#00ff00" }}>
                      {relatedV ? displayPrice(relatedV.price) : "£—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================
// CART VIEW COMPONENT
// ==========================
function CartView({ cart, displayedTotals, loading, vatLabel, onBack, onRefresh, onCheckout, onInc, onDec, onRemove, displayPrice }) {
  const card = {
    background: BRAND.card,
    border: "1px solid #202020",
    borderRadius: 18,
    padding: 14,
    boxShadow: "0 8px 22px rgba(0,0,0,0.35)",
  };

  if (loading && !cart) {
    return (
      <div style={card}>
        <Skeleton h={18} w={140} />
        <div style={{ height: 10 }} />
        <Skeleton h={14} w={"60%"} />
        <div style={{ height: 14 }} />
        <Skeleton h={70} r={16} />
      </div>
    );
  }

  const lines = cart?.lines || [];
  const subtotal = displayedTotals?.subtotal ?? 0;
  const tax = displayedTotals?.tax ?? 0;
  const total = displayedTotals?.total ?? 0;

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 1000 }}>Cart</div>
          <div style={{ fontSize: 12, color: BRAND.muted, fontWeight: 800 }}>
            {vatLabel} • Items: {cart?.totalQuantity || 0}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="ghost" onClick={onRefresh}>
            Refresh
          </Button>
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
        </div>
      </div>

      <div style={{ height: 12 }} />

      {lines.length === 0 ? (
        <EmptyState
          icon="🛒"
          title="Cart is Empty"
          description="Start browsing our collections to add products to your cart."
          action={() => onBack()}
          actionLabel="Continue Shopping"
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {lines.map((l, idx) => (
            <div
              key={l.id}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                padding: 10,
                borderRadius: 16,
                border: "1px solid #242424",
                background: "#0f0f0f",
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 14,
                  overflow: "hidden",
                  border: "1px solid #222",
                  background: "#0b0b0b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {l.imageUrl ? (
                  <img src={l.imageUrl} alt={l.imageAlt || l.productTitle} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ color: BRAND.muted, fontWeight: 900 }}>ACE</div>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 1000, lineHeight: 1.2 }}>{l.productTitle}</div>
                <div style={{ fontSize: 12, color: BRAND.muted, marginTop: 4 }}>
                  {l.variantTitle ? `${l.variantTitle} • ` : ""}
                  {displayPrice(l.price)}
                  {l.sku ? <span style={{ marginLeft: 8 }}>SKU: {l.sku}</span> : null}
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => onDec(l)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    border: "1px solid #2a2a2a",
                    background: "#161616",
                    color: "#fff",
                    fontWeight: 1000,
                    cursor: "pointer",
                  }}
                >
                  –
                </button>

                <div style={{ minWidth: 28, textAlign: "center", fontWeight: 1000 }}>{l.quantity}</div>

                <button
                  type="button"
                  onClick={() => onInc(l)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    border: "1px solid #2a2a2a",
                    background: "#161616",
                    color: "#fff",
                    fontWeight: 1000,
                    cursor: "pointer",
                  }}
                >
                  +
                </button>

                <button
                  type="button"
                  onClick={() => onRemove(l)}
                  style={{
                    width: 38,
                    height: 34,
                    borderRadius: 10,
                    border: "1px solid #3a1d1d",
                    background: "#220f0f",
                    color: "#ffd1d1",
                    fontWeight: 1000,
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ height: 14 }} />

      <div style={{ borderTop: "1px solid #222", paddingTop: 12, paddingBottom: 12, display: "grid", gap: 8, background: "#0a0a0a", borderRadius: 14, padding: 12 }}>
        <RowLabel label="Subtotal" value={formatGBP(subtotal)} />
        {tax > 0 && <RowLabel label={`VAT (20%)`} value={formatGBP(tax)} />}
        <div style={{ height: 2, background: "linear-gradient(90deg, transparent, #222, transparent)", margin: "4px 0" }} />
        <RowLabel label="Total" value={formatGBP(total)} strong style={{ fontSize: 16, color: BRAND.primary }} />
      </div>

      <div style={{ height: 12 }} />

      <Button onClick={onCheckout} disabled={!cart?.checkoutUrl || lines.length === 0} style={{ width: "100%", fontSize: 14 }} icon={lines.length > 0 ? "💳" : undefined}>
        {lines.length === 0 ? "Cart is empty" : "Proceed to Checkout"}
      </Button>
    </div>
  );
}

function RowLabel({ label, value, strong, style }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", ...style }}>
      <div style={{ color: BRAND.muted, fontWeight: 900, fontSize: 13 }}>{label}</div>
      <div style={{ fontWeight: strong ? 1100 : 900, fontSize: strong ? 16 : 14 }}>{value}</div>
    </div>
  );
}

// ==========================
// ORDERS HUB
// ==========================
function OrdersView({ card, auth, orders, loading, onLogin, onRefresh, onBack, onOpen, onReorder, isNative }) {
  const getStatusColor = (status) => {
    if (!status) return "#888";
    const s = status.toLowerCase();
    if (s.includes("deliver") || s.includes("fulfill")) return "#66ff66";
    if (s.includes("paid") || s.includes("success")) return "#66ff66";
    if (s.includes("process") || s.includes("pend")) return "#ffb366";
    if (s.includes("cancel") || s.includes("refund")) return "#ff9999";
    return "#888";
  };

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 1000 }}>📦 Orders</div>
          <div style={{ fontSize: 12, color: BRAND.muted, fontWeight: 800 }}>
            {auth ? `${orders?.length || 0} order${orders?.length !== 1 ? "s" : ""}` : "Login to view orders"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="ghost" onClick={onRefresh} disabled={!auth || !isNative} icon="↻" style={{ fontSize: 12 }}>
            Refresh
          </Button>
          <Button variant="ghost" onClick={onBack} icon="←" style={{ fontSize: 12 }}>
            Back
          </Button>
        </div>
      </div>

      <div style={{ height: 12 }} />

      {!isNative ? (
        <div style={{ color: "#d8e8ff", background: "#0f1a2a", border: "1px solid #1c2e4a", padding: 10, borderRadius: 14, fontWeight: 800, fontSize: 12 }}>
          Orders requires the Android app (Customer Accounts API not available on localhost).
        </div>
      ) : !auth ? (
        <Button onClick={onLogin} style={{ width: "100%" }} icon="🔐">
          Login to view orders
        </Button>
      ) : loading ? (
        <div style={{ display: "grid", gap: 10 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ padding: 12, borderRadius: 14, border: "1px solid #242424", background: "#0f0f0f", animation: `cardSlideIn 0.4s ease ${i * 50}ms backwards` }}>
              <Skeleton h={14} w={"50%"} />
              <div style={{ height: 8 }} />
              <Skeleton h={12} w={"70%"} />
            </div>
          ))}
        </div>
      ) : !orders?.length ? (
        <EmptyState icon="📭" title="No Orders Yet" description="Your past orders will appear here once you make your first purchase." />
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {orders.map((o, idx) => {
            const total = o?.totalPrice ? formatMoneyV2(o.totalPrice) : "—";
            const date = formatDateTime(o?.createdAt);
            const paymentColor = getStatusColor(o?.financialStatus);
            const fulfillmentColor = getStatusColor(o?.fulfillmentStatus);

            return (
              <div
                key={o.id}
                style={{
                  padding: 14,
                  borderRadius: 14,
                  border: "1px solid #242424",
                  background: "#0f0f0f",
                  display: "grid",
                  gap: 10,
                  transition: "all 0.2s",
                  animation: `cardSlideIn 0.4s ease ${idx * 50}ms backwards`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                  <div style={{ fontWeight: 1000, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{o?.name || `Order #${o?.number || ""}`}</div>
                  <div style={{ fontWeight: 1100, fontSize: 16 }}>{total}</div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 11 }}>
                  <span style={{ color: BRAND.muted }}>{date}</span>
                  {o?.financialStatus && (
                    <span style={{ padding: "4px 8px", borderRadius: 6, background: `rgba(${paymentColor === "#66ff66" ? "102,255,102" : "255,179,102"}, 0.15)`, color: paymentColor, fontWeight: 900 }}>
                      {o.financialStatus === "PAID" ? "✓" : "○"} {o.financialStatus}
                    </span>
                  )}
                  {o?.fulfillmentStatus && (
                    <span style={{ padding: "4px 8px", borderRadius: 6, background: `rgba(${fulfillmentColor === "#66ff66" ? "102,255,102" : "255,179,102"}, 0.15)`, color: fulfillmentColor, fontWeight: 900 }}>
                      {o.fulfillmentStatus === "FULFILLED" ? "✓" : "◷"} {o.fulfillmentStatus}
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button variant="dark" onClick={() => onOpen(o)} style={{ flex: 1, minWidth: 140, fontSize: 12 }} icon="→">
                    Details
                  </Button>
                  <Button onClick={() => onReorder(o)} style={{ flex: 1, minWidth: 140, fontSize: 12 }} icon="↻">
                    Reorder
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OrderDetailView({ card, order, onBack, onReorder }) {
  const items = order?.lineItems?.nodes || [];
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 1000 }}>{order?.name || "Order"}</div>
          <div style={{ fontSize: 12, color: BRAND.muted, fontWeight: 800 }}>
            {formatDateTime(order?.createdAt)} • {order?.totalPrice ? formatMoneyV2(order.totalPrice) : "—"}
          </div>
        </div>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      </div>

      <div style={{ height: 12 }} />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Button variant="dark" onClick={onReorder} style={{ flex: 1, minWidth: 180 }}>
          Reorder these items
        </Button>
      </div>

      <div style={{ height: 12 }} />

      {!items.length ? (
        <div style={{ color: BRAND.muted, fontWeight: 900 }}>No line items found.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((li) => (
            <div
              key={li.id}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                padding: 10,
                borderRadius: 16,
                border: "1px solid #242424",
                background: "#0f0f0f",
              }}
            >
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 14,
                  overflow: "hidden",
                  border: "1px solid #222",
                  background: "#0b0b0b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {li?.image?.url ? (
                  <img src={li.image.url} alt={li.image.altText || li.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ color: BRAND.muted, fontWeight: 900 }}>ACE</div>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 1000, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis" }}>{li?.name || "Item"}</div>
                <div style={{ fontSize: 12, color: BRAND.muted, marginTop: 4, fontWeight: 800 }}>
                  Qty: {li?.quantity || 1} {li?.sku ? `• SKU: ${li.sku}` : ""}
                </div>
              </div>

              <Badge>x{li?.quantity || 1}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
