export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const apiKey = env.OPENAI_API_KEY;
  const workflowId = env.CHATKIT_WORKFLOW_ID;

  if (!apiKey || !workflowId) {
    return new Response("Missing OpenAI configuration", { status: 500 });
  }

  const userId = crypto.randomUUID();

  const upstream = await fetch("https://api.openai.com/v1/chatkit/sessions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Beta": "chatkit_beta=v1",
    },
    body: JSON.stringify({
      workflow: { id: workflowId },
      user: userId
    }),
  });

  let data;
  try {
    data = await upstream.json();
  } catch {
    data = null;
  }

  if (!upstream.ok) {
    return new Response(JSON.stringify(data || { error: "ChatKit session error" }), {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ client_secret: data.client_secret }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
