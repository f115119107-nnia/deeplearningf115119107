import {
  createCartCookie,
  getCart,
  getCartId,
  gql,
  parseCartRequest,
} from "@shopify/hydrogen";
import type { StorefrontClient } from "@shopify/hydrogen";

const CART_FRAGMENT = gql(`
  fragment SupportCartFields on Cart {
    id
    updatedAt
    checkoutUrl
    totalQuantity
    note
    attributes { key value }
    cost {
      subtotalAmount { amount currencyCode }
      totalAmount { amount currencyCode }
      checkoutChargeAmount { amount currencyCode }
    }
    lines(first: 250) {
      nodes {
        id
        quantity
        attributes { key value }
        cost {
          totalAmount { amount currencyCode }
          subtotalAmount { amount currencyCode }
          amountPerQuantity { amount currencyCode }
          compareAtAmountPerQuantity { amount currencyCode }
        }
        merchandise {
          ... on ProductVariant {
            id
            title
            sku
            image { id url altText width height }
            product { id title handle vendor productType }
            selectedOptions { name value }
          }
        }
      }
    }
    discountCodes { applicable code }
  }
`);

export const SUPPORT_CART_QUERY = gql(
  `query SupportCart($id: ID!, $country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) { cart(id: $id) { ...SupportCartFields } }`,
  [CART_FRAGMENT],
);

const CART_CREATE = gql(
  `mutation SupportCartCreate($input: CartInput!, $country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) { cartCreate(input: $input) { cart { ...SupportCartFields } userErrors { code field message } warnings { code message target } } }`,
  [CART_FRAGMENT],
);
const CART_LINES_ADD = gql(
  `mutation SupportCartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!, $country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) { cartLinesAdd(cartId: $cartId, lines: $lines) { cart { ...SupportCartFields } userErrors { code field message } warnings { code message target } } }`,
  [CART_FRAGMENT],
);
const CART_LINES_UPDATE = gql(
  `mutation SupportCartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!, $country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) { cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { ...SupportCartFields } userErrors { code field message } warnings { code message target } } }`,
  [CART_FRAGMENT],
);
const CART_LINES_REMOVE = gql(
  `mutation SupportCartLinesRemove($cartId: ID!, $lineIds: [ID!]!, $country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) { cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { cart { ...SupportCartFields } userErrors { code field message } warnings { code message target } } }`,
  [CART_FRAGMENT],
);
const CART_DISCOUNT_CODES_UPDATE = gql(
  `mutation SupportCartDiscountCodesUpdate($cartId: ID!, $discountCodes: [String!]!, $country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) { cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes) { cart { ...SupportCartFields } userErrors { code field message } warnings { code message target } } }`,
  [CART_FRAGMENT],
);
const CART_NOTE_UPDATE = gql(
  `mutation SupportCartNoteUpdate($cartId: ID!, $note: String!, $country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) { cartNoteUpdate(cartId: $cartId, note: $note) { cart { ...SupportCartFields } userErrors { code field message } warnings { code message target } } }`,
  [CART_FRAGMENT],
);
const CART_ATTRIBUTES_UPDATE = gql(
  `mutation SupportCartAttributesUpdate($cartId: ID!, $attributes: [AttributeInput!]!, $country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) { cartAttributesUpdate(cartId: $cartId, attributes: $attributes) { cart { ...SupportCartFields } userErrors { code field message } warnings { code message target } } }`,
  [CART_FRAGMENT],
);

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function readServerCart(request: Request, storefrontClient: StorefrontClient) {
  const result = await getCart(getCartId(request), storefrontClient, SUPPORT_CART_QUERY);
  return {
    cart: result.cart,
    ...(result.errors?.length ? { errors: result.errors } : {}),
  };
}

export type CartHandlersForUI = {
  get: () => Promise<{ data: Awaited<ReturnType<typeof readServerCart>> }>;
};

type MutationPayload = {
  cart: unknown;
  userErrors?: unknown[];
  warnings?: unknown[];
};

export async function mutateServerCart(request: Request, storefrontClient: StorefrontClient): Promise<Response> {
  const isJson = request.headers.get("content-type")?.toLowerCase().includes("application/json") ?? false;
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 65_536) {
    return Response.json({ error: { code: "request_too_large", message: "購物袋請求過大。" } }, { status: 413, headers: PRIVATE_HEADERS });
  }

  let parsed: Awaited<ReturnType<typeof parseCartRequest>>;
  try {
    parsed = await parseCartRequest(request);
  } catch {
    return Response.json({ error: { code: "invalid_cart_request", message: "購物袋請求格式無效。" } }, { status: 400, headers: PRIVATE_HEADERS });
  }

  const action = parsed.action;
  const cartId = parsed.cartId ?? getCartId(request);
  let payload: MutationPayload | null | undefined;
  let createdCartId: string | undefined;

  try {
    switch (action.intent) {
      case "add": {
        if (cartId) {
          const result = await storefrontClient.graphql(CART_LINES_ADD, {
            variables: { cartId, lines: action.lines },
          });
          if (result.errors?.length || !result.data) throw new Error("Cart lines add failed.");
          payload = result.data.cartLinesAdd;
        } else {
          const result = await storefrontClient.graphql(CART_CREATE, {
            variables: { input: { lines: action.lines } },
          });
          if (result.errors?.length || !result.data) throw new Error("Cart create failed.");
          payload = result.data.cartCreate;
          const id = payload?.cart && typeof payload.cart === "object" && "id" in payload.cart
            ? payload.cart.id
            : undefined;
          if (typeof id === "string") createdCartId = id;
        }
        break;
      }
      case "update": {
        if (!cartId) return missingCart(request, isJson);
        const result = await storefrontClient.graphql(CART_LINES_UPDATE, {
          variables: { cartId, lines: action.lines },
        });
        if (result.errors?.length || !result.data) throw new Error("Cart line update failed.");
        payload = result.data.cartLinesUpdate;
        break;
      }
      case "remove": {
        if (!cartId) return missingCart(request, isJson);
        const result = await storefrontClient.graphql(CART_LINES_REMOVE, {
          variables: { cartId, lineIds: action.lineIds },
        });
        if (result.errors?.length || !result.data) throw new Error("Cart line removal failed.");
        payload = result.data.cartLinesRemove;
        break;
      }
      case "discount-update": {
        if (!cartId) return missingCart(request, isJson);
        const result = await storefrontClient.graphql(CART_DISCOUNT_CODES_UPDATE, {
          variables: { cartId, discountCodes: action.discountCodes },
        });
        if (result.errors?.length || !result.data) throw new Error("Cart discount update failed.");
        payload = result.data.cartDiscountCodesUpdate;
        break;
      }
      case "discount-apply":
      case "discount-remove": {
        if (!cartId) return missingCart(request, isJson);
        const current = await getCart(cartId, storefrontClient, SUPPORT_CART_QUERY);
        if (!current.cart) return missingCart(request, isJson);
        const codes = current.cart.discountCodes.map((entry) => entry.code);
        let nextCodes: string[];
        if (action.intent === "discount-apply") {
          nextCodes = [...new Set([...codes, action.code])];
        } else {
          nextCodes = codes.filter((code) => code !== action.code);
        }
        const result = await storefrontClient.graphql(CART_DISCOUNT_CODES_UPDATE, {
          variables: { cartId, discountCodes: nextCodes },
        });
        if (result.errors?.length || !result.data) throw new Error("Cart discount update failed.");
        payload = result.data.cartDiscountCodesUpdate;
        break;
      }
      case "note-update": {
        if (!cartId) return missingCart(request, isJson);
        const result = await storefrontClient.graphql(CART_NOTE_UPDATE, {
          variables: { cartId, note: action.note },
        });
        if (result.errors?.length || !result.data) throw new Error("Cart note update failed.");
        payload = result.data.cartNoteUpdate;
        break;
      }
      case "attributes-update": {
        if (!cartId) return missingCart(request, isJson);
        const result = await storefrontClient.graphql(CART_ATTRIBUTES_UPDATE, {
          variables: { cartId, attributes: action.attributes },
        });
        if (result.errors?.length || !result.data) throw new Error("Cart attribute update failed.");
        payload = result.data.cartAttributesUpdate;
        break;
      }
    }
  } catch {
    console.error("[shopify-cart] Storefront cart operation failed; request details were not logged.");
    return Response.json({ error: { code: "cart_operation_failed", message: "Shopify 購物袋暫時無法更新，請稍後重試。" } }, { status: 502, headers: PRIVATE_HEADERS });
  }

  if (!payload) {
    return Response.json({ error: { code: "cart_operation_failed", message: "Shopify 購物袋沒有回傳結果。" } }, { status: 502, headers: PRIVATE_HEADERS });
  }

  const data = {
    cart: payload.cart,
    userErrors: payload.userErrors ?? [],
    warnings: payload.warnings ?? [],
  };
  const headers = new Headers(PRIVATE_HEADERS);
  if (createdCartId) headers.append("Set-Cookie", createCartCookie(createdCartId));

  if (isJson) return Response.json(data, { headers });

  if (Array.isArray(data.userErrors) && data.userErrors.length > 0) {
    return Response.json({ error: { code: "cart_validation_failed", message: "Shopify 無法接受這項購物袋變更。", userErrors: data.userErrors } }, { status: 422, headers });
  }

  headers.set("Location", safeReturnLocation(request));
  return new Response(null, { status: 303, headers });
}

function missingCart(request: Request, isJson: boolean): Response {
  const headers = new Headers(PRIVATE_HEADERS);
  if (isJson) return Response.json({ error: { code: "missing_cart", message: "找不到要更新的購物袋。" } }, { status: 400, headers });
  headers.set("Location", safeReturnLocation(request));
  return new Response(null, { status: 303, headers });
}

function safeReturnLocation(request: Request): string {
  const fallback = "/cart";
  const referer = request.headers.get("referer");
  if (!referer) return fallback;
  try {
    const refererUrl = new URL(referer);
    const requestUrl = new URL(request.url);
    if (refererUrl.origin === requestUrl.origin) return `${refererUrl.pathname}${refererUrl.search}${refererUrl.hash}`;
  } catch {
    // Invalid or non-HTTP referrers fall back to the cart page.
  }
  return fallback;
}
