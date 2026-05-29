#!/usr/bin/env node
var Database = require("better-sqlite3");
var path = require("node:path");
var os = require("node:os");
var fs = require("node:fs");

const DIR = path.join(os.homedir(), ".config", "input-token-counter");
const METRICS_FILE = path.join(DIR, "metrics.jsonl");
const DB_PATH = path.join(DIR, "report.db");

function fmt(n) { return n.toLocaleString(); }
function dur(ms) {
  if (ms < 1000) return Math.round(ms) + "ms";
  if (ms < 60000) return (ms / 1000).toFixed(1) + "s";
  return (ms / 60000).toFixed(1) + "m";
}
function pct(n, total) { return total ? ((n / total) * 100).toFixed(1) + "%" : "0.0%"; }

function importMetrics() {
  if (!fs.existsSync(METRICS_FILE)) {
    console.log("Waiting for data... (no metrics.jsonl found)");
    return false;
  }
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`CREATE TABLE IF NOT EXISTS calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    tool TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    args_chars INTEGER NOT NULL,
    result_chars INTEGER NOT NULL DEFAULT 0,
    error INTEGER NOT NULL DEFAULT 0,
    batch TEXT NOT NULL
  );`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_tool ON calls(tool);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_batch ON calls(batch);");

  const lines = fs.readFileSync(METRICS_FILE, "utf-8").trim().split("\n").filter(Boolean);
  if (!lines.length) { db.close(); return false; }

  const batch = new Date().toISOString();
  const insert = db.prepare("INSERT OR IGNORE INTO calls (ts, tool, duration_ms, args_chars, result_chars, error, batch) VALUES (@ts, @tool, @dur, @ac, @rc, @err, @batch)");
  const rows = lines.map(function(l) {
    var p = JSON.parse(l);
    return { ts: p.ts, tool: p.tool, dur: p.duration || 0, ac: p.argsChars || 0, rc: p.resultChars || 0, err: p.error ? 1 : 0, batch: batch };
  });
  db.transaction(function(rr) { for (var i = 0; i < rr.length; i++) insert.run(rr[i]); })(rows);
  db.close();
  return true;
}

function query() {
  if (!fs.existsSync(DB_PATH)) { console.log("No database yet."); return; }
  const db = new Database(DB_PATH, { readonly: true });
  const t = db.prepare("SELECT COUNT(*) AS c, SUM(duration_ms) AS td, SUM(error) AS e, SUM(args_chars) AS ac, SUM(result_chars) AS rc, MIN(ts) AS f, MAX(ts) AS l FROM calls").get();
  if (!t.c) { console.log("No calls in database."); db.close(); return; }

  console.log("");
  console.log("=".repeat(74));
  console.log("                      TOOL CALL PROFILER - REPORT");
  console.log("=".repeat(74));
  console.log("  Total calls:       " + fmt(t.c));
  console.log("  Errors:            " + fmt(t.e) + " (" + pct(t.e, t.c) + ")");
  console.log("  Total duration:    " + dur(t.td));
  console.log("  Average duration:  " + dur(t.td / t.c));
  console.log("  Chars sent:        " + fmt(t.ac));
  console.log("  Chars returned:    " + fmt(t.rc));
  console.log("  From: " + (t.f ? t.f.replace("T"," ").split(".")[0] : "-"));
  console.log("  To:   " + (t.l ? t.l.replace("T"," ").split(".")[0] : "-"));
  console.log("");

  var tools = db.prepare("SELECT tool, COUNT(*) AS c, SUM(error) AS e, SUM(duration_ms) AS td, AVG(duration_ms) AS ad, MAX(duration_ms) AS mx FROM calls GROUP BY tool ORDER BY c DESC").all();
  console.log("-".repeat(74));
  console.log("  Calls by Tool");
  console.log("-".repeat(74));
  console.log("  Tool             Calls Err     Avg     Total   Longest");
  for (var i = 0; i < tools.length; i++) {
    var t2 = tools[i];
    var nm = t2.tool.length > 15 ? t2.tool.slice(0,14) + "\u2026" : t2.tool;
    console.log("  " + nm.padEnd(16) + " " + String(t2.c).padStart(5) + " " + String(t2.e).padStart(3) + " " + dur(t2.ad).padStart(7) + " " + dur(t2.td).padStart(8) + " " + dur(t2.mx).padStart(8));
  }

  var d = db.prepare("SELECT COUNT(*) AS n, MIN(duration_ms) AS mn, MAX(duration_ms) AS mx, AVG(duration_ms) AS av, TOTAL(duration_ms * duration_ms) AS ss FROM calls").get();
  var vr = d.n > 1 ? (d.ss / d.n) - (d.av * d.av) : 0;
  var sd = Math.sqrt(Math.max(0, vr));
  var md = db.prepare("SELECT duration_ms FROM calls ORDER BY duration_ms LIMIT 1 OFFSET ?").get(Math.floor(d.n / 2));
  var p95 = db.prepare("SELECT duration_ms FROM calls ORDER BY duration_ms LIMIT 1 OFFSET ?").get(Math.ceil(d.n * 0.95) - 1);
  var p99 = db.prepare("SELECT duration_ms FROM calls ORDER BY duration_ms LIMIT 1 OFFSET ?").get(Math.ceil(d.n * 0.99) - 1);

  console.log("");
  console.log("-".repeat(74));
  console.log("  Duration Distribution");
  console.log("-".repeat(74));
  console.log("  Mean:      " + dur(d.av) + "      Shortest:  " + dur(d.mn));
  console.log("  Median:    " + dur(md ? md.duration_ms : 0) + "      Longest:   " + dur(d.mx));
  console.log("  Std Dev:   " + dur(sd) + "      P95:       " + dur(p95 ? p95.duration_ms : 0));
  console.log("  P99:       " + dur(p99 ? p99.duration_ms : 0));

  var slow = db.prepare("SELECT ts, tool, duration_ms FROM calls ORDER BY duration_ms DESC LIMIT 10").all();
  console.log("");
  console.log("-".repeat(74));
  console.log("  Top 10 Slowest Calls");
  console.log("-".repeat(74));
  console.log("  #   Time                Tool               Duration");
  for (var j = 0; j < slow.length; j++) {
    var s = slow[j];
    var sn = s.tool.length > 20 ? s.tool.slice(0,19) + "\u2026" : s.tool;
    var st = s.ts.replace("T"," ").split(".")[0];
    console.log("  " + String(j+1).padStart(2) + "  " + st + "  " + sn.padEnd(17) + dur(s.duration_ms));
  }
  console.log("");
  console.log("=".repeat(74));

  db.close();
}

importMetrics();
query();
