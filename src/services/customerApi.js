/**
 * src/services/customerApi.js
 * Shopify Customer Account API (orders, profile)
 */

import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { ACCOUNT_DOMAIN } from "../config/shopify.js";

/**
 * Fetch customer orders using Customer Account API
 */
export async function fetchCustomerOrders(accessToken, first = 10) {
  const query = `
    query Orders($first: Int!) {
      customer {
        orders(first: $first, sortKey: PROCESSED_AT, reverse: true) {
          nodes {
            id
            name
            number
            createdAt
            processedAt
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

  const graphqlApiUrl = `https://${ACCOUNT_DOMAIN}/customer/api/2026-01/graphql`;

  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.request({
      method: "POST",
      url: graphqlApiUrl,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      data: JSON.stringify({ query, variables: { first } }),
    });

    const json = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
    if (r.status >= 400) {
      throw new Error(
        json?.errors?.[0]?.message ||
          json?.error ||
          `HTTP ${r.status}`
      );
    }
    if (json?.errors?.length) {
      throw new Error(json.errors[0]?.message);
    }
    return json.data;
  }

  // WEB
  const res = await fetch(graphqlApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query, variables: { first } }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      json?.errors?.[0]?.message ||
        json?.error ||
        `HTTP ${res.status}`
    );
  }
  if (json?.errors?.length) {
    throw new Error(json.errors[0]?.message);
  }
  return json.data;
}

/**
 * Fetch customer profile
 */
export async function fetchCustomerProfile(accessToken) {
  const query = `
    query {
      customer {
        firstName
        lastName
        email
        phone
      }
    }
  `;

  const graphqlApiUrl = `https://${ACCOUNT_DOMAIN}/customer/api/2026-01/graphql`;

  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.request({
      method: "POST",
      url: graphqlApiUrl,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      data: JSON.stringify({ query }),
    });

    const json = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
    if (r.status >= 400) {
      throw new Error(json?.errors?.[0]?.message || `HTTP ${r.status}`);
    }
    return json.data?.customer;
  }

  // WEB
  const res = await fetch(graphqlApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.errors?.[0]?.message || `HTTP ${res.status}`);
  }
  return json.data?.customer;
}
