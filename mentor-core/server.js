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

    const prompt = `You are a coding mentor. A beginner got this error:

${output}

${codeLine ? `The actual line of code that failed is:\n${codeLine}\n` : ""}

Rules you MUST follow:
- Explain what the error MEANS in 1 sentence.
- Explain why it likely happened in 1 sentence.
- NEVER mention how to fix it.
- NEVER write any code.
- NEVER use words like "fix", "should", "ensure", "add a check", or "solution".

Keep your entire answer under 40 words.`;

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

app.listen(PORT, () => {
  console.log(`MENTOR CORE is running at http://localhost:${PORT}`);
});
