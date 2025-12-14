// /assets/athena-widget.js
document.addEventListener("DOMContentLoaded", () => {
  const bubble = document.getElementById("athena-bubble");
  const box = document.getElementById("athena-chatbox");
  const bodyDiv = document.getElementById("athena-body");
  const input = document.getElementById("athena-input");
  const sendBtn = document.getElementById("athena-send");

  if (!bubble || !box || !bodyDiv || !input || !sendBtn) return;

  // --- Tools row ---
  const toolsRow = document.createElement("div");
  toolsRow.style.display = "flex";
  toolsRow.style.gap = "8px";
  toolsRow.style.alignItems = "center";
  toolsRow.style.marginTop = "10px";

  const attachBtn = mkBtn("📎", "Επισύναψη PDF/εικόνας (πολλαπλά)");
  const clearDocBtn = mkBtn("🧹", "Καθαρισμός ενεργών εγγράφων (νέα υπόθεση)");

  const fileNameLabel = document.createElement("div");
  fileNameLabel.style.fontSize = "12px";
  fileNameLabel.style.opacity = "0.85";
  fileNameLabel.style.flex = "1";
  fileNameLabel.style.overflow = "hidden";
  fileNameLabel.style.textOverflow = "ellipsis";
  fileNameLabel.style.whiteSpace = "nowrap";
  fileNameLabel.textContent = "Καμία επισύναψη";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/pdf,image/*";
  fileInput.multiple = true;
  fileInput.style.display = "none";

  // State
  let selectedFiles = [];   // new uploads (File[])
  let activeFileIds = [];   // persisted context (string[])

  function updateLabel() {
    if (selectedFiles.length > 0) {
      const names = selectedFiles.slice(0, 2).map(f => f.name).join(", ");
      const more = selectedFiles.length > 2 ? ` +${selectedFiles.length - 2}` : "";
      fileNameLabel.textContent = `${selectedFiles.length} αρχεία: ${names}${more}`;
      return;
    }
    if (activeFileIds.length > 0) {
      fileNameLabel.textContent = `Έγγραφα ενεργά: ${activeFileIds.length} (χωρίς νέα επισύναψη)`;
      return;
    }
    fileNameLabel.textContent = "Καμία επισύναψη";
  }

  attachBtn.addEventListener("click", (e) => {
    e.preventDefault();
    fileInput.click();
  });

  // IMPORTANT: append mode (δεν αντικαθιστούμε, προσθέτουμε)
  fileInput.addEventListener("change", () => {
    const picked = fileInput.files ? Array.from(fileInput.files) : [];
    for (const f of picked) {
      if (!selectedFiles.some(x => x.name === f.name && x.size === f.size && x.lastModified === f.lastModified)) {
        selectedFiles.push(f);
      }
    }
    fileInput.value = ""; // επιτρέπει να ξαναδιαλέξει το ίδιο αρχείο αν χρειαστεί
    updateLabel();
  });

  clearDocBtn.addEventListener("click", (e) => {
    e.preventDefault();
    selectedFiles = [];
    activeFileIds = [];
    fileInput.value = "";
    updateLabel();
    addMessage("Αθηνά", "ΟΚ. Καθάρισα τα ενεργά έγγραφα. Ανέβασε νέο PDF/εικόνα για νέα υπόθεση.");
  });

  // place tools row
  const inputRow = input.parentElement;
  if (inputRow && inputRow.parentElement) {
    toolsRow.appendChild(attachBtn);
    toolsRow.appendChild(clearDocBtn);
    toolsRow.appendChild(fileNameLabel);
    toolsRow.appendChild(fileInput);
    inputRow.parentElement.insertBefore(toolsRow, inputRow);
  }

  function toggleBox() {
    const isOpen = box.style.display === "flex";
    box.style.display = isOpen ? "none" : "flex";
    if (!isOpen) input.focus();
  }

  // Safe-ish renderer: keeps newlines and shows bullets nicely
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderTextAsHtml(text) {
    const raw = String(text || "");
    const lines = raw.split(/\r?\n/);

    // Build simple HTML with <br> and <ul> for lines that start with "• " or "- "
    let html = "";
    let inUl = false;

    const openUl = () => { if (!inUl) { html += "<ul style='margin:6px 0 6px 18px; padding:0;'>"; inUl = true; } };
    const closeUl = () => { if (inUl) { html += "</ul>"; inUl = false; } };

    for (const line of lines) {
      const t = line.trimEnd();
      const isBullet = /^\s*(•|-)\s+/.test(t);

      if (isBullet) {
        openUl();
        const item = t.replace(/^\s*(•|-)\s+/, "");
        html += `<li style="margin:2px 0;">${escapeHtml(item)}</li>`;
      } else {
        closeUl();
        if (t.trim() === "") {
          html += "<br>";
        } else {
          html += `${escapeHtml(t)}<br>`;
        }
      }
    }
    closeUl();
    return html;
  }

  function addMessage(sender, text) {
    const div = document.createElement("div");
    div.className = "athena-msg";
    div.style.color = "#111";
    div.style.wordBreak = "break-word";
    div.innerHTML = `<strong>${escapeHtml(sender)}:</strong> ${renderTextAsHtml(text)}`;
    bodyDiv.appendChild(div);
    bodyDiv.scrollTop = bodyDiv.scrollHeight;
  }

  async function sendMessage() {
    const text = (input.value || "").trim();
    const hasNewUploads = selectedFiles.length > 0;
    const hasContextDocs = activeFileIds.length > 0;

    if (!text && !hasNewUploads && !hasContextDocs) return;

    const finalMessage =
      (hasNewUploads && !text)
        ? "Ανάλυσε τα συνημμένα έγγραφα και δώσε σε bullet points με τίτλους: Καλύψεις, Απαλλαγές, Εξαιρέσεις, Προϋποθέσεις/Αναμονές, Σημεία-παγίδες, Επόμενα βήματα."
        : (text || "Συνέχισε με βάση τα ενεργά έγγραφα.");

    addMessage("Εσύ", text || (hasNewUploads ? `(επισύναψη ${selectedFiles.length} αρχείων)` : "(συνέχεια στο ίδιο έγγραφο)"));
    input.value = "";
    sendBtn.disabled = true;

    addMessage("Αθηνά", "⏳ Σκέφτομαι…");

    try {
      const fd = new FormData();
      fd.append("message", finalMessage);

      if (hasNewUploads) {
        for (const f of selectedFiles) fd.append("file", f, f.name);
      } else if (hasContextDocs) {
        fd.append("file_ids", JSON.stringify(activeFileIds));
      }

      const res = await fetch("/athena", {
        method: "POST",
        body: fd,
        headers: { "Accept": "application/json" }
      });

      const data = await res.json().catch(() => ({}));

      // remove “Σκέφτομαι…”
      const last = bodyDiv.lastChild;
      if (last && last.textContent && last.textContent.includes("Σκέφτομαι")) bodyDiv.removeChild(last);

      if (!res.ok) {
        addMessage("Αθηνά", "Σφάλμα: " + (data?.error ? String(data.error) : "Server error"));
        return;
      }

      if (Array.isArray(data?.file_ids)) {
        activeFileIds = data.file_ids.map(String).filter(Boolean);
      }

      if (data?.reply) addMessage("Αθηνά", data.reply);
      else addMessage("Αθηνά", "Κάτι πήγε στραβά. Προσπάθησε ξανά.");

      // Clear ONLY new uploads; keep activeFileIds for context
      selectedFiles = [];
      updateLabel();
    } catch (err) {
      const last = bodyDiv.lastChild;
      if (last && last.textContent && last.textContent.includes("Σκέφτομαι")) bodyDiv.removeChild(last);
      addMessage("Αθηνά", "Πρόβλημα σύνδεσης. Έλεγξε το internet και δοκίμασε ξανά.");
    } finally {
      sendBtn.disabled = false;
    }
  }

  // IMPORTANT: μην αφήνεις το <form> να κάνει submit (αλλιώς “στέλνει μόνο του” / κάνει refresh)
  const form = sendBtn.closest("form");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      sendMessage();
    });
  }

  bubble.addEventListener("click", (e) => { e.preventDefault(); toggleBox(); });
  sendBtn.addEventListener("click", (e) => { e.preventDefault(); sendMessage(); });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  updateLabel();
  addMessage("Αθηνά", "Γεια σου! Πες μου τι θέλεις να μάθεις για την ασφάλιση. Μπορείς να επισυνάψεις PDF/εικόνες.");
});

function mkBtn(txt, title) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = txt;
  b.title = title;
  b.style.width = "44px";
  b.style.height = "36px";
  b.style.borderRadius = "10px";
  b.style.border = "1px solid rgba(0,0,0,0.15)";
  b.style.background = "white";
  b.style.cursor = "pointer";
  return b;
}
