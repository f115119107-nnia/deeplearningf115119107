import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

function parseCsv(source) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const input = source.replace(/^\uFEFF/, "");

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field.length === 0) {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((v) => v.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (quoted) throw new Error("CSV 引號未配對");
  if (field.length || row.length) {
    row.push(field);
    if (row.some((v) => v.length > 0)) rows.push(row);
  }

  const [headers, ...data] = rows;
  if (!headers) throw new Error("CSV 沒有標題列");

  return data.map((cells, index) => {
    if (cells.length !== headers.length) {
      throw new Error(
        `CSV 第 ${index + 2} 列欄位數錯誤：${cells.length}，預期 ${headers.length}`
      );
    }
    return Object.fromEntries(
      headers.map((header, i) => [header.trim(), cells[i]])
    );
  });
}

const rows = parseCsv(
  readFileSync("data/faq_info.csv", "utf8")
);

const required = [
  "id", "topic", "question", "answer", "keywords",
  "source_type", "source_url", "is_demo"
];

for (const column of required) {
  if (!rows.length || !(column in rows[0])) {
    throw new Error(`CSV 缺少必要欄位：${column}`);
  }
}

const db = new DatabaseSync("data/support.sqlite");

try {
  const exists = db.prepare(
    "SELECT name FROM sqlite_master WHERE name = 'faq_entries'"
  ).get();

  if (!exists) throw new Error("找不到 faq_entries 資料表");

  const findFaq = db.prepare(
    "SELECT id FROM faq_entries WHERE id = ?"
  );

  const insertFaq = db.prepare(`
    INSERT INTO faq_entries
      (id, topic, question, answer, keywords, source_type,
       source_url, is_demo, search_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSearch = db.prepare(`
    INSERT INTO faq_search (id, topic, question, answer, keywords)
    VALUES (?, ?, ?, ?, ?)
  `);

  const ids = new Set();
  const toInsert = [];

  for (const r of rows) {
    if (!r.id || !r.topic || !r.question || !r.answer) {
      throw new Error(`FAQ 資料不完整，ID：${r.id || "(空白)"}`);
    }
    if (ids.has(r.id)) throw new Error(`CSV 有重複 ID：${r.id}`);
    ids.add(r.id);

    if (!["official", "demo"].includes(r.source_type)) {
      throw new Error(`source_type 不合法：${r.id}`);
    }
    if (!["0", "1"].includes(r.is_demo)) {
      throw new Error(`is_demo 不合法：${r.id}`);
    }

    if (!findFaq.get(r.id)) toInsert.push(r);
  }

  db.exec("BEGIN IMMEDIATE");

  try {
    for (const r of toInsert) {
      const isDemo = Number(r.is_demo);
      const searchText =
        `${r.topic} ${r.question} ${r.answer} ${r.keywords}`;

      insertFaq.run(
        r.id, r.topic, r.question, r.answer, r.keywords,
        r.source_type, r.source_url, isDemo, searchText
      );

      insertSearch.run(
        r.id, r.topic, r.question, r.answer, r.keywords
      );
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const count = db.prepare(
    "SELECT COUNT(*) AS count FROM faq_entries"
  ).get();

  console.log(`CSV FAQ 總筆數：${rows.length}`);
  console.log(`本次新增：${toInsert.length} 筆`);
  console.log(`資料庫 FAQ 總筆數：${count.count}`);
  console.log(
    "新增 ID：",
    toInsert.map((r) => r.id).join(", ") || "沒有需要新增的資料"
  );
} finally {
  db.close();
}
