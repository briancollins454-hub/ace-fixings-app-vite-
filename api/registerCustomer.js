/**
 * Vercel API Route: registerCustomer
 * 
 * Creates or updates a customer in Shopify with all details in one go.
 * No OAuth required - simple email-based registration.
 * 
 * POST /api/registerCustomer
 * Body: { email, firstName, lastName, phone, address, vatNumber, password }
 */

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { 
      email, 
      firstName, 
      lastName, 
      phone,
      address, // { address1, address2, city, province, zip, country }
      vatNumber,
      password 
    } = req.body;

    // Validate required fields
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const shopDomain = process.env.SHOPIFY_DOMAIN || process.env.SHOP_DOMAIN || "ace-fixings.myshopify.com";
    const adminToken = process.env.SHOPIFY_ADMIN_API_TOKEN;
    const apiVersion = process.env.SHOPIFY_API_VERSION || "2024-01";

    if (!adminToken) {
      console.error("Missing SHOPIFY_ADMIN_API_TOKEN");
      return res.status(500).json({ error: "Server configuration error" });
    }

    console.log(`[Register] Processing registration for: ${email}`);

    // Step 1: Check if customer already exists
    const searchQuery = `
      query SearchCustomers($query: String!) {
        customers(first: 1, query: $query) {
          edges {
            node {
              id
              email
              firstName
              lastName
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
      { query: `email:${email}` }
    );

    let customerId;
    let isNewCustomer = false;

    if (searchResponse?.customers?.edges?.length > 0) {
      // Customer exists - update them
      customerId = searchResponse.customers.edges[0].node.id;
      console.log(`[Register] Found existing customer: ${customerId}`);
    } else {
      // Create new customer
      console.log(`[Register] Creating new customer: ${email}`);
      
      const createMutation = `
        mutation CreateCustomer($input: CustomerInput!) {
          customerCreate(input: $input) {
            customer {
              id
              email
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const customerInput = {
        email,
        firstName: firstName || "",
        lastName: lastName || "",
        phone: phone || null,
        tags: vatNumber ? ["No Vat Customers"] : [],
      };

      // Add address if provided
      if (address && address.address1) {
        customerInput.addresses = [{
          address1: address.address1,
          address2: address.address2 || "",
          city: address.city || "",
          province: address.province || "",
          zip: address.zip || "",
          country: address.country || "Ireland",
        }];
      }

      const createResponse = await graphqlRequest(
        shopDomain,
        adminToken,
        apiVersion,
        createMutation,
        { input: customerInput }
      );

      if (createResponse?.customerCreate?.userErrors?.length > 0) {
        const errors = createResponse.customerCreate.userErrors;
        console.error("[Register] Create errors:", errors);
        return res.status(400).json({ 
          error: errors.map(e => e.message).join(", ") 
        });
      }

      customerId = createResponse?.customerCreate?.customer?.id;
      isNewCustomer = true;
      console.log(`[Register] Created customer: ${customerId}`);
    }

    if (!customerId) {
      return res.status(500).json({ error: "Failed to create/find customer" });
    }

    // Step 2: Add VAT number and other details as metafields
    if (vatNumber) {
      const metafieldMutation = `
        mutation SetMetafields($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              id
              key
              value
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const metafields = [
        {
          ownerId: customerId,
          namespace: "custom",
          key: "tax_vat_number",
          type: "single_line_text_field",
          value: vatNumber,
        }
      ];

      // Add business name if firstName provided (using it as business name for B2B)
      if (firstName) {
        metafields.push({
          ownerId: customerId,
          namespace: "custom",
          key: "business_name",
          type: "single_line_text_field",
          value: `${firstName} ${lastName || ""}`.trim(),
        });
      }

      const metafieldResponse = await graphqlRequest(
        shopDomain,
        adminToken,
        apiVersion,
        metafieldMutation,
        { metafields }
      );

      console.log(`[Register] Metafield response:`, JSON.stringify(metafieldResponse));

      if (metafieldResponse?.metafieldsSet?.userErrors?.length > 0) {
        console.warn("[Register] Metafield warnings:", metafieldResponse.metafieldsSet.userErrors);
      }

      // Also add the "No Vat Customers" tag if not already added during creation
      if (!isNewCustomer) {
        const tagMutation = `
          mutation AddTag($id: ID!, $tags: [String!]!) {
            tagsAdd(id: $id, tags: $tags) {
              userErrors {
                field
                message
              }
            }
          }
        `;

        await graphqlRequest(
          shopDomain,
          adminToken,
          apiVersion,
          tagMutation,
          { id: customerId, tags: ["No Vat Customers"] }
        );
        console.log(`[Register] Added 'No Vat Customers' tag`);
      }
    }

    // Step 3: Send account invite email (so they can set password and login to Shopify)
    if (isNewCustomer) {
      const inviteMutation = `
        mutation SendInvite($customerId: ID!) {
          customerSendAccountInviteEmail(customerId: $customerId) {
            customer {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      try {
        await graphqlRequest(
          shopDomain,
          adminToken,
          apiVersion,
          inviteMutation,
          { customerId }
        );
        console.log(`[Register] Sent account invite email to ${email}`);
      } catch (e) {
        console.warn("[Register] Could not send invite email:", e.message);
      }
    }

    return res.status(200).json({
      success: true,
      customerId,
      isNewCustomer,
      message: isNewCustomer 
        ? "Account created! Check your email for login instructions."
        : "Account updated successfully.",
    });

  } catch (err) {
    console.error("[Register] Error:", err.message);
    return res.status(500).json({
      error: err.message || "Registration failed",
    });
  }
}

/**
 * Helper: Make GraphQL request to Shopify Admin API
 */
async function graphqlRequest(domain, token, apiVersion, query, variables) {
  const url = `https://${domain}/admin/api/${apiVersion}/graphql.json`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: variables || {} }),
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
