// /functions/athena.js  (Cloudflare Pages Function)
// Supports: text-only JSON OR multipart/form-data with an uploaded PDF/image.
// Uploads file to OpenAI Files API (purpose: "user_data") and sends file_id to Responses API.

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env.OPENAI_API_KEY) {
      return json({ error: "Missing OPENAI_API_KEY in Cloudflare Variables" }, 500);
    }

    const contentType = request.headers.get("content-type") || "";

    let userMessage = "";
    let uploadedFile = null; // File (Blob-like) from formData
    let uploadedFileName = "";
    let uploadedFileType = "";

    if (contentType.includes("multipart/form-data")) {
      const fd = await request.formData();
      userMessage = String(fd.get("message") || "").trim();

      const f = fd.get("file");
      if (f && typeof f === "object" && typeof f.arrayBuffer === "function") {
        uploadedFile = f;
        uploadedFileName = f.name || "upload";
        uploadedFileType = f.type || "application/octet-stream";
      }
    } else {
      const body = await request.json().catch(() => ({}));
      userMessage = String(body?.message || "").trim();
    }

    if (!userMessage) {
      return json({ error: "Empty message" }, 400);
    }

    const instructions =
      "Είσαι η Αθηνά, ο ψηφιακός ασφαλιστικός βοηθός της IL Insurance στην Ελλάδα. " +
      "Απαντάς σύντομα, καθαρά και σε απλά ελληνικά. " +
      "Εξηγείς ασφαλιστικά προϊόντα (υγεία, ζωή, περιουσία, αυτοκίνητο, αστική ευθύνη, αποταμιευτικά) " +
      "και καθοδηγείς τον χρήστη στα επόμενα βήματα χωρίς νομικές υπερβολές. " +
      "Αν κάτι ξεφεύγει από την αρμοδιότητά σου, ζητάς να επικοινωνήσει με τον ασφαλιστικό σύμβουλο. " +
      "Αν ο χρήστης ανέβασε έγγραφο/φωτογραφίες, διάβασέ τα και: (1) εξήγησε συνοπτικά τι βλέπεις, (2) βρες κρίσιμους όρους/καλύψεις/εξαιρέσεις/απαλλαγές, (3) πες καθαρά τι ΔΕΝ μπορείς να επιβεβαιώσεις χωρίς τις πλήρεις Γενικές/Ειδικές Συνθήκες.";

    // Optional: upload file to OpenAI and get file_id
    let fileId = null;

    if (uploadedFile) {
      // Basic validation: allow pdf + images, 1–5MB (you asked this range)
      const size = Number(uploadedFile.size || 0);
      const maxBytes = 5 * 1024 * 1024;

      const allowed =
        uploadedFileType === "application/pdf" ||
        uploadedFileType.startsWith("image/");

      if (!allowed) {
        return json({ error: "Allowed file types: PDF or images (jpg/png/webp)." }, 400);
      }
      if (size <= 0 || size > maxBytes) {
        return json({ error: "File size must be between 1 byte and 5MB." }, 400);
      }

      // Upload to OpenAI Files API as user_data
      // Docs: purpose="user_data", then use file_id in Responses input. :contentReference[oaicite:1]{index=1}
      const up = new FormData();
      up.append("purpose", "user_data");
      up.append("file", uploadedFile, uploadedFileName);

      const upRes = await fetch("https://api.openai.com/v1/files", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: up,
      });

      const upJson = await upRes.json().catch(() => ({}));

      if (!upRes.ok) {
        const msg = upJson?.error?.message || upJson?.message || `File upload error (${upRes.status})`;
        return json({ error: msg }, 500);
      }

      fileId = upJson?.id || null;
      if (!fileId) {
        return json({ error: "Upload succeeded but missing file id." }, 500);
      }
    }

    // Build Responses "input" with optional input_file
    const contentParts = [];
    if (fileId) {
      contentParts.push({ type: "input_file", file_id: fileId });
    }
    contentParts.push({ type: "input_text", text: userMessage });

    const payload = {
      // Σημείωση: PDFs δουλεύουν με vision-capable μοντέλα. :contentReference[oaicite:2]{index=2}
      // Αν θέλεις φθηνότερο, δοκίμασε μετά πάλι "gpt-4.1-mini" — αλλά πρώτα να δουλέψει σταθερά.
      model: "gpt-4.1",
      instructions,
      input: [{ role: "user", content: contentParts }],
      // store: false,
    };

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const msg =
        data?.error?.message ||
        data?.message ||
        `OpenAI error (${upstream.status})`;
      return json({ error: msg }, 500);
    }

    const replyText =
      (typeof data.output_text === "string" && data.output_text.trim())
        ? data.output_text.trim()
        : "Δεν μπόρεσα να απαντήσω. Προσπάθησε ξανά.";

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
