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
      uploadedFiles = (form.getAll("file") || []).filter(Boolean);

      // client can send file_ids as JSON string
      const raw = String(form.get("file_ids") || "").trim();
      if (raw) {
        try {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) incomingFileIds = arr.map(String).filter(Boolean);
        } catch {}
      }
    } else {
      const body = await request.json().catch(() => ({})); // ✅ fixed
      userMessage = String(body?.message || "").trim();

      const arr = body?.file_ids;
      if (Array.isArray(arr)) incomingFileIds = arr.map(String).filter(Boolean);
    }

    // Keep doc context even if user sends no new file
    const hasUploads = uploadedFiles.length > 0;
    const hasActiveDocs = hasUploads || incomingFileIds.length > 0;

    // Default prompt if doc exists but user didn't type anything
    if (!userMessage && hasActiveDocs) {
      userMessage =
        "Ανάλυσε τα συνημμένα έγγραφα και δώσε καθαρή εικόνα ΜΟΝΟ σε bullets (•), " +
        "με τίτλους και αυτή τη σειρά: Καλύψεις, Απαλλαγές, Εξαιρέσεις, Προϋποθέσεις/Αναμονές, Σημεία-παγίδες, Επόμενα βήματα.";
    }

    if (!userMessage && !hasActiveDocs) {
      return json({ error: "Empty message" }, 400);
    }

    // Validate uploads (only new files)
    if (hasUploads) {
      const maxBytesEach = 10 * 1024 * 1024; // 10MB per file
      const maxFiles = 5; // πρακτικό όριο (μην βαράμε 20 uploads)
      const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

      if (uploadedFiles.length > maxFiles) {
        return json({ error: `Πάρα πολλά αρχεία. Μέγιστο: ${maxFiles} ανά αποστολή.` }, 400);
      }

      for (const f of uploadedFiles) {
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

    // Instructions: 1) ρόλος Αθηνάς, 2) email για περισσότερα, 3) αυστηρό format όταν υπάρχουν έγγραφα
    const supportEmail = "info@ildigitalassistant.com"; // άλλαξέ το εδώ αν θέλεις

    const baseInstructions =
      "Είσαι η Αθηνά, ο ψηφιακός ασφαλιστικός βοηθός της IL Insurance στην Ελλάδα.\n" +
      "Απαντάς ΠΑΝΤΑ στα ελληνικά, καθαρά, πρακτικά και χωρίς διαφημιστική γλώσσα.\n" +
      "Στόχος σου: (α) απαντήσεις σε ασφαλιστικές ερωτήσεις, (β) καθοδήγηση σε περίπτωση συμβάντος (βήματα), " +
      "(γ) εξήγηση δικαιωμάτων/υποχρεώσεων σε συμβόλαιο που ανεβάζει ο πελάτης.\n" +
      `Για περισσότερες πληροφορίες/εξατομίκευση, να προτείνεις επικοινωνία στο ${supportEmail}.\n` +
      "Αν λείπουν κρίσιμα στοιχεία, κάνε 1-2 στοχευμένες ερωτήσεις.\n" +
      "Απόφυγε νομικές υπερβολές.\n";

    const docFormatRule = hasActiveDocs
      ? "ΟΤΑΝ υπάρχουν έγγραφα στη συζήτηση:\n" +
        "1) ΜΗΝ χρησιμοποιείς markdown (όχι ###, όχι **bold**).\n" +
        "2) Γράφεις ΜΟΝΟ με απλό κείμενο και bullets που ξεκινούν με '• '.\n" +
        "3) Δίνεις ΑΚΡΙΒΩΣ τους τίτλους με αυτή τη σειρά και τίποτα άλλο:\n" +
        "Καλύψεις:\nΑπαλλαγές:\nΕξαιρέσεις:\nΠροϋποθέσεις/Αναμονές:\nΣημεία-παγίδες:\nΕπόμενα βήματα:\n" +
        "4) Κάθε ενότητα max 5 bullets. Κάθε bullet max 18 λέξεις.\n" +
        "5) Αν δεν χωράει, κλείνεις με: 'Γράψε: ΣΥΝΕΧΕΙΑ' και σταματάς.\n"
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
    const t = setTimeout(() => controller.abort(), 35000);

    const input = allFileIds.length
      ? [{
          role: "user",
          content: [
            { type: "input_text", text: userMessage },
            ...allFileIds.map(id => ({ type: "input_file", file_id: id })),
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
        model: "gpt-5.2",
        instructions,
        input,
        temperature: 0.15,
        max_output_tokens: 900, // ✅ μειώνει το “κόβει απότομα”
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
