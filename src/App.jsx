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
// BRAND / THEME
// ==========================
const BRAND = {
  name: "Ace Fixings",
  domain: "acefixings.com",
  primary: "#ef4444",
  bg: "#0a0a0a",
  card: "#111111",
  text: "#ffffff",
  muted: "#a3a3a3",
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
function Button({ children, onClick, disabled, style, variant = "primary", title, className, type = "button", loading = false, icon }) {
  const base = {
    border: "none",
    padding: "12px 14px",
    borderRadius: 14,
    fontWeight: 700,
    cursor: disabled || loading ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    transition: "all 0.12s cubic-bezier(0.34, 1.56, 0.64, 1)",
    userSelect: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    whiteSpace: "nowrap",
    maxWidth: "100%",
    position: "relative",
    overflow: "hidden",
  };
  const variants = {
    primary: { 
      background: `linear-gradient(135deg, ${BRAND.primary}, #ff6b6b)`,
      backgroundSize: "200% 200%",
      color: "#fff",
      boxShadow: "0 4px 12px rgba(239,68,68,0.25)",
    },
    ghost: { background: "transparent", color: "#fff", border: "1px solid #333" },
    dark: { background: "#1c1c1c", color: "#fff", border: "1px solid #2a2a2a" },
  };
  return (
    <button
      type={type}
      className={className}
      title={title}
      onClick={disabled || loading ? undefined : onClick}
      style={{ ...base, ...variants[variant], ...style }}
      onMouseDown={(e) => {
        if (!disabled && !loading) e.currentTarget.style.transform = "scale(0.98)";
      }}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {loading ? (
        <>
          <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          {children}
        </>
      ) : (
        <>
          {icon && <span>{icon}</span>}
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
        background: active ? BRAND.primary : "#181818",
        color: "#fff",
        border: "1px solid #2a2a2a",
        padding: "8px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function Skeleton({ h = 16, w = "100%", r = 12, style }) {
  return (
    <div
      style={{
        height: h,
        width: w,
        borderRadius: r,
        background: "linear-gradient(90deg, #1a1a1a 0%, #2a2a2a 50%, #1a1a1a 100%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 2s infinite",
        ...style,
      }}
    />
  );
}

function Badge({ children }) {
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
        background: "rgba(255,255,255,0.10)",
        border: "1px solid rgba(255,255,255,0.14)",
        fontSize: 12,
        fontWeight: 1000,
        lineHeight: 1,
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
        gap: 4,
        padding: "4px 8px",
        borderRadius: 8,
        background: "rgba(220,38,38,0.15)",
        border: "1px solid rgba(220,38,38,0.4)",
        fontSize: 11,
        fontWeight: 900,
        color: "#ff9999",
      }}>
        ✕ Out of Stock
      </span>
    );
  }
  const isLow = quantity && quantity < 5;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "4px 8px",
      borderRadius: 8,
      background: isLow ? "rgba(251,146,60,0.15)" : "rgba(34,197,94,0.15)",
      border: isLow ? "1px solid rgba(251,146,60,0.4)" : "1px solid rgba(34,197,94,0.4)",
      fontSize: 11,
      fontWeight: 900,
      color: isLow ? "#ffb366" : "#66ff66",
    }}>
      {isLow ? "⚠ Low Stock" : "✓ In Stock"}
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
      padding: "4px 8px",
      borderRadius: 8,
      background: "linear-gradient(135deg, rgba(251,146,60,0.2), rgba(239,68,68,0.2))",
      border: "1px solid rgba(251,146,60,0.4)",
      fontSize: 11,
      fontWeight: 900,
      color: "#ffa366",
    }}>
      Save {percent}%
    </span>
  );
}

function VatToggle({ mode, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <button
        type="button"
        onClick={() => onChange("inc")}
        style={{
          flex: 1,
          padding: "8px 12px",
          borderRadius: 12,
          background: mode === "inc" ? BRAND.primary : "#1a1a1a",
          border: `1px solid ${mode === "inc" ? "transparent" : "#333"}`,
          color: "#fff",
          fontWeight: 900,
          fontSize: 12,
          cursor: "pointer",
          transition: "all 0.2s",
          boxShadow: mode === "inc" ? "0 2px 8px rgba(239,68,68,0.2)" : "none",
        }}
      >
        Inc VAT
      </button>
      <button
        type="button"
        onClick={() => onChange("ex")}
        style={{
          flex: 1,
          padding: "8px 12px",
          borderRadius: 12,
          background: mode === "ex" ? BRAND.primary : "#1a1a1a",
          border: `1px solid ${mode === "ex" ? "transparent" : "#333"}`,
          color: "#fff",
          fontWeight: 900,
          fontSize: 12,
          cursor: "pointer",
          transition: "all 0.2s",
          boxShadow: mode === "ex" ? "0 2px 8px rgba(239,68,68,0.2)" : "none",
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
      const response = await fetch("/api/submitVatVerification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerEmail: customerEmail,
          businessName,
          country,
          vatNumber,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setToast(`❌ Error: ${result.error || "Failed to submit VAT verification"}`);
        return false;
      }

      setToast("✓ VAT verification submitted for review. Your team will verify and approve soon.");
      setVatFormBusinessName("");
      setVatFormVatNumber("");
      setVatFormSubmitted(true);
      return true;
    } catch (err) {
      setToast(`❌ Error: ${err?.message || "Failed to submit VAT verification"}`);
      return false;
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
            OneSignal.setAppId(ONESIGNAL_APP_ID);
            OneSignal.promptForPushNotificationsWithUserResponse(() => {});
          } catch {}
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

  function displayPrice(basePrice) {
    const inc = basePrice;
    const ex = basePrice / (1 + VAT_RATE);
    return vatMode === "inc" ? formatGBP(inc) : formatGBP(ex);
  }

  function displayCompareAt(compareAtPrice) {
    if (!compareAtPrice) return "";
    const inc = compareAtPrice;
    const ex = compareAtPrice / (1 + VAT_RATE);
    return vatMode === "inc" ? formatGBP(inc) : formatGBP(ex);
  }

  function getDisplayedCartTotals() {
    if (!cart) return { subtotal: 0, tax: 0, total: 0 };
    // Shopify prices are Inc-VAT; recalculate based on vatMode
    const lineSubtotal = cart.lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
    if (vatMode === "inc") {
      return {
        subtotal: lineSubtotal,
        tax: cart.cost.tax,
        total: cart.cost.total,
      };
    } else {
      // Ex-VAT mode: remove VAT from all totals
      const exSubtotal = lineSubtotal / (1 + VAT_RATE);
      const exTax = 0;
      const exTotal = exSubtotal;
      return {
        subtotal: exSubtotal,
        tax: exTax,
        total: exTotal,
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

    const tokenJson = await httpPostForm(oidcJson.token_endpoint, {
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
    color: BRAND.text,
    display: "flex",
    justifyContent: "center",
    overflowX: "hidden",
  };

  const shell = {
    width: "100%",
    maxWidth: 1100,
    paddingTop: 16,
    paddingBottom: "calc(96px + env(safe-area-inset-bottom))",
    paddingLeft: "calc(16px + env(safe-area-inset-left))",
    paddingRight: "calc(16px + env(safe-area-inset-right))",
    overflowX: "hidden",
  };

  const topbar = {
    position: "sticky",
    top: 0,
    zIndex: 5,
    background: "rgba(10,10,10,0.9)",
    backdropFilter: "blur(10px)",
    borderBottom: "1px solid #1f1f1f",
    padding: "12px 0",
    marginBottom: 12,
  };

  const card = {
    background: BRAND.card,
    border: "1px solid #202020",
    borderRadius: 18,
    padding: 14,
    boxShadow: "0 8px 22px rgba(0,0,0,0.35)",
  };

  const grid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
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
    background: "rgba(10,10,10,0.92)",
    borderTop: "1px solid #1f1f1f",
    paddingTop: 12,
    paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
    paddingLeft: "calc(12px + env(safe-area-inset-left))",
    paddingRight: "calc(12px + env(safe-area-inset-right))",
    display: "flex",
    justifyContent: "center",
    transform: "translateZ(0)",
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
  };

  const navInner = {
    width: "100%",
    maxWidth: 1100,
    display: "flex",
    gap: 10,
    justifyContent: "space-between",
    alignItems: "center",
  };

  const navBtn = (active) => ({
    flex: 1,
    minWidth: 0,
    height: 48,
    padding: "0 8px",
    borderRadius: 16,
    background: active ? BRAND.primary : "#171717",
    border: "1px solid #2a2a2a",
    color: "#fff",
    fontWeight: 900,
    fontSize: 12,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    lineHeight: 1.2,
    overflow: "hidden",
    whiteSpace: "nowrap",
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
    @keyframes shimmer { 0%{background-position: -1000px 0} 100%{background-position: 1000px 0} }
    @keyframes viewIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0px); } }
    @keyframes cardSlideIn { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: translateY(0px) scale(1); } }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    @keyframes slideInLeft { from { opacity: 0; transform: translateX(-16px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes slideInRight { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes gradientShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }

    html, body, #root {
      width: 100%;
      height: 100%;
      margin: 0;
      background: ${BRAND.bg};
      overflow-x: hidden;
    }

    body {
      overscroll-behavior-x: none;
      overscroll-behavior-y: none;
      touch-action: pan-y;
      -webkit-overflow-scrolling: touch;
    }

    * {
      box-sizing: border-box;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      -webkit-tap-highlight-color: transparent;
    }

    input, button { outline: none; }
    ::selection { background: rgba(239,68,68,0.35); }

    .skeleton-shimmer {
      background: linear-gradient(90deg, #1a1a1a 0%, #2a2a2a 50%, #1a1a1a 100%);
      background-size: 1000px 100%;
      animation: shimmer 2s infinite;
    }

    .btn-loading {
      pointer-events: none;
      opacity: 0.8;
    }

    .btn-loading::after {
      content: '';
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-left: 6px;
    }

    .card-hover {
      transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .card-hover:active {
      transform: scale(0.96);
    }

    .price-transition {
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    a { color: inherit; }

    .view-anim {
      animation: viewIn 180ms ease-out;
      will-change: transform, opacity;
    }

    @media (max-width: 380px) {
      .search-row { grid-template-columns: 1fr; }
      .top-cart-btn { width: 100% !important; }
    }
  `;

  if (!booted) {
    return (
      <div style={layout}>
        <style>{GLOBAL_CSS}</style>
        <div style={shell}>
          <div style={{ ...card, marginTop: 18 }}>
            <Skeleton h={18} w={220} />
            <div style={{ height: 10 }} />
            <Skeleton h={14} w={"70%"} />
            <div style={{ height: 12 }} />
            <Skeleton h={90} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={layout}>
      <style>{GLOBAL_CSS}</style>

      <div style={shell}>
        <div style={topbar}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 18, fontWeight: 1000, letterSpacing: 0.2 }}>{BRAND.name}</div>
              <div style={{ fontSize: 12, color: BRAND.muted }}>
                {userLine ? `Signed in as ${userLine}` : "Browse & order from your phone"}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <div style={{ minWidth: 220, display: "flex" }}>
                <VatToggle mode={vatMode} onChange={setVatMode} />
              </div>

              {compareProducts.length > 0 && (
                <Button
                  variant="ghost"
                  onClick={() => setView("comparison")}
                  title="Compare products"
                  icon="⚖️"
                  style={{ fontSize: 12 }}
                >
                  Compare ({compareProducts.length})
                </Button>
              )}

              {favorites.length > 0 && (
                <Button
                  variant="ghost"
                  onClick={() => setView("favorites")}
                  title="View favorites"
                  icon="❤️"
                  style={{ fontSize: 12 }}
                >
                  Favorites ({favorites.length})
                </Button>
              )}

              {auth ? (
                <Button variant="ghost" onClick={() => setView("account")} icon="👤" style={{ fontSize: 12 }}>
                  Account
                </Button>
              ) : (
                <Button variant="ghost" onClick={startLogin} title="Login" icon="🔐" style={{ fontSize: 12 }}>
                  Login
                </Button>
              )}
            </div>
          </div>

          <div style={{ height: 10 }} />

          <div className="search-row" style={searchRow}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={view === "home" ? "Search collections…" : "Search products…"}
              style={{
                width: "100%",
                minWidth: 0,
                padding: "12px 12px",
                borderRadius: 16,
                border: "1px solid #262626",
                background: "#0f0f0f",
                color: "#fff",
                fontWeight: 700,
              }}
            />
            <Button
              className="top-cart-btn"
              variant="dark"
              onClick={async () => {
                try {
                  await ensureCartId();
                  setView("cart");
                } catch (e) {
                  setError(String(e?.message || e));
                }
              }}
              title="Open cart"
              style={{ minWidth: 120, justifyContent: "space-between", gap: 10 }}
            >
              <span style={{ fontWeight: 1000 }}>Cart</span>
              <Badge>{cartCount}</Badge>
            </Button>
          </div>

          {error ? (
            <div
              style={{
                marginTop: 10,
                background: "#2a0f0f",
                border: "1px solid #4a1c1c",
                color: "#ffd1d1",
                padding: 10,
                borderRadius: 14,
              }}
            >
              <div style={{ fontWeight: 900 }}>Error</div>
              <div style={{ fontSize: 13, opacity: 0.95 }}>{error}</div>
            </div>
          ) : null}

          {!isNative ? (
            <div
              style={{
                marginTop: 10,
                background: "#0f1a2a",
                border: "1px solid #1c2e4a",
                color: "#d8e8ff",
                padding: 10,
                borderRadius: 14,
              }}
            >
              <div style={{ fontWeight: 900 }}>Web preview mode</div>
              <div style={{ fontSize: 13, opacity: 0.95 }}>
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
                      style={{
                        ...card,
                        cursor: "pointer",
                        animation: `cardSlideIn 0.4s ease ${idx * 40}ms backwards`,
                        transition: "all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
                      }}
                      onClick={() => openCollection(c)}
                      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
                      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                      role="button"
                    >
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
                        {c.imageUrl && (
                          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, transparent 0%, rgba(0,0,0,0.3) 100%)", zIndex: 1 }} />
                        )}
                        {c.imageUrl ? (
                          <img src={c.imageUrl} alt={c.imageAlt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <div style={{ color: BRAND.muted, fontWeight: 900 }}>📦</div>
                        )}
                      </div>

                      <div style={{ height: 10 }} />
                      <div style={{ fontWeight: 1000 }}>{c.title}</div>
                      <div style={{ fontSize: 12, color: BRAND.muted, marginTop: 6 }}>{c.handle}</div>

                      <div style={{ height: 12 }} />
                      <Button variant="dark" onClick={(e) => { e.stopPropagation(); openCollection(c); }} style={{ width: "100%", fontSize: 12 }} icon="→">
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
                <div style={{ ...card, marginBottom: 12 }}>
                  <div style={{ fontSize: 13, color: "#e5e5e5" }} dangerouslySetInnerHTML={{ __html: activeCollection.descriptionHtml }} />
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
            <div style={card}>
              <div style={{ fontSize: 18, fontWeight: 1000 }}>Account</div>
              <div style={{ marginTop: 8, fontSize: 13, color: BRAND.muted, fontWeight: 800 }}>
                {auth ? (userLine ? `You are signed in as ${userLine}` : "Signed in") : "Not signed in"}
              </div>

              {isNonVatCustomer && (
                <div style={{ marginTop: 10, padding: "8px 10px", background: "#1a2a1a", border: "1px solid #2d5a2d", borderRadius: 12, fontSize: 12, color: "#7cff7c", fontWeight: 900 }}>
                  ✓ Non-VAT Account (Prices shown excluding VAT)
                </div>
              )}

              <div style={{ height: 14 }} />

              {/* TAX EXEMPTION STATUS */}
              {companyAccount && companyAccount.reverseCharge && (
                <div style={{ padding: 12, background: "#1a2a1a", border: "1px solid #2d5a2d", borderRadius: 12, marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 1000, color: "#7cff7c", marginBottom: 8 }}>
                    🇮🇪 Tax Exempt Account
                  </div>
                  <div style={{ fontSize: 12, color: "#a0d9a0", marginBottom: 10, lineHeight: 1.4 }}>
                    Your account is verified as tax exempt. All prices shown excluding VAT (reverse charge applies).
                  </div>
                  <div style={{ fontSize: 11, color: "#70b070", fontWeight: 900, padding: 8, background: "#0f1514", borderRadius: 8, textAlign: "center" }}>
                    ✓ VAT prices: Ex-VAT pricing active
                  </div>
                </div>
              )}

              {/* VAT VERIFICATION FORM - Only show if logged in and NOT vat-verified */}
              {auth && !companyAccount?.reverseCharge && !vatFormSubmitted && (
                <div style={{ padding: 14, background: "#1a2511", border: "1px solid #3d5a2d", borderRadius: 12, marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 1000, color: "#9cff7c", marginBottom: 12 }}>
                    📋 B2B VAT Verification
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 900, color: BRAND.muted, marginBottom: 6 }}>
                        Business Name *
                      </label>
                      <input
                        type="text"
                        value={vatFormBusinessName}
                        onChange={(e) => setVatFormBusinessName(e.target.value)}
                        placeholder="e.g., Acme Ltd."
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #2d5a2d",
                          background: "#0b1510",
                          color: "#fff",
                          fontWeight: 800,
                          fontSize: 13,
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 900, color: BRAND.muted, marginBottom: 6 }}>
                        Country *
                      </label>
                      <select
                        value={vatFormCountry}
                        onChange={(e) => setVatFormCountry(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #2d5a2d",
                          background: "#0b1510",
                          color: "#fff",
                          fontWeight: 800,
                          fontSize: 13,
                        }}
                      >
                        <option value="Ireland">Ireland</option>
                        <option value="UK">United Kingdom</option>
                        <option value="Germany">Germany</option>
                        <option value="France">France</option>
                        <option value="Spain">Spain</option>
                        <option value="Italy">Italy</option>
                        <option value="Netherlands">Netherlands</option>
                        <option value="Belgium">Belgium</option>
                        <option value="Austria">Austria</option>
                        <option value="Czech Republic">Czech Republic</option>
                        <option value="Denmark">Denmark</option>
                        <option value="Finland">Finland</option>
                        <option value="Greece">Greece</option>
                        <option value="Hungary">Hungary</option>
                        <option value="Poland">Poland</option>
                        <option value="Portugal">Portugal</option>
                        <option value="Romania">Romania</option>
                        <option value="Slovakia">Slovakia</option>
                        <option value="Slovenia">Slovenia</option>
                        <option value="Sweden">Sweden</option>
                        <option value="Other EU">Other EU</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 900, color: BRAND.muted, marginBottom: 6 }}>
                        VAT Number *
                      </label>
                      <input
                        type="text"
                        value={vatFormVatNumber}
                        onChange={(e) => setVatFormVatNumber(e.target.value)}
                        placeholder="e.g., IE1234567AB"
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #2d5a2d",
                          background: "#0b1510",
                          color: "#fff",
                          fontWeight: 800,
                          fontSize: 13,
                        }}
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
                      style={{ width: "100%", marginTop: 6, fontSize: 13 }}
                      icon={vatFormLoading ? undefined : "✓"}
                    >
                      {vatFormLoading ? "Submitting..." : "Submit for Verification"}
                    </Button>
                  </div>
                </div>
              )}

              {/* AWAITING VERIFICATION MESSAGE */}
              {auth && vatFormSubmitted && !companyAccount?.reverseCharge && (
                <div style={{ padding: 12, background: "#2a2a1a", border: "1px solid #5a5a2d", borderRadius: 12, marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 1000, color: "#ffb366", marginBottom: 6 }}>
                    ⏳ Awaiting Verification
                  </div>
                  <div style={{ fontSize: 12, color: "#d9b8a0", lineHeight: 1.4 }}>
                    Your VAT verification has been submitted. Our team will review and verify your details within 1-2 business days.
                  </div>
                </div>
              )}

              {!auth ? (
                <Button onClick={startLogin} style={{ width: "100%" }}>
                  Login with OAuth
                </Button>
              ) : (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Button variant="dark" onClick={() => setView("home")} style={{ flex: 1, minWidth: 160 }}>
                    Back to Shop
                  </Button>
                  <Button variant="dark" onClick={() => setView("orders")} style={{ flex: 1, minWidth: 160 }}>
                    Orders
                  </Button>
                  <Button onClick={logout} style={{ flex: 1, minWidth: 160 }}>
                    Logout
                  </Button>
                </div>
              )}

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
            </div>
          )}
        </div>

        {/* BOTTOM NAV */}
        <div style={bottomNav}>
          <div style={navInner}>
            <button type="button" style={navBtn(view === "home")} onClick={() => setView("home")}>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Home</span>
            </button>

            <button
              type="button"
              style={navBtn(view === "collection")}
              onClick={() => {
                if (activeCollection) setView("collection");
                else setView("home");
              }}
            >
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Browse</span>
            </button>

            <button
              type="button"
              style={navBtn(view === "cart")}
              onClick={async () => {
                try {
                  await ensureCartId();
                  setView("cart");
                } catch (e) {
                  setError(String(e?.message || e));
                }
              }}
            >
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Cart</span>
              <Badge>{cartCount}</Badge>
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
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Orders</span>
            </button>

            <button type="button" style={navBtn(view === "account")} onClick={() => setView("account")}>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Account</span>
            </button>
          </div>
        </div>

        {/* TOAST */}
        {toast ? (
          <div
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: "calc(82px + env(safe-area-inset-bottom))",
              display: "flex",
              justifyContent: "center",
              pointerEvents: "none",
              zIndex: 20000,
            }}
          >
            <div
              style={{
                pointerEvents: "none",
                background: "rgba(20,20,20,0.95)",
                border: "1px solid #2a2a2a",
                padding: "10px 14px",
                borderRadius: 999,
                color: "#fff",
                fontWeight: 900,
                boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
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

          {/* Reviews Section */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #1f1f1f" }}>
            <div style={{ fontSize: 14, fontWeight: 1000, marginBottom: 10 }}>Product Reviews (23)</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <StarRating rating={4.5} size={14} />
              <span style={{ fontSize: 12, color: BRAND.muted, fontWeight: 900 }}>4.5 out of 5</span>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ padding: 10, borderRadius: 10, background: "#0f0f0f", border: "1px solid #1f1f1f" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <StarRating rating={5} size={12} />
                  <span style={{ fontSize: 11, fontWeight: 900, color: "#fff" }}>John M.</span>
                  <span style={{ fontSize: 10, color: BRAND.muted }}>Verified</span>
                </div>
                <div style={{ fontSize: 12, color: "#e5e5e5", lineHeight: 1.5 }}>"Excellent quality! Fast shipping and exactly as described."</div>
              </div>
              <div style={{ padding: 10, borderRadius: 10, background: "#0f0f0f", border: "1px solid #1f1f1f" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <StarRating rating={4} size={12} />
                  <span style={{ fontSize: 11, fontWeight: 900, color: "#fff" }}>Sarah P.</span>
                  <span style={{ fontSize: 10, color: BRAND.muted }}>Verified</span>
                </div>
                <div style={{ fontSize: 12, color: "#e5e5e5", lineHeight: 1.5 }}>"Perfect for my projects. Great value!"</div>
              </div>
            </div>
            <Button variant="ghost" onClick={() => setToast("Thank you for your interest!")} style={{ fontSize: 11, marginTop: 10 }} icon="✎">
              Write a review
            </Button>
          </div>

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
