#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const METRICS_DIR = path.join(os.homedir(), ".config", "toolcall-stats");
const SUMMARY_FILE = path.join(METRICS_DIR, "summary.json");
const METRICS_FILE = path.join(METRICS_DIR, "metrics.jsonl");
const DB_FILE = path.join(METRICS_DIR, "report.db");

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
      console.log("No data yet. Tool calls will be tracked automatically.");
      return;
    }
    data = JSON.parse(fs.readFileSync(SUMMARY_FILE, "utf-8"));
    if (!data || !data.totalCalls) {
      console.log("No tool calls recorded yet. Start using OpenCode and this will track automatically.");
      return;
    }
  } catch {
    console.log("No data yet.");
    return;
  }

  const avgDuration = data.totalCalls > 0 ? data.totalDuration / data.totalCalls : 0;

  console.log(hr());
  console.log("              Tool Call Profiler -- Summary");
  console.log(hr());
  console.log("  Tool calls:         " + formatNumber(data.totalCalls));
  console.log("  Errors:             " + formatNumber(data.totalErrors) + " (" + (data.totalCalls > 0 ? ((data.totalErrors / data.totalCalls) * 100).toFixed(1) : 0) + "%)");
  console.log("  Total duration:     " + formatDuration(data.totalDuration));
  console.log("  Avg duration:       " + formatDuration(avgDuration));
  console.log("  Total args size:    " + formatNumber(data.totalArgsChars) + " chars");
  console.log("  Total result size:  " + formatNumber(data.totalResultChars) + " chars");
  if (data.firstCall) console.log("  First call:         " + data.firstCall.replace("T", " ").split(".")[0]);
  if (data.lastCall) console.log("  Last call:          " + data.lastCall.replace("T", " ").split(".")[0]);
  console.log(hr());

  const tools = Object.entries(data.byTool || {}).sort((a, b) => b[1].calls - a[1].calls);
  if (tools.length) {
    console.log("");
    console.log("  Calls by tool:");
    console.log("  Tool                   Calls   Errors    Avg Time   Total Time");
    console.log("  ----                   -----   ------    --------   ----------");
    for (const [tool, stats] of tools) {
      const avg = stats.calls > 0 ? stats.totalDuration / stats.calls : 0;
      const name = tool.length > 22 ? tool.slice(0, 21) + "\u2026" : tool;
      console.log("  " + name.padEnd(23) + String(stats.calls).padStart(7) + " " + String(stats.errors).padStart(7) + "   " + formatDuration(avg).padStart(8) + "  " + formatDuration(stats.totalDuration).padStart(10));
    }
    console.log(hr());
  }
}

function loadMetrics() {
  if (!fs.existsSync(METRICS_FILE)) return [];
  return fs.readFileSync(METRICS_FILE, "utf-8").trim().split("\n").filter(Boolean).map(function (l) { return JSON.parse(l); });
}

function median(sorted) {
  if (!sorted.length) return 0;
  var mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  var idx = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function stddev(values, mean) {
  if (values.length < 2) return 0;
  var variance = 0;
  for (var v = 0; v < values.length; v++) {
    variance += (values[v] - mean) * (values[v] - mean);
  }
  variance /= (values.length - 1);
  return Math.sqrt(variance);
}

function printStats() {
  var metrics = loadMetrics();
  if (!metrics.length) {
    console.log("No metrics data yet.");
    return;
  }

  var durations = metrics.map(function (m) { return m.duration; }).sort(function (a, b) { return a - b; });
  var mean = 0;
  for (var i = 0; i < durations.length; i++) { mean += durations[i]; }
  mean /= durations.length;

  console.log(hr());
  console.log("              Tool Call Profiler -- Advanced Stats (" + formatNumber(metrics.length) + " calls)");
  console.log(hr());
  console.log("  Duration distribution:");
  console.log("    Longest:            " + formatDuration(durations[durations.length - 1]));
  console.log("    99th percentile:    " + formatDuration(percentile(durations, 0.99)));
  console.log("    95th percentile:    " + formatDuration(percentile(durations, 0.95)));
  console.log("    75th percentile:    " + formatDuration(percentile(durations, 0.75)));
  console.log("    Median (50th):      " + formatDuration(median(durations)));
  console.log("    25th percentile:    " + formatDuration(percentile(durations, 0.25)));
  console.log("    Mean:               " + formatDuration(mean));
  console.log("    Std deviation:      " + formatDuration(stddev(durations, mean)));
  console.log("    Shortest:           " + formatDuration(durations[0]));
  console.log(hr());

  var byTool = {};
  for (var i = 0; i < metrics.length; i++) {
    var m = metrics[i];
    if (!byTool[m.tool]) byTool[m.tool] = [];
    byTool[m.tool].push(m.duration);
  }

  var toolNames = Object.keys(byTool).sort(function (a, b) { return byTool[b].length - byTool[a].length; });
  if (toolNames.length) {
    console.log("");
    console.log("  Per-tool duration breakdown:");
    console.log("  Tool                 Calls     Mean        Median      P95       Longest");
    console.log("  ----                 -----     ----        ------      ---       -------");
    for (var i = 0; i < toolNames.length; i++) {
      var t = toolNames[i];
      var d = byTool[t].sort(function (a, b) { return a - b; });
      var tmean = 0;
      for (var j = 0; j < d.length; j++) { tmean += d[j]; }
      tmean /= d.length;
      var name = t.length > 22 ? t.slice(0, 21) + "\u2026" : t;
      console.log("  " + name.padEnd(23) + String(d.length).padStart(7) + "  " + formatDuration(tmean).padStart(8) + "  " + formatDuration(median(d)).padStart(8) + "  " + formatDuration(percentile(d, 0.95)).padStart(8) + "  " + formatDuration(d[d.length - 1]).padStart(8));
    }
    console.log(hr());
  }

  var slowest = metrics.slice().sort(function (a, b) { return b.duration - a.duration; }).slice(0, 10);
  console.log("");
  console.log("  Top 10 slowest calls:");
  console.log("  #    Time                 Tool                   Duration");
  console.log("  ---  ----                 ----                   --------");
  for (var i = 0; i < slowest.length; i++) {
    var e = slowest[i];
    var ts = e.ts.replace("T", " ").split(".")[0];
    var name = e.tool.length > 22 ? e.tool.slice(0, 21) + "\u2026" : e.tool;
    console.log("  " + String(i + 1).padStart(2) + "   " + ts.padEnd(21) + " " + name.padEnd(23) + formatDuration(e.duration).padStart(8));
  }
  console.log();
}

function printRecent(n) {
  if (!fs.existsSync(METRICS_FILE)) {
    console.log("No metrics data yet.");
    return;
  }
  n = n || 10;
  const lines = fs.readFileSync(METRICS_FILE, "utf-8").trim().split("\n").filter(Boolean);
  if (!lines.length) {
    console.log("No calls recorded yet.");
    return;
  }

  const entries = lines.map(function (l) { return JSON.parse(l); }).slice(-n).reverse();
  console.log("");
  console.log("  Last " + entries.length + " tool calls:");
  console.log("  Time                 Tool                   Duration   Error");
  console.log("  ----                 ----                   --------   -----");
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    var ts = e.ts.replace("T", " ").split(".")[0];
    var name = e.tool.length > 22 ? e.tool.slice(0, 21) + "\u2026" : e.tool;
    var dur = formatDuration(e.duration);
    var err = e.error ? "ERR" : "ok";
    console.log("  " + ts.padEnd(21) + " " + name.padEnd(23) + dur.padStart(8) + "  " + err.padStart(5));
  }
  console.log("");
}

var cmd = process.argv[2] || "";

if (cmd === "--reset" || cmd === "-r") {
  try { if (fs.existsSync(METRICS_FILE)) fs.unlinkSync(METRICS_FILE); } catch (e) {}
  try { if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE); } catch (e) {}
  try { if (fs.existsSync(DB_FILE + "-wal")) fs.unlinkSync(DB_FILE + "-wal"); } catch (e) {}
  try { if (fs.existsSync(DB_FILE + "-shm")) fs.unlinkSync(DB_FILE + "-shm"); } catch (e) {}
  var empty = {
    totalCalls: 0,
    totalDuration: 0,
    totalErrors: 0,
    totalArgsChars: 0,
    totalResultChars: 0,
    byTool: {},
    firstCall: null,
    lastCall: null,
  };
  try {
    fs.writeFileSync(SUMMARY_FILE, JSON.stringify(empty, null, 2));
  } catch (e) {}
  console.log("Reset toolcall-stats data.");
} else if (cmd === "--json" || cmd === "-j") {
  try {
    var data = JSON.parse(fs.readFileSync(SUMMARY_FILE, "utf-8"));
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ error: "No data yet" }));
  }
} else if (cmd === "--stats" || cmd === "-s") {
  printSummary();
  printStats();
} else if (cmd === "--help" || cmd === "-h") {
  console.log("Usage: tc-stats [options]");
  console.log("  (no args)      Show summary table");
  console.log("  --recent, -n   Show summary + recent calls");
  console.log("  --stats, -s    Show summary + advanced stats (percentiles, median, stddev, slowest)");
  console.log("  --json, -j     Show raw JSON summary");
  console.log("  --reset        Clear all data (JSONL + SQLite)");
  console.log("  --help, -h     Show this help");
} else if (cmd === "--recent" || cmd === "-n") {
  printSummary();
  printRecent(10);
} else {
  printSummary();
}
