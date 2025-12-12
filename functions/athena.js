// /functions/athena.js
export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env?.OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing OPENAI_API_KEY in environment variables." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

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

  const instructions =
    "Είσαι η Αθηνά, ο ψηφιακός ασφαλιστικός βοηθός της IL Insurance στην Ελλάδα. " +
    "Απαντάς σύντομα, καθαρά και σε απλά ελληνικά, με επαγγελματικό ύφος. " +
    "Εξηγείς ασφαλιστικά προϊόντα (υγεία, ζωή, περιουσία, αυτοκίνητο, αστική ευθύνη, αποταμιευτικά) " +
    "και καθοδηγείς τον χρήστη στα επόμενα βήματα. " +
    "Δεν δίνεις νομικές συμβουλές και δεν υπόσχεσαι αποζημιώσεις ή εγκρίσεις. " +
    "Αν λείπουν στοιχεία, κάνεις 2–4 στοχευμένες ερωτήσεις για να καταλάβεις ανάγκες/προϋπολογισμό/περιορισμούς. " +
    "Αν κάτι ξεφεύγει από την αρμοδιότητά σου ή χρειάζεται ανθρώπινο έλεγχο, ζητάς να επικοινωνήσει με τον ασφαλιστικό σύμβουλο.";

  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5.1-mini",
        instructions,
        input: userMessage,
        store: false
      })
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      // Μην διαρρέουν λεπτομέρειες στον πελάτη – αλλά να φαίνεται καθαρά ότι είναι server θέμα.
      console.error("OpenAI error:", data);
      return new Response(
        JSON.stringify({ error: "Upstream AI error" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const replyText = data?.output_text ?? "Δεν μπόρεσα να απαντήσω. Προσπάθησε ξανά.";
    return new Response(
      JSON.stringify({ reply: replyText }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Athena error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
