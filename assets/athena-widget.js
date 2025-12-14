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
  clearDocBtn.title = "Νέο έγγραφο (καθαρισμός όλων των συνημμένων)";
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
fileInput.multiple = true; // ✅ multi
fileInput.style.display = "none";

// ✅ DEBUG: να βλέπεις ΑΜΕΣΩΣ ότι είναι ON
fileNameLabel.textContent = "Widget loaded — multiple=" + (fileInput.multiple ? "ON" : "OFF");


  // Multi-doc state
  let selectedFiles = [];   // File[] (νέα uploads)
  let activeFileIds = [];   // string[] (server file_ids για συνέχεια διαλόγου)

  function updateLabel() {
    if (selectedFiles.length > 0) {
      const names = selectedFiles.slice(0, 2).map(f => f.name).join(", ");
      const more = selectedFiles.length > 2 ? ` +${selectedFiles.length - 2}` : "";
      const totalKB = Math.round(selectedFiles.reduce((s, f) => s + (f.size || 0), 0) / 1024);
      fileNameLabel.textContent = `${selectedFiles.length} αρχεία: ${names}${more} (${totalKB} KB)`;
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

  fileInput.addEventListener("change", () => {
    selectedFiles = fileInput.files ? Array.from(fileInput.files) : [];
    updateLabel();
  });

  function addMessage(sender, text) {
    const div = document.createElement("div");
    div.className = "athena-msg";
    div.style.color = "#111";
    div.style.whiteSpace = "pre-wrap";   // ✅ εμφανίζει bullets + αλλαγές γραμμής
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
    selectedFiles = [];
    activeFileIds = [];
    fileInput.value = "";
    updateLabel();
    addMessage("Αθηνά", "ΟΚ. Καθάρισα όλα τα έγγραφα. Ανέβασε νέα PDF/εικόνες όταν είσαι έτοιμος/η.");
  });

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
    const text = (input.value || "").trim();

    if (!text && selectedFiles.length === 0 && activeFileIds.length === 0) return;

    const finalMessage =
      (selectedFiles.length > 0 && !text)
        ? "Ανάλυσε τα συνημμένα έγγραφα και δώσε σε bullet points: Καλύψεις, Απαλλαγές, Εξαιρέσεις, Προϋποθέσεις/Αναμονές, Σημεία-παγίδες, Επόμενα βήματα. Αν υπάρχουν διαφορές μεταξύ των εγγράφων, σύγκρινέ τες καθαρά."
        : (text || "Συνέχισε με βάση τα ενεργά έγγραφα.");

    addMessage("Εσύ", text || (selectedFiles.length > 0 ? `(επισύναψη ${selectedFiles.length} αρχείων)` : "(συνέχεια στα ίδια έγγραφα)"));
    input.value = "";
    sendBtn.disabled = true;

    addMessage("Αθηνά", "⏳ Σκέφτομαι…");

    try {
      const fd = new FormData();
      fd.append("message", finalMessage);

      if (selectedFiles.length > 0) {
        for (const f of selectedFiles) fd.append("file", f, f.name);
      } else if (activeFileIds.length > 0) {
        fd.append("file_ids", JSON.stringify(activeFileIds));
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

      const last = bodyDiv.lastChild;
      if (last && last.textContent && last.textContent.includes("Σκέφτομαι")) {
        bodyDiv.removeChild(last);
      }

      if (!res.ok) {
        addMessage("Αθηνά", "Σφάλμα: " + (data?.error ? String(data.error) : "Server error"));
        return;
      }

      // ✅ κρατάμε λίστα file_ids για επόμενες ερωτήσεις
      if (Array.isArray(data?.file_ids)) {
        activeFileIds = data.file_ids.filter(Boolean);
      }

      if (data?.reply) addMessage("Αθηνά", data.reply);
      else if (data?.error) addMessage("Αθηνά", "Σφάλμα: " + data.error);
      else addMessage("Αθηνά", "Κάτι πήγε στραβά. Προσπάθησε ξανά σε λίγο.");

      selectedFiles = [];
      fileInput.value = "";
      updateLabel();
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

  addMessage("Αθηνά", "Γεια σου! Πες μου τι θέλεις να μάθεις για την ασφάλιση. Μπορείς και να επισυνάψεις PDF/εικόνες (πολλαπλά).");
});
