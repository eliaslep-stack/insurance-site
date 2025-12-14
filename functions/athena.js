export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env.OPENAI_API_KEY) {
      return json({ error: "Missing OPENAI_API_KEY" }, 500);
    }

    const ct = (request.headers.get("content-type") || "").toLowerCase();

    let userMessage = "";
    let files = [];            // ⬅️ ΠΟΛΛΑ αρχεία
    let incomingFileIds = [];  // ⬅️ προηγούμενα file_ids

    if (ct.includes("multipart/form-data")) {
      const form = await request.formData();
      userMessage = String(form.get("message") || "").trim();
      files = form.getAll("file") || [];

      const idsRaw = form.get("file_ids");
      if (idsRaw) {
        try {
          incomingFileIds = JSON.parse(idsRaw);
        } catch {}
      }
    } else {
      const body = await request.json().catch(() => ({}));
      userMessage = String(body?.message || "").trim();
      incomingFileIds = Array.isArray(body?.file_ids) ? body.file_ids : [];
    }

    const hasNewFiles = files.length > 0;
    const hasActiveFiles = hasNewFiles || incomingFileIds.length > 0;

    if (!userMessage && hasActiveFiles) {
      userMessage =
        "Ανάλυσε και σύγκρινε τα συνημμένα προγράμματα σε bullet points: " +
        "Καλύψεις, Απαλλαγές, Εξαιρέσεις, Αναμονές, Σημεία-παγίδες, Ποιο ταιριάζει σε ποιον.";
    }

    if (!userMessage && !hasActiveFiles) {
      return json({ error: "Empty message" }, 400);
    }

    // =============================
    // Upload ΟΛΩΝ των αρχείων
    // =============================
    const uploadedFileIds = [...incomingFileIds];

    for (const file of files) {
      if (!file || typeof file.arrayBuffer !== "function") continue;

      if (file.size > 10 * 1024 * 1024) {
        return json({ error: "Αρχείο > 10MB" }, 400);
      }

      const fd = new FormData();
      fd.append("purpose", "assistants");
      fd.append("file", file, file.name || "upload");

      const up = await fetch("https://api.openai.com/v1/files", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: fd,
      });

      const upData = await up.json();
      if (!up.ok || !upData.id) {
        return json({ error: "File upload failed" }, 500);
      }

      uploadedFileIds.push(upData.id);
    }

    // Κόφτης ασφαλείας: max 3
    const fileIds = uploadedFileIds.slice(0, 3);

    // =============================
    // OpenAI Responses API
    // =============================
    const input =
      fileIds.length
        ? [{
            role: "user",
            content: [
              { type: "input_text", text: userMessage },
              ...fileIds.map(id => ({ type: "input_file", file_id: id })),
            ],
          }]
        : userMessage;

    const ai = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        instructions:
          "Είσαι η Αθηνά, ασφαλιστικός σύμβουλος στην Ελλάδα. " +
          "Όταν υπάρχουν έγγραφα απαντάς ΠΑΝΤΑ με bullet points και καθαρούς τίτλους.",
        input,
        temperature: 0.2,
        max_output_tokens: 600,
      }),
    });

    const data = await ai.json();
    const reply = extractReplyText(data);

    return json({
      reply,
      file_ids: fileIds, // ⬅️ ΕΠΙΣΤΡΕΦΟΥΜΕ ΟΛΑ
    });

  } catch (err) {
    return json({ error: "Internal error" }, 500);
  }
}

function extractReplyText(data) {
  if (data?.output_text) return data.output_text.trim();
  if (!Array.isArray(data?.output)) return "";
  for (const o of data.output) {
    if (o?.content) {
      for (const c of o.content) {
        if (c?.type === "output_text") return c.text.trim();
      }
    }
  }
  return "";
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
