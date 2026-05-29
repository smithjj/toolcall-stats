import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const pending = new Map();

function dir() {
  return path.join(os.homedir(), ".config", "input-token-counter");
}

function summaryPath() {
  return path.join(dir(), "summary.json");
}

function metricsPath() {
  return path.join(dir(), "metrics.jsonl");
}

function ensure() {
  const d = dir();
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function loadSummary() {
  try {
    const p = summaryPath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (_) {}
  return { totalCalls: 0, totalDuration: 0, totalErrors: 0, totalArgsChars: 0, totalResultChars: 0, byTool: {}, firstCall: null, lastCall: null };
}

function saveSummary(s) {
  ensure();
  fs.writeFileSync(summaryPath(), JSON.stringify(s, null, 2));
}

async function record(tool, dur, argsStr, resultStr, err) {
  ensure();
  const entry = { ts: new Date().toISOString(), tool, duration: dur, argsChars: argsStr.length, resultChars: resultStr.length, error: !!err };
  fs.appendFileSync(metricsPath(), JSON.stringify(entry) + "\n");

  const s = loadSummary();
  s.totalCalls++;
  s.totalDuration += dur;
  if (err) s.totalErrors++;
  s.totalArgsChars += argsStr.length;
  s.totalResultChars += resultStr.length;
  if (!s.byTool[tool]) s.byTool[tool] = { calls: 0, errors: 0, totalDuration: 0, totalArgsChars: 0, totalResultChars: 0 };
  s.byTool[tool].calls++;
  if (err) s.byTool[tool].errors++;
  s.byTool[tool].totalDuration += dur;
  s.byTool[tool].totalArgsChars += argsStr.length;
  s.byTool[tool].totalResultChars += resultStr.length;
  if (!s.firstCall) s.firstCall = entry.ts;
  s.lastCall = entry.ts;
  saveSummary(s);
}

export default async function plugin(_opts) {
  return {
    "tool.execute.before": async (_input, output) => {
      const tool = output?.tool || _input?.tool;
      if (!tool) return;
      const name = typeof tool === "string" ? tool : tool.name || "unknown";
      const id = _input?.id || output?.id || `${name}-${Date.now()}`;
      pending.set(id, { name, start: Date.now(), argsStr: JSON.stringify(output?.args ?? _input?.args ?? {}) });
    },
    "tool.execute.after": async (_input, output) => {
      const id = _input?.id || output?.id;
      if (!id || !pending.has(id)) return;
      const p = pending.get(id);
      pending.delete(id);
      const dur = Date.now() - p.start;
      const res = output?.result != null ? JSON.stringify(output.result).slice(0, 5000) : "";
      await record(p.name, dur, p.argsStr, res, !!output?.error);
    },
  };
}

export function getSummary() {
  return loadSummary();
}

export function reset() {
  try { fs.unlinkSync(metricsPath()); } catch (_) {}
  saveSummary({ totalCalls: 0, totalDuration: 0, totalErrors: 0, totalArgsChars: 0, totalResultChars: 0, byTool: {}, firstCall: null, lastCall: null });
}
