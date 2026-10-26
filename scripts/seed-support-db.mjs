import { DatabaseSync } from "node:sqlite";
import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const dataDir = resolve(process.cwd(), "data");
const databasePath = resolve(dataDir, "support.sqlite");

function parseCsv(source) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const text = source.replace(/^\uFEFF/, "");

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      if (field.length) throw new Error("CSV quote appeared inside an unquoted field");
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("CSV has an unterminated quoted field");
  if (field.length || row.length) {
    row.push(field);
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }

  const [headers, ...data] = rows;
  if (!headers?.length) throw new Error("CSV is empty");
  return data.map((cells, rowIndex) => {
    if (cells.length !== headers.length) {
      throw new Error(`CSV row ${rowIndex + 2} has ${cells.length} values; expected ${headers.length}`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
  });
}

function readCsv(filename) {
  return parseCsv(readFileSync(resolve(dataDir, filename), "utf8"));
}

const faqRows = readCsv("faq_info.csv");
const recordRows = readCsv("records_info.csv");
const productRows = readCsv("products_info.csv");
const faqTopics = new Set(faqRows.map((row) => row.topic));
if (faqRows.length < 15 || faqTopics.size < 8) {
  throw new Error(`FAQ seed requires at least 15 records and 8 topics; got ${faqRows.length} and ${faqTopics.size}`);
}
if (recordRows.length < 15) {
  throw new Error(`Demo record seed requires at least 15 anonymous records; got ${recordRows.length}`);
}
if (!recordRows.every((row) => row.is_demo === "1")) {
  throw new Error("All demonstration records must be marked is_demo=1");
}
if (!productRows.every((row) => row.is_demo === "1" && /^\d+$/.test(row.price_twd))) {
  throw new Error("All demonstration products require a TWD integer price and is_demo=1");
}

try {
  rmSync(databasePath, { force: true });
} catch (error) {
  throw new Error(`Could not replace ${databasePath}: ${error.message}`);
}

const db = new DatabaseSync(databasePath);
try {
  let hasFts5 = false;
  try {
    db.exec("CREATE VIRTUAL TABLE temp.__fts5_probe USING fts5(value, tokenize='trigram'); DROP TABLE temp.__fts5_probe;");
    hasFts5 = true;
  } catch {
    console.warn("SQLite FTS5/trigram is unavailable; using the deterministic FAQ text ranker fallback.");
  }

  db.exec(`
    PRAGMA journal_mode = DELETE;
    PRAGMA foreign_keys = ON;
    CREATE TABLE faq_info (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      keywords TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK(source_type IN ('official','demo')),
      source_url TEXT NOT NULL,
      is_demo INTEGER NOT NULL CHECK(is_demo IN (0,1)),
      search_text TEXT NOT NULL
    );
    CREATE INDEX faq_info_topic_idx ON faq_info(topic);
    CREATE TABLE records_info (
      id TEXT PRIMARY KEY,
      record_type TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT NOT NULL,
      is_demo INTEGER NOT NULL CHECK(is_demo = 1)
    );
    CREATE INDEX records_info_type_idx ON records_info(record_type);
    CREATE TABLE products_info (
      id TEXT PRIMARY KEY,
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      price_twd INTEGER NOT NULL CHECK(price_twd >= 0),
      description TEXT NOT NULL,
      is_demo INTEGER NOT NULL CHECK(is_demo = 1)
    );
  `);

  if (hasFts5) {
    db.exec(`CREATE VIRTUAL TABLE faq_info USING fts5(
      id UNINDEXED, topic, question, answer, keywords,
      tokenize='trigram'
    );`);
  } else {
    db.exec(`CREATE TABLE faq_info (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      keywords TEXT NOT NULL
    );`);
  }

  const insertFaq = db.prepare(`
    INSERT INTO faq_info(id,topic,question,answer,keywords,source_type,source_url,is_demo,search_text)
    VALUES(?,?,?,?,?,?,?,?,?)
  `);
  const insertFts = db.prepare("INSERT INTO faq_info(id,topic,question,answer,keywords) VALUES(?,?,?,?,?)");
  const insertRecord = db.prepare("INSERT INTO records_info(id,record_type,status,summary,is_demo) VALUES(?,?,?,?,?)");
  const insertProduct = db.prepare("INSERT INTO products_info(id,sku,name,price_twd,description,is_demo) VALUES(?,?,?,?,?,?)");
  db.exec("BEGIN IMMEDIATE;");
  try {
    for (const row of faqRows) {
      const searchText = `${row.topic} ${row.question} ${row.answer} ${row.keywords}`;
      const isDemo = row.is_demo === "1" ? 1 : 0;
      insertFaq.run(row.id, row.topic, row.question, row.answer, row.keywords, row.source_type, row.source_url, isDemo, searchText);
      insertFts.run(row.id, row.topic, row.question, row.answer, row.keywords);
    }
    for (const row of recordRows) {
      insertRecord.run(row.id, row.record_type, row.status, row.summary, 1);
    }
    for (const row of productRows) {
      insertProduct.run(row.id, row.sku, row.name, Number(row.price_twd), row.description, 1);
    }
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  db.exec("PRAGMA optimize;");

  const counts = {
    faq: db.prepare("SELECT COUNT(*) AS count FROM faq_info").get().count,
    topics: db.prepare("SELECT COUNT(DISTINCT topic) AS count FROM faq_info").get().count,
    records: db.prepare("SELECT COUNT(*) AS count FROM records_info").get().count,
    products: db.prepare("SELECT COUNT(*) AS count FROM products_info").get().count,
  };
  console.log(`SQLite support database seeded: ${databasePath}; ${JSON.stringify(counts)}`);
} finally {
  db.close();
}
