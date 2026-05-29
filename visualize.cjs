var Database = require('better-sqlite3');
var fs = require('node:fs');
var path = require('node:path');
var os = require('node:os');

var DIR = path.join(os.homedir(), '.config', 'input-token-counter');
var DB_PATH = path.join(DIR, 'report.db');
var OUT_PATH = path.join(DIR, 'report.html');

function buildFallback(msg) {
  return ['<!DOCTYPE html>',
    '<html lang=en>',
    '<head><meta charset=UTF-8><title>Tool Call Report</title>',
    '<style>',
    'body{background:#0d1117;color:#c9d1d9;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}',
    '.card{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:40px;text-align:center;max-width:500px}',
    '.card h1{color:#58a6ff;font-size:20px;margin:0 0 12px}',
    '.card p{color:#8b949e;font-size:14px;margin:0}',
    '</style>',
    '</head>',
    '<body><div class=card><h1>No Data Available</h1><p>' + msg + '</p></div></body>',
    '</html>'
  ].join('\n');
}

function durLabel(ms) {
  if (ms < 1000) return Math.round(ms) + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  return (ms / 60000).toFixed(1) + 'm';
}

function js(a) { return JSON.stringify(a); }

var colors = ['#58a6ff','#3fb950','#f0883e','#f85149','#bc8cff','#d29922','#8b949e','#79c0ff','#56d364','#db6d28'];

try {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(OUT_PATH, buildFallback('Database not found at ' + DB_PATH), 'utf8');
    console.log('No DB, wrote fallback.');
    process.exit(0);
  }

  var db = new Database(DB_PATH, { readonly: true });

  var total = db.prepare('SELECT COUNT(*) AS c, SUM(duration_ms) AS td FROM calls').get();

  if (!total.c) {
    fs.writeFileSync(OUT_PATH, buildFallback('No calls recorded yet.'), 'utf8');
    db.close();
    console.log('No data, wrote fallback.');
    process.exit(0);
  }

  var sqlBT = 'SELECT tool, COUNT(*) AS c, AVG(duration_ms) AS ad, MAX(duration_ms) AS mx, SUM(error) AS errs FROM calls GROUP BY tool ORDER BY c DESC';
  var byTool = db.prepare(sqlBT).all();
  var totalErrors = byTool.reduce(function(s, t) { return s + t.errs; }, 0);

  var sqlBH = 'SELECT substr(ts,1,13) AS h, COUNT(*) AS c FROM calls GROUP BY h ORDER BY h';
  var byHour = db.prepare(sqlBH).all();

  var durStats = db.prepare('SELECT MIN(duration_ms) AS mn, MAX(duration_ms) AS mx FROM calls').get();

  var sqlSL = 'SELECT tool, MAX(duration_ms) AS mx FROM calls GROUP BY tool ORDER BY mx DESC';
  var slowest = db.prepare(sqlSL).all();

  var durs = db.prepare('SELECT duration_ms FROM calls').all().map(function(r){return r.duration_ms;});
  db.close();

  // Histogram
  var mn = durStats.mn, mx = durStats.mx;
  if (mn === mx) { mx = mn + 1; }
  var bw = (mx - mn) / 20;
  var hB = [], hL = [];
  for (var b = 0; b < 20; b++) {
    var lo = mn + b * bw, hi = mn + (b+1) * bw;
    hB[b] = 0;
    hL[b] = Math.round((lo + hi) / 2);
  }
  for (var i = 0; i < durs.length; i++) {
    var idx = Math.min(19, Math.floor((durs[i] - mn) / bw));
    hB[idx]++;
  }

  var CT = js(byTool.map(function(r){return r.tool;}));
  var CC = js(byTool.map(function(r){return r.c;}));
  var CA = js(byTool.map(function(r){return Math.round(r.ad);}));
  var HL = js(hL);
  var HV = js(hB);
  var HH = js(byHour.map(function(r){return r.h;}));
  var HC = js(byHour.map(function(r){return r.c;}));
  var ST = js(slowest.map(function(r){return r.tool.length>25?r.tool.slice(0,24)+'\u2026':r.tool;}));
  var SV = js(slowest.map(function(r){return r.mx;}));
  var CL = js(colors);

  var topTool = byTool[0].tool;
  var totalCalls = total.c;
  var uniqueTools = byTool.length;
  var totalDur = total.td;
  var avgDur = Math.round(total.td / total.c);

} catch(e) {
  fs.writeFileSync(OUT_PATH, buildFallback("Error: " + e.message), "utf8");
  process.exit(1);
}

  // --- HTML template ---
  var css = [
    '*{box-sizing:border-box;margin:0;padding:0}',
    'body{background:#0d1117;color:#c9d1d9;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;padding:24px}',
    '.header{text-align:center;margin-bottom:24px}',
    '.header h1{font-size:24px;color:#58a6ff;margin-bottom:4px}',
    '.header span{font-size:14px;color:#8b949e}',
    '.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:16px;margin-bottom:24px}',
    '.stat-card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px;text-align:center}',
    '.stat-card .label{font-size:12px;color:#8b949e;text-transform:uppercase;margin-bottom:4px}',
    '.stat-card .value{font-size:28px;font-weight:600;color:#58a6ff}',
    '.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(460px,1fr));gap:20px;margin-bottom:20px}',
    '.chart-box{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px}',
    '.chart-box h2{font-size:15px;color:#c9d1d9;margin-bottom:12px;font-weight:600}',
    '.chart-box canvas{width:100%!important;height:300px!important}',
    'footer{text-align:center;color:#484f58;font-size:12px;margin-top:24px}'
  ].join('');

  function sc(label, value) {
    return '<div class=stat-card><div class=label>' + label + '</div><div class=value>' + value + '</div></div>';
  }

  function cb(title, cid) {
    return '<div class=chart-box><h2>' + title + '</h2><canvas id=' + cid + '></canvas></div>';
  }

  var H = [
    '<!DOCTYPE html>',
    '<html lang=en>',
    '<head>',
    '<meta charset=UTF-8>',
    "<meta name=viewport content='width=device-width,initial-scale=1'>",
    '<title>Tool Call Dashboard</title>',
    '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>',
    '<style>' + css + '</style>',
    '</head>',
    '<body>',
    '<div class=header><h1>Tool Call Dashboard</h1><span>' + DB_PATH + '</span></div>',
    '<div class=stats>',
    sc('Total Calls', totalCalls.toLocaleString()),
    sc('Error Rate', (totalErrors / totalCalls * 100).toFixed(1) + '%'),
    sc('Unique Tools', String(uniqueTools)),
    sc('Total Duration', durLabel(totalDur)),
    sc('Avg Duration', durLabel(avgDur)),
    sc('Top Tool', '<span style=font-size:16px>' + topTool + '</span>'),
    '</div>',
    '<div class=grid>',
    cb('Calls by Tool', 'c1'),
    cb('Duration per Tool - Average', 'c2'),
    cb('Tool Distribution', 'c3'),
    cb('Duration Histogram', 'c4'),
    cb('Calls Over Time', 'c5'),
    cb('Longest Duration per Tool', 'c6'),
    '</div>',
    '<footer>Generated ' + new Date().toISOString() + '</footer>',
  ];

  // Chart.js init scripts
  H.push('<script>');
  H.push('Chart.defaults.color="#8b949e";');
  H.push('Chart.defaults.borderColor="#30363d";');
  H.push('Chart.defaults.font.size=13;');
  H.push('var C=' + CL + ';');

  // c1 - Calls by Tool (bar)
  H.push('new Chart(c1.getContext("2d"),{type:"bar",data:{labels:' + CT + ',datasets:[{label:"Calls",data:' + CC + ',backgroundColor:C}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{color:"#21262d"}},x:{grid:{color:"#21262d"}}}}});');

  // c2 - Duration per Tool Avg (bar)
  H.push('new Chart(c2.getContext("2d"),{type:"bar",data:{labels:' + CT + ',datasets:[{label:"Avg ms",data:' + CA + ',backgroundColor:C}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:function(x){return x.raw+"ms"}}}},scales:{y:{beginAtZero:true,grid:{color:"#21262d"}},x:{grid:{color:"#21262d"}}}}});');

  // c3 - Tool Distribution (doughnut)
  H.push('new Chart(c3.getContext("2d"),{type:"doughnut",data:{labels:' + CT + ',datasets:[{data:' + CC + ',backgroundColor:C}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"bottom",labels:{color:"#8b949e",padding:12}}}}});');

  // c4 - Duration Histogram (bar, 20 buckets)
  H.push('new Chart(c4.getContext("2d"),{type:"bar",data:{labels:' + HL + ',datasets:[{label:"Count",data:' + HV + ',backgroundColor:"#3fb950"}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{type:"logarithmic",ticks:{callback:function(v){return v+"ms"}},grid:{color:"#21262d"}},y:{beginAtZero:true,grid:{color:"#21262d"}}}}});');

  // c5 - Calls Over Time (line)
  H.push('new Chart(c5.getContext("2d"),{type:"line",data:{labels:' + HH + ',datasets:[{label:"Calls/hr",data:' + HC + ',borderColor:"#58a6ff",backgroundColor:"rgba(88,166,255,0.1)",fill:true,tension:0.3,pointRadius:2,pointHitRadius:8}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{color:"#21262d"}},x:{grid:{color:"#21262d"}}}}});');

  // c6 - Longest Duration per Tool (horizontal bar)
  H.push('new Chart(c6.getContext("2d"),{type:"bar",data:{labels:' + ST + ',datasets:[{label:"Max ms",data:' + SV + ',backgroundColor:"#f0883e"}]},options:{indexAxis:"y",responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:function(x){return x.raw+"ms"}}}},scales:{x:{beginAtZero:true,grid:{color:"#21262d"}},y:{grid:{color:"#21262d"}}}}});');

  H.push('</script>');
  H.push('</body>');
  H.push('</html>');

  fs.writeFileSync(OUT_PATH, H.join('\n'), 'utf8');
  console.log('Wrote ' + OUT_PATH + ' (' + Math.round(Buffer.byteLength(H.join(''))/1024) + ' KB)');
