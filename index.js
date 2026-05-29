import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const METRICS_DIR = path.join(os.homedir(), ".config", "input-token-counter");
const METRICS_FILE = path.join(METRICS_DIR, "metrics.jsonl");
const SUMMARY_FILE = path.join(METRICS_DIR, "summary.json");

const pending = new Map();

function ensureDir() {
  if (!fs.existsSync(METRICS_DIR)) {
    fs.mkdirSync(METRICS_DIR, { recursive: true });
  }
}

function loadSummary() {
  try {
    if (fs.existsSync(SUMMARY_FILE)) {
      return JSON.parse(fs.readFileSync(SUMMARY_FILE, "utf-8"));
    }
  } catch {}
  return {
    totalCalls: 0,
    totalDuration: 0,
    totalErrors: 0,
    totalArgsChars: 0,
    totalResultChars: 0,
    byTool: {},
    firstCall: null,
    lastCall: null,
  };
}

function saveSummary(summary) {
  try {
    ensureDir();
    fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));
  } catch {}
}

function appendMetric(entry) {
  try {
    ensureDir();
    fs.appendFileSync(METRICS_FILE, JSON.stringify(entry) + "\n");
  } catch {}
}

function formatDuration(ms) {
  if (ms < 1000) return Math.round(ms) + "ms";
  if (ms < 60000) return (ms / 1000).toFixed(1) + "s";
  return (ms / 60000).toFixed(1) + "m";
}

const plugin = {
  name: "input-token-counter",
  version: "2.0.0",
  description: "Profiles tool calls in OpenCode — tracks duration, frequency, and errors",
  hooks: {
    "tool.execute.before": async (input) => {
      const id = input.id ?? `${input.tool?.name ?? "unknown"}-${Date.now()}-${pending.size}`;
      pending.set(id, { tool: input.tool?.name ?? "unknown", start: Date.now(), args: input.args });
      return input;
    },

    "tool.execute.after": async (output, input) => {
      const id = input.id;
      const start = pending.get(id);
      const duration = start ? Date.now() - start.start : -1;
      pending.delete(id);

      const tool = input.tool?.name ?? "unknown";
      const argsStr = JSON.stringify(input.args ?? {});
      const resultStr = output.result != null ? JSON.stringify(output.result) : "";
      const isError = !!(output.error || (output.result != null && typeof output.result === "string" && output.result.includes("error")));

      ensureDir();

      const entry = {
        ts: new Date().toISOString(),
        tool,
        duration,
        argsChars: argsStr.length,
        resultChars: resultStr.length,
        error: isError,
      };
      appendMetric(entry);

      const summary = loadSummary();
      summary.totalCalls += 1;
      summary.totalDuration += Math.max(0, duration);
      if (isError) summary.totalErrors += 1;
      summary.totalArgsChars += argsStr.length;
      summary.totalResultChars += resultStr.length;

      if (!summary.byTool[tool]) {
        summary.byTool[tool] = { calls: 0, errors: 0, totalDuration: 0, totalArgsChars: 0, totalResultChars: 0 };
      }
      summary.byTool[tool].calls += 1;
      if (isError) summary.byTool[tool].errors += 1;
      summary.byTool[tool].totalDuration += Math.max(0, duration);
      summary.byTool[tool].totalArgsChars += argsStr.length;
      summary.byTool[tool].totalResultChars += resultStr.length;

      if (!summary.firstCall) summary.firstCall = entry.ts;
      summary.lastCall = entry.ts;

      saveSummary(summary);

      return output;
    },
  },
};

function getSummary() {
  return loadSummary();
}

function reset() {
  try {
    if (fs.existsSync(METRICS_FILE)) fs.unlinkSync(METRICS_FILE);
    saveSummary({
      totalCalls: 0,
      totalDuration: 0,
      totalErrors: 0,
      totalArgsChars: 0,
      totalResultChars: 0,
      byTool: {},
      firstCall: null,
      lastCall: null,
    });
  } catch {}
}

export default plugin;
export { plugin as InputTokenCounter, getSummary, reset };
