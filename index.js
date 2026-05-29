import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const DIR = path.join(os.homedir(), ".config", "input-token-counter");
const SUMMARY = path.join(DIR, "summary.json");
const METRICS = path.join(DIR, "metrics.jsonl");

const pending = new Map();

function ensure() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
}

function load() {
  try {
    if (fs.existsSync(SUMMARY)) return JSON.parse(fs.readFileSync(SUMMARY, "utf-8"));
  } catch (_) {}
  return { totalCalls: 0, totalDuration: 0, totalErrors: 0, totalArgsChars: 0, totalResultChars: 0, byTool: {}, firstCall: null, lastCall: null };
}

function save(s) {
  ensure();
  fs.writeFileSync(SUMMARY, JSON.stringify(s, null, 2));
}

function record(tool, dur, argsStr, resultStr, err) {
  ensure();
  const entry = { ts: new Date().toISOString(), tool, duration: dur, argsChars: argsStr.length, resultChars: resultStr.length, error: !!err };
  fs.appendFileSync(METRICS, JSON.stringify(entry) + "\n");

  const s = load();
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
  save(s);
}

export default {
  name: "tool-profiler",
  version: "2.2.0",
  description: "Profiles tool calls - tracks duration, frequency, and errors",
  hooks: {
    "tool.execute.before": (_input, output) => {
      const tool = output.tool || _input.tool;
      if (!tool) return;
      const name = typeof tool === "string" ? tool : tool.name || "unknown";
      const id = _input.id || output.id || `${name}-${Date.now()}`;
      pending.set(id, { name, start: Date.now(), argsStr: JSON.stringify(output.args ?? _input.args ?? {}) });
    },
    "tool.execute.after": (_input, output) => {
      const id = _input.id || output.id;
      if (!id || !pending.has(id)) return;
      const p = pending.get(id);
      pending.delete(id);
      const dur = Date.now() - p.start;
      const res = output.result != null ? JSON.stringify(output.result).slice(0, 5000) : "";
      record(p.name, dur, p.argsStr, res, !!output.error);
    },
  },
};

export function getSummary() {
  return load();
}

export function reset() {
  try { fs.unlinkSync(METRICS); } catch (_) {}
  save({ totalCalls: 0, totalDuration: 0, totalErrors: 0, totalArgsChars: 0, totalResultChars: 0, byTool: {}, firstCall: null, lastCall: null });
}
