import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const METRICS_DIR = path.join(os.homedir(), ".config", "input-token-counter");
const METRICS_FILE = path.join(METRICS_DIR, "metrics.jsonl");
const SUMMARY_FILE = path.join(METRICS_DIR, "summary.json");

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
    totalTokens: 0,
    totalCalls: 0,
    totalCharacters: 0,
    byModel: {},
    byProvider: {},
    firstCall: null,
    lastCall: null,
  };
}

function saveSummary(summary) {
  ensureDir();
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2), "utf-8");
}

function appendMetric(entry) {
  ensureDir();
  fs.appendFileSync(METRICS_FILE, JSON.stringify(entry) + "\n", "utf-8");
}

let tiktoken = null;
function getTiktoken() {
  if (!tiktoken) {
    try {
      tiktoken = require("tiktoken");
    } catch {
      return null;
    }
  }
  return tiktoken;
}

function countMessagesTokens(messages) {
  const tk = getTiktoken();
  if (!tk) return { tokens: 0, chars: 0, error: "tiktoken not available" };

  try {
    const enc = tk.get_encoding("cl100k_base");
    let totalTokens = 0;
    let totalChars = 0;

    for (const msg of messages) {
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content || "");
      totalChars += content.length;
      totalTokens += enc.encode(content).length;
      if (msg.role) totalTokens += 1;
      if (msg.name) totalTokens += enc.encode(msg.name).length + 1;
    }

    totalTokens += 3;

    enc.free();
    return { tokens: totalTokens, chars: totalChars };
  } catch (err) {
    return { tokens: 0, chars: 0, error: err.message };
  }
}

function detectModel(params) {
  if (params.model) return String(params.model);
  return "unknown";
}

function detectProvider(params) {
  if (params.url) {
    const u = String(params.url);
    if (u.includes("openai")) return "openai";
    if (u.includes("anthropic")) return "anthropic";
    if (u.includes("googleapis")) return "google";
    if (u.includes("azure")) return "azure";
  }
  if (params.model) {
    const m = String(params.model);
    if (m.startsWith("gpt") || m.includes("o1") || m.includes("o3")) return "openai";
    if (m.startsWith("claude")) return "anthropic";
    if (m.startsWith("gemini")) return "google";
  }
  return "unknown";
}

function reset() {
  ensureDir();
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify({
    totalTokens: 0, totalCalls: 0, totalCharacters: 0,
    byModel: {}, byProvider: {},
    firstCall: null, lastCall: null,
  }, null, 2), "utf-8");
  fs.writeFileSync(METRICS_FILE, "", "utf-8");
  return { reset: true };
}

function getSummary() {
  return loadSummary();
}

const plugin = {
  name: "input-token-counter",
  version: "1.0.0",
  description: "Counts input/prompt tokens sent to LLM APIs using tiktoken",

  hooks: {
    "chat.params": (input) => {
      try {
        const params = input.params || {};
        const messages = params.messages || [];

        const result = countMessagesTokens(messages);
        const model = detectModel(params);
        const provider = detectProvider(params);

        const entry = {
          ts: new Date().toISOString(),
          model,
          provider,
          inputTokens: result.tokens,
          inputChars: result.chars,
          messageCount: messages.length,
          toolCount: (params.tools || []).length,
          error: result.error || null,
        };

        appendMetric(entry);

        const summary = loadSummary();
        summary.totalTokens += result.tokens;
        summary.totalCalls += 1;
        summary.totalCharacters += result.chars;

        if (!summary.byModel[model]) summary.byModel[model] = { calls: 0, tokens: 0 };
        summary.byModel[model].calls += 1;
        summary.byModel[model].tokens += result.tokens;

        if (!summary.byProvider[provider]) summary.byProvider[provider] = { calls: 0, tokens: 0 };
        summary.byProvider[provider].calls += 1;
        summary.byProvider[provider].tokens += result.tokens;

        if (!summary.firstCall) summary.firstCall = entry.ts;
        summary.lastCall = entry.ts;

        saveSummary(summary);
      } catch (err) {
        try {
          appendMetric({ ts: new Date().toISOString(), error: err.message });
        } catch {}
      }

      return input;
    },
  },

  reset,
  getSummary,
};

export default plugin;
export { plugin as InputTokenCounter, getSummary, reset };
