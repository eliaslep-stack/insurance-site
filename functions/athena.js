// /functions/athena.js  (Cloudflare Pages Function)
// Supports BOTH JSON and multipart/form-data (file upload).
// Uploads file to OpenAI Files API, then calls Responses API with input_file.

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env.OPENAI_API_KEY) {
      return json({ error: "Missing OPENAI_API_KEY in Cloudflare Variables" }, 500);
    }

    const ct = (request.headers.get("content-type") || "").toLowerCase();

    let userMessage = "";
    let file = null; // File (from formData)

    if (ct.includes("multipart/form-data")) {
      const form = await request.formData();
      userMessage = String(form.get("message") || "").trim();
      file = form.get("file"); // may be null
    } else {
      const body = await request.json().catch(() => ({}));
      userMessage = String(body?.message || "").trim();
    }

    const hasFile = !!file && typeof file === "object" && typeof file.arrayBuffer === "function";

    // Fallback: αν υπάρχει αρχείο και δεν υπάρχει κείμενο, δημιουργούμε εμείς prompt
    if (!userMessage && hasFile) {
      userMessage =
        "Ανάλυσε το συνημμένο αρχείο και δώσε καθαρή εικόνα για: βασικές καλύψεις, απαλλαγές, εξαιρέσεις, προϋποθέσεις, σημεία-παγίδες και τι πρέπει να ρωτήσει ο πελάτης πριν προχωρήσει.";
    }

    if (!userMessage && !hasFile) {
      return json({ error: "Empty message" }, 400);
    }

    // Σκληροί έλεγχοι αρχείου (επαγγελματική συμπεριφορά)
    if (hasFile) {
      const maxBytes = 10 * 1024 * 1024; // 10MB
      if (file.size > maxBytes) {
        return json({ error: "Το αρχείο είναι πολύ μεγάλο (max 10MB)." }, 400);
      }

      const allowed = new Set([
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
      ]);

      if (!allowed.has(String(file.type || "").toLowerCase())) {
        return json({ error: "Μη υποστηριζόμενος τύπος αρχείου. Δεκτά: PDF, JPG, PNG, WEBP." }, 400);
      }
    }

    const instructions =
      "Είσαι η Αθηνά, ο ψηφιακός ασφαλιστικός βοηθός της IL Insurance στην Ελλάδα. " +
      "Απαντάς σύντομα, καθαρά και σε απλά ελληνικά. " +
      "Εξηγείς ασφαλιστικά προϊόντα (υγεία, ζωή, περιουσία, αυτοκίνητο, αστική ευθύνη, αποταμιευτικά) " +
      "και καθοδηγείς τον χρήστη στα επόμενα βήματα χωρίς νομικές υπερβολές. " +
      "Αν κάτι ξεφεύγει από την αρμοδιότητά σου, ζητάς να επικοινωνήσει με τον ασφαλιστικό σύμβουλο.";

    // 1) Αν υπάρχει αρχείο, το ανεβάζουμε πρώτα στο OpenAI και παίρνουμε file_id
    let fileId = null;

    if (hasFile) {
      const upController = new AbortController();
      const upTimer = setTimeout(() => upController.abort(), 25000);

      const fd = new FormData();
      fd.append("purpose", "assistants");
      fd.append("file", file, file.name || "upload");

      const up = await fetch("https://api.openai.com/v1/files", {
        method: "POST",
        signal: upController.signal,
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: fd,
      }).finally(() => clearTimeout(upTimer));

      const upData = await up.json().catch(() => ({}));

      if (!up.ok) {
        const msg = upData?.error?.message || upData?.message || `OpenAI file upload error (${up.status})`;
        return json({ error: msg }, 500);
      }

      fileId = upData?.id || null;
      if (!fileId) {
        return json({ error: "Το αρχείο ανέβηκε, αλλά δεν επιστράφηκε file id από την OpenAI." }, 500);
      }
    }

    // 2) Κλήση στο Responses API με input_text (+ input_file αν υπάρχει)
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 30000);

    const input = fileId
      ? [
          {
            role: "user",
            content: [
              { type: "input_text", text: userMessage },
              { type: "input_file", file_id: fileId },
            ],
          },
        ]
      : userMessage;

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
        input,
        temperature: 0.3,
        max_output_tokens: 450,
      }),
    }).finally(() => clearTimeout(t));

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const msg = data?.error?.message || data?.message || `OpenAI error (${upstream.status})`;
      return json({ error: msg }, 500);
    }

    const replyText = extractReplyText(data);

    if (!replyText) {
      return json(
        {
          error: "Η OpenAI επέστρεψε απάντηση χωρίς αναγνώσιμο κείμενο. (Παρακαλώ δοκίμασε ξανά.)",
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
        : err?.message
        ? String(err.message)
        : "Internal error";
    return json({ error: msg }, 500);
  }
}

function extractReplyText(data) {
  if (data && typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  if (!data || !Array.isArray(data.output)) return "";

  for (const item of data.output) {
    if (item?.type === "message" && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c?.type === "output_text" && typeof c.text === "string" && c.text.trim()) {
          return c.text.trim();
        }
      }
    }

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
