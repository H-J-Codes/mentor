import express from "express";
import fs from "fs";
import path from "path";
import { askAI } from "./ai.js";
import {
  recordMistake,
  getAllMistakes,
  incrementHints,
  markSolved,
  checkRecurring,
  checkConceptRecurring,
  getStats,
} from "./db.js";
const app = express();
const PORT = 3000;

app.use(express.json());

// Folders we never want to look inside — huge, auto-generated, or irrelevant to real code
const IGNORE_FOLDERS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "__pycache__",
  ".vscode",
];

function scanDirectory(dirPath, depth = 0, maxDepth = 3) {
  if (depth > maxDepth) {
    return { name: path.basename(dirPath), type: "folder", truncated: true };
  }

  const items = fs.readdirSync(dirPath, { withFileTypes: true });
  const children = [];

  for (const item of items) {
    if (IGNORE_FOLDERS.includes(item.name)) {
      continue;
    }

    const fullPath = path.join(dirPath, item.name);

    if (item.isDirectory()) {
      children.push(scanDirectory(fullPath, depth + 1, maxDepth));
    } else {
      children.push({ name: item.name, type: "file" });
    }
  }

  return {
    name: path.basename(dirPath),
    type: "folder",
    children: children,
  };
}
// Tries to find "arrayName[someIndex]" in the failing line, and checks if that index is genuinely valid
function analyzeArrayBoundsError(filePath, codeLine) {
  if (!codeLine) return null;

  const accessMatch = codeLine.match(/(\w+)\[(\d+)\]/); // finds something like numbers[5]
  if (!accessMatch) return null;

  const arrayName = accessMatch[1];
  const usedIndex = parseInt(accessMatch[2], 10);

  try {
    const fileContent = fs.readFileSync(filePath, "utf-8");
    // finds the array's actual declaration, e.g. "const numbers = [1, 2, 3];"
    const arrayDeclarationRegex = new RegExp(`${arrayName}\\s*=\\s*\\[([^\\]]*)\\]`);
    const declarationMatch = fileContent.match(arrayDeclarationRegex);

    if (!declarationMatch) return null;

    const items = declarationMatch[1].split(",").filter(item => item.trim() !== "");
    const actualLength = items.length;

    if (usedIndex >= actualLength) {
      return {
        arrayName,
        usedIndex,
        actualLength,
        validIndexExample: actualLength - 1 // the real, genuinely valid last index
      };
    }
  } catch {
    return null;
  }

  return null;
}
// Grabs the specific line the error happened on, straight from the real file
function getCodeContext(filePath, output) {
  try {
    const lineMatch = output.match(/:(\d+)/);
    if (!lineMatch) return null;

    const lineNumber = parseInt(lineMatch[1], 10);
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const lines = fileContent.split("\n");

    return lines[lineNumber - 1]?.trim() || null;
  } catch {
    return null;
  }
}


app.get("/ping", (req, res) => {
  res.json({ message: "pong" });
});
app.get("/mistakes", (req, res) => {
  const mistakes = getAllMistakes();
  res.json(mistakes);
});
app.get("/stats", (req, res) => {
  const stats = getStats();
  res.json(stats);
});
app.post("/scan", (req, res) => {
  const projectPath = req.body.path;

  if (!projectPath) {
    return res.status(400).json({ error: "No path provided" });
  }

  try {
    const topLevelItems = fs.readdirSync(projectPath);
    const hasPackageJson = topLevelItems.includes("package.json");
    const hasRequirementsTxt = topLevelItems.includes("requirements.txt");

    let projectType = "unknown";
    if (hasPackageJson) projectType = "Node.js / JavaScript";
    if (hasRequirementsTxt) projectType = "Python";

    const structure = scanDirectory(projectPath);

    res.json({
      path: projectPath,
      projectType: projectType,
      structure: structure,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Could not read that folder", details: error.message });
  }
});

app.post("/error", async (req, res) => {
  const { filePath, hasError, output } = req.body;

  if (hasError) {
    console.log("🐛 ERROR CAUGHT in:", filePath);
    const {
      id: mistakeId,
      category,
      concept,
    } = recordMistake(filePath, output);
    const occurrenceCount = checkRecurring(category);
    const conceptCount = checkConceptRecurring(concept);
    console.log(
      `📝 Saved to memory as mistake #${mistakeId} (category: ${category}, seen ${occurrenceCount}x)`,
    );
    const codeLine = getCodeContext(filePath, output);

    const prompt = `A beginner has this error:

    ${output}
    ${codeLine ? `Failing line: ${codeLine}` : ""}

    Write ONE short question (under 15 words) that makes them think about the problem themselves.

    STRICT RULES:
    - Output ONLY the question. Nothing else.
    - NEVER explain what the error means.
    - NEVER say what's wrong.
    - NEVER use the words "fix", "should", "ensure", "undefined", "TypeError".
    - NEVER give code.

    Example of correct style: "What do you expect to be at that position in the list?"`;
    try {
      const explanation = await askAI(prompt);
      console.log("🧑‍🏫 MENTOR explains:", explanation);
      res.json({
        received: true,
        explanation: explanation,
        mistakeId: mistakeId,
        isRecurring: occurrenceCount >= 3,
        occurrenceCount: occurrenceCount,
        category: category,
        isConceptRecurring: conceptCount >= 3,
        conceptCount: conceptCount,
        concept: concept,
      });
    } catch (aiError) {
      console.log("Could not reach the AI:", aiError.message);
      res.json({ received: true, explanation: null });
    }
  } else {
    console.log("✅ Ran successfully:", filePath);
    res.json({ received: true });
  }
});function buildHintPrompt(level, output, codeLine) {
  const context = `Error:\n${output}\n${codeLine ? `Failing line: ${codeLine}\n` : ""}`;

  const levelInstructions = {
    1: `Write ONE short question (under 15 words) that makes them think about the problem themselves.
STRICT RULES: Output ONLY the question. NEVER explain the error. NEVER use "fix", "should", "undefined", "TypeError". NEVER give code.`,

    2: `Name the ONE programming CONCEPT this error relates to (e.g. "array bounds", "null values", "type mismatch") and explain that concept generally, in 1-2 sentences.
STRICT RULES: Do NOT mention their specific variable names. Do NOT say what's wrong in THEIR code. Do NOT give code.`,

    3: `Point them toward WHERE in their code to look, in 1-2 sentences, using their actual variable/line details.
STRICT RULES: Do NOT explain the exact fix. Do NOT give code.`,

    4: `The root cause is that the code is trying to access an index that does not exist in the array — the index used is out of range for that array's actual length. Given this exact known cause, write the corrected code that fixes it directly (e.g. using a valid, in-range index). Briefly restate the cause in 1 sentence, then show the fixed code. Do NOT invent a different cause.`,
  };

  return `You are a coding mentor. A beginner has this error:

${context}

${levelInstructions[level] || levelInstructions[4]}`;
}

app.post("/hint", async (req, res) => {
  const { filePath, output, level, mistakeId } = req.body; // added mistakeId here

  if (mistakeId) {
    incrementHints(mistakeId);
  }
  const codeLine = getCodeContext(filePath, output);

  let prompt;
  if (level === 4) {
    const analysis = analyzeArrayBoundsError(filePath, codeLine);

    if (analysis) {
      prompt = `A beginner's code has this line:
${codeLine}

FACT (already verified, do not question this): the array "${analysis.arrayName}" has ${analysis.actualLength} items, so valid indexes are 0 to ${analysis.validIndexExample}. The code used index ${analysis.usedIndex}, which does not exist.

Write 1 sentence explaining this fact simply, then show the corrected line of code using index ${analysis.validIndexExample} instead of ${analysis.usedIndex}. Do not use any other index number.`;
    } else {
      // fallback to the old approach if our detective function couldn't figure it out
      prompt = buildHintPrompt(level, output, codeLine);
    }
  } else {
    prompt = buildHintPrompt(level, output, codeLine);
  }

  try {
    const hint = await askAI(prompt);
    res.json({ hint, level });
  } catch (error) {
    res.json({ hint: null, level });
  }
});

app.post("/solved", (req, res) => {
  const { mistakeId } = req.body;
  if (mistakeId) {
    markSolved(mistakeId);
    console.log(`✅ Mistake #${mistakeId} marked as solved`);
  }
  res.json({ received: true });
});

app.listen(PORT, () => {
  console.log(`MENTOR CORE is running at http://localhost:${PORT}`);
});
