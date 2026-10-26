# 小七補給站｜Shopify 示範店與 AI 文字客服

這是課堂作業示範：以 Shopify Hydrogen／React Router SSR 建立商品目錄、商品詳情、購物袋和 Shopify hosted checkout；另提供繁體中文文字客服 Agent。網站明確標示示範商品與資料，不代表 7-ELEVEN 真實商品、售價、庫存、訂單或即時真人客服服務。

## 功能

- Shopify Storefront API 伺服器端讀取商品、集合、搜尋與商品變體。購物袋使用 Hydrogen 官方 CartProvider、forms、parser，以及 scope-minimized 伺服器端 Shopify Cart API；支援加購、更新數量、移除、購物袋摘要與 Shopify 結帳網址。
- `/chat` 是左右氣泡對話介面。每個問題送至 `/api/chat`，伺服器端 Agent 必須先以內建模型選擇一個工具；回答由工具結果或伺服器程式組成，不讓模型憑記憶直接生成店務答案。
- 四個工具：`search_faq`、`lookup_demo_record`、`calculate_demo_basket`、`transfer_to_human`。工具只讀 SQLite/CSV 匯入的匿名示範資料；真人工具會明確說明未連接排班、不會代為送訊息。
- 工具足跡及官方資料來源連結顯示在對話中；聊天不持久化對話或顧客個資。

## 資料與來源

`data/faq.csv` 含 16 筆 FAQ、8 個主題，並記錄來源類型、連結與示範標記；`data/demo_records.csv` 是 15 筆明確標記為虛構的匿名紀錄；`data/demo_products.csv` 有 2 項課堂展示價格。`scripts/seed-support-db.mjs` 每次開發／建置時冪等重建 `data/support.sqlite`，並強制檢查 FAQ 至少 15 筆、8 個主題及示範紀錄至少 15 筆。SQLite 使用 Node.js `node:sqlite`，查詢以唯讀連線和參數化 SQL 執行。

官方客服 FAQ：<https://www.7-11.com.tw/faq.aspx>

官方交貨便服務說明：<https://www.7-11.com.tw/service/accept.aspx>

## 在 WebDev 專案中執行（Manus 託管模式）

本專案使用 Shopify 整合注入的伺服器端網域與 Storefront token，以及平台提供的 LLM endpoint／金鑰。這些值由執行環境提供，不要將金鑰貼在 AI 對話、寫入 Git、或放進瀏覽器 bundle；`.env.example` 只列示無機密的設定欄位。

```bash
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
pnpm seed:db
pnpm dev
```

React Router dev server 以 WebDev runtime 的 3000 埠提供 SSR 預覽。`GET /manus-routes.json` 列出實際頁面路由；API 路由 `/api/chat` 不列入頁面清單。

## Windows 本機示範模式（不需 Shopify／Manus 金鑰）

使用者選擇的本機展示模式以獨立 Node 內建 HTTP server 提供，不必執行 Hydrogen／React Router 或安裝 pnpm 套件；Node.js 22.14 或更新版本即可在 Windows 直接啟動：

```powershell
node local-demo/start.mjs
```

接著開啟 <http://localhost:4173>。首次啟動會自動由 CSV 建立 SQLite。此獨立模式呈現兩項虛構示範商品與存在瀏覽器 `localStorage` 的本機購物袋；不會連 Shopify、不會建立訂單或收款，結帳按鈕會明確提示其限制。完整圖文步驟見 `local-demo/README.md`。

客服需要安裝 Ollama 並下載支援工具呼叫的 `qwen2.5:3b`：

```powershell
ollama pull qwen2.5:3b
```

本機 Node server 會呼叫同一台電腦的 Ollama，再由伺服器端工具查 SQLite；瀏覽器不直接連 Ollama，也不需要金鑰。Ollama 未啟動時仍可瀏覽／操作本機購物袋，客服會顯示可恢復的安裝或啟動提示。此模式預設僅監聽 `127.0.0.1`；搬到另一台電腦時，需要該電腦自行安裝 Node 與 Ollama，SQLite 會由 CSV 重新建立。

## Agent 工具選擇測試

先啟動網站與伺服器端 LLM runtime，再於另一個終端執行：

```bash
pnpm test:agent
```

`data/agent-tests.json` 提供 12 題匿名測試，涵蓋官方 FAQ、匿名示範紀錄、程式計算、真人聯絡、未命中資料和未知事項。測試檢查第一個工具是否符合預期、工具狀態、答案中的可核對內容與真人轉接揭露。執行結果會寫入 `reports/agent-test-results.json`。

## 產生 SQLite 與生產建置

```bash
pnpm seed:db
pnpm typecheck
pnpm build
```

`pnpm build` 會先由 CSV 重新建立 SQLite，再輸出 Hydrogen SSR server/client build。根目錄 `Dockerfile` 使用鎖定的 pnpm/Node toolchain 安裝依賴並建置，在執行時以 `PORT`（預設 3000）啟動 `react-router-serve`。容器內 SQLite 是唯讀示範知識庫，不儲存顧客訂單或客服訊息。

## 重要界線

- 本站沒有門市即時庫存、門市營業狀態、真實包裹查詢或 Shopify 顧客訂單存取權。
- Shopify 目錄只放兩個有明確示範標記的課堂商品，每項都已附上並通過 Shopify 媒體處理的商品圖片；價格也和客服計算 CSV 對齊，結帳由 Shopify 處理。
- 目前受管理的 Storefront token 不包含 selling-plan 讀取權限；因課堂商品不使用訂閱，伺服器使用只查必要欄位的 Shopify Cart query，仍在 Shopify 託管結帳。
- 真人工具只提供官方聯絡管道，不代表已送出客服表單或通知真人。
- 對話工具查不到資料時明確回報，不推測、不補造答案。

## 第六節：AI 協作與成果查核

本作業使用 Manus AI 協作規劃 SQLite 資料表與四項客服工具、整理官方 FAQ 資料來源、撰寫 Shopify/Hydrogen 與 React Router 程式、除錯及設計 Agent 測試。AI 協助產生的程式碼與回答仍由作者負責：逐筆檢視 CSV 的來源與示範標記，使用匿名示範紀錄，並核對 Agent 工具軌跡、官方來源連結、計算內容與未命中時的真人轉接聲明。

已執行 12 題真實後端 Agent 工具選擇／答案證據整合測試，結果為 12/12 通過；另外以 Shopify Storefront 實際驗證商品原生表單加購、購物袋讀取、數量更新及移除。沒有完成付款、使用真實顧客個資，或將 API 金鑰貼入任何 AI 對話。所有 LLM／Shopify 憑證只由伺服器執行環境提供，瀏覽器只傳送訊息並顯示回覆與安全工具足跡。

另依本機展示需求新增獨立 Node server 和 Ollama tool-calling 介面；本機客服只讀同一份 SQLite／CSV，工具結果由伺服器組成，沒有 Shopify／Manus 憑證依賴。此本機模式不建立真實購物訂單或付款；其 Ollama 啟停、跨電腦安裝及本機購物袋限制另行以 `local-demo/README.md` 揭露，不影響原 Shopify 模式。
