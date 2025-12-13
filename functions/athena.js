// /functions/athena.js
// Cloudflare Pages Function
// ✔ Bullet-point enforced document analysis
// ✔ Keeps document context across turns using file_id

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env.OPENAI_API_KEY) {
      return json({ error: "Missing OPENAI_API_KEY" }, 500);
    }

    const ct = (request.headers.get("content-type") || "").toLowerCase();

    let userMessage = "";
    let file = null;
    let incomingFileId = null;

    // -------- Read request --------
    if (ct.includes("multipart/form-data")) {
      const form = await request.formData();
      userMessage = String(form.get("message") || "").trim();
      file = form.get("file");
      incomingFileId = String(form.get("file_id") || "").trim() || null;
    } else {
      const body = await request.json().catch(() => ({}));
      userMessage = String(body?.message || "").trim();
      incomingFileId = String(body?.file_id || "").trim() || null;
    }

    const hasFile =
      !!file && typeof file === "object" && typeof file.arrayBuffer === "function";

    const hasActiveFile = hasFile || !!incomingFileId;

    // -------- Hard fallback prompt --------
    if (!userMessage && hasActiveFile) {
      userMessage = "Ανάλυσε το έγγραφο.";
    }

    if (!userMessage && !hasActiveFile) {
      return json({ error: "Empty message" }, 400);
    }

    // -------- File validation --------
    if (hasFile) {
      if (file.size > 10 * 1024 * 1024) {
        return json({ error: "Το αρχείο είναι πολύ μεγάλο (max 10MB)." }, 400);
      }

      const allowed = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
      ];

      if (!allowed.includes(file.type)) {
        return json({ error: "Μη αποδεκτός τύπος αρχείου." }, 400);
      }
    }

    // -------- STRONG SYSTEM INSTRUCTIONS --------
    const instructions = `
Είσαι η Αθηνά, επαγγελματικός ασφαλιστικός σύμβουλος στην Ελλάδα.

ΑΝ ΥΠΑΡΧΕΙ ΕΓΓΡΑΦΟ:
ΑΠΑΝΤΑΣ ΥΠΟΧΡΕΩΤΙΚΑ ΜΕ ΤΗΝ ΠΑΡΑΚΑΤΩ ΔΟΜΗ.
ΑΠΑΓΟΡΕΥΕΤΑΙ ΝΑ ΓΡΑΨΕΙΣ ΠΑΡΑΓΡΑΦΟΥΣ.

ΜΟΡΦΗ ΑΠΑΝΤΗΣΗΣ (γράψε ΜΟΝΟ έτσι):

Καλύψεις:
• …

Απαλλαγές:
• …

Εξαιρέσεις:
• …

Προϋποθέσεις / Αναμονές:
• …

Σημεία-παγίδες:
• …

Επόμενα βήματα:
• …

ΑΝ ΔΕΝ ΥΠΑΡΧΕΙ ΕΓΓΡΑΦΟ:
Απάντα σύντομα και καθαρά.

Μίλα πάντα σε απλά ελληνικά.
`;

    // -------- Upload file only if NEW --------
    let fileId = incomingFileId || null;

    if (hasFile) {
      const fd = new FormData();
      fd.append("purpose", "assistants");
      fd.append("file", file, file.name || "document");

      const upload = await fetch("https://api.openai.com/v1/files", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: fd,
      });

      const upData = await upload.json().catch(() => ({}));

      if (!upload.ok || !upData?.id) {
        return json({ error: "Αποτυχία ανεβάσματος αρχείου." }, 500);
      }

      fileId = upData.id;
    }

    // -------- Build input --------
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

    // -------- Call OpenAI --------
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        instructions,
        input,
        temperature: 0.2,
        max_output_tokens: 500,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return json({ error: "Σφάλμα απάντησης AI." }, 500);
    }

    const replyText = extractReplyText(data);

    if (!replyText) {
      return json({ error: "Κενή απάντηση AI." }, 500);
    }

    return json({ reply: replyText, file_id: fileId }, 200);
  } catch (err) {
    return json({ error: "Server error." }, 500);
  }
}

// -------- Helpers --------
function extractReplyText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  if (Array.isArray(data?.output)) {
    for (const item of data.output) {
      if (Array.isArray(item?.content)) {
        for (const c of item.content) {
          if (c?.type === "output_text" && c.text?.trim()) {
            return c.text.trim();
          }
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
