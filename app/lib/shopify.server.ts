import { createContext } from "react-router";
import {
  createShopifyRequestContext,
  createStorefrontClient,
  type ShopifyScriptsI18n,
  type ShopifyScriptsShop,
  type StorefrontClient,
} from "@shopify/hydrogen";

export const storefrontClientContext = createContext<StorefrontClient>();

export function storeDomainFromEnvironment(): string {
  const rawDomain = process.env.PUBLIC_STORE_DOMAIN ?? process.env.SHOPIFY_STORE_DOMAIN;
  if (!rawDomain) throw new Error("Shopify Storefront is not configured on the server.");
  return rawDomain.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function publicStorefrontTokenFromEnvironment(): string | undefined {
  // WebDev supplies the managed token under SHOPIFY_*; prefer an app-owned Hydrogen override.
  return process.env.PUBLIC_STOREFRONT_API_TOKEN ?? process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;
}

const SHOPIFY_I18N: ShopifyScriptsI18n = {
  country: "TW",
  language: "ZH_TW",
  currency: "TWD",
};

/** Values used by Shopify storefront scripts; never includes an access token. */
export function getShopifyScriptsData() {
  const shop: ShopifyScriptsShop = {
    shopId: process.env.SHOPIFY_SHOP_ID ?? "gid://shopify/Shop/77085212842",
    storefrontId: process.env.SHOPIFY_STOREFRONT_ID ?? "0",
    myshopifyDomain: storeDomainFromEnvironment(),
  };
  return { shop, i18n: SHOPIFY_I18N };
}

export function createShopifyRequest(request: Request) {
  const requestContext = createShopifyRequestContext({ request, i18n: SHOPIFY_I18N });
  const storefrontClient = createStorefrontClient({
    type: "public",
    requestContext,
    config: {
      storeDomain: storeDomainFromEnvironment(),
      publicStorefrontToken: publicStorefrontTokenFromEnvironment(),
    },
  });
  return { requestContext, storefrontClient };
}
