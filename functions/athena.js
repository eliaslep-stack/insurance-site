// /functions/athena.js
// Cloudflare Pages Function
// Supports multipart/form-data with MULTIPLE files + keeps document context via file_ids[].
// Calls OpenAI Responses API with input_text + input_file(s).

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env.OPENAI_API_KEY) {
      return json({ error: "Missing OPENAI_API_KEY in Cloudflare Variables" }, 500);
    }

    const ct = (request.headers.get("content-type") || "").toLowerCase();

    let userMessage = "";
    let incomingFileIds = []; // persisted doc context from client
    let uploadedFiles = [];   // File[] from multipart

    if (ct.includes("multipart/form-data")) {
      const form = await request.formData();
      userMessage = String(form.get("message") || "").trim();

      // MULTI: getAll("file")
      uploadedFiles = form.getAll("file").filter(Boolean);

      // client can send file_ids as JSON string
      const raw = String(form.get("file_ids") || "").trim();
      if (raw) {
        try {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) incomingFileIds = arr.map(String).filter(Boolean);
        } catch {}
      }
    } else {
      const body = await request.json().catch(() => ({}));
      userMessage = String(body?.message || "").trim();
      const arr = body?.file_ids;
      if (Array.isArray(arr)) incomingFileIds = arr.map(String).filter(Boolean);
    }

    const hasUploads = uploadedFiles.length > 0;
    const hasActiveDocs = hasUploads || incomingFileIds.length > 0;

    if (!userMessage && hasActiveDocs) {
      userMessage =
        "Ανάλυσε τα συνημμένα έγγραφα και δώσε καθαρή εικόνα σε bullet points, με τίτλους: " +
        "Καλύψεις, Απαλλαγές, Εξαιρέσεις, Προϋποθέσεις/Αναμονές, Σημεία-παγίδες, Επόμενα βήματα.";
    }

    if (!userMessage && !hasActiveDocs) {
      return json({ error: "Empty message" }, 400);
    }

    // Validate uploads (only new files)
    if (hasUploads) {
      const maxBytesEach = 10 * 1024 * 1024; // 10MB per file
      const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

      for (const f of uploadedFiles) {
        // Some environments return strings for empty fields; keep only true File objects
        if (!f || typeof f !== "object" || typeof f.arrayBuffer !== "function") {
          return json({ error: "Invalid file payload." }, 400);
        }
        if ((f.size || 0) > maxBytesEach) {
          return json({ error: `Το αρχείο "${f.name || "upload"}" είναι πολύ μεγάλο (max 10MB).` }, 400);
        }
        const type = String(f.type || "").toLowerCase();
        if (!allowed.has(type)) {
          return json({ error: `Μη υποστηριζόμενος τύπος για "${f.name}". Δεκτά: PDF, JPG, PNG, WEBP.` }, 400);
        }
      }
    }

    // Instructions: 1) τι κάνει η Αθηνά, 2) πού στέλνει για “περισσότερα”, 3) μορφοποίηση όταν υπάρχουν έγγραφα
    const supportEmail = "info@ildigitalassistant.com"; // άλλαξέ το εδώ αν θες άλλο
    const baseInstructions =
      "Είσαι η Αθηνά, ο ψηφιακός ασφαλιστικός βοηθός της IL Insurance στην Ελλάδα.\n" +
      "Απαντάς ΠΑΝΤΑ στα ελληνικά, καθαρά και πρακτικά.\n" +
      "Στόχος σου είναι: (α) να απαντάς ασφαλιστικές ερωτήσεις, (β) να καθοδηγείς σε περίπτωση συμβάντος (βήματα + χρήσιμα τηλέφωνα αν ζητηθούν), " +
      "(γ) να εξηγείς δικαιώματα/υποχρεώσεις σε συμβόλαιο που ανεβάζει ο πελάτης.\n" +
      `Για περισσότερες πληροφορίες/εξατομίκευση, να προτείνεις επικοινωνία στο ${supportEmail}.\n` +
      "Μην κάνεις νομικές υπερβολές, και αν λείπουν κρίσιμα στοιχεία κάνε 1-2 στοχευμένες ερωτήσεις.\n";

    const docFormatRule = hasActiveDocs
      ? "ΟΤΑΝ υπάρχουν έγγραφα στη συζήτηση: γράφε ΠΑΝΤΑ σε bullet points, μία πρόταση ανά bullet, " +
        "και κράτα τους τίτλους ακριβώς με αυτή τη σειρά:\n" +
        "Καλύψεις:\nΑπαλλαγές:\nΕξαιρέσεις:\nΠροϋποθέσεις/Αναμονές:\nΣημεία-παγίδες:\nΕπόμενα βήματα:\n" +
        "Μην χρησιμοποιείς markdown τύπου **bold** ή ###. Μόνο απλό κείμενο + bullets (•)."
      : "";

    const instructions = baseInstructions + "\n" + docFormatRule;

    // 1) Upload new files -> collect file_ids
    let newFileIds = [];
    if (hasUploads) {
      for (const file of uploadedFiles) {
        const fileId = await uploadToOpenAI(file, env.OPENAI_API_KEY);
        newFileIds.push(fileId);
      }
    }

    // Active doc set = incoming + new (dedupe)
    const allFileIds = dedupe([...incomingFileIds, ...newFileIds]);

    // 2) Call Responses API (attach ALL active file_ids every turn)
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 30000);

    const input = allFileIds.length
      ? [{
          role: "user",
          content: [
            { type: "input_text", text: userMessage },
            ...allFileIds.map(id => ({ type: "input_file", file_id: id }))
          ],
        }]
      : userMessage;

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // αν θες “αναβαθμισμένες δυνατότητες”, βάλε gpt-5.2 ή gpt-5.2-pro
        model: "gpt-5.2",
        instructions,
        input,
        temperature: 0.2,
        max_output_tokens: 520,
      }),
    }).finally(() => clearTimeout(t));

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const msg = data?.error?.message || data?.message || `OpenAI error (${upstream.status})`;
      return json({ error: msg }, 500);
    }

    const replyText = extractReplyText(data);
    if (!replyText) {
      return json({ error: "Η OpenAI επέστρεψε απάντηση χωρίς αναγνώσιμο κείμενο." }, 500);
    }

    // Return reply + file_ids so client keeps multi-doc context
    return json({ reply: replyText, file_ids: allFileIds }, 200);
  } catch (err) {
    const msg =
      err?.name === "AbortError"
        ? "Timeout: ο server άργησε να απαντήσει. Δοκίμασε ξανά."
        : (err?.message ? String(err.message) : "Internal error");
    return json({ error: msg }, 500);
  }
}

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
  const id = upData?.id;
  if (!id) throw new Error("Το αρχείο ανέβηκε, αλλά δεν επιστράφηκε file id από την OpenAI.");
  return id;
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

function dedupe(arr) {
  const s = new Set();
  const out = [];
  for (const x of arr) {
    const v = String(x || "").trim();
    if (!v || s.has(v)) continue;
    s.add(v);
    out.push(v);
  }
  return out;
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
