import type { Route } from "./+types/api.cart";
import { readServerCart, mutateServerCart } from "~/lib/cart.server";
import { storefrontClientContext } from "~/lib/shopify.server";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function loader({ context, request }: Route.LoaderArgs) {
  const storefrontClient = context.get(storefrontClientContext);
  const data = await readServerCart(request, storefrontClient);
  return Response.json(data, { headers: PRIVATE_HEADERS });
}

export async function action({ context, request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: { code: "method_not_allowed", message: "只接受 POST 請求。" } }, { status: 405, headers: { ...PRIVATE_HEADERS, Allow: "POST" } });
  }
  if (!isSameOriginCartRequest(request)) {
    return Response.json({ error: { code: "cross_site_request", message: "購物袋請求來源無效。" } }, { status: 403, headers: PRIVATE_HEADERS });
  }

  const storefrontClient = context.get(storefrontClientContext);
  return mutateServerCart(request, storefrontClient);
}

function isSameOriginCartRequest(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site" || fetchSite === "same-site") return false;
  if (fetchSite === "same-origin") return true;

  const originHeader = request.headers.get("origin");
  if (!originHeader) return false;

  try {
    const origin = new URL(originHeader).origin;
    const requestUrl = new URL(request.url);
    const allowed = new Set([requestUrl.origin]);
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().replace(/:$/, "");
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwardedHost ?? request.headers.get("host")?.split(",")[0]?.trim();
    const protocol = forwardedProto ?? requestUrl.protocol.replace(/:$/, "");
    if (host && protocol) allowed.add(`${protocol}://${host}`);
    return allowed.has(origin);
  } catch {
    return false;
  }
}
