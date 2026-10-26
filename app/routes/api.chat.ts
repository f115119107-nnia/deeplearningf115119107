import type { Route } from "./+types/api.chat";
import { runSupportAgent } from "~/lib/agent.server";

const NO_STORE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "只接受 POST 請求。" }, { status: 405, headers: { ...NO_STORE, Allow: "POST" } });
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return Response.json({ error: "請以 JSON 傳送訊息。" }, { status: 415, headers: NO_STORE });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 65_536) {
    return Response.json({ error: "訊息請求過大，請精簡問題後重試。" }, { status: 413, headers: NO_STORE });
  }

  let payload: unknown;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 65_536) {
      return Response.json({ error: "訊息請求過大，請精簡問題後重試。" }, { status: 413, headers: NO_STORE });
    }
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return Response.json({ error: "訊息格式無效，請重新送出。" }, { status: 400, headers: NO_STORE });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return Response.json({ error: "訊息格式無效。" }, { status: 400, headers: NO_STORE });
  }
  const body = payload as Record<string, unknown>;
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 500) {
    return Response.json({ error: "請輸入 1 到 500 字的問題。" }, { status: 400, headers: NO_STORE });
  }

  try {
    const result = await runSupportAgent({ message, history: body.history });
    return Response.json(result, { status: 200, headers: NO_STORE });
  } catch {
    console.error("[support-agent] Request failed; user content and credentials are not logged.");
    return Response.json(
      { error: "客服工具暫時無法使用，為避免未查證回答，Agent 沒有用記憶補答。請稍後重試。" },
      { status: 503, headers: NO_STORE },
    );
  }
}
