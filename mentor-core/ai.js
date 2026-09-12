const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL = "llama3.2:1b";

export async function askAI(prompt) {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.3,
      },
    }),
  });

  const data = await response.json();
  return data.response;
}
