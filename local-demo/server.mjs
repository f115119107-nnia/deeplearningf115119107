import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { isIP } from "node:net";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getLocalProducts, getOllamaStatus, getSupportStats, runSupportAgent } from "./agent.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = resolve(projectRoot, "local-demo", "public");
const host = process.env.LOCAL_DEMO_HOST?.trim() || "127.0.0.1";
const port = Number(process.env.LOCAL_DEMO_PORT || 4173);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

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
};

function sendJson(response, status, body) {
  response.writeHead(status, { ...PRIVATE_HEADERS, "Content-Type": "application/json; charset=utf-8" });
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
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
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

function serveStatic(pathname, response) {
  const fileName = pathname === "/" ? "index.html" : pathname.replace(/^\//u, "");
  if (!/^(?:index\.html|style\.css|app\.js|onigiri\.svg|iced-coffee\.svg|favicon\.svg)$/u.test(fileName)) {
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
      sendJson(response, 200, { ok: true, mode: "local-demo" });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/products") {
      sendJson(response, 200, { products: getLocalProducts(), stats: getSupportStats() });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/status") {
      const [ollama, stats] = await Promise.all([getOllamaStatus(), Promise.resolve(getSupportStats())]);
      sendJson(response, 200, { mode: "local-demo", ollama, stats });
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
      try {
        const result = await runSupportAgent(message);
        sendJson(response, 200, result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "本機客服 Agent 暫時無法使用。";
        sendJson(response, 503, { error: message });
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
  console.log(`小七本機示範網站已啟動：http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
  console.log(`預設安全模式：${localOnly ? "僅本機可連線" : "網路介面可連線；請勿暴露於公用網路"}`);
  console.log(`Ollama 模型：${process.env.OLLAMA_MODEL?.trim() || "qwen2.5:3b"}`);
  console.log("結帳為本機展示功能，不會建立 Shopify 訂單或收取付款。按 Ctrl+C 停止。");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

export default server;
