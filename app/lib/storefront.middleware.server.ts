import {
  handleShopifyRedirects,
  handleShopifyRoutes,
} from "@shopify/hydrogen";
import type { Route } from "../+types/root";
import { shopifyRouteTemplates } from "~/lib/shopify.routes";
import {
  createShopifyRequest,
  storefrontClientContext,
} from "~/lib/shopify.server";

function isPublicHttpsRequest(request: Request): boolean {
  const originOrReferer = request.headers.get("origin") ?? request.headers.get("referer");
  if (originOrReferer) {
    try {
      if (new URL(originOrReferer).protocol === "https:") return true;
    } catch {
      // Continue with trusted proxy/request metadata.
    }
  }

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwardedProto) return forwardedProto === "https";

  const requestUrl = new URL(request.url);
  if (requestUrl.protocol === "https:") return true;
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim().toLowerCase();
  const host = (forwardedHost ?? request.headers.get("host") ?? requestUrl.hostname).split(":")[0].toLowerCase();
  return !["localhost", "127.0.0.1", "::1"].includes(host);
}

function withCartCookiePolicy(response: Response, request: Request): Response {
  const sourceHeaders = response.headers as Headers & { getSetCookie?: () => string[] };
  const cookies = sourceHeaders.getSetCookie?.() ?? [];
  if (cookies.length === 0) return response;

  const publicHttps = isPublicHttpsRequest(request);
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");

  for (let cookie of cookies) {
    if (/^cart=/i.test(cookie)) {
      const sameSite = publicHttps ? "None" : "Lax";
      if (/;\s*SameSite=[^;]*/i.test(cookie)) {
        cookie = cookie.replace(/;\s*SameSite=[^;]*/i, `; SameSite=${sameSite}`);
      } else {
        cookie += `; SameSite=${sameSite}`;
      }
      if (publicHttps && !/;\s*Secure(?:;|$)/i.test(cookie)) cookie += "; Secure";
      if (!publicHttps) cookie = cookie.replace(/;\s*Secure(?=;|$)/ig, "");
      if (!/;\s*HttpOnly(?:;|$)/i.test(cookie)) cookie += "; HttpOnly";
    }
    headers.append("set-cookie", cookie);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const storefrontMiddleware: Route.MiddlewareFunction = async (
  { context, request },
  next,
) => {
  const { requestContext, storefrontClient } = createShopifyRequest(request);
  context.set(storefrontClientContext, storefrontClient);

  // Cart requests are served by the app's scope-minimized `/api/cart` route;
  // the default Hydrogen handler queries sellingPlanAllocation, which this
  // development store's managed Storefront token is not permitted to read.
  const shopifyRoute = handleShopifyRoutes({
    request,
    requestContext,
    storefrontClient,
    routeTemplates: shopifyRouteTemplates,
  });
  if (shopifyRoute) {
    return withCartCookiePolicy(await shopifyRoute, request);
  }

  // Hydrogen 2026.10 serves GraphiQL at /graphiql in development. Keep the
  // scaffold's documented /api/graphiql path as a development-only alias.
  if (import.meta.env.DEV && new URL(request.url).pathname === "/api/graphiql") {
    return new Response(null, {
      status: 302,
      headers: { Location: "/graphiql", "Cache-Control": "no-store" },
    });
  }

  const response = await next();
  if (response.status === 404) {
    const redirect = await handleShopifyRedirects({
      request,
      storefrontClient,
      routeTemplates: shopifyRouteTemplates,
    });
    if (redirect) return redirect;
  }

  requestContext.applyResponseHeaders(response.headers);
  return withCartCookiePolicy(response, request);
};
