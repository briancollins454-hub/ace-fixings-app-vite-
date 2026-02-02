/**
 * src/services/oauth.js
 * OAuth login flow with PKCE
 */

import { Browser } from "@capacitor/browser";
import { Preferences } from "@capacitor/preferences";
import { Capacitor } from "@capacitor/core";
import {
  ACCOUNT_DOMAIN,
  OIDC_CONFIG_URL,
  CUSTOMER_ACCOUNT_API_DISCOVERY_URL,
  CUSTOMER_ACCOUNTS_CLIENT_ID,
  REDIRECT_URI,
} from "../config/shopify.js";
import { STORAGE_KEYS } from "../config/storage.js";
import {
  randomString,
  sha256Base64Url,
  decodeJwt,
  safeJsonParse,
} from "../utils/crypto.js";
import { fetchJson, httpPostForm } from "../utils/http.js";
import { toQuery } from "../utils/url.js";

/**
 * Fetch OIDC and Customer API discovery endpoints
 */
export async function discoverOidcAndApi() {
  const [oidcJson, custJson] = await Promise.all([
    fetchJson(OIDC_CONFIG_URL),
    fetchJson(CUSTOMER_ACCOUNT_API_DISCOVERY_URL),
  ]);
  return { oidcJson, custJson };
}

/**
 * Generate PKCE verifier and challenge
 */
export async function generatePkce() {
  const verifier = randomString(64);
  const challenge = await sha256Base64Url(verifier);
  const state = randomString(24);
  const nonce = randomString(24);
  return { verifier, challenge, state, nonce };
}

/**
 * Build OAuth authorization URL
 */
export function buildAuthUrl(oidcJson, pkce) {
  const authUrl =
    `${oidcJson.authorization_endpoint}?` +
    toQuery({
      client_id: CUSTOMER_ACCOUNTS_CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      scope: "openid email customer-account-api:full",
      state: pkce.state,
      nonce: pkce.nonce,
      code_challenge: pkce.challenge,
      code_challenge_method: "S256",
    });

  console.log("🌐 AUTH URL LENGTH:", authUrl.length);
  return authUrl;
}

/**
 * Save PKCE to storage
 */
export async function savePkce(pkce) {
  await Preferences.set({
    key: STORAGE_KEYS.PKCE,
    value: JSON.stringify({
      ...pkce,
      redirect: REDIRECT_URI,
      created_at: Date.now(),
    }),
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code, pkceVerifier) {
  let tokenEndpoint = (await fetchJson(OIDC_CONFIG_URL)).token_endpoint;

  // Use absolute URL on native if relative
  if (
    Capacitor.isNativePlatform() &&
    !tokenEndpoint.startsWith("http")
  ) {
    tokenEndpoint = `https://${ACCOUNT_DOMAIN}/authentication/oauth/token`;
  }

  const tokenJson = await httpPostForm(tokenEndpoint, {
    grant_type: "authorization_code",
    client_id: CUSTOMER_ACCOUNTS_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code,
    code_verifier: pkceVerifier,
  });

  if (!tokenJson.access_token) {
    throw new Error("Token exchange failed (missing access_token)");
  }

  return {
    access_token: tokenJson.access_token,
    id_token: tokenJson.id_token,
    refresh_token: tokenJson.refresh_token,
    expires_at: Date.now() + (Number(tokenJson.expires_in || 3600) * 1000),
  };
}

/**
 * Get PKCE data from storage
 */
export async function getPkceFromStorage() {
  const pkce = await Preferences.get({ key: STORAGE_KEYS.PKCE });
  return pkce?.value ? safeJsonParse(pkce.value) : null;
}

/**
 * Clear PKCE from storage
 */
export async function clearPkce() {
  await Preferences.remove({ key: STORAGE_KEYS.PKCE });
}
