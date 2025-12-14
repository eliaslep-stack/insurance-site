// /functions/athena.js
// Cloudflare Pages Function
// Supports multipart/form-data multi-file upload + keeps document context with file_ids[].

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env.OPENAI_API_KEY) return json({ error: "Missing OPENAI_API_KEY" }, 500);

    const ct = (request.headers.get("content-type") || "").toLowerCase();

    let userMessage = "";
    let files = [];               // File[]
    let incomingFileIds = [];     // string[]

    if (ct.includes("multipart/form-data")) {
      const form = await request.formData();
      userMessage = String(form.get("message") || "").trim();

      // Multi-files (same key "file" repeated)
      const gotFiles = form.getAll("file") || [];
      files = gotFiles.filter(f => f && typeof f === "object" && typeof f.arrayBuffer === "function");

      // Existing context file_ids passed as JSON string
      const fileIdsJson = String(form.get("file_ids") || "").trim();
      if (fileIdsJson) {
        try {
          const arr = JSON.parse(fileIdsJson);
          if (Array.isArray(arr)) incomingFileIds = arr.map(String).filter(Boolean);
        } catch {}
      }

      // Also allow repeated file_id fields if you ever use them
      const repeated = (form.getAll("file_id") || []).map(String).filter(Boolean);
      if (repeated.length) incomingFileIds = repeated;
    } else {
      const body = await request.json().catch(() => ({}));
      userMessage = String(body?.message || "").trim();
      if (Array.isArray(body?.file_ids)) incomingFileIds = body.file_ids.map(String).filter(Boolean);
    }

    const hasNewFiles = files.length > 0;
    const hasActiveDocs = hasNewFiles || incomingFileIds.length > 0;

    if (!userMessage && hasActiveDocs) userMessage = "Ανάλυσε τα έγγραφα.";
    if (!userMessage && !hasActiveDocs) return json({ error: "Empty message" }, 400);

    // Limits (πρακτικά για Cloudflare + latency)
    const MAX_FILES = 5;
    const MAX_BYTES_PER_FILE = 10 * 1024 * 1024; // 10MB
    const MAX_TOTAL_BYTES = 20 * 1024 * 1024;    // 20MB συνολικά

    if (hasNewFiles) {
      if (files.length > MAX_FILES) {
        return json({ error: `Μέγιστος αριθμός αρχείων: ${MAX_FILES}.` }, 400);
      }

      const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
      let total = 0;

      for (const f of files) {
        if (!allowed.has(String(f.type || "").toLowerCase())) {
          return json({ error: "Μη υποστηριζόμενος τύπος αρχείου. Δεκτά: PDF, JPG, PNG, WEBP." }, 400);
        }
        if ((f.size || 0) > MAX_BYTES_PER_FILE) {
          return json({ error: "Κάποιο αρχείο είναι πολύ μεγάλο (max 10MB ανά αρχείο)." }, 400);
        }
        total += (f.size || 0);
      }

      if (total > MAX_TOTAL_BYTES) {
        return json({ error: "Το σύνολο των αρχείων είναι πολύ μεγάλο (max 20MB συνολικά)." }, 400);
      }
    }

    // Strong formatting enforcement when docs exist
    const instructions = `
Είσαι η Αθηνά, επαγγελματικός ασφαλιστικός βοηθός στην Ελλάδα.

ΑΝ ΥΠΑΡΧΟΥΝ ΕΓΓΡΑΦΑ:
ΑΠΑΝΤΑΣ ΥΠΟΧΡΕΩΤΙΚΑ ΜΟΝΟ ΜΕ ΤΗΝ ΠΑΡΑΚΑΤΩ ΔΟΜΗ ΚΑΙ ΜΕ BULLET POINTS.
ΑΠΑΓΟΡΕΥΕΤΑΙ να γράψεις παραγράφους.

ΜΟΡΦΗ ΑΠΑΝΤΗΣΗΣ:

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

Σύγκριση εγγράφων (αν υπάρχουν >1):
• …

Επόμενα βήματα:
• …

ΑΝ ΔΕΝ ΥΠΑΡΧΟΥΝ ΕΓΓΡΑΦΑ:
Απάντα σύντομα και καθαρά.
`;

    // Upload new files -> file_ids
    let fileIds = incomingFileIds.slice();

    if (hasNewFiles) {
      fileIds = []; // όταν ανεβαίνουν νέα, θεωρούμε ότι ξεκινά νέο “σύνολο εγγράφων”
      for (const file of files) {
        const fd = new FormData();
        fd.append("purpose", "assistants");
        fd.append("file", file, file.name || "document");

        const up = await fetch("https://api.openai.com/v1/files", {
          method: "POST",
          headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
          body: fd,
        });

        const upData = await up.json().catch(() => ({}));
        if (!up.ok || !upData?.id) {
          return json({ error: upData?.error?.message || "OpenAI file upload error" }, 500);
        }

        fileIds.push(upData.id);
      }
    }

    // Build input: attach ALL files every turn to keep doc context stable
    const content = [{ type: "input_text", text: userMessage }];
    for (const id of fileIds) content.push({ type: "input_file", file_id: id });

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        instructions,
        input: [{ role: "user", content }],
        temperature: 0.2,
        max_output_tokens: 650,
      }),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return json({ error: data?.error?.message || `OpenAI error (${upstream.status})` }, 500);
    }

    const reply = extractReplyText(data);
    if (!reply) return json({ error: "Κενή απάντηση AI." }, 500);

    return json({ reply, file_ids: fileIds }, 200);
  } catch (err) {
    return json({ error: "Server error." }, 500);
  }
}

function extractReplyText(data) {
  if (data && typeof data.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  if (!data || !Array.isArray(data.output)) return "";
  for (const item of data.output) {
    if (Array.isArray(item?.content)) {
      for (const c of item.content) {
        if (c?.type === "output_text" && typeof c.text === "string" && c.text.trim()) return c.text.trim();
      }
    }
  }
  return "";
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
