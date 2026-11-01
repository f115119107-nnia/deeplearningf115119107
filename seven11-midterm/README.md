# 小七補給站｜Shopify 示範店與 AI 客服 Agent

本專案延續 Unit G 小七超商客服作業，並依期中要求加入 RAG、更多工具、更完整的聊天介面與安全規則。它有兩種明確分開的執行模式：**Shopify 託管店面**供雲端展示目錄、購物袋及 Shopify hosted checkout；**本機期中示範版**不需 Shopify／Manus 憑證，可在 Windows 以 Node.js 執行 RAG、SQLite 工具、雙語回覆及確認後才寫入的虛構示範預留。兩種模式都不能被解讀為 7-ELEVEN 真實商品、門市庫存、訂單或即時真人客服。

## 功能

- **Shopify 託管模式：** Hydrogen／React Router SSR 商品目錄、搜尋、商品詳情、Shopify 購物袋，以及導向 Shopify 託管結帳的流程。購物袋 mutation 在 server 執行，並保留 Origin／CSRF 驗證。
- **雲端 AI 客服：** `/chat` 是左右對話氣泡介面。每則問題送到 `/api/chat`，後端 Agent 先選工具；FAQ／匿名示範紀錄／計算／真人客服工具結果由伺服器組成，不讓模型憑記憶直接回答。
- **本機期中 Agent：** 客服問題同樣先由本機 Ollama Agent 選工具。新增 SQLite RAG 規則文件、繁中／英文自動回覆、同分頁近期對話記憶、彈性名稱比對和確認後寫入匿名示範預留。模型只在伺服器端被呼叫，資料查詢、計算與寫入也全部在 Node server 執行。
- **確認式寫入：** Agent 的準備工具只列出示範品項、數量和金額；後端必須等到目前 session 的使用者明確確認，才新增本機 SQLite 示範資料。模糊同意、取消、逾時、其他 session、不可供應商品和重複確認都不會寫入。這不是門市預留、訂單或付款。
- **安全拒答：** 對超出客服範圍、要求忽略規則、索取 System Prompt 或越權角色扮演使用固定拒答；工具沒有資料就明確說查不到，不補造政策、商品或訂單狀態。

## CSV 與 SQLite 資料

源資料以 CSV 保存，SQLite 是 seed script 建立的執行期資料，**不要把 `.sqlite` 檔當成繳交的 CSV 或上傳 GitHub**。

| CSV | 內容 | 說明 |
|---|---|---|
| `data/faq.csv` | 16 筆 FAQ、8 個主題 | 含繁中／英文欄位、來源類型、官方來源連結與示範標記。 |
| `data/demo_records.csv` | 15 筆匿名 `DEMO-` 記錄 | 僅為虛構示範，沒有真實顧客資料或 Shopify 訂單。 |
| `data/demo_products.csv` | 15 筆商品資料 | 每筆含繁中名稱、英文名稱、別名、數字示範價格及供應狀態；皆清楚標示為虛構。 |
| `data/rag_rules.csv` | 5 篇中英雙語規則文件 | 明確標示為本機課堂示範資料，seed 時切成 SQLite RAG chunks；不取代價格、庫存、紀錄等結構化工具。 |
| `data/agent-tests.json` | 雲端 Agent regression 問題 | 12 題涵蓋 FAQ、紀錄、計算、轉接、未命中及未知事項。 |

`scripts/seed-support-db.mjs` 從 CSV 建立表格，資料庫沒有 FTS5 時會使用文字評分 fallback。Hydrogen build／測試使用 `data/support.sqlite`；Windows standalone 模式使用**獨立**的 `data/local-demo.sqlite`，第一次啟動建立、後續安全重用。

## 本機期中模式（Windows／不需 Shopify 或 Manus 金鑰）

需要 Node.js **22.14 或更新版本**（必須包含 `node:sqlite`）。本模式不需要 Corepack、pnpm install 或 React Router：

```powershell
node local-demo/start.mjs
```

在瀏覽器開啟 <http://localhost:4173>；也可雙擊根目錄的 `啟動本機示範.bat`。聊天 AI 另需安裝 Ollama 並下載模型：

```powershell
ollama pull qwen2.5:3b
```

完整安裝、同一 Wi-Fi 展示、安全界線和移轉說明見 [本機期中操作指南](local-demo/README.md)。本機 server 預設只綁定 `127.0.0.1`；不應將無登入驗證的課堂示範暴露在公用網路。

## 測試

本機 Agent 可在不下載或啟動模型的情況下用 Ollama API stub 重現工具流程：

```powershell
node scripts/test-local-agent.mjs
```

最近一次本機 regression **27/27 通過**，涵蓋雙語 FAQ／RAG、模糊與歧義商品名稱、計算、RAG 零命中、未命中 `DEMO-` 紀錄、未知事項、提示注入、角色扮演及範圍拒答、模型未選工具，以及 session 綁定的預留準備／明確確認／取消／不可供應／防重複寫入。RAG 生成器只能回傳經原始 SQLite 文件核對的完整逐字句；偽造或截斷引文會被丟棄並改顯示來源 chunk。這是 API stub 測試，不能代替使用者電腦上的真實 Ollama 模型對話與截圖查核。

雲端 Hydrogen Agent 測試在 LLM 環境可用後執行：

```bash
pnpm test:agent
pnpm typecheck
pnpm build
```

先前已對雲端版本執行 12 題 Agent regression 並通過 12/12，另曾驗證 Shopify 商品、購物袋新增／更新／移除與 hosted checkout URL（沒有完成付款）。這項舊結果只代表雲端版本；不應與本機 Ollama stub 的 27/27 混稱為真實模型測試。

## Shopify／WebDev 託管模式

專案使用 Shopify 整合注入的伺服器端 Storefront 網域與 token，以及平台提供的伺服器端 LLM endpoint／key。不得將憑證貼進 AI 對話、寫進 Git 或放進瀏覽器 bundle。一般 Hydrogen 開發指令如下（需依專案所需 Node／pnpm 版本設定）：

```bash
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
pnpm seed:db
pnpm dev
```

React Router 開發伺服器提供 SSR；靜態的 `GET /manus-routes.json` 列出使用者頁面，API、assets 不屬於頁面路由。受管理 Storefront token 不含本案不需要的 selling-plan scope，因此 `/api/cart` 只查必要購物袋欄位。Shopify 店面有兩項帶圖片的課堂商品；本機 `demo_products.csv` 的 15 筆是期中示範目錄，不代表雲端 Shopify 店面也有 15 項。

## 重要界線

- 沒有門市即時庫存／營業狀態、真實包裹查詢或顧客 Shopify 訂單存取權。
- 雲端結帳才是 Shopify hosted checkout；standalone 本機版本只有瀏覽器示範購物袋，絕不建立 Shopify 訂單或收款。
- 本機示範預留是匿名、本機 session 資料，只供課堂演示確認流程；不會通知門市或保留真實庫存。
- 真人工具只提供 CSV／SQLite 官方聯絡資訊，不代表已送出表單或通知真人。
- 對話近期記憶僅供追問理解，不是事實來源；每則店務問題仍由工具查詢。

## 第六節：AI 協作與成果查核

本作業使用 Manus AI 協作規劃資料表與工具、整理公開 FAQ 來源、撰寫 Shopify／Hydrogen 與 standalone Node／HTML／CSS／JavaScript 程式、除錯及設計 regression。AI 協助產生的程式碼仍由作者負責：逐筆檢視 CSV 的來源與虛構標記，使用匿名示範紀錄，並查核工具軌跡、答案來源、計算與確認後 SQLite 寫入。

本機 Agent 使用 Ollama `qwen2.5:3b`；模型選擇工具，FAQ／商品／紀錄由伺服器工具或程式提供答案；RAG 模型只能選擇來源中逐字可核對的完整句子，伺服器丟棄偽造或截斷內容。已執行隔離 SQLite／API stub 的 27/27 regression，也保留先前雲端 Agent 12/12 測試結果。前者不是實際模型表現評估，作者仍須在自己的 Ollama／瀏覽器中逐題檢查，並擷取老師要求的真實對話畫面。沒有完成付款、使用真實顧客個資，或把 API 金鑰貼進任何 AI 對話；本機示範也沒有 Manus／Shopify 憑證依賴。

## 交作業前仍需自行完成

依老師附件，需提交 PDF 報告及可公開檢視的 GitHub 專案。此工作區目前沒有公開 GitHub URL；學生 ID、姓名、實際工時、真實對話截圖和 PDF 上傳也只能由學生本人補上。不可把這些未知個人資料或未拍攝截圖寫成已完成。
