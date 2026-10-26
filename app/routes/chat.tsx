import { useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import type { Route } from "./+types/chat";
import type { PublicSource, ToolTrace } from "~/lib/tools.server";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace?: ToolTrace[];
  sources?: PublicSource[];
  needsHuman?: boolean;
};

type ChatResponse = {
  reply?: string;
  trace?: ToolTrace[];
  sources?: PublicSource[];
  needsHuman?: boolean;
  error?: string;
};

const STARTER_QUESTIONS = [
  "交貨便貨態要去哪裡查？",
  "7-ELEVEN 客服電話是多少？",
  "算一下海苔飯糰 2 個和冰咖啡 1 杯",
  "示範紀錄 DEMO-PARCEL-001 的狀態？",
];

export function meta({}: Route.MetaArgs) {
  return [
    { title: "AI 文字客服｜小七補給站" },
    { name: "description", content: "每個問題先由 Agent 選擇工具，查詢 SQLite 客服資料後再回答。" },
  ];
}

export default function ChatRoute() {
  const welcome = useMemo<ChatMessage>(() => ({
    id: "welcome",
    role: "assistant",
    content: "嗨，我是小七補給站的文字客服 Agent。每個問題我都會先選工具查資料；如果資料裡沒有，我會說明查不到，不會憑記憶猜答案。你可以問官方服務，或試試課堂示範商品與匿名測試紀錄。",
  }), []);
  const [messages, setMessages] = useState<ChatMessage[]>([welcome]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [retryQuestion, setRetryQuestion] = useState("");
  const scrollArea = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function askAgent(question: string, addUserMessage: boolean) {
    const text = question.trim().slice(0, 500);
    if (!text || pending) return;
    const previous = messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .filter((message) => message.id !== "welcome")
      .slice(-8)
      .map((message) => ({ role: message.role, content: message.content }));
    if (!addUserMessage && previous.at(-1)?.role === "user" && previous.at(-1)?.content === text) {
      previous.pop();
    }
    const userTurn: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text };
    if (addUserMessage) setMessages((current) => [...current, userTurn]);
    setDraft("");
    setError("");
    setRetryQuestion(text);
    setPending(true);
    requestAnimationFrame(() => scrollArea.current?.scrollTo({ top: scrollArea.current.scrollHeight, behavior: "smooth" }));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: previous }),
      });
      const payload = await response.json().catch(() => ({})) as ChatResponse;
      if (!response.ok || !payload.reply) throw new Error(payload.error || "客服工具暫時無法使用，請稍後重試。");
      const answer: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: payload.reply,
        trace: payload.trace,
        sources: payload.sources,
        needsHuman: payload.needsHuman,
      };
      setMessages((current) => [...current, answer]);
      setRetryQuestion("");
      requestAnimationFrame(() => scrollArea.current?.scrollTo({ top: scrollArea.current.scrollHeight, behavior: "smooth" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "客服工具暫時無法使用，請稍後重試。");
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void askAgent(draft, true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <section className="chat-page section-wrap">
      <aside className="chat-intro">
        <p className="eyebrow"><span className="eyebrow-dot" /> TOOL-FIRST SUPPORT</p>
        <h1>先查資料，<br /><span>再給你答案。</span></h1>
        <p className="chat-intro-copy">每個問題先交給 Agent 選工具：查 SQLite 知識、查匿名示範紀錄、計算示範商品，或提供真人客服聯絡方式。</p>
        <div className="agent-steps" aria-label="客服 Agent 工作流程">
          <div><span>01</span><p>Agent 選工具</p></div>
          <span className="agent-steps-arrow" aria-hidden="true">→</span>
          <div><span>02</span><p>SQLite／程式處理</p></div>
          <span className="agent-steps-arrow" aria-hidden="true">→</span>
          <div><span>03</span><p>回覆附足跡</p></div>
        </div>
        <div className="chat-disclaimer">
          <span className="disclaimer-mark" aria-hidden="true">i</span>
          <p><strong>這是課堂示範客服。</strong><br />不查真實訂單、顧客個資或門市即時庫存；目前未連接真人排班，也不會保存對話紀錄。</p>
        </div>
      </aside>

      <section className="chat-panel" aria-label="小七 AI 客服對話">
        <header className="chat-panel-header">
          <div className="agent-avatar" aria-hidden="true"><span>7</span><i /></div>
          <div className="chat-agent-title"><strong>小七客服 Agent</strong><span><i /> 工具查詢服務 · 示範版</span></div>
          <span className="chat-security">SQLite <span aria-hidden="true">·</span> 私密查詢</span>
        </header>

        <div className="chat-session-note"><span aria-hidden="true">✳</span> 每個問題都先由 Agent 選工具；客服資料只用工具結果回答。</div>

        <ol className="chat-messages" ref={scrollArea} aria-live="polite" aria-relevant="additions text">
          {messages.map((message) => <ChatBubble key={message.id} message={message} />)}
          {pending && (
            <li className="message-row assistant-row" aria-label="客服 Agent 正在查詢">
              <div className="assistant-avatar-mini" aria-hidden="true">7</div>
              <div className="thinking-bubble"><span /><span /><span /><p>Agent 正在選工具並查資料…</p></div>
            </li>
          )}
        </ol>

        {messages.length === 1 && !pending && (
          <div className="starter-prompts" aria-label="試試這些問題">
            {STARTER_QUESTIONS.map((question) => (
              <button key={question} type="button" onClick={() => void askAgent(question, true)}>{question} <span aria-hidden="true">↗</span></button>
            ))}
          </div>
        )}

        {error && (
          <div className="chat-error" role="alert">
            <span>{error}</span>
            {retryQuestion && <button type="button" onClick={() => void askAgent(retryQuestion, false)}>重試這題</button>}
          </div>
        )}

        <form className="chat-composer" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="chat-input">輸入問題</label>
          <textarea
            ref={inputRef}
            id="chat-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, 500))}
            onKeyDown={handleKeyDown}
            placeholder="輸入你想查詢的問題…"
            rows={2}
            maxLength={500}
            disabled={pending}
          />
          <div className="composer-bottom">
            <span>{draft.length}/500 <span className="composer-hint">· Enter 送出，Shift + Enter 換行</span></span>
            <button type="submit" disabled={pending || !draft.trim()} aria-label="送出問題">
              {pending ? <span className="send-spinner" aria-hidden="true" /> : <>送出 <span aria-hidden="true">↗</span></>}
            </button>
          </div>
        </form>
        <p className="chat-privacy-note">請勿輸入密碼、完整電話、身分證字號或其他敏感個資。</p>
      </section>
    </section>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <li className={`message-row ${isUser ? "user-row" : "assistant-row"}`}>
      {!isUser && <div className="assistant-avatar-mini" aria-hidden="true">7</div>}
      <div className="message-column">
        <div className={`message-bubble ${isUser ? "user-bubble" : "assistant-bubble"}`}>
          <p>{message.content}</p>
          {!isUser && message.needsHuman && <span className="human-needed-label">需要真人協助</span>}
        </div>
        {!isUser && message.trace && message.trace.length > 0 && (
          <details className="tool-trace">
            <summary><span className="trace-check" aria-hidden="true">✓</span> Agent 工具足跡 <span className="trace-count">{message.trace.length}</span></summary>
            <ol>
              {message.trace.map((trace, index) => (
                <li className={`trace-item trace-${trace.status}`} key={`${trace.name}-${index}`}>
                  <span className="trace-node" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{trace.label}</strong><p>{trace.summary}</p></div>
                  <span className="trace-state">{trace.status === "success" ? "完成" : trace.status === "not_found" ? "未命中" : "停止"}</span>
                </li>
              ))}
            </ol>
            {message.sources && message.sources.length > 0 && (
              <div className="message-sources">
                <span className="source-heading">查詢來源</span>
                {message.sources.map((source, index) => (
                  <a href={source.url} key={`${source.url}-${index}`} target="_blank" rel="noreferrer noopener">
                    <span>{source.label}</span><span aria-hidden="true">↗</span>
                  </a>
                ))}
              </div>
            )}
          </details>
        )}
      </div>
      {isUser && <span className="user-avatar-mini" aria-hidden="true">你</span>}
    </li>
  );
}
