import express from "express";
import fs from "fs";

const app = express();
const PORT = 3000;

app.use(express.json()); // lets our server understand JSON sent to it

app.get("/ping", (req, res) => {
  res.json({ message: "pong" });
});

app.post("/scan", (req, res) => {
  const projectPath = req.body.path;

  if (!projectPath) {
    return res.status(400).json({ error: "No path provided" });
  }

  try {
    const items = fs.readdirSync(projectPath); // list everything in that folder
    const hasPackageJson = items.includes("package.json");
    const hasRequirementsTxt = items.includes("requirements.txt");

    let projectType = "unknown";
    if (hasPackageJson) projectType = "Node.js / JavaScript";
    if (hasRequirementsTxt) projectType = "Python";

    res.json({
      path: projectPath,
      items: items,
      projectType: projectType,
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
