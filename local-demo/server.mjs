import { randomUUID } from "node:crypto";
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { isIP } from "node:net";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { detectLanguage, getLocalProducts, getOllamaStatus, getSupportStats, listSavedReservations, runSupportAgent } from "./agent.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = resolve(projectRoot, "local-demo", "public");
const host = process.env.LOCAL_DEMO_HOST?.trim() || "127.0.0.1";
const port = Number(process.env.LOCAL_DEMO_PORT || 4173);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const SESSION_COOKIE = "local_demo_session";
const COOKIE_MAX_AGE = 60 * 60 * 24;

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("LOCAL_DEMO_PORT must be an integer between 1024 and 65535.");
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
const PRIVATE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

function sendJson(response, status, body, additionalHeaders = {}) {
  response.writeHead(status, { ...PRIVATE_HEADERS, "Content-Type": "application/json; charset=utf-8", ...additionalHeaders });
  response.end(JSON.stringify(body));
}

async function readJson(request, maxBytes = 32_768) {
  if (request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw Object.assign(new Error("content_type_must_be_json"), { status: 415 });
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maxBytes) throw Object.assign(new Error("request_too_large"), { status: 413 });
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value;
  } catch {
    throw Object.assign(new Error("invalid_json"), { status: 400 });
  }
}

function isAllowedHost(request) {
  const rawHost = request.headers.host;
  if (!rawHost) return false;
  try {
    const parsed = new URL(`http://${rawHost}`);
    if (parsed.port !== String(port) || parsed.username || parsed.password) return false;
    const requestHost = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
    const configuredHost = host.toLowerCase().replace(/^\[|\]$/gu, "");
    if (LOOPBACK_HOSTS.has(configuredHost)) return LOOPBACK_HOSTS.has(requestHost);
    if (configuredHost === "0.0.0.0" || configuredHost === "::") {
      return LOOPBACK_HOSTS.has(requestHost) || isIP(requestHost) !== 0;
    }
    return requestHost === configuredHost;
  } catch {
    return false;
  }
}

function isSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin || !isAllowedHost(request)) return false;
  try {
    const parsedOrigin = new URL(origin);
    return parsedOrigin.protocol === "http:" &&
      parsedOrigin.host.toLowerCase() === String(request.headers.host || "").toLowerCase();
  } catch {
    return false;
  }
}

function readSessionId(request) {
  const header = request.headers.cookie || "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== SESSION_COOKIE) continue;
    const value = rest.join("=");
    if (/^[0-9a-f-]{36}$/iu.test(value)) return { id: value, isNew: false };
  }
  return { id: randomUUID(), isNew: true };
}

function sessionCookie(sessionId) {
  // Local demo is served over plain HTTP on the user's own computer; Secure is not applicable here.
  return `${SESSION_COOKIE}=${sessionId}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=Strict`;
}

function serveStatic(pathname, response) {
  const fileName = pathname === "/" ? "index.html" : pathname.replace(/^\//u, "");
  if (!/^(?:index\.html|style\.css|app\.js|onigiri\.svg|iced-coffee\.svg|demo-product\.svg|favicon\.svg)$/u.test(fileName)) {
    sendJson(response, 404, { error: "not_found" });
    return;
  }
  const filePath = resolve(publicRoot, fileName);
  if (!filePath.startsWith(`${publicRoot}${sep}`)) {
    sendJson(response, 404, { error: "not_found" });
    return;
  }
  try {
    const stat = statSync(filePath);
    response.writeHead(200, {
      ...PRIVATE_HEADERS,
      "Content-Type": MIME_TYPES[extname(filePath)] || "application/octet-stream",
      "Content-Length": stat.size,
    });
    createReadStream(filePath).pipe(response);
  } catch {
    sendJson(response, 404, { error: "not_found" });
  }
}

const server = createServer(async (request, response) => {
  if (!isAllowedHost(request)) {
    sendJson(response, 403, { error: "本機示範伺服器只接受 localhost 或明確指定的本機 IP。" });
    return;
  }
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, { ok: true, mode: "local-demo-midterm" });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/products") {
      const language = url.searchParams.get("lang") === "en" ? "en" : "zh";
      sendJson(response, 200, { products: getLocalProducts(language), stats: getSupportStats() });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/status") {
      const [ollama, stats] = await Promise.all([getOllamaStatus(), Promise.resolve(getSupportStats())]);
      sendJson(response, 200, { mode: "local-demo-midterm", ollama, stats });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/reservations") {
      const { id: sessionId } = readSessionId(request);
      const language = url.searchParams.get("lang") === "en" ? "en" : "zh";
      sendJson(response, 200, { reservations: listSavedReservations(sessionId, language) });
      return;
    }
    if (url.pathname === "/api/chat" && request.method === "POST") {
      if (!isSameOrigin(request)) {
        sendJson(response, 403, { error: "請求來源無效。" });
        return;
      }
      const payload = await readJson(request);
      const message = typeof payload.message === "string" ? payload.message.trim() : "";
      if (!message || message.length > 500) {
        sendJson(response, 400, { error: "請輸入 1 至 500 字的問題。" });
        return;
      }
      const history = Array.isArray(payload.history) ? payload.history : [];
      if (history.length > 12) {
        sendJson(response, 400, { error: "對話上下文過長，請重新整理頁面後再試。" });
        return;
      }
      const { id: sessionId } = readSessionId(request);
      const cookieHeaders = { "Set-Cookie": sessionCookie(sessionId) };
      try {
        const result = await runSupportAgent({ message, history, sessionId });
        sendJson(response, 200, result, cookieHeaders);
      } catch (error) {
        const language = detectLanguage(message);
        const userError = language === "en"
          ? "The local support agent is unavailable. Check the Ollama status above; no answer was made from model memory."
          : "本機客服 Agent 暫時無法使用。請檢查上方 Ollama 狀態；系統沒有用模型記憶補答。";
        const safeCode = error instanceof Error && /找不到模型/u.test(error.message) ? "MODEL_NOT_INSTALLED" : "AGENT_UNAVAILABLE";
        sendJson(response, 503, { error: userError, errorCode: safeCode }, cookieHeaders);
      }
      return;
    }
    if (request.method === "GET" && !url.pathname.startsWith("/api/")) {
      serveStatic(url.pathname, response);
      return;
    }
    sendJson(response, 405, { error: "method_not_allowed" });
  } catch (error) {
    const status = Number(error?.status) || 500;
    sendJson(response, status, { error: status === 500 ? "本機示範伺服器發生錯誤。" : error.message });
  }
});

server.listen(port, host, () => {
  const localOnly = host === "127.0.0.1" || host === "localhost" || host === "::1";
  console.log(`小七本機期中示範網站已啟動：http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
  console.log(`預設安全模式：${localOnly ? "僅本機可連線" : "網路介面可連線；請勿暴露於公用網路"}`);
  console.log(`Ollama 模型：${process.env.OLLAMA_MODEL?.trim() || "qwen2.5:3b"}`);
  console.log("客服支援 RAG、繁中／英文、對話記憶和確認式本機示範預留；購物袋不連 Shopify、不收款。按 Ctrl+C 停止。");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

export default server;
