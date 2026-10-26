# 小七補給站｜本機示範模式

這個獨立模式可在 Windows、macOS 或 Linux 本機執行，不需要 Shopify 帳號、Shopify API token、Manus 金鑰、pnpm 或 React Router build。它使用專案 CSV 建立 SQLite，呈現兩項課堂示範商品、本機購物袋及 Ollama 工具型客服。

**重要：**商品、價格、購物袋僅為課堂展示。本模式不連接 Shopify，不會建立訂單、收款或完成真正結帳。客服只有在本機 Ollama 正在執行且已下載模型時可回答；模型只負責選工具，答案由 server 端 SQLite／程式結果組成。

## Windows 啟動

1. 安裝 Node.js **22.14 或更新版本**（建議新版 LTS）。此版本需包含 Node 內建 `node:sqlite`；不用為本模式執行 `pnpm install`。
2. 在檔案總管開啟 `seven11` 專案資料夾，雙擊根目錄的 `啟動本機示範.bat`。也可以在 VS Code 終端機輸入：

   ```powershell
   node --version
   node local-demo/start.mjs
   ```

   第一次啟動會由 CSV 建立 `data/support.sqlite`；之後會檢查並沿用既有資料庫，不會每次刪除重建。看到「小七本機示範網站已啟動」後，瀏覽器開啟 <http://localhost:4173>。終端機視窗要保持開啟；按 `Ctrl+C` 停止伺服器。若提示 4173 埠已占用，先在舊的伺服器視窗按 `Ctrl+C`；如資料庫損壞，先停止所有伺服器，再刪除 `data/support.sqlite` 讓下次啟動重新建立。

## 啟用 AI 客服

1. 從 <https://ollama.com/download> 安裝 Ollama，並啟動 Ollama 應用程式／服務。
2. 在另一個 PowerShell 終端機下載支援工具呼叫的模型：

   ```powershell
   ollama pull qwen2.5:3b
   ```

3. 保持 Ollama 運作；若本機示範 server 已在執行，重新整理頁面即可。介面頂端會顯示模型狀態。

Agent API 只由 Node server 呼叫 `http://127.0.0.1:11434`，瀏覽器不直接存取 Ollama。模型未啟動或未下載時，商品與購物袋仍可使用，聊天會顯示安裝／啟動提示；不會改用模型記憶回答。

可選擇在啟動前設定模型名稱：

```powershell
$env:OLLAMA_MODEL = "qwen2.5:3b"
node local-demo/start.mjs
```

若改變 `LOCAL_DEMO_PORT` 或 `LOCAL_DEMO_HOST`，也可用環境變數設定。伺服器預設只聽 `127.0.0.1:4173`；這最安全。不要將本機 server 或 Ollama API 暴露到公用網路。

## 搬到其他電腦

複製整個 `seven11` 專案資料夾（不必複製 `node_modules`），在另一台電腦安裝 Node.js，再執行 `node local-demo/start.mjs`。若沒有 SQLite 檔，會由 CSV 自動建立；也可不複製舊的 `data/support.sqlite`，讓新電腦首次啟動時重新 seed。要使用客服 AI，該電腦也須安裝 Ollama、下載 `qwen2.5:3b` 並啟動 Ollama。
