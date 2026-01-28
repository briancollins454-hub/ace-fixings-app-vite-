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
    const apiVersion = process.env.SHOPIFY_API_VERSION || "2024-01";

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
      mutation UpdateCustomerMetafield($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
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
        metafields: [
          {
            ownerId: customerId,
            namespace: "custom",
            key: "vat_number",
            type: "single_line_text_field",
            value: vatNumber,
          },
          {
            ownerId: customerId,
            namespace: "custom",
            key: "business_name",
            type: "single_line_text_field",
            value: businessName,
          },
          {
            ownerId: customerId,
            namespace: "custom",
            key: "business_country",
            type: "single_line_text_field",
            value: country,
          },
        ],
      }
    );
    
    console.log(`[VAT] Metafield response:`, JSON.stringify(metafieldResponse));

    if (metafieldResponse?.errors) {
      console.error("Metafield errors:", metafieldResponse.errors);
      throw new Error(`Metafield update failed: ${JSON.stringify(metafieldResponse.errors)}`);
    }

    // Check for userErrors from the mutation
    if (metafieldResponse?.metafieldsSet?.userErrors?.length > 0) {
      console.error("Metafield userErrors:", metafieldResponse.metafieldsSet.userErrors);
      throw new Error(`Metafield update failed: ${JSON.stringify(metafieldResponse.metafieldsSet.userErrors)}`);
    }

    console.log(`[VAT] Metafields updated for customer ${customerId}`);

    // Step 3: Add "No Vat Customers" tag to customer so they appear in the segment
    const addTagMutation = `
      mutation AddCustomerTag($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) {
          userErrors {
            field
            message
          }
          node {
            id
          }
        }
      }
    `;

    const tagResponse = await graphqlRequest(
      shopDomain,
      adminToken,
      apiVersion,
      addTagMutation,
      {
        id: customerId,
        tags: ["No Vat Customers"],
      }
    );

    if (tagResponse?.tagsAdd?.userErrors?.length > 0) {
      console.warn("[VAT] Tag add warning:", tagResponse.tagsAdd.userErrors);
      // Don't fail - metafields were saved successfully
    } else {
      console.log(`[VAT] Added 'No Vat Customers' tag to customer ${customerId}`);
    }

    // Success - metafields are saved and tag added
    return res.status(200).json({
      success: true,
      message: "VAT verification submitted successfully. Your application will be reviewed shortly.",
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
