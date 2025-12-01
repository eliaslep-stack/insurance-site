// /functions/athena.js  (Cloudflare Pages Function)

export const onRequest = async (context) => {
  const { request, env } = context;

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const apiKey = env.OPENAI_API_KEY;
  const workflowId = env.WORKFLOW_ID; // βάλε αυτό στο Cloudflare env

  if (!apiKey || !workflowId) {
    return new Response("Missing OPENAI_API_KEY or WORKFLOW_ID", {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const openaiRes = await fetch("https://api.openai.com/v1/chatkit/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "OpenAI-Beta": "chatkit_beta=v1",
    },
    body: JSON.stringify({
      workflow: { id: workflowId },   // π.χ. "wf_6925d4bec5f88..."
      user: crypto.randomUUID(),
    }),
  });

  const text = await openaiRes.text();

  if (!openaiRes.ok) {
    return new Response(text, {
      status: openaiRes.status,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const data = JSON.parse(text);

  return new Response(JSON.stringify({ client_secret: data.client_secret }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
};
