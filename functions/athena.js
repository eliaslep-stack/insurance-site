// /functions/athena.js
import OpenAI from "openai";

export async function onRequestPost(context) {
  const { request, env } = context;

  const client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  });

  try {
    const body = await request.json();
    const userMessage = body?.message?.trim();

    if (!userMessage) {
      return new Response(
        JSON.stringify({ error: "Empty message" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // ΕΔΩ βάλε τις οδηγίες της Αθηνάς (copy–paste από το GPT σου)
    const instructions =
      "Είσαι η Αθηνά, ο ψηφιακός ασφαλιστικός βοηθός της IL Insurance στην Ελλάδα. " +
      "Απαντάς σύντομα, καθαρά και σε απλά ελληνικά. " +
      "Εξηγείς ασφαλιστικά προϊόντα (υγεία, ζωή, περιουσία, αυτοκίνητο, αστική ευθύνη, αποταμιευτικά) " +
      "και καθοδηγείς τον χρήστη στα επόμενα βήματα χωρίς νομικές υπερβολές. " +
      "Αν κάτι ξεφεύγει από την αρμοδιότητά σου, ζητάς να επικοινωνήσει με τον ασφαλιστικό σύμβουλο.";

    const response = await client.responses.create({
      model: "gpt-5.1-mini",
      instructions,
      input: userMessage,
      // αν δεν θες να κρατάει logs, βάλε: store: false,
    });

    const replyText = response.output_text ?? "Δεν μπόρεσα να απαντήσω. Προσπάθησε ξανά.";

    return new Response(
      JSON.stringify({ reply: replyText }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Athena error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
