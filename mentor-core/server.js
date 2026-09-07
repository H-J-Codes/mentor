import express from "express";
import fs from "fs";
import path from "path";

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
      continue; // skip this one entirely, don't even list it
    }

    const fullPath = path.join(dirPath, item.name);

    if (item.isDirectory()) {
      // recursion: scanDirectory calls itself for this subfolder
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

app.listen(PORT, () => {
  console.log(`MENTOR CORE is running at http://localhost:${PORT}`);
});
