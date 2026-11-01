import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databasePath = resolve(projectRoot, "data", "local-demo.sqlite");
const dbEnvironment = { ...process.env, SUPPORT_DB_FILE: "local-demo.sqlite" };

function seedDatabase() {
  const seed = spawnSync(process.execPath, [resolve(projectRoot, "scripts", "seed-support-db.mjs")], {
    cwd: projectRoot,
    stdio: "inherit",
    env: dbEnvironment,
  });
  if (seed.error) {
    console.error(`無法初始化本機期中 SQLite：${seed.error.message}`);
    process.exit(1);
  }
  if (seed.status !== 0) process.exit(seed.status ?? 1);
}

function validateExistingDatabase() {
  let database;
  try {
    database = new DatabaseSync(databasePath, { readOnly: true });
    database.exec("PRAGMA query_only = ON;");
    const stats = database.prepare(`
      SELECT
        (SELECT COUNT(*) FROM faq_entries) AS faq,
        (SELECT COUNT(*) FROM demo_records WHERE is_demo = 1) AS records,
        (SELECT COUNT(*) FROM demo_products WHERE is_demo = 1) AS products,
        (SELECT COUNT(*) FROM rag_chunks) AS rag_chunks
    `).get();
    const productColumns = new Set(database.prepare("PRAGMA table_info(demo_products)").all().map((column) => column.name));
    const requiredColumns = ["name_zh", "name_en", "aliases_zh", "aliases_en", "available"];
    const missingColumns = requiredColumns.filter((column) => !productColumns.has(column));
    if (Number(stats.faq) < 15 || Number(stats.records) < 15 || Number(stats.products) < 15 || Number(stats.rag_chunks) < 1 || missingColumns.length) {
      throw new Error(`資料庫格式不是最新版；缺少欄位或資料量不足${missingColumns.length ? ` (${missingColumns.join(", ")})` : ""}。`);
    }
    console.log("本機期中 SQLite 已就緒，安全重用（不刪除或重建）。");
    return true;
  } catch (error) {
    console.error("無法使用本機期中 SQLite。若是舊版 local-demo.sqlite，先停止所有本機示範伺服器，再刪除 data/local-demo.sqlite 後重新啟動；不要刪除 data/support.sqlite。", error instanceof Error ? error.message : "");
    return false;
  } finally {
    database?.close();
  }
}

if (!existsSync(databasePath)) {
  console.log("首次啟動：從 CSV 建立獨立本機期中 SQLite（不會改動 data/support.sqlite）。");
  seedDatabase();
} else if (!validateExistingDatabase()) {
  process.exit(1);
}

process.chdir(projectRoot);
const { default: server } = await import("./server.mjs").catch((error) => {
  console.error("無法啟動本機示範 HTTP server：", error instanceof Error ? error.message : error);
  process.exit(1);
});

server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error("本機埠已被占用。請在另一個執行網站的終端機按 Ctrl+C，或用 LOCAL_DEMO_PORT 設定其他埠後重試。SQLite 不會被刪除。 ");
  } else {
    console.error("本機示範 server 啟動失敗：", error instanceof Error ? error.message : error);
  }
  process.exit(1);
});
