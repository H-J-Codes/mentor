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
try {
  db.exec(`ALTER TABLE mistakes ADD COLUMN category TEXT`);
} catch (error) {
  // column already exists, that's fine, ignore
}
try {
  db.exec(`ALTER TABLE mistakes ADD COLUMN concept TEXT`);
} catch (error) {
  // already exists, ignore
}
const CATEGORY_TO_CONCEPT = {
  "array-bounds": "boundary-conditions",
  "loop-boundary": "boundary-conditions",
  "undefined-variable": "variable-scope",
  "null-reference": "variable-scope",
  "wrong-type-called": "type-mismatches",
  "syntax-error": "syntax-fundamentals",
  "infinite-recursion": "control-flow",
  other: "general",
};

function getConcept(category) {
  return CATEGORY_TO_CONCEPT[category] || "general";
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
  if (text.includes("maximum call stack size exceeded")) {
    return "infinite-recursion";
  }

  return "other";
}
export function recordMistake(filePath, errorOutput) {
  const category = categorizeError(errorOutput);
  const concept = getConcept(category);

  const stmt = db.prepare(`
    INSERT INTO mistakes (filePath, errorOutput, category, concept, createdAt)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    filePath,
    errorOutput,
    category,
    concept,
    new Date().toISOString(),
  );
  return { id: result.lastInsertRowid, category, concept };
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
export function checkConceptRecurring(concept) {
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM mistakes WHERE concept = ?
  `);
  const result = stmt.get(concept);
  return result.count;
}
export function getStats() {
  const totalStmt = db.prepare(`SELECT COUNT(*) as total FROM mistakes`);
  const total = totalStmt.get().total;

  const solvedAloneStmt = db.prepare(
    `SELECT COUNT(*) as count FROM mistakes WHERE solvedAlone = 1`,
  );
  const solvedAlone = solvedAloneStmt.get().count;

  const avgHintsStmt = db.prepare(
    `SELECT AVG(hintsUsed) as avg FROM mistakes WHERE hintsUsed > 0`,
  );
  const avgHintsResult = avgHintsStmt.get().avg;
  const avgHints = avgHintsResult ? Math.round(avgHintsResult * 10) / 10 : 0;

  const topCategoriesStmt = db.prepare(`
    SELECT category, COUNT(*) as count
    FROM mistakes
    WHERE category IS NOT NULL
    GROUP BY category
    ORDER BY count DESC
    LIMIT 3
  `);
  const topCategories = topCategoriesStmt.all();

  const topConceptsStmt = db.prepare(`
    SELECT concept, COUNT(*) as count
    FROM mistakes
    WHERE concept IS NOT NULL AND concept != 'general'
    GROUP BY concept
    ORDER BY count DESC
    LIMIT 3
  `);
  const topConcepts = topConceptsStmt.all();

  return {
    total,
    solvedAlone,
    solvedAlonePercent: total > 0 ? Math.round((solvedAlone / total) * 100) : 0,
    avgHints,
    topCategories,
    topConcepts,
  };
}