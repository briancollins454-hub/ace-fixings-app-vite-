/**
 * src/services/shopifyGraphql.js
 * Shopify Storefront GraphQL queries
 */

import { shopifyStorefront } from "../utils/http.js";

/**
 * Fetch all collections
 */
export async function fetchCollections() {
  const query = `
    query GetCollections {
      collections(first: 50) {
        edges {
          node {
            id
            title
            handle
            description
            image {
              url
              altText
            }
          }
        }
      }
    }
  `;
  const data = await shopifyStorefront(query);
  return data.collections.edges.map((e) => e.node);
}

/**
 * Fetch products in a collection
 */
export async function fetchProductsForCollection(handle, first = 50) {
  const query = `
    query GetCollectionProducts($handle: String!, $first: Int!) {
      collection(handle: $handle) {
        title
        products(first: $first) {
          edges {
            node {
              id
              title
              handle
              sku
              description
              image {
                url
                altText
              }
              priceRange {
                minVariantPrice { amount currencyCode }
                maxVariantPrice { amount currencyCode }
              }
              variants(first: 100) {
                edges {
                  node {
                    id
                    sku
                    availableForSale
                    selectedOptions {
                      name
                      value
                    }
                    price { amount currencyCode }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
  const data = await shopifyStorefront(query, { handle, first });
  if (!data.collection) return [];
  return data.collection.products.edges.map((e) => e.node);
}

/**
 * Search products by title
 */
export async function searchProducts(query, first = 50) {
  const gql = `
    query Search($query: String!, $first: Int!) {
      search(query: $query, first: $first, types: PRODUCT) {
        edges {
          node {
            ... on Product {
              id
              title
              handle
              sku
              description
              image {
                url
                altText
              }
              priceRange {
                minVariantPrice { amount currencyCode }
                maxVariantPrice { amount currencyCode }
              }
              variants(first: 100) {
                edges {
                  node {
                    id
                    sku
                    availableForSale
                    selectedOptions { name value }
                    price { amount currencyCode }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
  const data = await shopifyStorefront(gql, { query, first });
  return data.search.edges.map((e) => e.node);
}

/**
 * Fetch single product by handle
 */
export async function fetchProductByHandle(handle) {
  const query = `
    query GetProduct($handle: String!) {
      productByHandle(handle: $handle) {
        id
        title
        handle
        sku
        description
        image {
          url
          altText
        }
        images(first: 10) {
          edges {
            node {
              url
              altText
            }
          }
        }
        priceRange {
          minVariantPrice { amount currencyCode }
          maxVariantPrice { amount currencyCode }
        }
        variants(first: 100) {
          edges {
            node {
              id
              sku
              availableForSale
              selectedOptions { name value }
              price { amount currencyCode }
            }
          }
        }
      }
    }
  `;
  const data = await shopifyStorefront(query, { handle });
  return data.productByHandle;
}

/**
 * Create cart
 */
export async function createCartMutation(input = {}) {
  const query = `
    mutation CreateCart($input: CartInput) {
      cartCreate(input: $input) {
        cart {
          id
          checkoutUrl
          cost {
            subtotalAmount { amount currencyCode }
            totalTaxAmount { amount currencyCode }
            totalAmount { amount currencyCode }
          }
          lines(first: 100) {
            edges {
              node {
                id
                quantity
                cost { totalAmount { amount currencyCode } }
                merchandise {
                  ... on ProductVariant {
                    id
                    product { title handle sku image { url } }
                    selectedOptions { name value }
                    price { amount currencyCode }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
  const data = await shopifyStorefront(query, { input });
  return data.cartCreate.cart;
}

/**
 * Fetch cart by ID
 */
export async function fetchCartById(cartId) {
  const query = `
    query GetCart($cartId: ID!) {
      cart(id: $cartId) {
        id
        checkoutUrl
        cost {
          subtotalAmount { amount currencyCode }
          totalTaxAmount { amount currencyCode }
          totalAmount { amount currencyCode }
        }
        lines(first: 100) {
          edges {
            node {
              id
              quantity
              cost { totalAmount { amount currencyCode } }
              merchandise {
                ... on ProductVariant {
                  id
                  product { title handle sku image { url } }
                  selectedOptions { name value }
                  price { amount currencyCode }
                }
              }
            }
          }
        }
      }
    }
  `;
  const data = await shopifyStorefront(query, { cartId });
  return data.cart;
}

/**
 * Add lines to cart
 */
export async function addCartLinesMutation(cartId, lines) {
  const query = `
    mutation AddCartLines($cartId: ID!, $lines: [CartLineInput!]!) {
      cartLinesAdd(cartId: $cartId, lines: $lines) {
        cart {
          id
          checkoutUrl
          cost {
            subtotalAmount { amount currencyCode }
            totalTaxAmount { amount currencyCode }
            totalAmount { amount currencyCode }
          }
          lines(first: 100) {
            edges {
              node {
                id
                quantity
                cost { totalAmount { amount currencyCode } }
                merchandise {
                  ... on ProductVariant {
                    id
                    product { title handle sku image { url } }
                    selectedOptions { name value }
                    price { amount currencyCode }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
  const data = await shopifyStorefront(query, { cartId, lines });
  return data.cartLinesAdd.cart;
}

/**
 * Update cart lines
 */
export async function updateCartLinesMutation(cartId, lines) {
  const query = `
    mutation UpdateCartLines($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
      cartLinesUpdate(cartId: $cartId, lines: $lines) {
        cart {
          id
          checkoutUrl
          cost {
            subtotalAmount { amount currencyCode }
            totalTaxAmount { amount currencyCode }
            totalAmount { amount currencyCode }
          }
          lines(first: 100) {
            edges {
              node {
                id
                quantity
                cost { totalAmount { amount currencyCode } }
                merchandise {
                  ... on ProductVariant {
                    id
                    product { title handle sku image { url } }
                    selectedOptions { name value }
                    price { amount currencyCode }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
  const data = await shopifyStorefront(query, { cartId, lines });
  return data.cartLinesUpdate.cart;
}

/**
 * Remove cart lines
 */
export async function removeCartLinesMutation(cartId, lineIds) {
  const query = `
    mutation RemoveCartLines($cartId: ID!, $lineIds: [ID!]!) {
      cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
        cart {
          id
          checkoutUrl
          cost {
            subtotalAmount { amount currencyCode }
            totalTaxAmount { amount currencyCode }
            totalAmount { amount currencyCode }
          }
          lines(first: 100) {
            edges {
              node {
                id
                quantity
                cost { totalAmount { amount currencyCode } }
                merchandise {
                  ... on ProductVariant {
                    id
                    product { title handle sku image { url } }
                    selectedOptions { name value }
                    price { amount currencyCode }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
  const data = await shopifyStorefront(query, { cartId, lineIds });
  return data.cartLinesRemove.cart;
}
