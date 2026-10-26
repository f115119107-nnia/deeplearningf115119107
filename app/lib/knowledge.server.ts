import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

type FaqRow = {
  id: string;
  topic: string;
  question: string;
  answer: string;
  keywords: string;
  source_type: "official" | "demo";
  source_url: string;
  is_demo: number;
  search_text: string;
};

let connection: DatabaseSync | undefined;

function database(): DatabaseSync {
  if (!connection) {
    const path = resolve(process.cwd(), "data", "support.sqlite");
    connection = new DatabaseSync(path, { readOnly: true });
    connection.exec("PRAGMA query_only = ON;");
  }
  return connection;
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("zh-TW").replace(/[\s\p{P}\p{S}]+/gu, "");
}

function safeFtsExpression(query: string): string | null {
  const chars = Array.from(normalize(query));
  if (chars.length < 3) return null;
  const grams = Array.from({ length: chars.length - 2 }, (_, index) => chars.slice(index, index + 3).join(""));
  const unique = Array.from(new Set(grams)).slice(0, 48);
  return unique.map((gram) => `"${gram.replaceAll('"', '""')}"`).join(" OR ");
}

function scoreFaqRows(query: string, rows: FaqRow[], ftsMatches: Set<string>): FaqRow[] {
  const normalizedQuery = normalize(query);
  const chars = Array.from(normalizedQuery);
  if (chars.length < 2) return [];
  const bigrams = Array.from(new Set(Array.from({ length: chars.length - 1 }, (_, index) => chars.slice(index, index + 2).join(""))));
  const trigrams = chars.length >= 3
    ? Array.from(new Set(Array.from({ length: chars.length - 2 }, (_, index) => chars.slice(index, index + 3).join(""))))
    : [];

  return rows
    .map((row) => {
      const searchable = normalize(row.search_text);
      const question = normalize(row.question);
      const keywords = normalize(row.keywords);
      let score = question.includes(normalizedQuery) ? 100 : searchable.includes(normalizedQuery) ? 70 : 0;
      let matchedBigrams = 0;
      for (const gram of bigrams) {
        if (question.includes(gram)) {
          score += 2.5;
          matchedBigrams += 1;
        } else if (keywords.includes(gram)) {
          score += 2;
          matchedBigrams += 1;
        } else if (searchable.includes(gram)) {
          score += 0.8;
          matchedBigrams += 1;
        }
      }
      for (const gram of trigrams) {
        if (question.includes(gram)) score += 3.5;
        else if (keywords.includes(gram)) score += 3;
        else if (searchable.includes(gram)) score += 1;
      }
      if (ftsMatches.has(row.id)) score += 1.5;
      return { row, score, matchedBigrams };
    })
    .filter(({ score, matchedBigrams }) => score >= 6 && matchedBigrams >= 2)
    .sort((a, b) => b.score - a.score || b.matchedBigrams - a.matchedBigrams || a.row.id.localeCompare(b.row.id))
    .slice(0, 5)
    .map(({ row }) => row);
}

export function searchFaq(query: string): FaqRow[] {
  const text = query.trim().slice(0, 160);
  if (!text) return [];
  const db = database();
  const match = safeFtsExpression(text);
  const ftsMatches = new Set<string>();
  if (match) {
    try {
      const ids = db.prepare(`
        SELECT id
        FROM faq_search
        WHERE faq_search MATCH ?
        LIMIT 100
      `).all(match) as Array<{ id: string }>;
      for (const item of ids) ftsMatches.add(item.id);
    } catch {
      // The independent deterministic character ranker remains the safe fallback.
    }
  }
  const rows = db.prepare(`
    SELECT id, topic, question, answer, keywords, source_type, source_url, is_demo, search_text
    FROM faq_entries
  `).all() as unknown as FaqRow[];
  return scoreFaqRows(text, rows, ftsMatches);
}

export function findFaqById(id: string): FaqRow | undefined {
  const safeId = id.trim().toUpperCase().slice(0, 40);
  return database().prepare(`
    SELECT id, topic, question, answer, keywords, source_type, source_url, is_demo, search_text
    FROM faq_entries WHERE id = ?
  `).get(safeId) as FaqRow | undefined;
}

export function findDemoRecord(recordId: string) {
  const id = recordId.trim().toUpperCase().slice(0, 64);
  return database().prepare(`
    SELECT id, record_type AS recordType, status, summary, is_demo AS isDemo
    FROM demo_records WHERE id = ? AND is_demo = 1
  `).get(id) as {
    id: string;
    recordType: string;
    status: string;
    summary: string;
    isDemo: number;
  } | undefined;
}

export function listDemoProducts() {
  return database().prepare(`
    SELECT id, sku, name, price_twd AS priceTwd, description, is_demo AS isDemo
    FROM demo_products WHERE is_demo = 1 ORDER BY id
  `).all() as Array<{
    id: string;
    sku: string;
    name: string;
    priceTwd: number;
    description: string;
    isDemo: number;
  }>;
}

export function getSupportDatabaseStats() {
  const db = database();
  return {
    faqRows: (db.prepare("SELECT COUNT(*) AS count FROM faq_entries").get() as { count: number }).count,
    faqTopics: (db.prepare("SELECT COUNT(DISTINCT topic) AS count FROM faq_entries").get() as { count: number }).count,
    demoRecords: (db.prepare("SELECT COUNT(*) AS count FROM demo_records").get() as { count: number }).count,
    demoProducts: (db.prepare("SELECT COUNT(*) AS count FROM demo_products").get() as { count: number }).count,
  };
}
