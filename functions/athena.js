// /functions/athena.js  (Cloudflare Pages Function)
// No external imports — uses fetch to call OpenAI API directly.

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json().catch(() => ({}));
    const userMessage = (body?.message || "").trim();

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

    // Call OpenAI Responses API
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.1-mini",
        instructions,
        input: userMessage,
        // store: false, // αν θέλεις να μην κρατάει logs
      }),
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      // Επιστρέφουμε ΠΡΑΓΜΑΤΙΚΟ μήνυμα λάθους (billing/quota/invalid_key κλπ)
      const msg =
        data?.error?.message ||
        data?.message ||
        `OpenAI error (${upstream.status})`;
      return json({ error: msg }, 500);
    }

    const replyText =
      (data && typeof data.output_text === "string" && data.output_text.trim()) ||
      "Δεν μπόρεσα να απαντήσω. Προσπάθησε ξανά.";

    return json({ reply: replyText }, 200);
  } catch (err) {
    // Τώρα θα βλέπεις ακριβές σφάλμα αντί για “Server error” στο σκοτάδι
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
