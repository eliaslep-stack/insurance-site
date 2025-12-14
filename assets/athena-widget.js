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
  attachBtn.title = "Επισύναψη PDF/εικόνας (έως 3)";
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
  fileNameLabel.style.overflow = "hidden";
  fileNameLabel.style.textOverflow = "ellipsis";
  fileNameLabel.style.whiteSpace = "nowrap";
  fileNameLabel.textContent = "Καμία επισύναψη";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/pdf,image/*";
  fileInput.multiple = true; // ✅ επιτρέπει 1–3 αρχεία σε μία επιλογή
  fileInput.style.display = "none";

  let selectedFiles = [];   // νέα αρχεία προς upload
  let activeFileIds = [];   // file_ids που κρατάμε για συνέχεια/σύγκριση

  attachBtn.addEventListener("click", (e) => {
    e.preventDefault();
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    selectedFiles = Array.from(fileInput.files || []);
    if (selectedFiles.length > 3) {
      selectedFiles = selectedFiles.slice(0, 3);
      addMessage("Αθηνά", "Σημείωση: κρατάω έως 3 αρχεία για σύγκριση.");
    }
    if (selectedFiles.length) {
      const totalKb = Math.round(selectedFiles.reduce((s, f) => s + (f.size || 0), 0) / 1024);
      fileNameLabel.textContent = `Επιλεγμένα: ${selectedFiles.length} αρχείο/α (${totalKb} KB)`;
    } else {
      fileNameLabel.textContent = activeFileIds.length ? `Έγγραφα ενεργά: ${activeFileIds.length}` : "Καμία επισύναψη";
    }
  });

  clearDocBtn.addEventListener("click", (e) => {
    e.preventDefault();
    selectedFiles = [];
    activeFileIds = [];
    fileInput.value = "";
    fileNameLabel.textContent = "Καμία επισύναψη";
    addMessage("Αθηνά", "Καθάρισα όλα τα έγγραφα. Ανέβασε νέα αρχεία για σύγκριση.");
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

  function toggleBox() {
    const isOpen = box.style.display === "flex";
    box.style.display = isOpen ? "none" : "flex";
    if (!isOpen) input.focus();
  }

  async function sendMessage() {
    const text = (input.value || "").trim();

    if (!text && selectedFiles.length === 0 && activeFileIds.length === 0) return;

    const finalMessage =
      selectedFiles.length && !text
        ? "Ανάλυσε τα συνημμένα και δώσε σε bullet points: Καλύψεις, Απαλλαγές, Εξαιρέσεις, Προϋποθέσεις/Αναμονές, Σημεία-παγίδες, Επόμενα βήματα. Αν υπάρχουν ≥2 αρχεία, κάνε σύγκριση."
        : (text || "Κάνε σύγκριση/συνέχεια με βάση τα ενεργά έγγραφα.");

    addMessage("Εσύ", text || (selectedFiles.length ? "(επισύναψη)" : "(συνέχεια/σύγκριση)"));
    input.value = "";
    sendBtn.disabled = true;
    addMessage("Αθηνά", "⏳ Σκέφτομαι…");

    try {
      const fd = new FormData();
      fd.append("message", finalMessage);

      // Αν έχω νέα αρχεία, τα στέλνω όλα (έως 3) στο ίδιο request
      if (selectedFiles.length) {
        for (const f of selectedFiles) fd.append("file", f, f.name);
      } else if (activeFileIds.length) {
        fd.append("file_ids", JSON.stringify(activeFileIds));
      }

      const res = await fetch("/athena", {
        method: "POST",
        body: fd,
        headers: { "Accept": "application/json" }
      });

      let data = {};
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) data = await res.json();
      else data = { reply: await res.text() };

      // remove “Σκέφτομαι…”
      const last = bodyDiv.lastChild;
      if (last && last.textContent && last.textContent.includes("Σκέφτομαι")) bodyDiv.removeChild(last);

      if (!res.ok) {
        addMessage("Αθηνά", "Σφάλμα: " + (data?.error || "Server error"));
        return;
      }

      // κρατάμε ενημερωμένη λίστα file_ids από server (αν την επιστρέφει)
      if (Array.isArray(data.file_ids)) {
        activeFileIds = data.file_ids.filter(Boolean);
      } else if (data.file_id && !activeFileIds.includes(data.file_id)) {
        activeFileIds.push(data.file_id);
      }

      addMessage("Αθηνά", data.reply || "Χωρίς απάντηση.");
      selectedFiles = [];
      fileInput.value = "";
      fileNameLabel.textContent = activeFileIds.length ? `Έγγραφα ενεργά: ${activeFileIds.length}` : "Καμία επισύναψη";

    } catch (err) {
      const last = bodyDiv.lastChild;
      if (last && last.textContent && last.textContent.includes("Σκέφτομαι")) bodyDiv.removeChild(last);
      addMessage("Αθηνά", "Πρόβλημα σύνδεσης. Δοκίμασε ξανά.");
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

  addMessage("Αθηνά", "Γεια σου! Μπορείς να ανεβάσεις 1–3 αρχεία και να ζητήσεις σύγκριση.");
});
