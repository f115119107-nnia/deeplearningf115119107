import {
  findDemoRecord,
  findFaqById,
  listDemoProducts,
  searchFaq,
} from "~/lib/knowledge.server";

export const TOOL_LABELS = {
  search_faq: "查詢客服知識庫",
  lookup_demo_record: "查詢示範紀錄",
  calculate_demo_basket: "計算示範購物籃",
  transfer_to_human: "提供真人客服管道",
} as const;

export const SUPPORT_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_faq",
      description: "在唯讀 SQLite 客服知識庫查詢官方 7-ELEVEN 服務資訊或已明確標示的本站示範規則。沒有命中時不得猜答案。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "用最具體的繁體中文關鍵詞查找，例如：交貨便貨態、客服電話、0元取件。" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_demo_record",
      description: "只在 SQLite 中查詢 DEMO- 開頭的完全虛構匿名示範記錄；不查真實訂單或顧客資料。",
      parameters: {
        type: "object",
        properties: {
          record_id: { type: "string", description: "示範記錄代碼，例如 DEMO-PARCEL-001。" },
        },
        required: ["record_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_demo_basket",
      description: "依 SQLite 課堂示範商品 CSV 匯入的 TWD 示範單價，以伺服器程式計算數量和小計。商品不是 7-ELEVEN 真實商品或售價。查單品價格時也可用 quantity 1。",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            minItems: 1,
            maxItems: 10,
            items: {
              type: "object",
              properties: {
                product_name: { type: "string", description: "示範品名稱或能在 SQLite 商品資料中匹配的關鍵詞，例如海苔飯糰或冰咖啡。" },
                quantity: { type: "integer", minimum: 1, maximum: 50 },
              },
              required: ["product_name", "quantity"],
              additionalProperties: false,
            },
          },
        },
        required: ["items"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "transfer_to_human",
      description: "當問題查無資料、要求真實訂單／個人資料、詢問即時門市庫存或營業狀態、涉及客訴或需要真人判斷時，查詢 SQLite 官方客服聯絡知識並提供聯絡方式。這只會提供方式，不會實際傳訊給真人。",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "用繁體中文簡述需要真人協助的原因。" },
        },
        required: ["reason"],
        additionalProperties: false,
      },
    },
  },
] as const;

export type SupportToolName = keyof typeof TOOL_LABELS;
export type ToolTrace = {
  name: SupportToolName;
  label: string;
  status: "success" | "not_found" | "error";
  summary: string;
};

export type PublicSource = { label: string; url: string; kind: "official" | "demo" };

type ToolResult = {
  answerable: boolean;
  found: boolean;
  data: Record<string, unknown>;
  trace: ToolTrace;
  sources: PublicSource[];
};

function cleanText(value: unknown, max = 160): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function executeSupportTool(name: string, rawArgs: unknown, context?: { originalQuestion?: string }): ToolResult {
  const args = rawArgs && typeof rawArgs === "object" ? rawArgs as Record<string, unknown> : {};
  if (!Object.hasOwn(TOOL_LABELS, name)) {
    throw new Error("Unsupported support tool");
  }
  const label = TOOL_LABELS[name as SupportToolName];

  if (name === "search_faq") {
    const query = cleanText(context?.originalQuestion, 160) || cleanText(args.query);
    const rows = searchFaq(query);
    const results = rows.map((row) => ({
      id: row.id,
      topic: row.topic,
      question: row.question,
      answer: row.answer,
      sourceType: row.source_type,
      sourceUrl: row.source_url,
      isDemo: row.is_demo === 1,
    }));
    const found = results.length > 0;
    return {
      answerable: found,
      found,
      data: { query, results },
      trace: {
        name: "search_faq",
        label,
        status: found ? "success" : "not_found",
        summary: found ? `SQLite 知識庫命中 ${results.length} 筆，使用最相關的一筆。` : "SQLite 知識庫沒有找到相符資料；未使用模型記憶補答。",
      },
      sources: found ? [{
        label: results[0].sourceType === "official" ? `官方來源：${results[0].topic}` : `示範資料：${results[0].topic}`,
        url: results[0].sourceUrl,
        kind: results[0].sourceType === "official" ? "official" : "demo",
      }] : [],
    };
  }

  if (name === "lookup_demo_record") {
    const recordId = cleanText(args.record_id, 64).toUpperCase();
    const record = /^DEMO-[A-Z0-9-]+$/.test(recordId) ? findDemoRecord(recordId) : undefined;
    const found = Boolean(record);
    return {
      answerable: found,
      found,
      data: { record: record ?? null, isDemo: true },
      trace: {
        name: "lookup_demo_record",
        label,
        status: found ? "success" : "not_found",
        summary: found ? "已從 SQLite 讀取一筆匿名虛構示範紀錄。" : "SQLite 中沒有這個示範代碼；未查詢任何真實訂單。",
      },
      sources: [],
    };
  }

  if (name === "calculate_demo_basket") {
    const requestedItems = Array.isArray(args.items) ? args.items.slice(0, 10) : [];
    const products = listDemoProducts();
    const lines: Array<{ id: string; name: string; quantity: number; unitPriceTwd: number; lineTotalTwd: number }> = [];
    const missing: string[] = [];
    let subtotalTwd = 0;

    for (const requested of requestedItems) {
      if (!requested || typeof requested !== "object") continue;
      const item = requested as Record<string, unknown>;
      const name = cleanText(item.product_name, 80);
      const quantity = Number(item.quantity);
      if (!name || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 50) {
        missing.push(name || "商品或數量格式不正確");
        continue;
      }
      const normalizedName = name.normalize("NFKC").toLowerCase();
      const matches = products.filter((product) => {
        const productName = product.name.normalize("NFKC").toLowerCase();
        return product.sku.toLowerCase() === normalizedName ||
          product.id.toLowerCase() === normalizedName ||
          productName.includes(normalizedName) ||
          normalizedName.includes(productName.replace("課堂示範商品｜", "").toLowerCase());
      });
      if (matches.length !== 1) {
        missing.push(name);
        continue;
      }
      const product = matches[0];
      const lineTotalTwd = product.priceTwd * quantity;
      if (!Number.isSafeInteger(lineTotalTwd)) {
        missing.push(name);
        continue;
      }
      subtotalTwd += lineTotalTwd;
      lines.push({ id: product.id, name: product.name, quantity, unitPriceTwd: product.priceTwd, lineTotalTwd });
    }

    const found = lines.length > 0 && missing.length === 0 && Number.isSafeInteger(subtotalTwd);
    return {
      answerable: found,
      found,
      data: {
        currencyCode: "TWD",
        lines,
        subtotalTwd: found ? subtotalTwd : null,
        missing,
        note: "僅為課堂示範商品 CSV 的程式計算，不代表 7-ELEVEN 真實商品或售價。",
      },
      trace: {
        name: "calculate_demo_basket",
        label,
        status: found ? "success" : "not_found",
        summary: found ? `從 SQLite 取價並以伺服器程式計算 ${lines.length} 筆示範商品。` : "有商品無法在 SQLite 示範商品表唯一匹配；不猜價格。",
      },
      sources: [],
    };
  }

  const reason = cleanText(args.reason, 160);
  const phoneEntry = findFaqById("FAQ002");
  const generalEntry = findFaqById("FAQ001");
  const contactUrl = generalEntry?.source_url || "https://www.7-11.com.tw/faq.aspx";
  const phone = phoneEntry?.answer.match(/0800[-‐–]?\d{6}/u)?.[0] || null;
  return {
    answerable: true,
    found: Boolean(generalEntry),
    data: {
      reason,
      humanConnected: false,
      contactUrl,
      phone,
      message: "目前是課堂示範客服，尚未連接即時真人客服排班或訊息系統；此工具沒有替你送出訊息。",
      officialFaq: generalEntry ? { question: generalEntry.question, answer: generalEntry.answer } : null,
    },
    trace: {
      name: "transfer_to_human",
      label,
      status: generalEntry ? "success" : "not_found",
      summary: "已查 SQLite 官方客服聯絡資料；示範環境沒有真的通知真人。",
    },
    sources: generalEntry ? [{ label: "7-ELEVEN 官方客服 FAQ", url: contactUrl, kind: "official" }] : [],
  };
}

export function formatToolAnswer(name: string, data: Record<string, unknown>): string {
  if (name === "search_faq") {
    const results = Array.isArray(data.results) ? data.results as Array<Record<string, unknown>> : [];
    const first = results[0];
    if (!first) return "目前在客服 SQLite 資料庫中查不到這項資訊，因此我不會自行推測。若需要協助，請選擇轉接真人客服。";
    const demoPrefix = first.isDemo ? "（課堂示範資料）" : "";
    return `${demoPrefix}${String(first.answer)}\n\n資料主題：${String(first.topic)}。`;
  }
  if (name === "lookup_demo_record") {
    const record = data.record as Record<string, unknown> | null;
    if (!record) return "在 SQLite 示範紀錄中查不到這個代碼；這個工具不連接或查詢真實訂單。";
    return `這是虛構的課堂示範紀錄「${String(record.id)}」。狀態：${String(record.status)}。${String(record.summary)}。`;
  }
  if (name === "calculate_demo_basket") {
    const lines = Array.isArray(data.lines) ? data.lines as Array<Record<string, unknown>> : [];
    const missing = Array.isArray(data.missing) ? data.missing.map(String) : [];
    if (missing.length || data.subtotalTwd == null) {
      return `我無法在 SQLite 示範商品表中唯一匹配：${missing.join("、") || "指定商品"}；沒有猜測價格。請用「海苔飯糰」或「冰咖啡」等名稱再問。`;
    }
    const money = (value: unknown) => `NT$${new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(Number(value))}`;
    const details = lines.map((line) => `• ${String(line.name)} × ${String(line.quantity)}：${money(line.unitPriceTwd)} × ${String(line.quantity)} = ${money(line.lineTotalTwd)}`);
    return `${details.join("\n")}\n示範小計：${money(data.subtotalTwd)}。\n\n${String(data.note)}`;
  }
  const phone = typeof data.phone === "string" ? `免付費專線：${data.phone}。` : "";
  const url = typeof data.contactUrl === "string" ? data.contactUrl : "https://www.7-11.com.tw/faq.aspx";
  return `目前客服 Agent 是課堂示範，沒有連接即時真人排班，也沒有替你送出訊息。請透過 7-ELEVEN 官方 FAQ／客服頁聯絡客服：${url}。${phone}具體服務時段請以官方頁面為準。`;
}
