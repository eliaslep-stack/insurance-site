// /functions/athena.js (Cloudflare Pages Function)
// ✅ Supports multipart/form-data with MULTIPLE files (up to 3)
// ✅ Supports continuing dialogue via file_ids (JSON array) without re-upload
// ✅ Uploads files to OpenAI Files API, then calls Responses API with multiple input_file
// ✅ Forces structured bullet output when documents exist

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env.OPENAI_API_KEY) {
      return json({ error: "Missing OPENAI_API_KEY in Cloudflare Variables" }, 500);
    }

    const ct = (request.headers.get("content-type") || "").toLowerCase();

    let userMessage = "";
    let incomingFileIds = [];

    // For multipart uploads
    let uploadedFiles = [];

    if (ct.includes("multipart/form-data")) {
      const form = await request.formData();

      userMessage = String(form.get("message") || "").trim();

      // ✅ multiple files support
      uploadedFiles = form.getAll("file").filter(Boolean);

      // ✅ file_ids persistence (array JSON)
      const rawIds = String(form.get("file_ids") || "").trim();
      if (rawIds) {
        try {
          const arr = JSON.parse(rawIds);
          if (Array.isArray(arr)) incomingFileIds = arr.map(String).filter(Boolean);
        } catch {
          // ignore malformed
        }
      }
    } else {
      const body = await request.json().catch(() => ({}));
      userMessage = String(body?.message || "").trim();

      if (Array.isArray(body?.file_ids)) {
        incomingFileIds = body.file_ids.map(String).filter(Boolean);
      }
    }

    // Normalize / limits
    incomingFileIds = unique(incomingFileIds).slice(0, 3);

    const hasNewFiles =
      Array.isArray(uploadedFiles) &&
      uploadedFiles.length > 0 &&
      uploadedFiles.some((f) => f && typeof f === "object" && typeof f.arrayBuffer === "function");

    if (hasNewFiles) {
      // Keep only first 3 new uploads to stay consistent with UI
      uploadedFiles = uploadedFiles
        .filter((f) => f && typeof f === "object" && typeof f.arrayBuffer === "function")
        .slice(0, 3);
    } else {
      uploadedFiles = [];
    }

    const hasAnyDoc = hasNewFiles || incomingFileIds.length > 0;

    // If user sends nothing but documents exist, still proceed with a good default prompt
    if (!userMessage && hasAnyDoc) {
      userMessage =
        "Ανάλυσε τα συνημμένα έγγραφα και δώσε καθαρή εικόνα. Αν υπάρχουν 2+ έγγραφα, κάνε σύγκριση μεταξύ τους.\n" +
        "Να απαντήσεις σε bullets, με τίτλους και μικρές γραμμές.";
    }

    if (!userMessage && !hasAnyDoc) {
      return json({ error: "Empty message" }, 400);
    }

    // Validate NEW uploaded files only
    if (hasNewFiles) {
      const maxBytes = 10 * 1024 * 1024; // 10MB each
      const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

      for (const f of uploadedFiles) {
        if ((f.size || 0) > maxBytes) {
          return json({ error: "Το αρχείο είναι πολύ μεγάλο (max 10MB ανά αρχείο)." }, 400);
        }
        const t = String(f.type || "").toLowerCase();
        if (!allowed.has(t)) {
          return json({ error: "Μη υποστηριζόμενος τύπος αρχείου. Δεκτά: PDF, JPG, PNG, WEBP." }, 400);
        }
      }
    }

    // ----------------- Instructions (hard-format for readability) -----------------
    const baseInstructions =
      "Είσαι η Αθηνά, ψηφιακός ασφαλιστικός βοηθός της IL Insurance στην Ελλάδα.\n" +
      "Μιλάς ΜΟΝΟ ελληνικά, καθαρά, επαγγελματικά, χωρίς διαφημιστική γλώσσα.\n" +
      "Δίνεις πρακτικές απαντήσεις και επόμενα βήματα.\n" +
      "Δεν κάνεις νομικές υπερβολές και, όταν χρειάζεται, λες να μιλήσουν με ασφαλιστικό σύμβουλο.\n";

    const docFormatRule = hasAnyDoc
      ? "ΥΠΑΡΧΟΥΝ ΣΥΝΗΜΜΕΝΑ ΕΓΓΡΑΦΑ. Άρα η απάντηση ΠΡΕΠΕΙ να είναι ευανάγνωστη.\n" +
        "Γράψε ΠΑΝΤΑ σε bullet points, με μικρές γραμμές και καθαρούς τίτλους.\n" +
        "Χρησιμοποίησε ΑΚΡΙΒΩΣ αυτή τη δομή:\n" +
        "• Καλύψεις\n" +
        "• Απαλλαγές / Συμμετοχές\n" +
        "• Εξαιρέσεις\n" +
        "• Προϋποθέσεις / Αναμονές\n" +
        "• Σημεία-παγίδες\n" +
        "• Τι να ρωτήσει ο πελάτης\n" +
        "• Πρόταση επόμενων βημάτων\n" +
        "Αν υπάρχουν 2+ έγγραφα, πρόσθεσε και ενότητα:\n" +
        "• Σύγκριση (Πίνακας ή bullets ανά πρόγραμμα)\n"
      : "";

    const instructions = baseInstructions + docFormatRule;

    // ----------------- Upload NEW files to OpenAI Files API -----------------
    let newFileIds = [];

    if (hasNewFiles) {
      // Upload each file and collect file_id
      for (const f of uploadedFiles) {
        const fileId = await uploadToOpenAI(f, env.OPENAI_API_KEY);
        if (fileId) newFileIds.push(fileId);
      }
    }

    newFileIds = unique(newFileIds);
    let activeFileIds = unique([...incomingFileIds, ...newFileIds]).slice(0, 3);

    // ----------------- Call Responses API with ALL active files -----------------
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    const content = [{ type: "input_text", text: userMessage }];

    // Attach all active file_ids on every turn (document dialogue + comparison)
    if (activeFileIds.length) {
      for (const fid of activeFileIds) {
        content.push({ type: "input_file", file_id: fid });
      }
    }

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
        input: [{ role: "user", content }],
        temperature: 0.2,
        max_output_tokens: 650,
      }),
    }).finally(() => clearTimeout(timer));

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const msg = data?.error?.message || data?.message || `OpenAI error (${upstream.status})`;
      return json({ error: msg }, 500);
    }

    const replyText = extractReplyText(data);
    if (!replyText) {
      return json(
        {
          error: "Η OpenAI επέστρεψε απάντηση χωρίς αναγνώσιμο κείμενο.",
          debug: {
            has_output_text: typeof data?.output_text === "string",
            output_len: Array.isArray(data?.output) ? data.output.length : 0,
          },
        },
        500
      );
    }

    // Return reply + file_ids so the widget can keep context and compare without re-upload
    return json({ reply: replyText, file_ids: activeFileIds }, 200);
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

// ----------------- Helpers -----------------

async function uploadToOpenAI(file, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

  const fd = new FormData();
  fd.append("purpose", "assistants");
  fd.append("file", file, file.name || "upload");

  const up = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    signal: controller.signal,
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
  }).finally(() => clearTimeout(timer));

  const upData = await up.json().catch(() => ({}));
  if (!up.ok) {
    const msg = upData?.error?.message || upData?.message || `OpenAI file upload error (${up.status})`;
    throw new Error(msg);
  }

  const fileId = upData?.id || null;
  if (!fileId) throw new Error("Το αρχείο ανέβηκε αλλά δεν επιστράφηκε file id από την OpenAI.");
  return fileId;
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

function unique(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
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
