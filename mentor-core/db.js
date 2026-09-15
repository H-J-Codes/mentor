import Database from "better-sqlite3";

const db = new Database("mentor.db"); // this creates (or opens) a file called mentor.db

// Create the table if it doesn't already exist — this only actually runs once, ever
db.exec(`
  CREATE TABLE IF NOT EXISTS mistakes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filePath TEXT,
    errorOutput TEXT,
    hintsUsed INTEGER DEFAULT 0,
    solvedAlone INTEGER DEFAULT 0,
    createdAt TEXT
  )
`);

export function recordMistake(filePath, errorOutput) {
  const stmt = db.prepare(`
    INSERT INTO mistakes (filePath, errorOutput, createdAt)
    VALUES (?, ?, ?)
  `);
  const result = stmt.run(filePath, errorOutput, new Date().toISOString());
  return result.lastInsertRowid; // gives us back the new row's ID, so we can update it later
}

export function getAllMistakes() {
  const stmt = db.prepare(`SELECT * FROM mistakes ORDER BY createdAt DESC`);
  return stmt.all();
}

export function incrementHints(mistakeId) {
  const stmt = db.prepare(`
    UPDATE mistakes SET hintsUsed = hintsUsed + 1 WHERE id = ?
  `);
  stmt.run(mistakeId);
}

export function markSolved(mistakeId) {
  const stmt = db.prepare(`
    SELECT hintsUsed FROM mistakes WHERE id = ?
  `);
  const row = stmt.get(mistakeId);
  const solvedAlone = row && row.hintsUsed === 0 ? 1 : 0;

  const updateStmt = db.prepare(`
    UPDATE mistakes SET solvedAlone = ? WHERE id = ?
  `);
  updateStmt.run(solvedAlone, mistakeId);
}