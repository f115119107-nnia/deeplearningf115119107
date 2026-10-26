import type { Route } from "./+types/api.fallback";

function apiNotFound() {
  return Response.json(
    { error: "找不到這個 API 端點。" },
    { status: 404, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
  );
}

export function loader(_args: Route.LoaderArgs) {
  return apiNotFound();
}

export function action(_args: Route.ActionArgs) {
  return apiNotFound();
}
