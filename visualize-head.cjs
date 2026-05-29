var Database = require("better-sqlite3");
var fs = require("node:fs");
var path = require("node:path");
var os = require("node:os");

var DIR = path.join(os.homedir(), ".config", "input-token-counter");
var DB_PATH = path.join(DIR, "report.db");
var OUT_PATH = path.join(DIR, "report.html");

function buildFallback(msg) {
  return "<!DOCTYPE html><html lang=en><head><meta charset=UTF-8><title>Tool Call Report</title>" +
  "<style>body{background:#0d1117;color:#c9d1d9;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;" +
  "display:flex;align-items:center;justify-content:center;height:100vh;margin:0}" +
  ".card{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:40px;text-align:center;max-width:500px}" +
  ".card h1{color:#58a6ff;font-size:20px;margin:0 0 12px}.card p{color:#8b949e;font-size:14px;margin:0}" +
  "</style></head><body><div class=card><h1>No Data Available</h1><p>" + msg + "</p></div></body></html>";
}
