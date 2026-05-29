import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const METRICS_DIR = path.join(os.homedir(), ".config", "input-token-counter");
const METRICS_FILE = path.join(METRICS_DIR, "metrics.jsonl");
const SUMMARY_FILE = path.join(METRICS_DIR, "summary.json");

function formatNumber(n) {
  return n.toLocaleString();
}

function formatDuration(ms) {
  if (ms < 1000) return Math.round(ms) + "ms";
  if (ms < 60000) return (ms / 1000).toFixed(1) + "s";
  return (ms / 60000).toFixed(1) + "m";
}

function hr() {
  return "-".repeat(70);
}

function printSummary() {
  let data;
  try {
    if (!fs.existsSync(SUMMARY_FILE)) {
      console.log("No input-token-counter data found yet.");
      console.log("Make some tool calls first, then run this again.\n");
      return;
    }
    data = JSON.parse(fs.readFileSync(SUMMARY_FILE, "utf-8"));
    if (!data || !data.totalCalls) {
      console.log("No tool calls recorded yet. Start using OpenCode and this will track automatically.\n");
      return;
    }
  } catch {
    console.log("No data yet.\n");
    return;
  }

  const avgDuration = data.totalCalls > 0 ? data.totalDuration / data.totalCalls : 0;

  console.log(hr());
  console.log("              Tool Call Profiler — Summary");
  console.log(hr());
  console.log(`  Tool calls:         ${formatNumber(data.totalCalls)}`);
  console.log(`  Errors:             ${formatNumber(data.totalErrors)} (${data.totalCalls > 0 ? ((data.totalErrors / data.totalCalls) * 100).toFixed(1) : 0}%)`);
  console.log(`  Total duration:     ${formatDuration(data.totalDuration)}`);
  console.log(`  Avg duration:       ${formatDuration(avgDuration)}`);
  console.log(`  Total args size:    ${formatNumber(data.totalArgsChars)} chars`);
  console.log(`  Total result size:  ${formatNumber(data.totalResultChars)} chars`);
  if (data.firstCall) console.log(`  First call:         ${data.firstCall.replace("T", " ").split(".")[0]}`);
  if (data.lastCall) console.log(`  Last call:          ${data.lastCall.replace("T", " ").split(".")[0]}`);
  console.log(hr());

  const tools = Object.entries(data.byTool || {}).sort((a, b) => b[1].calls - a[1].calls);
  if (tools.length) {
    console.log("\n  Calls by tool:");
    console.log(`  ${"Tool".padEnd(22)} ${"Calls".padStart(7)} ${"Errors".padStart(7)} ${"Avg Time".padStart(10)} ${"Total Time".padStart(12)}`);
    console.log(`  ${"".padEnd(22)} ${"".padStart(7)} ${"".padStart(7)} ${"".padStart(10)} ${"".padStart(12)}`);
    for (const [tool, stats] of tools) {
      const avg = stats.calls > 0 ? stats.totalDuration / stats.calls : 0;
      const name = tool.length > 20 ? tool.slice(0, 19) + "…" : tool;
      console.log(`  ${name.padEnd(22)} ${String(stats.calls).padStart(7)} ${String(stats.errors).padStart(7)} ${formatDuration(avg).padStart(10)} ${formatDuration(stats.totalDuration).padStart(12)}`);
    }
    console.log(hr());
  }
}

function printRecent(n = 10) {
  if (!fs.existsSync(METRICS_FILE)) {
    console.log("No metrics data yet.");
    return;
  }
  const lines = fs.readFileSync(METRICS_FILE, "utf-8").trim().split("\n").filter(Boolean);
  if (!lines.length) {
    console.log("No calls recorded yet.");
    return;
  }

  const entries = lines.map(l => JSON.parse(l)).slice(-n).reverse();
  console.log(`\n  Last ${entries.length} tool calls:`);
  console.log(`  ${"Time".padEnd(21)} ${"Tool".padEnd(22)} ${"Duration".padStart(10)} ${"Error".padStart(6)}`);
  console.log(`  ${"".padEnd(21)} ${"".padEnd(22)} ${"".padStart(10)} ${"".padStart(6)}`);
  for (const e of entries) {
    const ts = e.ts.replace("T", " ").split(".")[0];
    const name = e.tool.length > 20 ? e.tool.slice(0, 19) + "…" : e.tool;
    const dur = formatDuration(e.duration);
    const err = e.error ? "ERR" : "ok";
    console.log(`  ${ts.padEnd(21)} ${name.padEnd(22)} ${dur.padStart(10)} ${err.padStart(6)}`);
  }
  console.log();
}

const cmd = process.argv[2] || "";

if (cmd === "--reset" || cmd === "-r") {
  try {
    if (fs.existsSync(METRICS_FILE)) fs.unlinkSync(METRICS_FILE);
  } catch {}
  const empty = {
    totalCalls: 0,
    totalDuration: 0,
    totalErrors: 0,
    totalArgsChars: 0,
    totalResultChars: 0,
    byTool: {},
    firstCall: null,
    lastCall: null,
  };
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(empty, null, 2));
  console.log("Reset input-token-counter data.");
} else if (cmd === "--json" || cmd === "-j") {
  try {
    const data = JSON.parse(fs.readFileSync(SUMMARY_FILE, "utf-8"));
    console.log(JSON.stringify(data, null, 2));
  } catch {
    console.log(JSON.stringify({ error: "No data yet" }));
  }
} else if (cmd === "--help" || cmd === "-h") {
  console.log("Usage: input-token-counter [options]");
  console.log("  (no args)      Show summary table");
  console.log("  --recent, -n   Show summary + recent calls");
  console.log("  --json, -j     Show raw JSON summary");
  console.log("  --reset        Reset all statistics");
  console.log("  --help, -h     Show this help");
} else if (cmd === "--recent" || cmd === "-n") {
  printSummary();
  printRecent(10);
} else {
  printSummary();
}
