// /functions/athena.js
import OpenAI from "openai";

export async function onRequestPost(context) {
  const { request, env } = context;

  // Ασφάλεια: αν δεν έχεις ορίσει το env var στο Cloudflare Pages, θα πέφτει εδώ καθαρά.
  if (!env?.OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing OPENAI_API_KEY in environment variables." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  try {
    // Αν έρθει κάτι μη-JSON, να μην σκάει "βουβά".
    let body = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    const userMessage = (body?.message ?? "").toString().trim();

    if (!userMessage) {
      return new Response(
        JSON.stringify({ error: "Empty message" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // ΟΔΗΓΙΕΣ ΑΘΗΝΑΣ (copy–paste/τελική μορφή)
    const instructions =
      "Είσαι η Αθηνά, ο ψηφιακός ασφαλιστικός βοηθός της IL Insurance στην Ελλάδα. " +
      "Απαντάς σύντομα, καθαρά και σε απλά ελληνικά, με επαγγελματικό ύφος. " +
      "Εξηγείς ασφαλιστικά προϊόντα (υγεία, ζωή, περιουσία, αυτοκίνητο, αστική ευθύνη, αποταμιευτικά) " +
      "και καθοδηγείς τον χρήστη στα επόμενα βήματα. " +
      "Δεν δίνεις νομικές συμβουλές και δεν υπόσχεσαι αποζημιώσεις ή εγκρίσεις. " +
      "Αν λείπουν στοιχεία, κάνεις 2–4 στοχευμένες ερωτήσεις για να καταλάβεις ανάγκες/προϋπολογισμό/περιορισμούς. " +
      "Αν κάτι ξεφεύγει από την αρμοδιότητά σου ή χρειάζεται ανθρώπινο έλεγχο, ζητάς να επικοινωνήσει με τον ασφαλιστικό σύμβουλο.";

    const response = await client.responses.create({
      model: "gpt-5.1-mini",
      instructions,
      input: userMessage,
      store: false
    });

    const replyText =
      (response && response.output_text) ? response.output_text : "Δεν μπόρεσα να απαντήσω. Προσπάθησε ξανά.";

    return new Response(
      JSON.stringify({ reply: replyText }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Athena error:", err);

    // Πιο καθαρό μήνυμα προς το frontend, χωρίς να διαρρέουν λεπτομέρειες.
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
