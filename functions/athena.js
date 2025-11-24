// /functions/athena.js

export async function onRequest(context) {
  const { request, env } = context;

  // Επιτρέπουμε μόνο POST
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Διαβάζουμε το JSON body
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response("Invalid JSON", { status: 400 });
  }

  const userMessage = body.message || "";

  if (!userMessage.trim()) {
    return new Response(
      JSON.stringify({ error: "Empty message" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Παίρνουμε το API key από το Cloudflare Environment
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Missing API key on server" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // ΕΔΩ ΒΑΖΕΙΣ ΤΙΣ ΟΔΗΓΙΕΣ ΤΗΣ ΑΘΗΝΑΣ
  const systemPrompt = `
ΕΔΩ επικόλλησε ΟΛΟ το κείμενο από τα "Instructions" του IL Digital Insurance Assistant.
Σβήσε αυτή τη γραμμή όταν το κάνεις.
  `;

  // Ζητάμε απάντηση από το OpenAI
  const payload = {
    model: "gpt-5.1-mini",
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ]
  };

  const apiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!apiResponse.ok) {
    const text = await apiResponse.text();
    return new Response(
      JSON.stringify({ error: "OpenAI error", details: text }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const data = await apiResponse.json();
  const reply = data.output_text || "";

  return new Response(
    JSON.stringify({ reply }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
