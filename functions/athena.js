// /functions/athena.js  (Cloudflare Pages Function)
// Uses fetch to call OpenAI Responses API directly (no external imports).

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json().catch(() => ({}));
    const userMessage = String(body?.message || "").trim();

    if (!userMessage) return json({ error: "Empty message" }, 400);
    if (!env.OPENAI_API_KEY) return json({ error: "Missing OPENAI_API_KEY in Cloudflare Variables" }, 500);

    const instructions =
      "Είσαι η Αθηνά, ο ψηφιακός ασφαλιστικός βοηθός της IL Insurance στην Ελλάδα. " +
      "Απαντάς σύντομα, καθαρά και σε απλά ελληνικά. " +
      "Εξηγείς ασφαλιστικά προϊόντα (υγεία, ζωή, περιουσία, αυτοκίνητο, αστική ευθύνη, αποταμιευτικά) " +
      "και καθοδηγείς τον χρήστη στα επόμενα βήματα χωρίς νομικές υπερβολές. " +
      "Αν κάτι ξεφεύγει από την αρμοδιότητά σου, ζητάς να επικοινωνήσει με τον ασφαλιστικό σύμβουλο.";

    // Hard timeout ώστε να μην "κρεμάει" το widget
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 25000);

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        instructions,
        input: userMessage,
        temperature: 0.3,
        max_output_tokens: 350,
      }),
    }).finally(() => clearTimeout(t));

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const msg =
        data?.error?.message ||
        data?.message ||
        `OpenAI error (${upstream.status})`;
      return json({ error: msg }, 500);
    }

    const replyText = extractReplyText(data);

    if (!replyText) {
      // Αυτό είναι το κρίσιμο: αν για οποιονδήποτε λόγο δεν βγάλουμε κείμενο, στέλνουμε διαγνωστικό
      return json(
        {
          error:
            "Η OpenAI επέστρεψε απάντηση χωρίς αναγνώσιμο κείμενο. (Παρακαλώ δοκίμασε ξανά.)",
          debug: {
            has_output_text: typeof data?.output_text === "string",
            output_len: Array.isArray(data?.output) ? data.output.length : 0,
          },
        },
        500
      );
    }

    return json({ reply: replyText }, 200);
  } catch (err) {
    const msg =
      err?.name === "AbortError"
        ? "Timeout: ο server άργησε να απαντήσει. Δοκίμασε ξανά."
        : (err?.message ? String(err.message) : "Internal error");
    return json({ error: msg }, 500);
  }
}

function extractReplyText(data) {
  // 1) Fast path: output_text (συχνά υπάρχει)
  if (data && typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  // 2) Fallback: ψάχνουμε σε output[] -> message/content -> output_text
  if (!data || !Array.isArray(data.output)) return "";

  for (const item of data.output) {
    // αρκετές φορές το item είναι { type: "message", content: [...] }
    if (item?.type === "message" && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c?.type === "output_text" && typeof c.text === "string" && c.text.trim()) {
          return c.text.trim();
        }
      }
    }

    // κάποιες υλοποιήσεις έχουν content σε άλλα σημεία
    if (Array.isArray(item?.content)) {
      for (const c of item.content) {
        if (c?.type === "output_text" && typeof c.text === "string" && c.text.trim()) {
          return c.text.trim();
        }
      }
    }
  }

  return "";
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
