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
// Safely add the category column if it doesn't already exist (won't error on repeat runs)
try {
  db.exec(`ALTER TABLE mistakes ADD COLUMN category TEXT`);
} catch (error) {
  // column already exists, that's fine, ignore
}
function categorizeError(errorOutput) {
  const text = errorOutput.toLowerCase();

  if (
    text.includes("cannot read properties of undefined") &&
    text.match(/\[\d+\]/)
  ) {
    return "array-bounds";
  }
  if (text.includes("is not defined")) {
    return "undefined-variable";
  }
  if (text.includes("is not a function")) {
    return "wrong-type-called";
  }
  if (text.includes("unexpected token") || text.includes("syntaxerror")) {
    return "syntax-error";
  }
  if (text.includes("cannot read properties of null")) {
    return "null-reference";
  }

  return "other";
}
export function recordMistake(filePath, errorOutput) {
  const category = categorizeError(errorOutput);

  const stmt = db.prepare(`
    INSERT INTO mistakes (filePath, errorOutput, category, createdAt)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(
    filePath,
    errorOutput,
    category,
    new Date().toISOString(),
  );
  return { id: result.lastInsertRowid, category };
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
export function checkRecurring(category) {
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM mistakes WHERE category = ?
  `);
  const result = stmt.get(category);
  return result.count;
}