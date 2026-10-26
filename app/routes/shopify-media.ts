import type { Route } from "./+types/shopify-media";

const DEMO_IMAGE_KEYS: Record<string, string> = {
  "demo-onigiri": "async-images/ASXxpFeXQj7q8EEm4Oh9ub/image-1.webp",
  "demo-iced-coffee": "async-images/ASXxpFeXQj7q8EEm4Oh9ub/image-2.webp",
};
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function loader({ params, request }: Route.LoaderArgs) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" },
    });
  }

  const storageKey = params.handle ? DEMO_IMAGE_KEYS[params.handle] : undefined;
  if (!storageKey) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const apiBase = process.env.MANUS_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.MANUS_API_KEY;
  if (!apiBase || !apiKey) {
    return new Response("Media unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const presignUrl = new URL(`${apiBase}/v1/storage/presign/get`);
    presignUrl.searchParams.set("path", storageKey);
    const presignResponse = await fetch(presignUrl, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: request.signal,
    });
    if (!presignResponse.ok) {
      return new Response("Media unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
    }

    const presign = (await presignResponse.json()) as { url?: unknown };
    if (typeof presign.url !== "string") {
      return new Response("Media unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const sourceUrl = new URL(presign.url);
    if (sourceUrl.protocol !== "https:") {
      return new Response("Media unavailable", { status: 502, headers: { "Cache-Control": "no-store" } });
    }

    const imageResponse = await fetch(sourceUrl, {
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg" },
      signal: request.signal,
    });
    if (!imageResponse.ok) {
      return new Response("Media unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
    }

    const contentType = imageResponse.headers.get("content-type")?.split(";")[0]?.trim();
    const declaredLength = Number(imageResponse.headers.get("content-length") ?? 0);
    if (!contentType?.startsWith("image/") || declaredLength > MAX_IMAGE_BYTES) {
      return new Response("Invalid media", { status: 502, headers: { "Cache-Control": "no-store" } });
    }

    const bytes = await imageResponse.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
      return new Response("Invalid media", { status: 502, headers: { "Cache-Control": "no-store" } });
    }

    const headers = {
      "Cache-Control": "public, max-age=3600",
      "Content-Length": String(bytes.byteLength),
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${params.handle}.webp"`,
      "X-Content-Type-Options": "nosniff",
    };
    return new Response(request.method === "HEAD" ? null : bytes, { headers });
  } catch {
    return new Response("Media unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
