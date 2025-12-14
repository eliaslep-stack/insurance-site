document.addEventListener("DOMContentLoaded", () => {
  const bubble = document.getElementById("athena-bubble");
  const box = document.getElementById("athena-chatbox");
  const bodyDiv = document.getElementById("athena-body");
  const input = document.getElementById("athena-input");
  const sendBtn = document.getElementById("athena-send");

  if (!bubble || !box || !bodyDiv || !input || !sendBtn) {
    console.warn("Athena widget: missing DOM elements.");
    return;
  }

  // ---- Upload UI (paperclip + hidden file input + clear doc button) ----
  const toolsRow = document.createElement("div");
  toolsRow.style.display = "flex";
  toolsRow.style.gap = "8px";
  toolsRow.style.alignItems = "center";
  toolsRow.style.marginTop = "10px";

  const attachBtn = document.createElement("button");
  attachBtn.type = "button";
  attachBtn.textContent = "📎";
  attachBtn.title = "Επισύναψη PDF/εικόνας";
  attachBtn.style.width = "44px";
  attachBtn.style.height = "36px";
  attachBtn.style.borderRadius = "10px";
  attachBtn.style.border = "1px solid rgba(0,0,0,0.15)";
  attachBtn.style.background = "white";
  attachBtn.style.cursor = "pointer";

  const clearDocBtn = document.createElement("button");
  clearDocBtn.type = "button";
  clearDocBtn.textContent = "🧹";
  clearDocBtn.title = "Νέο έγγραφο (καθαρισμός συνημμένου)";
  clearDocBtn.style.width = "44px";
  clearDocBtn.style.height = "36px";
  clearDocBtn.style.borderRadius = "10px";
  clearDocBtn.style.border = "1px solid rgba(0,0,0,0.15)";
  clearDocBtn.style.background = "white";
  clearDocBtn.style.cursor = "pointer";

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
  fileInput.style.display = "none";

  // ---- Memory: keep doc context via file_id ----
  let selectedFile = null;
  let activeFileId = null;

  attachBtn.addEventListener("click", (e) => {
    e.preventDefault();
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    selectedFile = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
    if (selectedFile) {
      fileNameLabel.textContent =
        selectedFile.name + " (" + Math.round(selectedFile.size / 1024) + " KB)";
    } else {
      fileNameLabel.textContent = activeFileId
        ? "Έγγραφο ενεργό (χωρίς νέα επισύναψη)"
        : "Καμία επισύναψη";
    }
  });

  // ---- IMPORTANT: renders newlines + bullets properly ----
  function addMessage(sender, text) {
    const div = document.createElement("div");
    div.className = "athena-msg";
    div.style.color = "#111";

    // ✅ keeps line breaks & bullet points
    div.style.whiteSpace = "pre-wrap";
    div.style.wordBreak = "break-word";

    const strong = document.createElement("strong");
    strong.textContent = sender + ": ";

    const span = document.createElement("span");
    span.textContent = String(text || "");

    div.appendChild(strong);
    div.appendChild(span);

    bodyDiv.appendChild(div);
    bodyDiv.scrollTop = bodyDiv.scrollHeight;
  }

  clearDocBtn.addEventListener("click", (e) => {
    e.preventDefault();
    selectedFile = null;
    activeFileId = null;
    fileInput.value = "";
    fileNameLabel.textContent = "Καμία επισύναψη";
    addMessage("Αθηνά", "ΟΚ. Ξεκινάμε με νέο έγγραφο. Ανέβασε νέο PDF/εικόνα όταν είσαι έτοιμος/η.");
  });

  // Put toolsRow just above the input row if possible
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

  async function sendMessage() {
    const rawText = input.value || "";
    const text = rawText.trim();

    // If nothing to send
    if (!text && !selectedFile && !activeFileId) return;

    const finalMessage =
      selectedFile && !text
        ? "Ανάλυσε το συνημμένο αρχείο και δώσε σε bullet points: Καλύψεις, Απαλλαγές, Εξαιρέσεις, Προϋποθέσεις/Αναμονές, Σημεία-παγίδες, Επόμενα βήματα."
        : (text || "Συνέχισε την ανάλυση με βάση το ενεργό έγγραφο.");

    addMessage("Εσύ", text || (selectedFile ? "(επισύναψη)" : "(συνέχεια στο ίδιο έγγραφο)"));
    input.value = "";
    sendBtn.disabled = true;

    addMessage("Αθηνά", "⏳ Σκέφτομαι…");

    try {
      const fd = new FormData();
      fd.append("message", finalMessage);

      if (selectedFile) {
        fd.append("file", selectedFile, selectedFile.name);
      } else if (activeFileId) {
        fd.append("file_id", activeFileId);
      }

      const res = await fetch("/athena", {
        method: "POST",
        body: fd,
        headers: { "Accept": "application/json" }
      });

      let data = {};
      const rct = res.headers.get("content-type") || "";
      if (rct.includes("application/json")) {
        data = await res.json();
      } else {
        const t = await res.text();
        data = { reply: t };
      }

      // Remove "⏳ Σκέφτομαι…"
      const last = bodyDiv.lastChild;
      if (last && last.textContent && last.textContent.includes("Σκέφτομαι")) {
        bodyDiv.removeChild(last);
      }

      if (!res.ok) {
        const msg = data?.error ? String(data.error) : "Server error";
        addMessage("Αθηνά", "Σφάλμα: " + msg);
        return;
      }

      // ✅ keep file context for next turns
      if (data && data.file_id) {
        activeFileId = data.file_id;
      }

      if (data && data.reply) {
        addMessage("Αθηνά", data.reply);
      } else if (data && data.error) {
        addMessage("Αθηνά", "Σφάλμα: " + data.error);
      } else {
        addMessage("Αθηνά", "Κάτι πήγε στραβά. Προσπάθησε ξανά σε λίγο.");
      }

      // Reset only the new upload selection
      selectedFile = null;
      fileInput.value = "";
      fileNameLabel.textContent = activeFileId
        ? "Έγγραφο ενεργό (χωρίς νέα επισύναψη)"
        : "Καμία επισύναψη";

    } catch (err) {
      const last = bodyDiv.lastChild;
      if (last && last.textContent && last.textContent.includes("Σκέφτομαι")) {
        bodyDiv.removeChild(last);
      }
      addMessage("Αθηνά", "Πρόβλημα σύνδεσης. Έλεγξε το internet και δοκίμασε ξανά.");
    } finally {
      sendBtn.disabled = false;
    }
  }

  bubble.addEventListener("click", (e) => {
    e.preventDefault();
    toggleBox();
  });

  sendBtn.addEventListener("click", (e) => {
    e.preventDefault();
    sendMessage();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  addMessage("Αθηνά", "Γεια σου! Πες μου τι θέλεις να μάθεις για την ασφάλιση. Μπορείς και να επισυνάψεις PDF/εικόνα.");
});
