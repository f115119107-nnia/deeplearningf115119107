const CART_KEY = "seven11-demo-cart-v2";
const HISTORY_KEY = "seven11-demo-chat-history-v2";
const FALLBACK_GREETING = "嗨！我是小七補給站客服 Agent。我會先查詢 FAQ、規則或示範資料；示範預留只有在你明確確認後才會寫入本機資料庫。";

const elements = {
  productGrid: document.querySelector("#product-grid"),
  productCount: document.querySelector("#product-count"),
  bagCount: document.querySelector("#bag-count"),
  bagDialog: document.querySelector("#bag-dialog"),
  bagLines: document.querySelector("#bag-lines"),
  bagSubtotal: document.querySelector("#bag-subtotal"),
  reservationList: document.querySelector("#reservation-list"),
  modelStatus: document.querySelector("#model-status"),
  chatMessages: document.querySelector("#chat-messages"),
  chatForm: document.querySelector("#chat-form"),
  chatInput: document.querySelector("#chat-input"),
  toast: document.querySelector("#toast"),
};

let products = [];
let productById = new Map();
let lastReplyLanguage = "zh";
let conversation = loadHistory();
let busy = false;
let toastTimer;

function parseStoredJson(key, fallback) {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function loadHistory() {
  const value = parseStoredJson(HISTORY_KEY, []);
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => entry && (entry.role === "user" || entry.role === "assistant") && typeof entry.content === "string")
    .slice(-12)
    .map((entry) => ({ role: entry.role, content: entry.content.slice(0, 1800) }));
}

function saveHistory() {
  conversation = conversation.slice(-12);
  try {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(conversation));
  } catch {
    // Chat still works if the browser disables session storage.
  }
}

function loadCart() {
  try {
    const value = JSON.parse(localStorage.getItem(CART_KEY) || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([id, qty]) => typeof id === "string" && Number.isInteger(qty) && qty > 0 && qty <= 99));
  } catch {
    return {};
  }
}

let cart = loadCart();

function money(value) {
  return `NT$${new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(Number(value) || 0)}`;
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}

function showToast(message) {
  if (!elements.toast) return;
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 3400);
}

function renderProducts() {
  if (!elements.productGrid) return;
  elements.productCount.textContent = String(products.length);
  elements.productGrid.replaceChildren();
  for (const product of products) {
    const card = makeElement("article", "product-card");
    const media = makeElement("div", "product-card-media");
    const image = document.createElement("img");
    image.src = ["/onigiri.svg", "/iced-coffee.svg", "/demo-product.svg"].includes(product.image) ? product.image : "/demo-product.svg";
    image.alt = `${product.nameZh}／${product.nameEn} 課堂示範插畫`;
    image.loading = "lazy";
    media.append(image);
    const tag = makeElement("span", `product-tag${product.available ? "" : " is-unavailable"}`, product.available ? "DEMO · FICTIONAL" : "DEMO · UNAVAILABLE");
    media.append(tag);

    const info = makeElement("div", "product-info");
    const details = makeElement("div", "product-names");
    details.append(makeElement("h3", "", product.nameZh));
    details.append(makeElement("p", "product-en", product.nameEn));
    details.append(makeElement("p", "product-description", product.descriptionZh || "虛構課堂示範資料"));
    info.append(details, makeElement("span", "product-price", money(product.priceTwd)));

    const add = makeElement("button", "button add-button", product.available ? "加入本機購物袋" : "目前不可供應");
    add.type = "button";
    add.disabled = !product.available;
    add.setAttribute("aria-label", product.available ? `將 ${product.nameZh} 加入本機購物袋` : `${product.nameZh} 目前不可供應`);
    add.addEventListener("click", () => {
      cart[product.id] = Math.min(99, (cart[product.id] || 0) + 1);
      saveCart();
      renderCart();
      showToast(`已加入示範商品：${product.nameZh}`);
    });
    card.append(media, info, add);
    elements.productGrid.append(card);
  }
}

function saveCart() {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* Ignore disabled local storage. */ }
}

function renderCart() {
  const entries = Object.entries(cart).map(([id, quantity]) => ({ product: productById.get(id), quantity })).filter((entry) => entry.product);
  const count = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const subtotal = entries.reduce((sum, entry) => sum + entry.product.priceTwd * entry.quantity, 0);
  if (elements.bagCount) elements.bagCount.textContent = String(count);
  if (elements.bagSubtotal) elements.bagSubtotal.textContent = money(subtotal);
  if (!elements.bagLines) return;
  elements.bagLines.replaceChildren();
  if (!entries.length) {
    elements.bagLines.append(makeElement("p", "bag-empty", "本機購物袋目前沒有商品。"));
    return;
  }
  for (const { product, quantity } of entries) {
    const line = makeElement("div", "bag-line");
    const details = makeElement("div", "bag-line-details");
    details.append(makeElement("strong", "", product.nameZh));
    details.append(makeElement("small", "", `${product.nameEn} · ${money(product.priceTwd)} / 件`));
    const actions = makeElement("div", "bag-actions");
    actions.append(makeActionButton("−", "decrease", product.id, "減少數量"));
    actions.append(makeElement("span", "bag-quantity", String(quantity)));
    actions.append(makeActionButton("+", "increase", product.id, "增加數量"));
    actions.append(makeActionButton("移除", "remove", product.id, "移除商品", "remove"));
    details.append(actions);
    line.append(details, makeElement("strong", "bag-line-total", money(product.priceTwd * quantity)));
    elements.bagLines.append(line);
  }
}

function makeActionButton(text, action, productId, label, extraClass = "") {
  const button = makeElement("button", extraClass, text);
  button.type = "button";
  button.dataset.action = action;
  button.dataset.productId = productId;
  button.setAttribute("aria-label", label);
  return button;
}

function renderConversation() {
  if (!elements.chatMessages) return;
  elements.chatMessages.replaceChildren();
  if (!conversation.length) {
    appendMessage("assistant", FALLBACK_GREETING, {}, false);
    return;
  }
  for (const item of conversation) appendMessage(item.role, item.content, {}, false);
  scrollChat();
}

function appendMessage(role, content, options = {}, scroll = true) {
  const article = makeElement("article", `message ${role === "user" ? "message-user" : "message-agent"}`);
  const bubble = makeElement("div", "bubble", content);
  article.append(bubble);
  if (role === "assistant" && Array.isArray(options.trace) && options.trace.length) {
    const traceBox = makeElement("div", "tool-trace");
    traceBox.append(makeElement("div", "trace-title", lastReplyLanguage === "en" ? "Tool trace" : "工具軌跡"));
    for (const item of options.trace) {
      const line = document.createElement("div");
      const status = item.status === "success" ? "✓" : item.status === "not_found" ? "?" : "!";
      line.textContent = `${status} ${item.label || item.name}: ${item.summary || ""}`;
      traceBox.append(line);
    }
    article.append(traceBox);
  }
  if (role === "assistant" && Array.isArray(options.sources) && options.sources.length) {
    const sourceBox = makeElement("div", "message-sources");
    for (const source of options.sources) {
      const label = String(source.label || (lastReplyLanguage === "en" ? "Source" : "資料來源"));
      if (typeof source.url === "string" && /^https:\/\//u.test(source.url)) {
        const link = document.createElement("a");
        link.href = source.url;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = label;
        sourceBox.append(link);
      } else {
        sourceBox.append(makeElement("span", "", label));
      }
    }
    article.append(sourceBox);
  }
  if (role === "assistant" && options.confirmationRequired) {
    const actions = makeElement("div", "chat-confirm-actions");
    const confirm = makeElement("button", "", lastReplyLanguage === "en" ? "Confirm demo reservation" : "確認示範預留");
    confirm.type = "button";
    confirm.dataset.prompt = lastReplyLanguage === "en" ? "confirm reservation" : "確認預留";
    const cancel = makeElement("button", "", lastReplyLanguage === "en" ? "Cancel" : "取消預留");
    cancel.type = "button";
    cancel.dataset.prompt = lastReplyLanguage === "en" ? "cancel reservation" : "取消預留";
    actions.append(confirm, cancel);
    article.append(actions);
  }
  elements.chatMessages.append(article);
  if (scroll) scrollChat();
}

function scrollChat() {
  if (elements.chatMessages) elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function addTyping() {
  const node = makeElement("div", "typing", lastReplyLanguage === "en" ? "Checking local tools and SQLite…" : "正在選擇工具並查詢本機 SQLite…");
  node.id = "chat-typing";
  elements.chatMessages.append(node);
  scrollChat();
}

function setBusy(value) {
  busy = value;
  const button = elements.chatForm?.querySelector("button[type=submit]");
  if (button) button.disabled = value;
  if (elements.chatInput) elements.chatInput.disabled = value;
}

async function sendMessage(message) {
  const prompt = String(message || "").trim().slice(0, 500);
  if (!prompt || busy) return;
  const history = conversation.slice(-8).map((item) => ({ role: item.role, content: item.content }));
  conversation.push({ role: "user", content: prompt });
  saveHistory();
  appendMessage("user", prompt);
  lastReplyLanguage = /\p{Script=Han}/u.test(prompt) ? "zh" : "en";
  setBusy(true);
  addTyping();
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ message: prompt, history }),
    });
    const payload = await response.json().catch(() => ({}));
    document.querySelector("#chat-typing")?.remove();
    lastReplyLanguage = payload.language === "en" ? "en" : "zh";
    if (!response.ok) {
      const error = typeof payload.error === "string" ? payload.error : (lastReplyLanguage === "en" ? "The local support agent is unavailable." : "本機客服 Agent 暫時無法使用。");
      conversation.push({ role: "assistant", content: error });
      saveHistory();
      appendMessage("assistant", error, {});
      return;
    }
    const reply = typeof payload.reply === "string" ? payload.reply : (lastReplyLanguage === "en" ? "The agent returned no answer." : "客服 Agent 沒有回傳回答。" );
    conversation.push({ role: "assistant", content: reply });
    saveHistory();
    appendMessage("assistant", reply, payload);
    if (Array.isArray(payload.trace) && payload.trace.some((item) => item.name === "confirm_demo_reservation" && item.status === "success")) {
      await loadReservations();
    }
  } catch {
    document.querySelector("#chat-typing")?.remove();
    const error = lastReplyLanguage === "en" ? "Could not connect to the local demo server. Keep the Node terminal running and retry." : "無法連線到本機示範伺服器；請讓 Node 終端機保持執行後重試。";
    conversation.push({ role: "assistant", content: error });
    saveHistory();
    appendMessage("assistant", error, {});
  } finally {
    setBusy(false);
    elements.chatInput?.focus();
  }
}

async function loadReservations() {
  if (!elements.reservationList) return;
  try {
    const response = await fetch(`/api/reservations?lang=${lastReplyLanguage}`, { credentials: "same-origin" });
    const payload = await response.json();
    const entries = Array.isArray(payload.reservations) ? payload.reservations : [];
    elements.reservationList.replaceChildren();
    if (!entries.length) {
      elements.reservationList.append(makeElement("p", "reservation-empty", lastReplyLanguage === "en" ? "No saved demo reservation for this browser session." : "此瀏覽 session 尚無已保存的示範預留。"));
      return;
    }
    for (const item of entries) {
      const card = makeElement("div", "reservation-item");
      card.append(makeElement("strong", "", item.reservationId));
      const names = (item.items || []).map((line) => `${line.name} × ${line.quantity}`).join(lastReplyLanguage === "en" ? ", " : "、");
      card.append(makeElement("div", "", names));
      card.append(makeElement("div", "", `${lastReplyLanguage === "en" ? "Demo total" : "示範合計"}: ${money(item.subtotalTwd)} · ${lastReplyLanguage === "en" ? "fictional local record" : "虛構本機記錄"}`));
      elements.reservationList.append(card);
    }
  } catch {
    elements.reservationList.replaceChildren(makeElement("p", "reservation-empty", lastReplyLanguage === "en" ? "Saved demo records are temporarily unavailable." : "暫時無法讀取已保存的示範記錄。"));
  }
}

async function loadProducts() {
  try {
    const response = await fetch("/api/products", { credentials: "same-origin" });
    const payload = await response.json();
    if (!response.ok || !Array.isArray(payload.products)) throw new Error("products_unavailable");
    products = payload.products;
    productById = new Map(products.map((product) => [product.id, product]));
    cart = Object.fromEntries(Object.entries(cart).filter(([id]) => productById.has(id)));
    saveCart();
    renderProducts();
    renderCart();
  } catch {
    elements.productGrid.replaceChildren(makeElement("div", "loading-card", "目前無法載入本機商品資料；請確認 Node server 正在執行。"));
  }
}

async function loadModelStatus() {
  if (!elements.modelStatus) return;
  try {
    const response = await fetch("/api/status", { credentials: "same-origin" });
    const payload = await response.json();
    const model = payload.ollama?.model || "qwen2.5:3b";
    const stats = payload.stats || {};
    if (!payload.ollama?.available) {
      elements.modelStatus.className = "model-status is-error";
      elements.modelStatus.textContent = `Ollama 尚未連線；商品瀏覽可用，聊天需安裝並啟動 Ollama，再下載模型：ollama pull ${model}。資料：FAQ ${stats.faq || 0} 筆、RAG ${stats.ragChunks || 0} 段、匿名紀錄 ${stats.records || 0} 筆、虛構商品 ${stats.products || 0} 款。`;
    } else if (!payload.ollama?.modelInstalled) {
      elements.modelStatus.className = "model-status is-error";
      elements.modelStatus.textContent = `Ollama 已啟動但找不到模型；請在終端機執行：ollama pull ${model}。`;
    } else {
      elements.modelStatus.className = "model-status is-ready";
      elements.modelStatus.textContent = `本機 Ollama 已就緒（${model}）。${stats.faq || 0} 筆 FAQ／${stats.ragChunks || 0} 個 RAG 片段／${stats.records || 0} 筆匿名紀錄／${stats.products || 0} 款虛構商品。每題先選工具。`;
    }
  } catch {
    elements.modelStatus.className = "model-status is-error";
    elements.modelStatus.textContent = "無法讀取本機 Agent 狀態；請確認 Node server 正在執行。";
  }
}

function bindEvents() {
  document.querySelector("#bag-trigger")?.addEventListener("click", async () => {
    elements.bagDialog?.showModal();
    await loadReservations();
  });
  document.querySelector("#bag-close")?.addEventListener("click", () => elements.bagDialog?.close());
  elements.bagDialog?.addEventListener("click", (event) => {
    if (event.target === elements.bagDialog) elements.bagDialog.close();
  });
  elements.bagLines?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.dataset.productId;
    const action = button.dataset.action;
    if (!id || !cart[id]) return;
    if (action === "remove") delete cart[id];
    if (action === "increase") cart[id] = Math.min(99, cart[id] + 1);
    if (action === "decrease") {
      cart[id] -= 1;
      if (cart[id] <= 0) delete cart[id];
    }
    saveCart();
    renderCart();
  });
  document.querySelector("#demo-checkout")?.addEventListener("click", () => {
    showToast("這是本機展示模式：不連 Shopify、不建立訂單、不收付款。客服中的示範預留也不代表真實門市庫存。");
  });
  elements.chatForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = elements.chatInput.value;
    elements.chatInput.value = "";
    await sendMessage(value);
  });
  document.querySelector("#suggestions")?.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-prompt]");
    if (button) await sendMessage(button.dataset.prompt);
  });
  elements.chatMessages?.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-prompt]");
    if (button) await sendMessage(button.dataset.prompt);
  });
}

bindEvents();
renderConversation();
renderCart();
void loadProducts();
void loadModelStatus();
