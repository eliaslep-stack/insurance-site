// /functions/athena.js
// ΑΠΛΗ ΔΟΚΙΜΑΣΤΙΚΗ ΕΚΔΟΣΗ ΧΩΡΙΣ OpenAI ΓΙΑ ΝΑ ΔΟΥΜΕ ΑΝ ΔΟΥΛΕΥΕΙ ΤΟ ROUTE

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function onRequest(context) {
  const { request } = context;

  // Δεχόμαστε μόνο POST
  if (request.method !== "POST") {
    return jsonResponse({ reply: "Only POST is allowed." }, 405);
  }

  // Διαβάζουμε το body ως JSON
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ reply: "Σφάλμα: invalid JSON από τον browser." }, 400);
  }

  const userMessage = (body && body.message ? String(body.message) : "").trim();

  if (!userMessage) {
    return jsonResponse({
      reply: "Παρακαλώ γράψε την ερώτησή σου για την ασφάλιση πριν πατήσεις Αποστολή."
    }, 400);
  }

  // ΠΟΛΥ ΑΠΛΗ ΑΠΑΝΤΗΣΗ – ΜΟΝΟ ΓΙΑ ΤΕΣΤ
  const text =
    "Έλαβα την ερώτησή σου: «" + userMessage + "».\n\n" +
    "Προς το παρόν τρέχω σε δοκιμαστική λειτουργία χωρίς σύνδεση στο OpenAI, " +
    "απλώς για να επιβεβαιώσουμε ότι ο ψηφιακός οδηγός λειτουργεί τεχνικά.";

  return jsonResponse({ reply: text });
}
 
