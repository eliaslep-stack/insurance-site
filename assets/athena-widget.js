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

  // ---- Upload UI (paperclip + hidden file input + (optional) clear doc button) ----
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

  // Προαιρετικό κουμπί “νέο έγγραφο” (καθαρίζει το ενεργό file_id)
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

  // NEW: κρατάμε μνήμη εγγράφου με file_id
  let selectedFile = null;   // νέο upload που επέλεξε τώρα ο χρήστης
  let activeFileId = null;   // file_id από τον server για συνέχιση διαλόγου χωρίς re-upload

  attachBtn.addEventListener("click", (e) => {
    e.preventDefault();
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    selectedFile = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
    if (selectedFile) {
      fileNameLabel.textContent = selectedFile.name + " (" + Math.round(selectedFile.size / 1024) + " KB)";
    } else {
      fileNameLabel.textContent = activeFileId ? "Έγγραφο ενεργό (χωρίς νέα επισύναψη)" : "Καμία επισύναψη";
    }
  });

  clearDocBtn.addEventListener("click", (e) => {
    e.preventDefault();
    // Καθαρίζουμε και το νέο επιλεγμένο αρχείο και το ενεργό file context
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

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function addMessage(sender, text) {
    const div = document.createElement("div");
    div.className = "athena-msg";
    div.style.color = "#111";
    div.innerHTML = "<strong>" + escapeHtml(sender) + ":</strong> " + escapeHtml(text);
    bodyDiv.appendChild(div);
    bodyDiv.scrollTop = bodyDiv.scrollHeight;
  }

  async function sendMessage() {
    const rawText = (input.value || "");
    const text = rawText.trim();

    // Αν δεν υπάρχει ούτε κείμενο ούτε νέο αρχείο ούτε ενεργό αρχείο, μην στέλνεις
    if (!text && !selectedFile && !activeFileId) return;

    // Fallback prompt μόνο όταν ανεβάζουμε αρχείο χωρίς κείμενο
    const finalMessage =
      selectedFile && !text
        ? "Ανάλυσε το συνημμένο αρχείο και πες μου τι να προσέξω: καλύψεις, απαλλαγές, εξαιρέσεις, προϋποθέσεις και πιθανά σημεία παγίδων."
        : (text || "Συνέχισε την ανάλυση με βάση το ενεργό έγγραφο.");

    addMessage("Εσύ", text || (selectedFile ? "(επισύναψη)" : "(συνέχεια στο ίδιο έγγραφο)"));
    input.value = "";
    sendBtn.disabled = true;

    addMessage("Αθηνά", "⏳ Σκέφτομαι…");

    try {
      const fd = new FormData();
      fd.append("message", finalMessage);

      // Αν υπάρχει νέο αρχείο, το στέλνουμε.
      // Αν όχι, αλλά υπάρχει activeFileId, στέλνουμε file_id για να μη χρειάζεται re-upload.
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
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        data = await res.json();
      } else {
        const t = await res.text();
        data = { reply: t };
      }

      // remove “Σκέφτομαι…”
      const last = bodyDiv.lastChild;
      if (last && last.textContent && last.textContent.includes("Σκέφτομαι")) {
        bodyDiv.removeChild(last);
      }

      if (!res.ok) {
        const msg = data?.error ? String(data.error) : "Server error";
        addMessage("Αθηνά", "Σφάλμα: " + msg);
        return;
      }

      // NEW: αποθηκεύουμε το file_id για να συνεχίζει ο διάλογος χωρίς νέο upload
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

      // Reset ΜΟΝΟ το νέο upload (selectedFile). Το activeFileId παραμένει για συνέχεια.
      selectedFile = null;
      fileInput.value = "";

      // Ετικέτα: αν υπάρχει ενεργό έγγραφο, το δείχνουμε ως “ενεργό”
      fileNameLabel.textContent = activeFileId ? "Έγγραφο ενεργό (χωρίς νέα επισύναψη)" : "Καμία επισύναψη";
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
