import express from "express";
import fs from "fs";
import path from "path";
import { askAI } from "./ai.js";

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
      res.json({ received: true, explanation: explanation });
    } catch (aiError) {
      console.log("Could not reach the AI:", aiError.message);
      res.json({ received: true, explanation: null });
    }
  } else {
    console.log("✅ Ran successfully:", filePath);
    res.json({ received: true });
  }
});
app.post("/hint", async (req, res) => {
  const { filePath, output, level } = req.body;
  const codeLine = getCodeContext(filePath, output);

  const prompt = `You are a coding mentor giving Hint Level ${level} out of 7 for this error:

${output}
${codeLine ? `Failing line: ${codeLine}` : ""}

Hint Level 1 = just a gentle NUDGE. Ask a short guiding question. Do NOT explain the error, do NOT mention the concept name, do NOT give any code. One sentence only.`;

  try {
    const hint = await askAI(prompt);
    res.json({ hint });
  } catch (error) {
    res.json({ hint: null });
  }
});

app.listen(PORT, () => {
  console.log(`MENTOR CORE is running at http://localhost:${PORT}`);
});
