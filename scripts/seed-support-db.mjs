import { DatabaseSync } from "node:sqlite";
import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const dataDir = resolve(process.cwd(), "data");
const dbFile = process.env.SUPPORT_DB_FILE?.trim() || "support.sqlite";
if (!/^[A-Za-z0-9._-]+\.sqlite$/u.test(dbFile) || dbFile.includes("..")) {
  throw new Error("SUPPORT_DB_FILE must be a simple SQLite filename.");
}
const databasePath = resolve(dataDir, dbFile);

function parseCsv(source) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const text = source.replace(/^\uFEFF/u, "");

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

function requireColumns(rows, filename, required) {
  const headers = new Set(Object.keys(rows[0] || {}));
  const missing = required.filter((column) => !headers.has(column));
  if (missing.length) throw new Error(`${filename} is missing columns: ${missing.join(", ")}`);
}

function splitText(text, maxChars = 720, overlap = 90) {
  const source = Array.from(String(text ?? "").replace(/\s+/gu, " ").trim());
  const chunks = [];
  let start = 0;
  while (start < source.length) {
    let end = Math.min(start + maxChars, source.length);
    if (end < source.length) {
      const lowerBound = Math.max(start + Math.floor(maxChars * 0.62), start + 1);
      for (let cursor = end; cursor > lowerBound; cursor -= 1) {
        if (/[。！？.!?；;]/u.test(source[cursor - 1])) {
          end = cursor;
          break;
        }
      }
    }
    const chunk = source.slice(start, end).join("").trim();
    if (chunk) chunks.push(chunk);
    if (end >= source.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

const faqRows = readCsv("faq.csv");
const recordRows = readCsv("demo_records.csv");
const productRows = readCsv("demo_products.csv");
const ragRows = readCsv("rag_rules.csv");
requireColumns(faqRows, "faq.csv", ["id", "topic", "question", "answer", "keywords", "topic_en", "question_en", "answer_en", "keywords_en", "source_type", "source_url", "is_demo"]);
requireColumns(recordRows, "demo_records.csv", ["id", "record_type", "status", "summary", "record_type_en", "status_en", "summary_en", "is_demo"]);
requireColumns(productRows, "demo_products.csv", ["id", "sku", "name_zh", "name_en", "aliases_zh", "aliases_en", "price_twd", "available", "description_zh", "description_en", "is_demo"]);
requireColumns(ragRows, "rag_rules.csv", ["id", "title_zh", "title_en", "content_zh", "content_en", "keywords_zh", "keywords_en", "source_type", "source_url", "is_demo"]);

const faqTopics = new Set(faqRows.map((row) => row.topic));
if (faqRows.length < 15 || faqTopics.size < 8) {
  throw new Error(`FAQ seed requires at least 15 records and 8 topics; got ${faqRows.length} and ${faqTopics.size}`);
}
if (recordRows.length < 15 || !recordRows.every((row) => row.is_demo === "1")) {
  throw new Error(`Demo record seed requires at least 15 anonymous records marked is_demo=1; got ${recordRows.length}`);
}
if (productRows.length < 15 || !productRows.every((row) => row.is_demo === "1" && /^\d+$/u.test(row.price_twd) && /^[01]$/u.test(row.available) && row.name_zh?.trim() && row.name_en?.trim())) {
  throw new Error(`Demo product seed requires at least 15 fictional bilingual products with integer price and availability; got ${productRows.length}`);
}
if (ragRows.length < 5 || !ragRows.every((row) => row.source_type === "demo" && row.is_demo === "1" && row.content_zh?.trim() && row.content_en?.trim())) {
  throw new Error(`RAG seed requires at least 5 bilingual, explicitly fictional rule documents; got ${ragRows.length}`);
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
    console.warn("SQLite FTS5/trigram is unavailable; using the deterministic text ranker fallback.");
  }

  db.exec(`
    PRAGMA journal_mode = DELETE;
    PRAGMA foreign_keys = ON;
    CREATE TABLE faq_entries (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      keywords TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK(source_type IN ('official','demo')),
      source_url TEXT NOT NULL,
      is_demo INTEGER NOT NULL CHECK(is_demo IN (0,1)),
      search_text TEXT NOT NULL,
      topic_en TEXT NOT NULL,
      question_en TEXT NOT NULL,
      answer_en TEXT NOT NULL,
      keywords_en TEXT NOT NULL
    );
    CREATE INDEX faq_entries_topic_idx ON faq_entries(topic);
    CREATE TABLE demo_records (
      id TEXT PRIMARY KEY,
      record_type TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT NOT NULL,
      is_demo INTEGER NOT NULL CHECK(is_demo = 1),
      record_type_en TEXT NOT NULL,
      status_en TEXT NOT NULL,
      summary_en TEXT NOT NULL
    );
    CREATE INDEX demo_records_type_idx ON demo_records(record_type);
    CREATE TABLE demo_products (
      id TEXT PRIMARY KEY,
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      name_zh TEXT NOT NULL,
      name_en TEXT NOT NULL,
      aliases_zh TEXT NOT NULL,
      aliases_en TEXT NOT NULL,
      price_twd INTEGER NOT NULL CHECK(price_twd >= 0),
      available INTEGER NOT NULL CHECK(available IN (0,1)),
      description TEXT NOT NULL,
      description_zh TEXT NOT NULL,
      description_en TEXT NOT NULL,
      is_demo INTEGER NOT NULL CHECK(is_demo = 1)
    );
    CREATE INDEX demo_products_available_idx ON demo_products(available);
    CREATE TABLE rag_chunks (
      chunk_id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      language TEXT NOT NULL CHECK(language IN ('zh','en')),
      title_zh TEXT NOT NULL,
      title_en TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      keywords TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK(source_type IN ('official','demo')),
      source_url TEXT NOT NULL,
      is_demo INTEGER NOT NULL CHECK(is_demo IN (0,1))
    );
    CREATE INDEX rag_chunks_language_idx ON rag_chunks(language);
    CREATE TABLE demo_reservations (
      reservation_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      items_json TEXT NOT NULL,
      subtotal_twd INTEGER NOT NULL CHECK(subtotal_twd >= 0),
      created_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status = 'confirmed'),
      is_demo INTEGER NOT NULL CHECK(is_demo = 1)
    );
    CREATE INDEX demo_reservations_session_idx ON demo_reservations(session_id, created_at DESC);
  `);

  if (hasFts5) {
    db.exec(`CREATE VIRTUAL TABLE faq_search USING fts5(
      id UNINDEXED, topic, question, answer, keywords,
      topic_en, question_en, answer_en, keywords_en,
      tokenize='trigram'
    );`);
  } else {
    db.exec(`CREATE TABLE faq_search (
      id TEXT PRIMARY KEY, topic TEXT NOT NULL, question TEXT NOT NULL,
      answer TEXT NOT NULL, keywords TEXT NOT NULL, topic_en TEXT NOT NULL,
      question_en TEXT NOT NULL, answer_en TEXT NOT NULL, keywords_en TEXT NOT NULL
    );`);
  }

  const insertFaq = db.prepare(`
    INSERT INTO faq_entries(id,topic,question,answer,keywords,source_type,source_url,is_demo,search_text,topic_en,question_en,answer_en,keywords_en)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const insertFts = db.prepare("INSERT INTO faq_search(id,topic,question,answer,keywords,topic_en,question_en,answer_en,keywords_en) VALUES(?,?,?,?,?,?,?,?,?)");
  const insertRecord = db.prepare("INSERT INTO demo_records(id,record_type,status,summary,is_demo,record_type_en,status_en,summary_en) VALUES(?,?,?,?,?,?,?,?)");
  const insertProduct = db.prepare("INSERT INTO demo_products(id,sku,name,name_zh,name_en,aliases_zh,aliases_en,price_twd,available,description,description_zh,description_en,is_demo) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const insertRag = db.prepare("INSERT INTO rag_chunks(chunk_id,document_id,language,title_zh,title_en,chunk_index,content,keywords,source_type,source_url,is_demo) VALUES(?,?,?,?,?,?,?,?,?,?,?)");

  db.exec("BEGIN IMMEDIATE;");
  try {
    for (const row of faqRows) {
      const searchText = `${row.topic} ${row.question} ${row.answer} ${row.keywords} ${row.topic_en} ${row.question_en} ${row.answer_en} ${row.keywords_en}`;
      const isDemo = row.is_demo === "1" ? 1 : 0;
      const values = [row.id, row.topic, row.question, row.answer, row.keywords, row.source_type, row.source_url || "", isDemo, searchText, row.topic_en, row.question_en, row.answer_en, row.keywords_en];
      insertFaq.run(...values);
      insertFts.run(row.id, row.topic, row.question, row.answer, row.keywords, row.topic_en, row.question_en, row.answer_en, row.keywords_en);
    }
    for (const row of recordRows) {
      insertRecord.run(row.id, row.record_type, row.status, row.summary, 1, row.record_type_en, row.status_en, row.summary_en);
    }
    for (const row of productRows) {
      const price = Number(row.price_twd);
      const available = Number(row.available);
      insertProduct.run(row.id, row.sku, row.name_zh, row.name_zh, row.name_en, row.aliases_zh || "", row.aliases_en || "", price, available, row.description_zh, row.description_zh, row.description_en, 1);
    }
    let chunkCount = 0;
    for (const row of ragRows) {
      for (const [language, title, content, keywords] of [
        ["zh", row.title_zh, row.content_zh, row.keywords_zh],
        ["en", row.title_en, row.content_en, row.keywords_en],
      ]) {
        splitText(content).forEach((chunk, index) => {
          insertRag.run(`${row.id}:${language}:${index + 1}`, row.id, language, row.title_zh, row.title_en, index + 1, chunk, keywords, row.source_type, row.source_url || "", 1);
          chunkCount += 1;
        });
      }
    }
    db.exec("COMMIT;");
    db.exec("PRAGMA optimize;");

    const counts = {
      faq: Number(db.prepare("SELECT COUNT(*) AS count FROM faq_entries").get().count),
      topics: Number(db.prepare("SELECT COUNT(DISTINCT topic) AS count FROM faq_entries").get().count),
      records: Number(db.prepare("SELECT COUNT(*) AS count FROM demo_records").get().count),
      products: Number(db.prepare("SELECT COUNT(*) AS count FROM demo_products").get().count),
      availableProducts: Number(db.prepare("SELECT COUNT(*) AS count FROM demo_products WHERE available = 1").get().count),
      ragDocuments: ragRows.length,
      ragChunks: chunkCount,
      fts5: hasFts5,
      database: dbFile,
    };
    console.log(`SQLite support database seeded: ${databasePath}; ${JSON.stringify(counts)}`);
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
} finally {
  db.close();
}
