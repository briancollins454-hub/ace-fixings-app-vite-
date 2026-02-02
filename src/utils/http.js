/**
 * src/utils/http.js
 * HTTP request utilities (handles native vs web)
 * Native: CapacitorHttp avoids browser CORS
 * Web: uses fetch (but Shopify token endpoint blocked on localhost)
 */

import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { STOREFRONT_ENDPOINT, STOREFRONT_TOKEN } from "../config/shopify.js";
import { safeJsonParse } from "./crypto.js";

/**
 * GET request that returns text
 * Uses CapacitorHttp on native, fetch on web
 */
export async function httpGetText(url) {
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

/**
 * GET request that returns JSON
 */
export async function fetchJson(url) {
  const text = await httpGetText(url);
  const json = safeJsonParse(text);
  if (!json) throw new Error("Invalid JSON from discovery endpoint");
  return json;
}

/**
 * POST request with URL-encoded form data
 * Used for OAuth token exchange
 */
export async function httpPostForm(url, formObj) {
  const body = new URLSearchParams(formObj).toString();

  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.request({
      method: "POST",
      url,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: body,
    });

    const data = r?.data;
    const json = typeof data === "string" ? safeJsonParse(data) : data;
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

/**
 * Shopify Storefront GraphQL request
 */
export async function shopifyStorefront(query, variables = {}) {
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
