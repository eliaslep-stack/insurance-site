// /functions/athena.js
// Cloudflare Pages Function
// Supports multipart/form-data with MULTIPLE files + keeps document context via file_ids[].
// Calls OpenAI Responses API with input_text + input_file(s).
// Language-aware (EL/EN): responds in English for /en pages, Greek for /el pages, or explicit "lang" param.

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
    let incomingLang = "";    // "en" | "el" (optional)

    if (ct.includes("multipart/form-data")) {
      const form = await request.formData();
      userMessage = String(form.get("message") || "").trim();
      incomingLang = String(form.get("lang") || "").trim();

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
      const body = await request.json().catch(() => ({}));
      userMessage = String(body?.message || "").trim();
      incomingLang = String(body?.lang || "").trim();

      const arr = body?.file_ids;
      if (Array.isArray(arr)) incomingFileIds = arr.map(String).filter(Boolean);
    }

    // ---------- Language detection ----------
    // Priority: incomingLang > referer path > accept-language > default el
    const lang = detectLang(request, incomingLang);

    // Keep doc context even if user sends no new file
    const hasUploads = uploadedFiles.length > 0;
    const hasActiveDocs = hasUploads || incomingFileIds.length > 0;

    // Default prompt if doc exists but user didn't type anything
    if (!userMessage && hasActiveDocs) {
      userMessage =
        lang === "en"
          ? "Analyze the attached documents and give a clear summary ONLY in bullets (•), " +
            "with headings in this exact order: Coverages, Deductibles, Exclusions, Waiting periods / Conditions, Red flags / Traps, Next steps."
          : "Ανάλυσε τα συνημμένα έγγραφα και δώσε καθαρή εικόνα ΜΟΝΟ σε bullets (•), " +
            "με τίτλους και αυτή τη σειρά: Καλύψεις, Απαλλαγές, Εξαιρέσεις, Προϋποθέσεις/Αναμονές, Σημεία-παγίδες, Επόμενα βήματα.";
    }

    if (!userMessage && !hasActiveDocs) {
      return json({ error: "Empty message" }, 400);
    }

    // Validate uploads (only new files)
    if (hasUploads) {
      const maxBytesEach = 10 * 1024 * 1024; // 10MB per file
      const maxFiles = 5; // πρακτικό όριο
      const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

      if (uploadedFiles.length > maxFiles) {
        return json({ error: `Too many files. Max: ${maxFiles} per message.` }, 400);
      }

      for (const f of uploadedFiles) {
        if (!f || typeof f !== "object" || typeof f.arrayBuffer !== "function") {
          return json({ error: "Invalid file payload." }, 400);
        }
        if ((f.size || 0) > maxBytesEach) {
          return json({ error: `File "${f.name || "upload"}" is too large (max 10MB).` }, 400);
        }
        const type = String(f.type || "").toLowerCase();
        if (!allowed.has(type)) {
          return json({ error: `Unsupported type for "${f.name}". Allowed: PDF, JPG, PNG, WEBP.` }, 400);
        }
      }
    }

    // ---------- Instructions ----------
    const supportEmail = "info@ildigitalassistant.com"; // όπως το ζήτησες

    const baseInstructionsEl =
      "Είσαι η Αθηνά, ο ψηφιακός ασφαλιστικός βοηθός της IL Insurance στην Ελλάδα.\n" +
      "Απαντάς ΠΑΝΤΑ στα ελληνικά, καθαρά, πρακτικά και χωρίς διαφημιστική γλώσσα.\n" +
      "Στόχος σου: (α) απαντήσεις σε ασφαλιστικές ερωτήσεις, (β) καθοδήγηση σε περίπτωση συμβάντος (βήματα + χρήσιμα τηλέφωνα αν ζητηθούν), " +
      "(γ) εξήγηση δικαιωμάτων/υποχρεώσεων σε συμβόλαιο που ανεβάζει ο πελάτης.\n" +
      `Για περισσότερες πληροφορίες/εξατομίκευση, προτείνεις email στο ${supportEmail}.\n` +
      "Αν λείπουν κρίσιμα στοιχεία, κάνε 1-2 στοχευμένες ερωτήσεις. Απόφυγε νομικές υπερβολές.\n";

    const baseInstructionsEn =
      "You are Athena, the digital insurance assistant of IL Insurance in Greece.\n" +
      "You ALWAYS reply in English, clearly, practically, and without marketing fluff.\n" +
      "Your goals: (a) answer insurance questions, (b) guide the user in case of an incident (steps + useful phone numbers when asked), " +
      "(c) explain rights/obligations in an insurance policy the user uploads.\n" +
      `For more details/personalization, suggest emailing ${supportEmail}.\n` +
      "If key details are missing, ask 1–2 focused questions. Avoid legal overstatements.\n";

    const docFormatRuleEl = hasActiveDocs
      ? "ΟΤΑΝ υπάρχουν έγγραφα στη συζήτηση:\n" +
        "1) ΜΗΝ χρησιμοποιείς markdown (όχι ###, όχι **bold**).\n" +
        "2) Γράφεις ΜΟΝΟ με απλό κείμενο και bullets που ξεκινούν με '• '.\n" +
        "3) Δίνεις ΑΚΡΙΒΩΣ τους τίτλους με αυτή τη σειρά και τίποτα άλλο:\n" +
        "Καλύψεις:\nΑπαλλαγές:\nΕξαιρέσεις:\nΠροϋποθέσεις/Αναμονές:\nΣημεία-παγίδες:\nΕπόμενα βήματα:\n" +
        "4) Κάθε ενότητα max 6 bullets. Κάθε bullet max 20 λέξεις.\n" +
        "5) Αν δεν χωράει, κλείνεις με: 'Γράψε: ΣΥΝΕΧΕΙΑ' και σταματάς.\n"
      : "";

    const docFormatRuleEn = hasActiveDocs
      ? "WHEN documents are present:\n" +
        "1) Do NOT use markdown (no ###, no **bold**).\n" +
        "2) Use plain text ONLY and bullets starting with '• '.\n" +
        "3) Use EXACTLY these headings in this order and nothing else:\n" +
        "Coverages:\nDeductibles:\nExclusions:\nWaiting periods / Conditions:\nRed flags / Traps:\nNext steps:\n" +
        "4) Max 6 bullets per section. Max 20 words per bullet.\n" +
        "5) If it doesn’t fit, end with: 'Type: CONTINUE' and stop.\n"
      : "";

    const instructions =
      (lang === "en" ? baseInstructionsEn : baseInstructionsEl) +
      "\n" +
      (lang === "en" ? docFormatRuleEn : docFormatRuleEl);

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
    const t = setTimeout(() => controller.abort(), 40000);

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
        // Καλύτερα να μην το φουσκώνεις χωρίς λόγο. Το “κόβει απότομα” συνήθως είναι format+timeouts, όχι tokens.
        max_output_tokens: hasActiveDocs ? 650 : 800,
      }),
    }).finally(() => clearTimeout(t));

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const msg = data?.error?.message || data?.message || `OpenAI error (${upstream.status})`;
      return json({ error: msg }, 500);
    }

    const replyText = extractReplyText(data);
    if (!replyText) {
      return json({ error: "The model returned no readable text." }, 500);
    }

    // Return reply + file_ids so client keeps multi-doc context + echo lang for debugging
    return json({ reply: replyText, file_ids: allFileIds, lang }, 200);

  } catch (err) {
    const msg =
      err?.name === "AbortError"
        ? "Timeout: server took too long. Please try again."
        : (err?.message ? String(err.message) : "Internal error");
    return json({ error: msg }, 500);
  }
}

function detectLang(request, incomingLang) {
  const l = String(incomingLang || "").toLowerCase();
  if (l === "en" || l === "el") return l;

  const ref = (request.headers.get("referer") || "").toLowerCase();
  if (ref.includes("/en/")) return "en";
  if (ref.includes("/el/")) return "el";

  const al = (request.headers.get("accept-language") || "").toLowerCase();
  if (al.startsWith("en")) return "en";
  if (al.startsWith("el")) return "el";

  return "el";
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
  if (!id) throw new Error("Uploaded but no file id returned by OpenAI.");
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
