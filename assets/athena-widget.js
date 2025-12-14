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

  // ---- Upload UI ----
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
  clearDocBtn.title = "Καθαρισμός όλων των εγγράφων";
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
  fileNameLabel.style.whiteSpace = "nowrap";
  fileNameLabel.textContent = "Καμία επισύναψη";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/pdf,image/*";
  fileInput.style.display = "none";

  // ---- MULTI FILE MEMORY ----
  let selectedFile = null;        // νέο upload
  let activeFileIds = [];         // ΟΛΑ τα ενεργά έγγραφα

  attachBtn.addEventListener("click", e => {
    e.preventDefault();
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    selectedFile = fileInput.files?.[0] || null;
    if (selectedFile) {
      fileNameLabel.textContent =
        selectedFile.name + " (" + Math.round(selectedFile.size / 1024) + " KB)";
    }
  });

  clearDocBtn.addEventListener("click", e => {
    e.preventDefault();
    selectedFile = null;
    activeFileIds = [];
    fileInput.value = "";
    fileNameLabel.textContent = "Καμία επισύναψη";
    addMessage("Αθηνά", "Καθάρισα όλα τα έγγραφα. Μπορείς να ανεβάσεις νέα για σύγκριση.");
  });

  const inputRow = input.parentElement;
  if (inputRow && inputRow.parentElement) {
    toolsRow.appendChild(attachBtn);
    toolsRow.appendChild(clearDocBtn);
    toolsRow.appendChild(fileNameLabel);
    toolsRow.appendChild(fileInput);
    inputRow.parentElement.insertBefore(toolsRow, inputRow);
  }

  function addMessage(sender, text) {
    const div = document.createElement("div");
    div.className = "athena-msg";
    div.style.color = "#111";
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

  async function sendMessage() {
    const text = (input.value || "").trim();
    if (!text && !selectedFile && activeFileIds.length === 0) return;

    const finalMessage =
      selectedFile && !text
        ? "Ανάλυσε το συνημμένο έγγραφο και ετοίμασε bullet points."
        : text;

    addMessage("Εσύ", text || (selectedFile ? "(επισύναψη)" : "(σύγκριση εγγράφων)"));
    input.value = "";
    sendBtn.disabled = true;

    addMessage("Αθηνά", "⏳ Σκέφτομαι…");

    try {
      const fd = new FormData();
      fd.append("message", finalMessage);

      if (selectedFile) {
        fd.append("file", selectedFile, selectedFile.name);
      } else if (activeFileIds.length) {
        fd.append("file_ids", JSON.stringify(activeFileIds));
      }

      const res = await fetch("/athena", {
        method: "POST",
        body: fd,
        headers: { "Accept": "application/json" }
      });

      const data = await res.json();

      bodyDiv.removeChild(bodyDiv.lastChild);

      if (!res.ok) {
        addMessage("Αθηνά", "Σφάλμα: " + (data.error || "Server error"));
        return;
      }

      if (data.file_id && !activeFileIds.includes(data.file_id)) {
        activeFileIds.push(data.file_id);
      }

      fileNameLabel.textContent = activeFileIds.length
        ? `Έγγραφα ενεργά: ${activeFileIds.length}`
        : "Καμία επισύναψη";

      addMessage("Αθηνά", data.reply || "Χωρίς απάντηση");

      selectedFile = null;
      fileInput.value = "";

    } catch (err) {
      bodyDiv.removeChild(bodyDiv.lastChild);
      addMessage("Αθηνά", "Πρόβλημα σύνδεσης.");
    } finally {
      sendBtn.disabled = false;
    }
  }

  bubble.addEventListener("click", e => {
    e.preventDefault();
    box.style.display = box.style.display === "flex" ? "none" : "flex";
    input.focus();
  });

  sendBtn.addEventListener("click", e => {
    e.preventDefault();
    sendMessage();
  });

  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  addMessage("Αθηνά", "Γεια σου! Μπορείς να ανεβάσεις 1–3 αρχεία και να ζητήσεις σύγκριση.");
});
