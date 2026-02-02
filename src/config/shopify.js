/**
 * src/config/shopify.js
 * Shopify API configuration and constants
 */

// ==========================
// SHOPIFY STOREFRONT CONFIG
// ==========================
// Two separate domains: one for products, one for OAuth
export const SHOP_DOMAIN = "acefixings.com"; // For products/GraphQL API
export const ACCOUNT_DOMAIN = "account.acefixings.com"; // For OAuth/authentication
export const API_VERSION = "2025-07";

// ⛔ DO NOT paste tokens publicly. Rotate if this file is shared.
export const STOREFRONT_TOKEN = "6a03196efa97d2256f8b9b0c0fc148b9";
export const STOREFRONT_ENDPOINT = `https://${SHOP_DOMAIN}/api/${API_VERSION}/graphql.json`;
export const OIDC_CONFIG_URL = `https://${ACCOUNT_DOMAIN}/.well-known/openid-configuration`;
export const CUSTOMER_ACCOUNT_API_DISCOVERY_URL = `https://${ACCOUNT_DOMAIN}/.well-known/customer-account-api`;

// ==========================
// CUSTOMER ACCOUNTS (OAUTH)
// ==========================
export const CUSTOMER_ACCOUNTS_CLIENT_ID = "edc5278a-8942-4645-a802-bdfa625f8dbd";

// ✅ MUST match your AndroidManifest deep link intent-filter
// <data android:scheme="shop.90779713878.app" android:host="callback" />
export const REDIRECT_URI = "shop.90779713878.app://callback";
