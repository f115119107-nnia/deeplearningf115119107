import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databasePath = resolve(projectRoot, "data", "support.sqlite");

function seedDatabase() {
  const seed = spawnSync(process.execPath, [resolve(projectRoot, "scripts", "seed-support-db.mjs")], {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (seed.error) {
    console.error(`無法初始化 SQLite：${seed.error.message}`);
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
        (SELECT COUNT(*) FROM demo_products WHERE is_demo = 1) AS products
    `).get();
    if (Number(stats.faq) < 1 || Number(stats.records) < 1 || Number(stats.products) < 1) {
      throw new Error("SQLite is missing seeded support rows.");
    }
    console.log("SQLite 示範資料已存在，直接沿用（不會刪除或重建）。");
    return true;
  } catch (error) {
    console.error("無法讀取既有 SQLite 示範資料庫。請停止其他執行中的示範伺服器；若資料庫損壞，停止所有 Node 程序後刪除 data/support.sqlite，再重新啟動。", error instanceof Error ? error.message : "");
    return false;
  } finally {
    database?.close();
  }
}

if (!existsSync(databasePath)) {
  console.log("首次啟動：由 CSV 建立 SQLite 示範資料庫。");
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
    console.error("本機埠已被占用。請在另一個執行網站的終端機按 Ctrl+C，或用 LOCAL_DEMO_PORT 設定其他埠後重試。");
  } else {
    console.error("本機示範 server 啟動失敗：", error instanceof Error ? error.message : error);
  }
  process.exit(1);
});
