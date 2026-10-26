# 小七超商 Shopify 店面與 AI 客服｜實作計畫

## 範圍與核定決策

交付一個 Shopify 店面（商品目錄、伺服器端購物車、Shopify 託管結帳）以及顧客可使用的 AI 文字客服 Agent。以使用者的原始要求為準啟用 Shopify 整合；Shopify 開發商店已由店主建立，店舖幣別為 TWD，店舖目前沒有商品。客服需每輪先經 Agent 決定工具，店務答案只可根據工具輸出，不得讓模型憑記憶自行作答。API 憑證、Agent 迴圈、SQLite 與工具都留在伺服器端。

追加核定本機展示模式，因使用者選擇「本機示範模式，不做真實 Shopify 結帳」。以獨立 `local-demo/` Node.js 內建 HTTP server 及靜態介面啟動，無 Shopify/Manus 憑證也可呈現兩項課堂示範商品和瀏覽器本機購物袋；本模式不得冒稱 Shopify 購物袋、建立訂單或收取付款。Agent 由同機 Node server 連線至 Ollama tool-calling API，工具繼續查既有 SQLite，答案由程式依工具資料產生。伺服器預設只綁定 `127.0.0.1`；移至其他電腦時須各自有 Node.js，且聊天功能須安裝 Ollama 與建議模型。原 Shopify/LLM 雲端實作完整保留，不受本機模式影響。

Shopify 指引要求新店面採用支援 SSR 的 JavaScript 架構。本案採 Shopify Hydrogen／React Router SSR、官方 Storefront client、React CartProvider/forms/parser 與 Shopify 託管結帳。因目前管理的 Storefront token 沒有 `unauthenticated_read_selling_plans` scope，而預設 Hydrogen server handler 會查詢此非必要欄位，本案使用自訂伺服器 `/api/cart` route 和 Hydrogen `parseCartRequest`，僅查詢／變更課堂單一商品所需的 cart 欄位，避免要求額外 scope。購物車 cookie 需支援 WebDev HTTPS iframe Preview 的跨站情境，並保留來源檢查。

不另外建立顧客帳戶／登入頁；此功能不是本次需求，而且目前沒有 Customer Account API client ID。Shopify 結帳仍依店舖設定與 Shopify 提供的結帳網址運作，不在本網站蒐集顧客帳號憑證。

客服資料使用唯讀 SQLite 範例知識庫，由 CSV 匯入；WebDev MySQL 不啟用，避免把 SQLite 作業要求換成另一種資料庫。FAQ 至少包含 8 個主題及 15 筆知識紀錄；另有至少 15 筆明確標記為虛構／匿名的紀錄表資料，以及兩項 Shopify 示範商品。沒有真實訂單或客服系統授權，所以不查閱顧客私人 Shopify 訂單；查紀錄工具只處理明確標示為示範的匿名資料。真人轉接工具會提供官方聯絡方法並標明此開發示範未連接即時人工排班，不宣稱已通知真人。

「Agent 先選工具」透過後端 LLM 呼叫設定 `tool_choice: required` 實現。模型只負責工具選擇；最後的答案由伺服器依工具結果組成，包括 SQLite 原文與來源、計算結果、示範紀錄或人工聯絡提示，避免模型再補入記憶內容。未命中資料時明確回答查無資料並建議真人客服。工具名稱、執行狀態與安全的摘要會顯示在對話畫面。

新開發商店在未指定商品時建立恰好兩項示範商品，均附有商品圖片；名稱、金額與圖片會標示為課堂示範資料，不表示小七真實商品、實際售價或門市庫存。開發商店已確認幣別 TWD，測試價以 TWD 設定。結帳仍交由 Shopify 處理。

## 技術與資料設計

- **店面：** Hydrogen SSR、TypeScript、Shopify Storefront API；商品／系列頁讀取 Shopify 即時資料。Cart 使用 Hydrogen 官方 React CartProvider/forms/parser；`/api/cart` 伺服器 route 以 scope-minimized GraphQL 查詢及變更 Shopify 購物袋，支援加購、移除、調整數量、摘要和 `checkoutUrl` 導向 Shopify hosted checkout。
- **客服：** `/api/chat` 只在伺服器呼叫 WebDev 內建 OpenAI-compatible LLM API，讀取平台提供的 `MANUS_API_URL`／`MANUS_API_KEY`。瀏覽器不持有服務金鑰，不把秘密編入 bundle 或日誌。使用 `tool_choice: required`，設定有限迴圈與逾時；工具執行錯誤不會被偽裝成已查得答案。
- **本機展示模式：** `node local-demo/start.mjs` 先建立 SQLite，啟動 Node 內建 HTTP server（預設 `127.0.0.1:4173`），不需 pnpm 套件或 Shopify/Manus secrets。兩項商品由 SQLite 供應，購物袋用瀏覽器 localStorage 保存，結帳只顯示不會付款的說明。後端使用 `OLLAMA_BASE_URL`／`OLLAMA_MODEL`（預設本機 Ollama 與 Qwen 2.5 3B）選工具；Agent 工具執行和回答一律留在伺服器端。
- **工具：** `search_faq`（SQLite 知識查詢）、`lookup_demo_record`（SQLite 匿名測試紀錄）、`calculate_demo_basket`（讀取示範商品價格並由程式計算）、`transfer_to_human`（產生人工處理指引與官方聯絡方式）。所有回覆使用工具輸出。
- **資料：** 將繁體中文官方資訊與示範站規則分開標記來源及資料類型。SQLite 由版本控制的 CSV 以冪等 seed 腳本建立；知識資料唯讀，容器暫存檔案系統不承擔顧客訂單或真人客服佇列的耐久儲存。
- **介面：** 響應式 7-ELEVEN 品牌色導視；店面以非對稱編輯式商品陳列，另設 `/chat` 對話頁，客人訊息右側、Agent 訊息左側，顯示載入、錯誤、重試、工具軌跡、資料來源與真人客服入口。商品、結帳、Agent 回覆和示範性標示均以繁體中文呈現。

## 專案結構

- `app/routes/`：首頁／商品目錄、商品詳情、購物車、聊天頁及伺服器端 `/api/chat` 路由。
- `app/components/`：網站導覽、商品卡、購物車控制項、聊天室訊息、工具軌跡及來源標示。
- `app/lib/shopify.server.ts`：Storefront API client、安全 Shopify Scripts metadata 與 i18n。
- `app/lib/cart.server.ts`、`app/routes/api.cart.ts`：低 scope Shopify Cart GraphQL query/mutations、Hydrogen request parser 與 server endpoint。
- `app/lib/agent.server.ts`：後端 LLM 呼叫與有限工具迴圈；不匯入任何 client 模組。
- `app/lib/tools.server.ts`：四項客服工具及其輸入驗證／安全回傳格式。
- `app/lib/knowledge.server.ts`：SQLite 查詢、CSV seed 與唯讀知識庫存取。
- `data/`：FAQ、匿名示範紀錄與示範商品 CSV，以及可重現的 SQLite seed 腳本／資料庫產物。
- `public/manus-routes.json`：所有使用者可瀏覽頁面的 route manifest。
- `local-demo/`：獨立 Windows-friendly 示範版，包含 Node 內建 server、Ollama tool-calling Agent、本地購物袋介面、示範商品 SVG 與啟動說明；預設僅 localhost 可連線，無真實付款。
- `plan.md`、`TODO.md`：核定範圍與逐項交付狀態。

## 設計

### 風格方向（未提供介面風格指定時的選擇）

- 現代便利站誌，像清晰、明快的城市零售編輯頁。（0.08）
- 台灣早餐日常，以溫暖米白與食物攝影呈現晨間補給。（0.06）
- 夜間街角便利站，以深色背景與霓虹導視呈現晚間購物。（0.04）

選用「現代便利站誌」，以 7-ELEVEN 綠色作品牌主色，保留官方品牌語境中的紅、橘作為少量提示色；不仿造官方活動標語或把示範商品標成真實門市資訊。

- **設計運動：** 當代零售編輯設計，結合便利商店高辨識導視與台灣城市雜誌的留白層級。
- **核心原則：** 一眼可找到商品與結帳；示範資訊清楚揭露；Agent 資料來源透明；手機優先且可鍵盤操作。
- **色彩哲學：** 綠色建立品牌識別與可靠感；紅、橘只用於重要動作／狀態；暖白背景降低長時間對話與閱讀負擔；深墨色承載正文。
- **版面範式：** 首屏採左側品牌主訊息、右側錯落商品展示；商品分類以水平導覽形成「貨架」而非機械網格；聊天頁以對話佔主體、工具軌跡置於訊息下方的窄側欄／摺疊卡。
- **識別元素：** 小型 7 字形導視標籤；紅橘綠三色細線；像收據的價格／資料來源欄。標誌使用清楚的 7-ELEVEN 名稱，不生成仿真商標。
- **互動哲學：** 先回饋正在查詢，再展示工具選擇與結果；購物車操作保持可逆，未確認的 Shopify 金額會清楚標示。
- **動畫：** 以 120–180ms 輕量淡入／位移呈現購物車與工具狀態；遵守 `prefers-reduced-motion`，不做持續閃爍。
- **字體系統：** 系統繁中字體堆疊 `Noto Sans TC`、`PingFang TC`、`Microsoft JhengHei`、sans-serif；品牌數字與價格使用高辨識度等寬數字，標題較粗、正文行距寬鬆。
- **品牌本質：** 給日常補給與線上購物顧客使用、同時把客服回答來源公開的小七示範店。個性：親切、俐落、可信。
- **品牌語氣：** 簡潔、具體、不誇大。範例：「先查資料，再給你答案。」、「這是示範商品，實際供應請以門市資訊為準。」
- **文字標誌概念：** 使用真實品牌名稱的純文字標頭，搭配自製的幾何「7」導視符號；不使用生成模型製作精確商標字樣。
- **專屬品牌色：** 7-ELEVEN 綠，搭配紅與橘為輔助色；以官方頁面可見的品牌資產／色彩為識別參考。

## 資料來源

官方客服與意見回饋：<https://www.7-11.com.tw/faq.aspx>
官方交貨便服務說明：<https://www.7-11.com.tw/service/accept.aspx>
Shopify Hydrogen 目前購物車文件：<https://shopify.dev/docs/storefronts/hydrogen/cart>
Shopify Hydrogen SDK 文件：<https://shopify.dev/docs/storefronts/hydrogen>
