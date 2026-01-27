export const handler = async (event) => {
  const reply = (statusCode, obj) => ({
    statusCode,
    headers: {
      "Content-Type": "application/json",
      // Allow browser to call this function from your Netlify site
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(obj),
  });

  try {
    if (event.httpMethod === "OPTIONS") {
      return reply(200, { ok: true });
    }

    if (event.httpMethod !== "POST") {
      return reply(405, { ok: false, error: "Use POST" });
    }

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch (e) {
      return reply(400, { ok: false, error: "Invalid JSON body", details: String(e) });
    }

    const { query, variables } = body;
    if (!query) return reply(400, { ok: false, error: "Missing query" });

    const SHOP_DOMAIN = process.env.SHOP_DOMAIN || "acefixings.com";
    const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-07";
    const TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN;

    if (!TOKEN) {
      return reply(500, { ok: false, error: "Missing SHOPIFY_STOREFRONT_TOKEN env var" });
    }

    const url = `https://${SHOP_DOMAIN}/api/${API_VERSION}/graphql.json`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": TOKEN,
      },
      body: JSON.stringify({ query, variables: variables || {} }),
    });

    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }

    if (!res.ok) {
      return reply(res.status, { ok: false, error: `Shopify HTTP ${res.status}`, details: parsed });
    }

    return reply(200, parsed);
  } catch (err) {
    return reply(500, { ok: false, error: String(err?.message || err) });
  }
};
