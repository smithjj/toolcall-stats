import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const SUMMARY_FILE = path.join(os.homedir(), ".config", "input-token-counter", "summary.json");
const METRICS_DIR = path.join(os.homedir(), ".config", "input-token-counter");
const METRICS_FILE = path.join(METRICS_DIR, "metrics.jsonl");

function formatNumber(n) {
  return n.toLocaleString();
}

function printSummary() {
  let summary;
  try {
    if (!fs.existsSync(SUMMARY_FILE)) {
      console.log("No input-token-counter data found yet.");
      console.log("Make a few chat requests first, then run this again.\n");
      return;
    }
    summary = JSON.parse(fs.readFileSync(SUMMARY_FILE, "utf-8"));
  } catch (err) {
    console.error("Error reading summary:", err.message);
    process.exit(1);
  }

  console.log("\n=== Input Token Counter ===\n");
  console.log("  Total calls:     " + formatNumber(summary.totalCalls));
  console.log("  Total tokens:    " + formatNumber(summary.totalTokens));
  console.log("  Total chars:     " + formatNumber(summary.totalCharacters));
  console.log("  Avg tokens/call: " + formatNumber(summary.totalCalls > 0 ? Math.round(summary.totalTokens / summary.totalCalls) : 0));
  
  if (summary.firstCall) {
    console.log("  First call:      " + new Date(summary.firstCall).toLocaleString());
    console.log("  Last call:       " + new Date(summary.lastCall).toLocaleString());
  }
  
  console.log("");

  if (Object.keys(summary.byModel).length > 0) {
    console.log("  By Model:");
    const sortedModels = Object.entries(summary.byModel).sort((a, b) => b[1].tokens - a[1].tokens);
    for (const [model, data] of sortedModels) {
      console.log("    " + model.padEnd(40) + " calls: " + String(data.calls).padEnd(4) + " tokens: " + formatNumber(data.tokens));
    }
    console.log("");
  }

  if (Object.keys(summary.byProvider).length > 0) {
    console.log("  By Provider:");
    const sortedProviders = Object.entries(summary.byProvider).sort((a, b) => b[1].tokens - a[1].tokens);
    for (const [provider, data] of sortedProviders) {
      console.log("    " + provider.padEnd(20) + " calls: " + String(data.calls).padEnd(4) + " tokens: " + formatNumber(data.tokens));
    }
    console.log("");
  }

  if (summary.totalTokens > 0) {
    const costEstimate = (summary.totalTokens / 1000000) * 3;
    console.log("  Est. cost (GPT-4 @ /M): $" + costEstimate.toFixed(2));
    console.log("  Est. cost (Claude 3.5 @ /M): $" + costEstimate.toFixed(2));
    console.log("");
  }
}

function printRecent() {
  if (!fs.existsSync(METRICS_FILE)) {
    console.log("No metrics file found.");
    return;
  }
  
  const lines = fs.readFileSync(METRICS_FILE, "utf-8").trim().split("\n").filter(Boolean);
  const recent = lines.slice(-10);
  
  console.log("  Recent calls (last " + recent.length + "):");
  for (const line of recent) {
    try {
      const entry = JSON.parse(line);
      const time = new Date(entry.ts).toLocaleTimeString();
      if (entry.error) {
        console.log("    [" + time + "] ERROR: " + entry.error);
      } else {
        console.log("    [" + time + "] " + (entry.model || "?").padEnd(35) + " " + String(entry.inputTokens).padEnd(6) + " tokens  " + String(entry.messageCount) + " msgs" + (entry.toolCount ? " " + entry.toolCount + " tools" : ""));
      }
    } catch {}
  }
  console.log("");
}

const cmd = process.argv[2];
if (cmd === "--recent" || cmd === "-r") {
  printSummary();
  printRecent();
} else if (cmd === "--reset") {
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify({ totalTokens: 0, totalCalls: 0, totalCharacters: 0, byModel: {}, byProvider: {}, firstCall: null, lastCall: null }, null, 2));
  fs.writeFileSync(METRICS_FILE, "", "utf-8");
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
  console.log("  (no args)     Show summary table");
  console.log("  --recent, -r  Show summary + recent calls");
  console.log("  --json, -j    Show raw JSON summary");
  console.log("  --reset       Reset all data");
  console.log("  --help, -h    Show this help");
} else {
  printSummary();
}
