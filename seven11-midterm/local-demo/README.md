# 小七補給站｜本機期中示範模式

此獨立模式可在 Windows、macOS 或 Linux 執行，不需 Shopify 帳號、Shopify API token、Manus 金鑰、pnpm 或 Hydrogen/React Router build。它以 CSV 建立本機 SQLite，提供 15 項明確虛構的雙語示範商品、瀏覽器購物袋、FAQ 與 RAG 規則客服。

**重要界線：**商品、價格、供應狀態、購物袋與預留資料全是課堂虛構示範。本模式不連接 Shopify、門市庫存或真實客服，不建立訂單、不預留真實商品，也不收款。明確確認後新增的資料，只會寫入這台電腦的 `data/local-demo.sqlite`，並顯示「示範預留」編號；它不是 7-ELEVEN 門市預約或購物訂單。不要在展示時輸入真實姓名、電話或付款資料。

## Windows 啟動

1. 安裝 Node.js **22.14 或更新版本**（建議新版 LTS；需要內建 `node:sqlite`）。本機示範不必執行 `pnpm install`。
2. 在檔案總管開啟專案資料夾 `seven11`，雙擊根目錄的 `啟動本機示範.bat`；或於 VS Code PowerShell 終端機執行：

   ```powershell
   node --version
   node local-demo/start.mjs
   ```

3. 首次啟動會從 CSV 建立獨立的 `data/local-demo.sqlite`；之後會驗證並重用資料庫，不會刪除正在使用的檔案。看到「小七本機期中示範網站已啟動」後，瀏覽器開啟 <http://localhost:4173>。終端機要保持開啟；按 `Ctrl+C` 停止。

如果舊版 `local-demo.sqlite` 不符合新格式，先在所有伺服器視窗按 `Ctrl+C`，再只刪除 `data/local-demo.sqlite` 後重新啟動，讓程式重新從 CSV seed。不要刪除 `data/support.sqlite`。若提示 4173 埠被占用，請先停止仍在執行的舊示範伺服器；也可改用 `$env:LOCAL_DEMO_PORT="4174"` 再啟動。

## 啟用本機 AI 客服

1. 安裝 Ollama：<https://ollama.com/download>，並啟動 Ollama 應用程式／服務。
2. 在 PowerShell 下載支援工具呼叫的模型（此專案預設為 `qwen2.5:3b`）：

   ```powershell
   ollama pull qwen2.5:3b
   ```

3. 保持 Ollama 執行，再開啟或重新整理本機網站。頁面頂端會顯示 Ollama 與模型狀態。

Node server 只呼叫同一台電腦上的 `http://127.0.0.1:11434`；瀏覽器不會直接連 Ollama。Ollama 未啟動或模型未安裝時，商品與購物袋仍可使用；聊天會顯示可恢復的錯誤，不會退回模型記憶回答。可在啟動前以 `$env:OLLAMA_MODEL="你的模型名稱"` 換模型；模型需支援 Ollama tool calling。

## 功能與規則

- **結構化工具**：搜尋 FAQ、查詢匿名 `DEMO-` 紀錄、查詢雙語商品、模糊配對並計價、提供官方真人客服聯絡方式、處理範圍拒答。
- **RAG**：`data/rag_rules.csv` 是獨立的繁中／英文虛構規則文件；seed script 將長文切成 SQLite chunks。規則回答先檢索；模型只能選擇以完整中英文句末標點結束的逐字句，伺服器核對該完整句確實存在於對應 SQLite 原文後才顯示。若模型輸出無效 JSON、捏造引文或截斷句子，丟棄生成結果並回退顯示原始檢索片段；零命中時不進入生成、明說查無並提供官方管道。商品價格、示範紀錄及預留狀態仍由結構化工具查詢，不由 RAG 代替。
- **雙語與名稱容錯**：商品有繁中名稱、英文名稱與別名；Agent 按每則新問題的語言回繁中或英文。商品模糊配對需達門檻且唯一；若有多個候選會請客人補充名稱，不任意選一個。
- **對話記憶**：近期對話保存在目前瀏覽器分頁工作階段中，供理解追問；歷史內容不是事實來源，每則新問題仍須先選工具。
- **確認後寫入**：先產生待確認的虛構品項、數量與示範總價，不寫資料。客人必須針對同一 session 明確輸入「確認預留」／`confirm reservation` 或按確認按鈕才寫入 SQLite；模糊同意、取消、逾時、錯誤 session、不可供應品或重複確認都不會新增紀錄。已保存的匿名示範記錄會顯示在頁面中。
- **安全範圍**：固定拒絕越權提示、索取 System Prompt、角色扮演攻擊和明顯非客服問題；查不到的資訊不猜測，未知即時門市資訊導向官方客服資料。伺服器以 HttpOnly/SameSite session cookie 隔離待確認預留，客服 POST 僅接受同源 JSON 請求。
- **本機購物袋**：在瀏覽器 `localStorage` 儲存，加購、改數量、移除都只影響示範購物袋；結帳按鈕不會連 Shopify 或收取付款。

## 同一 Wi-Fi 的區域網路展示（選用）

預設只允許本機使用，建議保留此設定。若你確定要讓同一個可信任私人 Wi-Fi 的其他裝置觀看，可在 PowerShell 設定：

```powershell
$env:LOCAL_DEMO_HOST = "0.0.0.0"
node local-demo/start.mjs
```

其他裝置需使用你的電腦區域網路 IPv4 位址，例如 `http://192.168.1.20:4173`，不要輸入 `localhost`（那會指向觀看者自己的電腦）。Windows 防火牆可能需允許「私人網路」連線。此示範沒有登入驗證、僅限課堂虛構資料：**不要轉送到公用網路、設定路由器 port forwarding 或以公網 IP 暴露**。伺服器會拒絕非預期 Host 與跨來源寫入請求。

## CSV、SQLite 與回歸測試

主要資料由下列 CSV 建立；`data/local-demo.sqlite` 是本機執行期產物，不是應提交或繳交的源資料：

- `data/faq.csv`：16 筆 FAQ、8 個主題及官方來源連結，另含英文欄位。
- `data/demo_records.csv`：15 筆匿名、虛構的示範紀錄。
- `data/demo_products.csv`：15 筆虛構商品，每筆包含繁中名稱、英文名稱、別名、數字價格及供應狀態。
- `data/rag_rules.csv`：5 篇中英雙語、明確標示為示範的長篇規則文件。
- `scripts/seed-support-db.mjs`：驗證 CSV 並建立 FAQ、紀錄、商品、RAG chunks 及空的 `demo_reservations` 表。SQLite 沒有 FTS5 時，會使用可用的文字評分 fallback。

執行可重現的本機 Agent regression（不需要安裝或啟動 Ollama；使用暫存 SQLite 和 Ollama API stub，完成後會刪除暫存資料）：

```powershell
node scripts/test-local-agent.mjs
```

最近一次結果為 **27/27 通過**，涵蓋中英 FAQ/RAG、完整有效引文、捏造與截斷引文丟棄、RAG 零命中、名稱容錯與歧義、計算、未知資料、提示注入、角色扮演／範圍拒答、無工具回覆、跨 session 確認、確認／取消／重複確認及不可供應項目。此自動測試使用 API stub，證明伺服器工具流程而不代表真實 Ollama 模型品質；實際聊天仍需該台電腦安裝 Ollama 與模型。

## 搬到另一台電腦

複製整個專案資料夾（不必複製 `node_modules` 或 SQLite 檔），在新電腦安裝 Node.js，執行 `node local-demo/start.mjs`。沒有 `data/local-demo.sqlite` 時會從 CSV 重建。需要 AI 客服的電腦另須安裝 Ollama 並下載模型。請把資料 CSV、`local-demo/`、`scripts/`、根目錄啟動器和 `README.md` 一起保留。
