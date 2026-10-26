const CART_KEY = "seven11-local-demo-cart-v1";
const grid = document.querySelector("#product-grid");
const chatMessages = document.querySelector("#chat-messages");
const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const modelStatus = document.querySelector("#model-status");
const bagDialog = document.querySelector("#bag-dialog");
const toast = document.querySelector("#toast");
let products = [];
let toastTimer;

function escapeText(value) { return String(value ?? ""); }
function readCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((line) => typeof line.id === "string" && Number.isInteger(line.quantity) && line.quantity > 0) : [];
  } catch { return []; }
}
function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  renderCart();
}
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 4400);
}
function money(value) { return `NT$${new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(Number(value) || 0)}`; }

function renderProducts() {
  grid.replaceChildren();
  if (!products.length) {
    const empty = document.createElement("div");
    empty.className = "loading-card";
    empty.textContent = "目前沒有示範商品資料；請重新啟動本機示範伺服器。";
    grid.append(empty);
    return;
  }
  document.querySelector("#product-count").textContent = String(products.length);
  products.forEach((product) => {
    const card = document.createElement("article");
    card.className = "product-card";
    const media = document.createElement("div");
    media.className = "product-card-media";
    const image = document.createElement("img");
    image.src = product.image;
    image.alt = `${product.name}課堂示範插畫`;
    image.loading = "lazy";
    const tag = document.createElement("span");
    tag.className = "product-tag";
    tag.textContent = "FICTIONAL DEMO";
    media.append(image, tag);
    const info = document.createElement("div");
    info.className = "product-info";
    const details = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = product.name;
    const description = document.createElement("p");
    description.textContent = product.description;
    details.append(title, description);
    const price = document.createElement("strong");
    price.className = "product-price";
    price.textContent = `${money(product.priceTwd)} · 示範價`;
    info.append(details, price);
    const add = document.createElement("button");
    add.type = "button";
    add.className = "button add-button";
    add.textContent = "加入本機購物袋";
    const arrow = document.createElement("span");
    arrow.textContent = "+";
    add.append(arrow);
    add.addEventListener("click", () => addToCart(product.id));
    card.append(media, info, add);
    grid.append(card);
  });
}

function addToCart(id) {
  const product = products.find((item) => item.id === id);
  if (!product) return;
  const cart = readCart();
  const current = cart.find((line) => line.id === id);
  if (current) current.quantity = Math.min(current.quantity + 1, 50);
  else cart.push({ id, quantity: 1 });
  saveCart(cart);
  showToast(`${product.name} 已加入本機購物袋。`);
}

function renderCart() {
  const cart = readCart();
  const bagLines = document.querySelector("#bag-lines");
  bagLines.replaceChildren();
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  document.querySelector("#bag-count").textContent = String(count);
  let subtotal = 0;
  if (!cart.length) {
    const empty = document.createElement("p");
    empty.className = "bag-empty";
    empty.textContent = "本機購物袋目前是空的，先挑一項示範商品吧。";
    bagLines.append(empty);
  }
  for (const line of cart) {
    const product = products.find((item) => item.id === line.id);
    if (!product) continue;
    subtotal += product.priceTwd * line.quantity;
    const row = document.createElement("div");
    row.className = "bag-line";
    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = product.name;
    const price = document.createElement("small");
    price.textContent = `${money(product.priceTwd)} · 課堂示範價`;
    info.append(title, price);
    const lineTotal = document.createElement("strong");
    lineTotal.textContent = money(product.priceTwd * line.quantity);
    const actions = document.createElement("div");
    actions.className = "bag-actions";
    const decrease = document.createElement("button");
    decrease.type = "button"; decrease.textContent = "−"; decrease.setAttribute("aria-label", `減少${product.name}數量`);
    decrease.addEventListener("click", () => changeQuantity(line.id, -1));
    const quantity = document.createElement("span"); quantity.textContent = String(line.quantity); quantity.setAttribute("aria-label", "數量");
    const increase = document.createElement("button");
    increase.type = "button"; increase.textContent = "+"; increase.setAttribute("aria-label", `增加${product.name}數量`);
    increase.addEventListener("click", () => changeQuantity(line.id, 1));
    const remove = document.createElement("button");
    remove.type = "button"; remove.className = "remove"; remove.textContent = "移除";
    remove.addEventListener("click", () => saveCart(readCart().filter((item) => item.id !== line.id)));
    actions.append(decrease, quantity, increase, remove);
    info.append(actions);
    row.append(info, lineTotal);
    bagLines.append(row);
  }
  document.querySelector("#bag-subtotal").textContent = money(subtotal);
}

function changeQuantity(id, delta) {
  const cart = readCart();
  const line = cart.find((item) => item.id === id);
  if (!line) return;
  line.quantity += delta;
  if (line.quantity < 1) saveCart(cart.filter((item) => item.id !== id));
  else if (line.quantity <= 50) saveCart(cart);
  else showToast("每項示範商品最多 50 件。");
}

function appendText(parent, text) {
  const node = document.createElement("div");
  node.textContent = escapeText(text);
  parent.append(node);
}

function addMessage(role, text, result) {
  const article = document.createElement("article");
  article.className = `message ${role === "user" ? "message-user" : "message-agent"}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  appendText(bubble, text);
  article.append(bubble);
  if (result?.trace?.length) {
    for (const trace of result.trace) {
      const detail = document.createElement("div");
      detail.className = "tool-trace";
      const title = document.createElement("div");
      title.className = "trace-title";
      title.textContent = `${trace.label || trace.name} · ${trace.status === "success" ? "完成" : trace.status === "not_found" ? "查無資料" : "安全停止"}`;
      const summary = document.createElement("div");
      summary.textContent = trace.summary || "工具已執行。";
      detail.append(title, summary);
      bubble.append(detail);
    }
  }
  if (Array.isArray(result?.sources) && result.sources.length) {
    const sources = document.createElement("div");
    sources.className = "message-sources";
    for (const source of result.sources) {
      try {
        const url = new URL(source.url);
        if (url.protocol !== "https:") continue;
        const link = document.createElement("a");
        link.href = url.href; link.target = "_blank"; link.rel = "noreferrer"; link.textContent = source.label || "資料來源 ↗";
        sources.append(link);
      } catch { /* Invalid source URLs are not shown. */ }
    }
    if (sources.childElementCount) bubble.append(sources);
  }
  chatMessages.append(article);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function refreshStatus() {
  try {
    const response = await fetch("/api/status", { cache: "no-store" });
    const status = await response.json();
    if (status.ollama?.available && status.ollama?.modelInstalled) {
      modelStatus.textContent = `Ollama 已連線，模型 ${status.ollama.model} 可用。`;
      modelStatus.className = "model-status is-ready";
    } else if (status.ollama?.available) {
      modelStatus.textContent = `Ollama 正在執行，但尚未找到 ${status.ollama.model}。請在終端機執行 ollama pull ${status.ollama.model}。`;
      modelStatus.className = "model-status is-error";
    } else {
      modelStatus.textContent = `尚未連線至 Ollama。商品／購物袋可使用；若要啟用 AI，請啟動 Ollama 並下載 qwen2.5:3b。`;
      modelStatus.className = "model-status is-error";
    }
  } catch {
    modelStatus.textContent = "本機 AI 狀態暫時無法檢查；請確認本機示範伺服器仍在執行。";
    modelStatus.className = "model-status is-error";
  }
}

async function loadProducts() {
  try {
    const response = await fetch("/api/products", { cache: "no-store" });
    if (!response.ok) throw new Error("商品服務無法使用");
    const data = await response.json();
    products = Array.isArray(data.products) ? data.products : [];
    renderProducts();
    renderCart();
  } catch (error) {
    grid.textContent = error.message || "本機 SQLite 商品資料暫時無法載入。";
  }
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;
  chatInput.value = "";
  addMessage("user", message);
  const pending = document.createElement("div");
  pending.className = "typing";
  pending.textContent = "本機 Ollama 正在選擇客服工具…";
  chatMessages.append(pending);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  const submit = chatForm.querySelector("button[type=submit]");
  submit.disabled = true;
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const result = await response.json();
    pending.remove();
    if (!response.ok) {
      addMessage("assistant", result.error || "本機客服暫時無法使用。請確認 Ollama 狀態。", { trace: [{ label: "本機客服 Agent", status: "error", summary: "沒有生成未查證的答案。" }] });
      return;
    }
    addMessage("assistant", result.reply, result);
  } catch {
    pending.remove();
    addMessage("assistant", "無法連線至本機客服伺服器。請查看執行 node local-demo/start.mjs 的終端機。", { trace: [{ label: "本機客服 Agent", status: "error", summary: "沒有使用模型記憶回答。" }] });
  } finally {
    submit.disabled = false;
    chatInput.focus();
  }
});

document.querySelectorAll("[data-prompt]").forEach((button) => button.addEventListener("click", () => {
  chatInput.value = button.dataset.prompt || "";
  chatForm.requestSubmit();
}));
document.querySelector("#bag-trigger").addEventListener("click", () => bagDialog.showModal());
document.querySelector("#bag-close").addEventListener("click", () => bagDialog.close());
bagDialog.addEventListener("click", (event) => { if (event.target === bagDialog) bagDialog.close(); });
document.querySelector("#demo-checkout").addEventListener("click", () => showToast("這是本機示範購物袋，不會連線 Shopify、不會建立訂單，也不會收取付款。"));

loadProducts();
renderCart();
refreshStatus();
setInterval(refreshStatus, 30_000);
