import { createShopifyRouteTemplates } from "@shopify/hydrogen";

// Shopify's default paths are served directly by this app:
// /products/:productHandle, /collections/:collectionHandle, /cart and /search.
// Keep this shared manifest empty until a custom resource path is introduced.
export const shopifyRouteTemplates = createShopifyRouteTemplates({});
