import { executeSupportTool, formatToolAnswer, SUPPORT_TOOLS, TOOL_LABELS, type PublicSource, type SupportToolName, type ToolTrace } from "~/lib/tools.server";

const MAX_AGENT_STEPS = 3;
const MAX_HISTORY_MESSAGES = 8;
const SYSTEM_PROMPT = `你是小七補給站（課堂示範店）的客服 Agent。你不能憑模型記憶回答任何店務、官方政策、商品價格、庫存、包裹或紀錄問題。你的工作只有選擇伺服器工具。
規則：
1. 每個新問題至少呼叫一個工具；只能用工具回傳資料支持答案。請勿直接回答使用者。
2. 官方服務或政策用 search_faq，並給出精簡的繁體中文精確關鍵詞。
3. DEMO- 開頭的虛構示範資料代碼用 lookup_demo_record；不得查真實顧客／訂單。
4. 詢問示範商品名稱、示範價格或小計，用 calculate_demo_basket；quantity 用整數。可用「海苔飯糰」「冰咖啡」等 SQLite 商品關鍵詞。
5. 要求即時門市庫存／營業資訊、真實訂單／個資、投訴需真人處理，或不明事項／查詢未命中時，用 transfer_to_human。這只提供官方聯絡方式，不會真的送出訊息。
6. 若先前工具結果明確 not_found，下一步不要重複同一工具；改用不同可用工具或 transfer_to_human。最多三步。
7. 只輸出一個適合當前步驟的工具呼叫；工具輸入不得捏造記錄 ID、商品、政策或個人資料。`;

type ChatHistoryMessage = { role: "user" | "assistant"; content: string };

type CompletionMessage = {
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

type ChatCompletion = { choices?: Array<{ message?: CompletionMessage }>; error?: { message?: string } };

function platformEndpoint(): { url: string; key: string } {
  const base = process.env.MANUS_API_URL?.trim().replace(/\/+$/, "");
  const key = process.env.MANUS_API_KEY?.trim();
  if (!base || !key) throw new Error("Platform LLM service is not configured");
  return { url: `${base}/v1/chat/completions`, key };
}

async function requestToolChoice(messages: Array<Record<string, unknown>>): Promise<CompletionMessage> {
  const { url, key } = platformEndpoint();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        tools: SUPPORT_TOOLS,
        tool_choice: "required",
        parallel_tool_calls: false,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(28_000),
    });
  } catch {
    throw new Error("Platform LLM request failed or timed out");
  }

  const payload = await response.json().catch(() => ({})) as ChatCompletion;
  if (!response.ok || payload.error) {
    throw new Error(`Platform LLM request failed (${response.status})`);
  }
  const message = payload.choices?.[0]?.message;
  if (!message) throw new Error("Platform LLM returned no assistant message");
  return message;
}

function parseArguments(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid object");
    return value as Record<string, unknown>;
  } catch {
    throw new Error("Tool arguments were not valid JSON");
  }
}

function sanitizeHistory(input: unknown): ChatHistoryMessage[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((message): message is Record<string, unknown> => Boolean(message) && typeof message === "object")
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({ role: message.role as "user" | "assistant", content: String(message.content ?? "").slice(0, 1000) }))
    .filter((message) => message.content.length > 0)
    .slice(-MAX_HISTORY_MESSAGES);
}

function fallbackTrace(reason: string): ToolTrace {
  return {
    name: "search_faq",
    label: "客服 Agent",
    status: "error",
    summary: reason,
  };
}

export async function runSupportAgent(input: { message: string; history?: unknown }) {
  const userMessage = input.message.trim().slice(0, 500);
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: SYSTEM_PROMPT },
    ...sanitizeHistory(input.history),
    { role: "user", content: userMessage },
  ];
  const trace: ToolTrace[] = [];
  const sources: PublicSource[] = [];
  const calledTools = new Set<string>();

  for (let step = 1; step <= MAX_AGENT_STEPS; step += 1) {
    const assistant = await requestToolChoice(messages);
    const calls = assistant.tool_calls ?? [];
    if (!calls.length || calls.length > 1) {
      const message = "Agent 沒有選出唯一有效工具；為避免未查證回答，已停止本輪。請重試或聯絡官方客服。";
      return { reply: message, trace: [...trace, fallbackTrace("工具選擇不完整，未生成記憶式答案。")], sources, needsHuman: true, steps: step };
    }

    const call = calls[0];
    if (!call.id || !call.function || typeof call.function.name !== "string" || !Object.hasOwn(TOOL_LABELS, call.function.name)) {
      return {
        reply: "Agent 選出的工具不在客服系統支援範圍內，為避免未查證回答已停止。請重試或使用官方客服頁。",
        trace: [...trace, fallbackTrace("模型選擇的工具名稱無效，未執行未知工具。")],
        sources: dedupeSources(sources),
        needsHuman: true,
        steps: step,
      };
    }
    messages.push({
      role: "assistant",
      content: assistant.content ?? null,
      tool_calls: [{
        id: call.id,
        type: "function",
        function: { name: call.function.name, arguments: call.function.arguments },
      }],
    });

    if (calledTools.has(call.function.name)) {
      const output = {
        answerable: false,
        found: false,
        data: { error: "The same tool cannot be called twice in one turn." },
        trace: fallbackTrace("Agent 重複選擇相同工具，已依 max_steps 保護停止。"),
        sources: [] as PublicSource[],
      };
      trace.push(output.trace);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(output.data) });
      break;
    }
    calledTools.add(call.function.name);

    let output: ReturnType<typeof executeSupportTool>;
    try {
      const args = parseArguments(call.function.arguments);
      output = executeSupportTool(call.function.name, args, { originalQuestion: userMessage });
    } catch (error) {
      output = {
        answerable: false,
        found: false,
        data: { error: error instanceof Error ? error.message : "Tool execution failed" },
        trace: {
          name: call.function.name in { search_faq: 1, lookup_demo_record: 1, calculate_demo_basket: 1, transfer_to_human: 1 }
            ? call.function.name as SupportToolName
            : "search_faq",
          label: "工具執行",
          status: "error",
          summary: "工具輸入或 SQLite 查詢無效；未以模型記憶補答。",
        },
        sources: [],
      };
    }

    trace.push(output.trace);
    sources.push(...output.sources);
    messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(output.data) });
    if (output.answerable) {
      return {
        reply: formatToolAnswer(call.function.name, output.data),
        trace,
        sources: dedupeSources(sources),
        needsHuman: call.function.name === "transfer_to_human",
        steps: step,
      };
    }

    messages.push({
      role: "system",
      content: `上一個工具回傳沒有可回答的資料。已使用工具：${Array.from(calledTools).join(", ")}。請依工具結果選不同工具，通常轉真人；不要重複，也不要直接回答。`,
    });
  }

  return {
    reply: "我在目前 SQLite 客服資料中查不到足以回答的資訊，因此不會自行推測。此課堂示範未連接即時真人客服；請直接使用官方客服頁面。",
    trace: trace.length ? trace : [fallbackTrace("Agent 到達 max_steps，沒有有效工具結果。")],
    sources: dedupeSources(sources),
    needsHuman: true,
    steps: MAX_AGENT_STEPS,
  };
}

function dedupeSources(sources: PublicSource[]): PublicSource[] {
  const unique = new Map<string, PublicSource>();
  for (const source of sources) unique.set(`${source.url}|${source.label}`, source);
  return Array.from(unique.values());
}
