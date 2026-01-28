/**
 * Vercel API Route: submitVatVerification
 * 
 * Receives VAT verification form submission from app.
 * Adds customer to "no vat customers" segment.
 * Updates metafield with VAT number for your team to review.
 * 
 * POST /api/submitVatVerification
 * Body: { customerEmail, businessName, country, vatNumber }
 */

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { customerEmail, businessName, country, vatNumber } = req.body;

    // Validate inputs
    if (!customerEmail || !businessName || !country || !vatNumber) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const shopDomain = process.env.SHOPIFY_DOMAIN || process.env.SHOP_DOMAIN || "acefixings.myshopify.com";
    const adminToken = process.env.SHOPIFY_ADMIN_API_TOKEN;
    const apiVersion = process.env.SHOPIFY_API_VERSION || "2025-07";

    if (!adminToken) {
      console.error("Missing SHOPIFY_ADMIN_API_TOKEN in environment");
      return res.status(500).json({ error: "Missing admin API token" });
    }

    console.log(`[VAT] Using domain: ${shopDomain}, API version: ${apiVersion}`);
    console.log(`[VAT] Searching for customer: ${customerEmail}`);

    // Step 1: Find customer by email
    const searchQuery = `
      query SearchCustomers($query: String!) {
        customers(first: 1, query: $query) {
          edges {
            node {
              id
              email
            }
          }
        }
      }
    `;

    const searchResponse = await graphqlRequest(
      shopDomain,
      adminToken,
      apiVersion,
      searchQuery,
      { query: `email:${customerEmail}` }
    );

    if (!searchResponse?.customers?.edges?.length) {
      console.warn(`Customer not found: ${customerEmail}`);
      return res.status(404).json({ error: `Customer with email ${customerEmail} not found` });
    }

    const customerId = searchResponse.customers.edges[0].node.id;
    console.log(`[VAT] Found customer: ${customerId}`);

    // Step 2: Update customer metafield with VAT number
    const updateMetafieldMutation = `
      mutation UpdateCustomerMetafield($customerId: ID!, $metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(ownerId: $customerId, metafields: $metafields) {
          userErrors {
            field
            message
          }
          metafields {
            id
            key
            value
          }
        }
      }
    `;

    const metafieldResponse = await graphqlRequest(
      shopDomain,
      adminToken,
      apiVersion,
      updateMetafieldMutation,
      {
        customerId: customerId,
        metafields: [
          {
            namespace: "acefixings",
            key: "tax_vat_number",
            type: "single_line_text_field",
            value: vatNumber,
          },
          {
            namespace: "acefixings",
            key: "business_name",
            type: "single_line_text_field",
            value: businessName,
          },
          {
            namespace: "acefixings",
            key: "business_country",
            type: "single_line_text_field",
            value: country,
          },
        ],
      }
    );

    if (metafieldResponse?.errors) {
      console.error("Metafield errors:", metafieldResponse.errors);
      throw new Error(`Metafield update failed: ${JSON.stringify(metafieldResponse.errors)}`);
    }

    console.log(`[VAT] Metafields updated for customer ${customerId}`);

    // Step 3: Add customer to "no vat customers" segment
    const segmentMutation = `
      mutation AddCustomerToSegment($customerId: ID!, $segmentId: ID!) {
        segmentCustomersAdd(customerId: $customerId, segmentId: $segmentId) {
          userErrors {
            field
            message
          }
          customers {
            id
          }
        }
      }
    `;

    // First, get the segment ID for "no vat customers"
    const segmentQuery = `
      query GetSegments($first: Int!) {
        segments(first: $first) {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    `;

    const segmentData = await graphqlRequest(
      shopDomain,
      adminToken,
      apiVersion,
      segmentQuery,
      { first: 100 }
    );

    const noVatSegment = segmentData?.segments?.edges?.find(
      (e) => e.node.name?.toLowerCase() === "no vat customers"
    );

    if (!noVatSegment) {
      console.warn("[VAT] 'no vat customers' segment not found. Metafields updated but segment addition skipped.");
      return res.status(200).json({
        success: true,
        message: "VAT data submitted. Please ensure 'no vat customers' segment exists in Shopify.",
      });
    }

    console.log(`[VAT] Found segment: ${noVatSegment.node.id}`);

    const segmentResponse = await graphqlRequest(
      shopDomain,
      adminToken,
      apiVersion,
      segmentMutation,
      {
        customerId: customerId,
        segmentId: noVatSegment.node.id,
      }
    );

    if (segmentResponse?.errors) {
      console.error("Segment errors:", segmentResponse.errors);
      throw new Error(`Segment add failed: ${JSON.stringify(segmentResponse.errors)}`);
    }

    console.log(`[VAT] Customer added to segment`);

    return res.status(200).json({
      success: true,
      message: "VAT verification submitted. Your team will review and approve soon.",
    });
  } catch (err) {
    console.error("[VAT] Error:", err.message);
    return res.status(500).json({
      error: err.message || "Internal server error",
    });
  }
}

/**
 * Helper: Make GraphQL request to Shopify Admin API using fetch
 */
async function graphqlRequest(domain, token, apiVersion, query, variables) {
  const url = `https://${domain}/admin/api/${apiVersion}/graphql.json`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: variables || {},
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  
  if (data.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
  }

  return data.data || data;
}
