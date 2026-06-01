try {
  var Database = require('./node_modules/better-sqlite3');
  var db = new Database('test.db');
  db.exec('CREATE TABLE IF NOT EXISTS test (id INTEGER)');
  db.close();
  require('fs').unlinkSync('test.db');
  console.log('OK');
} catch(e) {
  console.log('FAIL: ' + e.message);
}
