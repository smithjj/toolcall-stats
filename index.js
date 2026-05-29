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

function record(entry) {
  ensure();
  fs.appendFileSync(METRICS, JSON.stringify(entry) + "\n");
  const s = load();
  s.totalCalls++;
  s.totalDuration += entry.duration || 0;
  if (entry.error) s.totalErrors++;
  s.totalArgsChars += entry.argsChars || 0;
  s.totalResultChars += entry.resultChars || 0;
  if (!s.byTool[entry.tool]) s.byTool[entry.tool] = { calls: 0, errors: 0, totalDuration: 0, totalArgsChars: 0, totalResultChars: 0 };
  s.byTool[entry.tool].calls++;
  if (entry.error) s.byTool[entry.tool].errors++;
  s.byTool[entry.tool].totalDuration += entry.duration || 0;
  s.byTool[entry.tool].totalArgsChars += entry.argsChars || 0;
  s.byTool[entry.tool].totalResultChars += entry.resultChars || 0;
  if (!s.firstCall) s.firstCall = entry.ts;
  s.lastCall = entry.ts;
  save(s);
}

export default async function(_opts) {
  return {
    "tool.execute.before": async (input, _output) => {
      const id = input.callID || `${input.tool}-${Date.now()}`;
      pending.set(id, {
        tool: input.tool,
        start: Date.now(),
        argsStr: JSON.stringify(input.args ?? {}),
      });
    },
    "tool.execute.after": async (input, output) => {
      const id = input.callID;
      if (!id || !pending.has(id)) return;
      const p = pending.get(id);
      pending.delete(id);
      const resultStr = output?.result != null ? JSON.stringify(output.result).slice(0, 5000) : "";
      record({
        ts: new Date().toISOString(),
        tool: p.tool,
        duration: Date.now() - p.start,
        argsChars: p.argsStr.length,
        resultChars: resultStr.length,
        error: !!output?.error,
      });
    },
  };
}

export function getSummary() {
  return load();
}

export function reset() {
  try { fs.unlinkSync(METRICS); } catch (_) {}
  save({ totalCalls: 0, totalDuration: 0, totalErrors: 0, totalArgsChars: 0, totalResultChars: 0, byTool: {}, firstCall: null, lastCall: null });
}
