// /functions/api/chatkit/session.js
// Cloudflare Pages Function – δημιουργεί ChatKit session και δίνει client_secret

export async function onRequestPost(context) {
  const { env } = context;

  const apiKey = env.OPENAI_API_KEY;          // ✅ ίδιο όνομα με το Cloudflare
  const workflowId = env.CHATKIT_WORKFLOW_ID; // ✅ ίδιο όνομα με το Cloudflare

  if (!apiKey || !workflowId) {
    return new Response(
      JSON.stringify({ error: "Missing OPENAI_API_KEY or CHATKIT_WORKFLOW_ID" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const openaiRes = await fetch("https://api.openai.com/v1/chatkit/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Beta": "chatkit_beta=v1",
      },
      body: JSON.stringify({
        workflow: { id: workflowId },
        user: crypto.randomUUID(),
      }),
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      console.error("OpenAI ChatKit error:", data);
      return new Response(
        JSON.stringify({ error: "OpenAI ChatKit error" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const client_secret = data.client_secret;
    if (!client_secret) {
      return new Response(
        JSON.stringify({ error: "No client_secret in response" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ client_secret }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("ChatKit session function error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
