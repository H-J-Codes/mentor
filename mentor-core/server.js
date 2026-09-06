import express from "express";

const app = express();
const PORT = 3000;

// A simple "health check" route — if this responds, the server is alive
app.get("/ping", (req, res) => {
  res.json({ message: "pong" });
});

app.listen(PORT, () => {
  console.log(`MENTOR CORE is running at http://localhost:${PORT}`);
});
