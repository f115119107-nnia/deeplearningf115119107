import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databasePath = resolve(projectRoot, "data", "support.sqlite");
const ollamaBaseUrl = readLocalOllamaUrl();
const ollamaModel = process.env.OLLAMA_MODEL?.trim() || "qwen2.5:3b";
const MAX_STEPS = 3;
const MAX_MESSAGE_LENGTH = 500;

let connection;
function database() {
  if (!connection) {
    connection = new DatabaseSync(databasePath, { readOnly: true });
    connection.exec("PRAGMA query_only = ON;");
  }
  return connection;
}

function readLocalOllamaUrl() {
  const value = process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434";
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("OLLAMA_BASE_URL must be a valid URL.");
  }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error("Local demo only allows Ollama on this computer (localhost).");
  }
  return url.origin;
}

export const TOOL_LABELS = {
  search_faq: "查詢 SQLite 客服知識庫",
  lookup_demo_record: "查詢匿名示範紀錄",
  calculate_demo_basket: "計算示範商品小計",
  transfer_to_human: "查詢官方真人客服管道",
};

const tools = [
  {
    type: "function",
    function: {
      name: "search_faq",
      description: "使用唯讀 SQLite 查詢官方服務 FAQ 或明確標記的示範規則。沒有命中就不能猜答案。",
      parameters: { type: "object", properties: { query: { type: "string", description: "具體的繁體中文查詢詞" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_demo_record",
      description: "只查詢 DEMO- 開頭的虛構匿名示範紀錄，不查真實顧客或訂單。",
      parameters: { type: "object", properties: { record_id: { type: "string" } }, required: ["record_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_demo_basket",
      description: "用 SQLite 示範商品單價及程式計算購物籃，不能猜商品或價格。",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            minItems: 1,
            maxItems: 10,
            items: {
              type: "object",
              properties: { product_name: { type: "string" }, quantity: { type: "integer", minimum: 1, maximum: 50 } },
              required: ["product_name", "quantity"],
            },
          },
        },
        required: ["items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "transfer_to_human",
      description: "查無資料、即時門市／真實訂單／個資或需真人判斷時，提供已核實的官方聯絡資料。只提供聯絡方式，不會代客傳訊。",
      parameters: { type: "object", properties: { reason: { type: "string" } }, required: ["reason"] },
    },
  },
];


const SYSTEM_PROMPT = `你是小七補給站本機課堂示範客服 Agent。

工具選擇規則：
1. 使用者詢問取件方式、0 元包裹、付款、寄件、物流、客服電話、官方政策、服務規則、活動或一般常見問題時，必須優先使用 search_faq。
2. 使用者詢問 DEMO- 開頭的虛構紀錄時，使用 lookup_demo_record。
3. 使用者詢問 SQLite 示範商品的價格或購物小計時，使用 calculate_demo_basket。
4. 只有在 FAQ 查無資料、涉及即時門市狀況、真實訂單、個人資料、客訴或需要真人判斷時，才使用 transfer_to_human。
5. 不得只因為問題簡短或沒有提供訂單編號，就直接轉接真人。
6. 每一輪只能呼叫一個工具；不得使用模型記憶直接回答，不得捏造事實。
7. 所有最終答案由伺服器根據工具結果產生。
8. 示範商品、價格及紀錄均非 7-ELEVEN 真實資料。`;

function normalize(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("zh-TW").replace(/[\s\p{P}\p{S}]+/gu, "");
}

function getFaqRows() {
  return database().prepare(`
    SELECT id, topic, question, answer, keywords, source_type, source_url, is_demo, search_text
    FROM faq_entries
  `).all();
}


function searchFaq(query) {
  const normalizedQuery = normalize(query).slice(0, 160);
  const chars = Array.from(normalizedQuery);

  if (chars.length < 2) return [];

  // 不同客服意圖的核心詞；避免不同主題只因部分文字重疊而誤配。
  const intentGroups = [
    {
      name: "openpoint_points",
      terms: ["openpoint","點數", "累積點數", "openpoint點數", "會員條碼","會員手機號碼","消費集點", "如何集點"],
    },
    {
      name: "zero_package_code",
      terms: ["0元包裹", "認證碼", "0元取件", "包裹取件"],
    },
  ];

  const getIntents = (value) => {
  const text = normalize(value);
  const intents = [];

  const asksPoints =
    text.includes("點數") ||
    text.includes("集點") ||
    text.includes("累積") ||
    text.includes("會員條碼") ||
    text.includes("會員手機號碼");

  const asksZeroPackage =
    text.includes("認證碼") ||
    text.includes("0元包裹") ||
    text.includes("0元取件") ||
    text.includes("包裹取件");

  if (asksPoints) intents.push("openpoint_points");
  if (asksZeroPackage) intents.push("zero_package_code");

  return intents;
};

  const queryIntents = getIntents(query);

  const bigrams = Array.from(
    new Set(
      Array.from(
        { length: chars.length - 1 },
        (_, i) => chars.slice(i, i + 2).join("")
      )
    )
  );

  const trigrams = chars.length >= 3
    ? Array.from(
        new Set(
          Array.from(
            { length: chars.length - 2 },
            (_, i) => chars.slice(i, i + 3).join("")
          )
        )
      )
    : [];

  return getFaqRows()
    .map((row) => {
      const searchable = normalize(row.search_text);
      const questionText = normalize(row.question);
      const keywords = normalize(row.keywords);
      const rowIntents = getIntents(
        `${row.topic} ${row.question} ${row.keywords}`
      );

      // 查詢與資料明確屬於不同意圖時，直接排除。
      const intentConflict =
        queryIntents.length > 0 &&
        rowIntents.length > 0 &&
        !queryIntents.some((intent) => rowIntents.includes(intent));

      if (intentConflict) {
        return { row, score: -1, matchedBigrams: 0 };
      }

      let score = 0;

      if (questionText === normalizedQuery) {
        score += 100;
      } else if (questionText.includes(normalizedQuery)) {
        score += 70;
      } else if (searchable.includes(normalizedQuery)) {
        score += 40;
      }

      let matchedBigrams = 0;

      for (const gram of bigrams) {
        if (questionText.includes(gram)) {
          score += 2.5;
          matchedBigrams += 1;
        } else if (keywords.includes(gram)) {
          score += 2;
          matchedBigrams += 1;
        } else if (searchable.includes(gram)) {
          score += 0.8;
          matchedBigrams += 1;
        }
      }

      for (const gram of trigrams) {
        if (questionText.includes(gram)) {
          score += 3.5;
        } else if (keywords.includes(gram)) {
          score += 3;
        } else if (searchable.includes(gram)) {
          score += 1;
        }
      }

      // 核心意圖相符時加分。
      if (
        queryIntents.length > 0 &&
        queryIntents.some((intent) => rowIntents.includes(intent))
      ) {
        score += 20;
      }

      return { row, score, matchedBigrams };
    })
    .filter((item) => item.score >= 12 && item.matchedBigrams >= 2)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.matchedBigrams - a.matchedBigrams ||
        a.row.id.localeCompare(b.row.id)
    )
    .slice(0, 5)
    .map(({ row }) => row);
}


function listProducts() {
  return database().prepare(`
    SELECT id, sku, name, price_twd AS priceTwd, description
    FROM demo_products WHERE is_demo = 1 ORDER BY id
  `).all();
}

export function getLocalProducts() {
  return listProducts().map((product) => ({
    id: product.id,
    sku: product.sku,
    name: product.name.replace(/^課堂示範商品[｜|]\s*/u, ""),
    priceTwd: Number(product.priceTwd),
    description: product.description,
    handle: product.id === "DEMO-ONIGIRI" ? "demo-onigiri" : "demo-iced-coffee",
    image: product.id === "DEMO-ONIGIRI" ? "/onigiri.svg" : "/iced-coffee.svg",
  }));
}

function findDemoRecord(id) {
  const safeId = String(id ?? "").trim().toUpperCase().slice(0, 64);
  if (!/^DEMO-[A-Z0-9-]+$/u.test(safeId)) return undefined;
  return database().prepare(`
    SELECT id, record_type AS recordType, status, summary, is_demo AS isDemo
    FROM demo_records WHERE id = ? AND is_demo = 1
  `).get(safeId);
}

function runTool(name, rawArgs, originalQuestion) {
  const args = rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs) ? rawArgs : {};
  if (!Object.hasOwn(TOOL_LABELS, name)) throw new Error("Unsupported tool selected by local model.");
  if (name === "search_faq") {
    const query =
    typeof args.query === "string" && args.query.trim()
    ? args.query.trim()
    : originalQuestion;

    const results = searchFaq(query).map((row) => ({
      id: row.id,
      topic: row.topic,
      answer: row.answer,
      sourceType: row.source_type,
      sourceUrl: row.source_url,
      isDemo: Number(row.is_demo) === 1,
    }));
    const first = results[0];
    return {
      answerable: Boolean(first),
      data: { results },
      trace: { name, label: TOOL_LABELS[name], status: first ? "success" : "not_found", summary: first ? `SQLite 知識庫命中 ${results.length} 筆。` : "SQLite 沒有相符資料；未以模型記憶補答。" },
      sources: first ? [{ label: `${first.sourceType === "official" ? "官方來源" : "示範資料"}：${first.topic}`, url: first.sourceUrl, kind: first.sourceType }] : [],
    };
  }
  if (name === "lookup_demo_record") {
    const record = findDemoRecord(args.record_id);
    return {
      answerable: Boolean(record),
      data: { record: record ?? null },
      trace: { name, label: TOOL_LABELS[name], status: record ? "success" : "not_found", summary: record ? "已讀取 SQLite 匿名虛構示範紀錄。" : "找不到此示範代碼；未查詢真實訂單。" },
      sources: [],
    };
  }
  if (name === "calculate_demo_basket") {
    const requested = Array.isArray(args.items) ? args.items.slice(0, 10) : [];
    const products = listProducts();
    const lines = [];
    const missing = [];
    let subtotalTwd = 0;
    for (const item of requested) {
      const label = typeof item?.product_name === "string" ? item.product_name.trim().slice(0, 80) : "";
      const quantity = Number(item?.quantity);
      if (!label || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 50) { missing.push(label || "商品或數量格式不正確"); continue; }
      const needle = normalize(label);
      const matches = products.filter((product) => {
        const full = normalize(product.name);
        const shortName = normalize(product.name.replace(/^課堂示範商品[｜|]\s*/u, ""));
        return normalize(product.sku) === needle || normalize(product.id) === needle || full.includes(needle) || shortName.includes(needle) || needle.includes(shortName);
      });
      if (matches.length !== 1) { missing.push(label); continue; }
      const product = matches[0];
      const total = Number(product.priceTwd) * quantity;
      if (!Number.isSafeInteger(total)) { missing.push(label); continue; }
      lines.push({ name: product.name.replace(/^課堂示範商品[｜|]\s*/u, ""), quantity, unitPriceTwd: Number(product.priceTwd), lineTotalTwd: total });
      subtotalTwd += total;
    }
    const found = lines.length > 0 && missing.length === 0 && Number.isSafeInteger(subtotalTwd);
    return {
      answerable: found,
      data: { lines, missing, subtotalTwd: found ? subtotalTwd : null, note: "模擬回覆 商品價格計算，非真實售價。" },
      trace: { name, label: TOOL_LABELS[name], status: found ? "success" : "not_found", summary: found ? `由 SQLite 取價並以程式計算 ${lines.length} 項商品。` : "商品未能在 SQLite 示範商品表唯一匹配；不猜價格。" },
      sources: [],
    };
  }
  const generalEntry = database().prepare("SELECT question, answer, source_url FROM faq_entries WHERE id = ?").get("FAQ001");
  const phoneEntry = database().prepare("SELECT answer FROM faq_entries WHERE id = ?").get("FAQ002");
  const phone = phoneEntry?.answer?.match(/0800[-‐–]?\d{6}/u)?.[0] ?? null;
  return {
    answerable: Boolean(generalEntry?.source_url),
    data: { contactUrl: generalEntry?.source_url ?? null, phone, officialFaq: generalEntry ?? null },
    trace: { name, label: TOOL_LABELS[name], status: generalEntry?.source_url ? "success" : "not_found", summary: "提供 SQLite 官方聯絡資料；沒有真的傳送訊息或通知真人。" },
    sources: generalEntry?.source_url ? [{ label: "7-ELEVEN 官方客服 FAQ", url: generalEntry.source_url, kind: "official" }] : [],
  };
}

function toolAnswer(name, data) {
  if (name === "search_faq") {
    const first = data.results?.[0];
    if (!first) return "目前在客服 SQLite 資料庫中查不到這項資訊，因此我不會自行推測。你可以選擇查詢官方客服管道。";
    return `${first.isDemo ? "（課堂示範資料）" : ""}${first.answer}\n\n資料主題：${first.topic}。`;
  }
  if (name === "lookup_demo_record") {
    const record = data.record;
    if (!record) return "在 SQLite 匿名示範紀錄中查不到這個代碼；本工具不連接或查詢真實訂單。";
    return `這是虛構的課堂示範紀錄「${record.id}」。狀態：${record.status}。${record.summary}`;
  }
  if (name === "calculate_demo_basket") {
    if (data.missing?.length || data.subtotalTwd == null) return `我無法在 SQLite 示範商品表中唯一匹配：${(data.missing || []).join("、") || "指定商品"}；沒有猜測價格。`;
    const money = (value) => `NT$${new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(value)}`;
    const lines = data.lines.map((line) => `• ${line.name} × ${line.quantity}：${money(line.unitPriceTwd)} × ${line.quantity} = ${money(line.lineTotalTwd)}`);
    return `${lines.join("\n")}\n示範小計：${money(data.subtotalTwd)}。\n\n${data.note}`;
  }
  if (typeof data.contactUrl !== "string") return "SQLite 客服資料中沒有官方聯絡資訊，因此我不會自行補充。";
  const phone = data.phone ? `免付費專線：${data.phone}。` : "";
  return `這是本機課堂示範客服，沒有連接即時真人排班，也沒有替你送出訊息。請透過 7-ELEVEN 官方客服頁聯絡客服：${data.contactUrl}。${phone}具體服務時段請以官方頁面為準。`;
}

function parseToolArguments(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  }
  throw new Error("The local model returned invalid tool arguments.");
}

async function requestToolChoice(messages) {
  let response;
  try {
    response = await fetch(`${ollamaBaseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: ollamaModel, messages, tools, stream: false, options: { temperature: 0 } }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    throw new Error(`無法連線至本機 Ollama。請啟動 Ollama，並確認已下載模型 ${ollamaModel}。`);
  }
  if (!response.ok) {
    if (response.status === 404) throw new Error(`Ollama 找不到模型 ${ollamaModel}。請執行 ollama pull ${ollamaModel}。`);
    throw new Error(`本機 Ollama 回應錯誤（HTTP ${response.status}）；請確認 Ollama 服務及模型狀態。`);
  }
  const payload = await response.json().catch(() => ({}));
  if (!payload.message) throw new Error("本機 Ollama 沒有回傳有效的工具選擇。");
  return payload.message;
}

export async function runSupportAgent(message) {
  const userMessage = String(message ?? "").trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!userMessage) throw new Error("請先輸入問題。");
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];
  const trace = [];
  const sources = [];
  const calledTools = new Set();

  
  // 一般客服問題先查 SQLite FAQ，避免 Ollama 直接轉接真人。
  const faqResults = searchFaq(userMessage);
  console.log(
    "[DEBUG] FAQ preflight:",
    userMessage,
    faqResults.map((row) => ({
      id: row.id,
      topic: row.topic,
      question: row.question,
    }))
  );

  if (faqResults.length > 0) {
    const first = faqResults[0];

    // 點數問題只允許命中點數相關 FAQ。
    const normalizedQuestion = normalize(userMessage);
    const asksPoints =
      normalizedQuestion.includes("點數") ||
      normalizedQuestion.includes("集點") ||
      normalizedQuestion.includes("累積");

    const firstFaqText = normalize(
      `${first.topic} ${first.question} ${first.keywords}`
    );

    const isPointsFaq =
      firstFaqText.includes("點數") ||
      firstFaqText.includes("集點") ||
      firstFaqText.includes("會員條碼");

    if (!asksPoints || isPointsFaq) {
      const result = runTool(
        "search_faq",
        { query: userMessage },
        userMessage
      );

      if (result.answerable) {
        return {
          reply: toolAnswer("search_faq", result.data),
          trace: [result.trace],
          sources: dedupeSources(result.sources),
          needsHuman: false,
          steps: 1,
        };
      }
    }
  }


  for (let step = 1; step <= MAX_STEPS; step += 1) {
    const assistant = await requestToolChoice(messages);
    const calls = Array.isArray(assistant.tool_calls) ? assistant.tool_calls : [];
    if (calls.length !== 1) {
      return {
        reply: "本機 Agent 這次沒有選出唯一且有效的客服工具；為避免未查證回答，我沒有使用模型記憶作答。請重試或查看官方客服管道。",
        trace: [...trace, { name: "search_faq", label: "客服 Agent", status: "error", summary: "未收到唯一工具呼叫；已停止本輪，沒有記憶式回答。" }],
        sources,
        needsHuman: true,
        steps: step,
      };
    }
    const call = calls[0];
    const name = call?.function?.name;
    if (typeof name !== "string" || !Object.hasOwn(TOOL_LABELS, name)) {
      return {
        reply: "本機 Agent 選擇了不支援的工具；為避免未查證回答，已停止本輪。請重試或使用官方客服頁。",
        trace: [...trace, { name: "search_faq", label: "客服 Agent", status: "error", summary: "拒絕執行未知工具。" }],
        sources,
        needsHuman: true,
        steps: step,
      };
    }
    if (calledTools.has(name)) {
      trace.push({ name, label: TOOL_LABELS[name], status: "error", summary: "拒絕重複工具查詢，未使用模型記憶補答。" });
      break;
    }
    calledTools.add(name);
    let result;
    try {
      const args = parseToolArguments(call.function.arguments);
      result = runTool(name, args, userMessage);
    } catch {
      result = {
        answerable: false,
        data: { found: false },
        trace: { name, label: TOOL_LABELS[name], status: "error", summary: "工具參數或 SQLite 查詢失敗；沒有使用模型記憶補答。" },
        sources: [],
      };
    }
    trace.push(result.trace);
    sources.push(...result.sources);
    if (result.answerable) {
      return { reply: toolAnswer(name, result.data), trace, sources: dedupeSources(sources), needsHuman: name === "transfer_to_human", steps: step };
    }
    messages.push({ role: "assistant", content: "", tool_calls: calls });
    messages.push({ role: "tool", content: JSON.stringify(result.data) });
    messages.push({ role: "system", content: `工具 ${name} 沒有找到可回答資料。請改用不同工具，通常應轉接官方真人客服。不得重複工具或直接回答。` });
  }
  return {
    reply: "目前在本機 SQLite 客服資料中查不到足以回答的資訊，因此我不會自行推測。請透過官方客服管道確認。",
    trace: trace.length ? trace : [{ name: "search_faq", label: "客服 Agent", status: "error", summary: "沒有有效工具結果；已安全停止。" }],
    sources: dedupeSources(sources),
    needsHuman: true,
    steps: MAX_STEPS,
  };
}

function dedupeSources(items) {
  return [...new Map(items.map((item) => [`${item.url}|${item.label}`, item])).values()];
}

export async function getOllamaStatus() {
  try {
    const response = await fetch(`${ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(1800) });
    if (!response.ok) return { available: false, modelInstalled: false };
    const payload = await response.json();
    const names = Array.isArray(payload.models) ? payload.models.map((item) => item.name).filter(Boolean) : [];
    return { available: true, modelInstalled: names.includes(ollamaModel), model: ollamaModel };
  } catch {
    return { available: false, modelInstalled: false, model: ollamaModel };
  }
}

export function getSupportStats() {
  const db = database();
  return {
    products: Number(db.prepare("SELECT COUNT(*) AS count FROM demo_products WHERE is_demo = 1").get().count),
    faq: Number(db.prepare("SELECT COUNT(*) AS count FROM faq_entries").get().count),
    topics: Number(db.prepare("SELECT COUNT(DISTINCT topic) AS count FROM faq_entries").get().count),
    records: Number(db.prepare("SELECT COUNT(*) AS count FROM demo_records WHERE is_demo = 1").get().count),
  };
}
