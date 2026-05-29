import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const METRICS_DIR = path.join(os.homedir(), ".config", "input-token-counter");
const METRICS_FILE = path.join(METRICS_DIR, "metrics.jsonl");
const SUMMARY_FILE = path.join(METRICS_DIR, "summary.json");

const pending = [];

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

export const InputTokenCounter = async (ctx) => {
  return {
    "tool.execute.before": async (input, output) => {
      pending.push({
        tool: input.tool,
        start: Date.now(),
        argsStr: JSON.stringify(output.args ?? {}),
      });
      return output;
    },

    "tool.execute.after": async (input, output) => {
      const start = pending.pop();
      if (!start) return output;

      const duration = Date.now() - start.start;
      const resultStr = output.result != null ? JSON.stringify(output.result) : "";
      const isError = !!(output.error);

      ensureDir();

      const entry = {
        ts: new Date().toISOString(),
        tool: start.tool,
        duration,
        argsChars: start.argsStr.length,
        resultChars: resultStr.length,
        error: isError,
      };
      appendMetric(entry);

      const summary = loadSummary();
      summary.totalCalls += 1;
      summary.totalDuration += duration;
      if (isError) summary.totalErrors += 1;
      summary.totalArgsChars += start.argsStr.length;
      summary.totalResultChars += resultStr.length;

      if (!summary.byTool[start.tool]) {
        summary.byTool[start.tool] = { calls: 0, errors: 0, totalDuration: 0, totalArgsChars: 0, totalResultChars: 0 };
      }
      summary.byTool[start.tool].calls += 1;
      if (isError) summary.byTool[start.tool].errors += 1;
      summary.byTool[start.tool].totalDuration += duration;
      summary.byTool[start.tool].totalArgsChars += start.argsStr.length;
      summary.byTool[start.tool].totalResultChars += resultStr.length;

      if (!summary.firstCall) summary.firstCall = entry.ts;
      summary.lastCall = entry.ts;

      saveSummary(summary);

      return output;
    },
  };
};

export function getSummary() {
  return loadSummary();
}

export function reset() {
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
