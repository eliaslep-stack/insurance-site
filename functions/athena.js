// /functions/athena.js  (Cloudflare Pages Function)
// No external imports — uses fetch to call OpenAI Responses API directly.

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json().catch(() => ({}));
    const userMessage = String(body?.message ?? "").trim();

    if (!userMessage) {
      return json({ error: "Empty message" }, 400);
    }

    if (!env.OPENAI_API_KEY) {
      return json({ error: "Missing OPENAI_API_KEY in Cloudflare Variables" }, 500);
    }

    const instructions =
      "Είσαι η Αθηνά, ο ψηφιακός ασφαλιστικός βοηθός της IL Insurance στην Ελλάδα. " +
      "Απαντάς σύντομα, καθαρά και σε απλά ελληνικά. " +
      "Εξηγείς ασφαλιστικά προϊόντα (υγεία, ζωή, περιουσία, αυτοκίνητο, αστική ευθύνη, αποταμιευτικά) " +
      "και καθοδηγείς τον χρήστη στα επόμενα βήματα χωρίς νομικές υπερβολές. " +
      "Αν κάτι ξεφεύγει από την αρμοδιότητά σου, ζητάς να επικοινωνήσει με τον ασφαλιστικό σύμβουλο.";

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        instructions,
        input: userMessage,
        // store: false,
      }),
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const msg =
        data?.error?.message ||
        data?.message ||
        `OpenAI error (${upstream.status})`;
      return json({ error: msg }, 500);
    }

    // Robust reply extraction (covers output_text and structured output[])
    let replyText = "";

    if (typeof data?.output_text === "string") {
      replyText = data.output_text.trim();
    }

    if (!replyText && Array.isArray(data?.output)) {
      for (const item of data.output) {
        // common shape: { type: "message", content: [ { type:"output_text", text:"..." } ] }
        if (item?.type === "message" && Array.isArray(item?.content)) {
          for (const c of item.content) {
            if (c?.type === "output_text" && typeof c?.text === "string") {
              replyText = c.text.trim();
              break;
            }
          }
        }
        if (replyText) break;
      }
    }

    if (!replyText) {
      replyText = "Δεν μπόρεσα να απαντήσω. Προσπάθησε ξανά.";
    }

    return json({ reply: replyText }, 200);
  } catch (err) {
    const msg = err?.message ? String(err.message) : "Internal error";
    return json({ error: msg }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
