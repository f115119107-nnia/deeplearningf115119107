import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const baseUrl = (process.env.AGENT_TEST_URL || "http://localhost:3000").replace(/\/+$/, "");
const cases = JSON.parse(readFileSync(new URL("../data/agent-tests.json", import.meta.url), "utf8"));
const results = [];

for (const test of cases) {
  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: test.question, history: [] }),
      signal: AbortSignal.timeout(40_000),
    });
    const payload = await response.json().catch(() => ({}));
    const trace = Array.isArray(payload.trace) ? payload.trace : [];
    const tools = trace.map((step) => step.name);
    const first = trace[0];
    const reply = typeof payload.reply === "string" ? payload.reply : "";
    const checks = {
      http: response.ok,
      answer: reply.length > 0 && reply.length <= 1200,
      firstTool: first?.name === test.expectedTool,
      firstStatus: !test.expectedFirstStatus || first?.status === test.expectedFirstStatus,
      noToolError: trace.every((step) => step.status !== "error"),
      maxSteps: trace.length > 0 && trace.length <= 3,
      noDuplicateTool: new Set(tools).size === tools.length,
      expectedAnswerEvidence: !test.expectedContains || reply.includes(test.expectedContains),
      humanDisclosure: test.expectedHuman !== true || (payload.needsHuman === true && reply.includes("課堂示範")),
      faqSource: test.category !== "FAQ" || (Array.isArray(payload.sources) && payload.sources.some((source) => source.kind === "official" && source.url?.startsWith("https://"))),
      notFoundEscalated: test.id !== "T11" || (trace.some((step) => step.status === "not_found") && tools.includes("transfer_to_human")),
    };
    const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
    const pass = failedChecks.length === 0;
    results.push({ id: test.id, category: test.category, expected: test.expectedTool, actual: tools.join(" → ") || `HTTP ${response.status}`, statuses: trace.map((step) => step.status), checks, failedChecks, reply });
  } catch (error) {
    results.push({
      id: test.id,
      category: test.category,
      expected: test.expectedTool,
      actual: error instanceof Error ? error.message : "request error",
      statuses: [],
      checks: { request: false },
      failedChecks: ["request"],
      reply: "",
    });
  }
  const last = results.at(-1);
  const pass = last.failedChecks.length === 0;
  console.log(`${pass ? "PASS" : "FAIL"} ${last.id} [${last.category}] expected=${last.expected}; actual=${last.actual}${last.failedChecks.length ? `; failed=${last.failedChecks.join(",")}` : ""}`);
  if (last.reply) console.log(`  回答核對：${last.reply.replace(/\s+/gu, " ").slice(0, 145)}`);
}

const passed = results.filter((result) => result.failedChecks.length === 0).length;
const report = { generatedAt: new Date().toISOString(), baseUrl, total: results.length, passed, failed: results.length - passed, results };
mkdirSync(new URL("../reports/", import.meta.url), { recursive: true });
writeFileSync(new URL("../reports/agent-test-results.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Agent tool-routing and answer-evidence tests: ${passed}/${results.length} passed. Results: reports/agent-test-results.json`);
if (results.length < 10 || passed !== results.length) process.exitCode = 1;
