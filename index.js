import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function getDir() {
  return path.join(os.homedir(), ".config", "input-token-counter");
}

function getSummaryPath() {
  return path.join(getDir(), "summary.json");
}

function getMetricsPath() {
  return path.join(getDir(), "metrics.jsonl");
}

function ensureDir() {
  const dir = getDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadSummary() {
  try {
    const p = getSummaryPath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    }
  } catch (_) {}
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
  ensureDir();
  fs.writeFileSync(getSummaryPath(), JSON.stringify(summary, null, 2));
}

function recordCall(tool, duration, argsStr, resultStr, isError) {
  ensureDir();
  const entry = {
    ts: new Date().toISOString(),
    tool,
    duration,
    argsChars: argsStr.length,
    resultChars: resultStr.length,
    error: isError,
  };
  fs.appendFileSync(getMetricsPath(), JSON.stringify(entry) + "\n");

  const summary = loadSummary();
  summary.totalCalls += 1;
  summary.totalDuration += duration;
  if (isError) summary.totalErrors += 1;
  summary.totalArgsChars += argsStr.length;
  summary.totalResultChars += resultStr.length;

  if (!summary.byTool[tool]) {
    summary.byTool[tool] = { calls: 0, errors: 0, totalDuration: 0, totalArgsChars: 0, totalResultChars: 0 };
  }
  summary.byTool[tool].calls += 1;
  if (isError) summary.byTool[tool].errors += 1;
  summary.byTool[tool].totalDuration += duration;
  summary.byTool[tool].totalArgsChars += argsStr.length;
  summary.byTool[tool].totalResultChars += resultStr.length;

  if (!summary.firstCall) summary.firstCall = entry.ts;
  summary.lastCall = entry.ts;

  saveSummary(summary);
}

const pendingMap = new Map();

export default async function plugin(opts) {
  return {
    name: "tool-profiler",
    description: "Profiles tool calls - tracks duration, frequency, and errors",
    hooks: {
      "tool.execute.before": ({ tool, args, id }) => {
        if (!tool) return;
        const toolName = typeof tool === "string" ? tool : tool.name || "unknown";
        const argsStr = JSON.stringify(args ?? {});
        pendingMap.set(id, { toolName, start: Date.now(), argsStr });
      },
      "tool.execute.after": ({ tool, result, error, id }) => {
        if (!id || !pendingMap.has(id)) return;
        const start = pendingMap.get(id);
        pendingMap.delete(id);
        const duration = Date.now() - start.start;
        const resultStr = result != null ? JSON.stringify(result).slice(0, 5000) : "";
        const isError = !!(error);
        recordCall(start.toolName, duration, start.argsStr, resultStr, isError);
      },
    },
  };
}

export function getSummary() {
  return loadSummary();
}

export function reset() {
  try {
    fs.unlinkSync(getMetricsPath());
  } catch (_) {}
  saveSummary({
    totalCalls: 0, totalDuration: 0, totalErrors: 0,
    totalArgsChars: 0, totalResultChars: 0,
    byTool: {}, firstCall: null, lastCall: null,
  });
}
