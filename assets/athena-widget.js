// /assets/athena-widget.js
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

  // ---- Tools row ----
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

  const clearDocsBtn = document.createElement("button");
  clearDocsBtn.type = "button";
  clearDocsBtn.textContent = "🧹";
  clearDocsBtn.title = "Καθαρισμός όλων των εγγράφων";
  clearDocsBtn.style.width = "44px";
  clearDocsBtn.style.height = "36px";
  clearDocsBtn.style.borderRadius = "10px";
  clearDocsBtn.style.border = "1px solid rgba(0,0,0,0.15)";
  clearDocsBtn.style.background = "white";
  clearDocsBtn.style.cursor = "pointer";

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
  // Βάζουμε multiple για browsers που υποστηρίζουν multi-select,
  // ΑΛΛΑ το κρίσιμο είναι ότι εμείς κάνουμε append (διαδοχικές επιλογές) ώστε να δουλεύει παντού.
  fileInput.multiple = true;
  fileInput.style.display = "none";

  // ---- Memory ----
  // selectedFiles: νέα αρχεία που επέλεξε ο χρήστης (ουρά προς upload), μέχρι 3
  // activeFileIds: file_ids που ήδη έχουν ανέβει στον server και μένουν “ενεργά” για διάλογο/σύγκριση
  let selectedFiles = [];
  let activeFileIds = [];

  // ---- UI helpers ----
  function addMessage(sender, text) {
    const div = document.createElement("div");
    div.className = "athena-msg";
    div.style.color = "#111";
    div.style.whiteSpace = "pre-wrap";   // ✅ line breaks & bullets
    div.style.wordBreak = "break-word";  // ✅ long lines wrap

    const strong = document.createElement("strong");
    strong.textContent = sender + ": ";

    const span = document.createElement("span");
    span.textContent = String(text || "");

    div.appendChild(strong);
    div.appendChild(span);

    bodyDiv.appendChild(div);
    bodyDiv.scrollTop = bodyDiv.scrollHeight;
  }

  function updateLabel() {
    if (selectedFiles.length) {
      const totalKb = Math.round(selectedFiles.reduce((s, f) => s + (f.size || 0), 0) / 1024);
      fileNameLabel.textContent = `Σε αναμονή: ${selectedFiles.length} αρχείο/α (${totalKb} KB)`;
      return;
    }
    if (activeFileIds.length) {
      fileNameLabel.textContent = `Έγγραφα ενεργά: ${activeFileIds.length}`;
      return;
    }
    fileNameLabel.textContent = "Καμία επισύναψη";
  }

  // ---- Events ----
  attachBtn.addEventListener("click", (e) => {
    e.preventDefault();
    fileInput.click();
  });

  // ✅ ΚΡΙΣΙΜΟ: append επιλογές (ώστε να βάζεις 2ο/3ο αρχείο σε ξεχωριστές κινήσεις)
  fileInput.addEventListener("change", () => {
    const newlyPicked = Array.from(fileInput.files || []);

    for (const f of newlyPicked) {
      if (selectedFiles.length >= 3) break;

      // avoid duplicates (same name+size)
      const exists = selectedFiles.some(x => x.name === f.name && x.size === f.size);
      if (!exists) selectedFiles.push(f);
    }

    if (newlyPicked.length && selectedFiles.length >= 3) {
      addMessage("Αθηνά", "Σημείωση: κρατάω έως 3 αρχεία για σύγκριση.");
    }

    // ✅ ΠΟΛΥ σημαντικό: επιτρέπει να ξαναδιαλέξεις αμέσως νέο αρχείο (ακόμα και το ίδιο)
    fileInput.value = "";

    updateLabel();
  });

  clearDocsBtn.addEventListener("click", (e) => {
    e.preventDefault();
    selectedFiles = [];
    activeFileIds = [];
    fileInput.value = "";
    updateLabel();
    addMessage("Αθηνά", "Καθάρισα όλα τα έγγραφα. Ανέβασε νέα αρχεία για σύγκριση.");
  });

  // Put toolsRow above input row
  const inputRow = input.parentElement;
  if (inputRow && inputRow.parentElement) {
    toolsRow.appendChild(attachBtn);
    toolsRow.appendChild(clearDocsBtn);
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

    // nothing to send
    if (!text && selectedFiles.length === 0 && activeFileIds.length === 0) return;

    // message that pushes bullet structure + compare when multiple docs exist
    const finalMessage =
      (selectedFiles.length > 0 && !text)
        ? "Ανάλυσε τα συνημμένα και δώσε ΜΟΝΟ σε bullet points με τίτλους: Καλύψεις, Απαλλαγές, Εξαιρέσεις, Προϋποθέσεις/Αναμονές, Σημεία-παγίδες, Επόμενα βήματα. Αν υπάρχουν ≥2 έγγραφα, κάνε σύγκριση ανά ενότητα (A vs B vs C)."
        : (text || "Συνέχισε/σύγκρινε με βάση τα ενεργά έγγραφα. Απάντα σε bullet points.");

    addMessage("Εσύ", text || (selectedFiles.length ? "(επισύναψη)" : "(συνέχεια/σύγκριση)"));
    input.value = "";
    sendBtn.disabled = true;
    addMessage("Αθηνά", "⏳ Σκέφτομαι…");

    try {
      const fd = new FormData();
      fd.append("message", finalMessage);

      // ✅ Αν ανεβάζεις νέα αρχεία, στείλε ΚΑΙ τα ήδη ενεργά file_ids (ώστε να “χτιστεί” το σύνολο).
      if (selectedFiles.length) {
        if (activeFileIds.length) fd.append("file_ids", JSON.stringify(activeFileIds));
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

      // remove “⏳ Σκέφτομαι…”
      const last = bodyDiv.lastChild;
      if (last && last.textContent && last.textContent.includes("Σκέφτομαι")) {
        bodyDiv.removeChild(last);
      }

      if (!res.ok) {
        addMessage("Αθηνά", "Σφάλμα: " + (data?.error || "Server error"));
        return;
      }

      // ✅ Κρατάμε πίσω έως 3 file_ids από server
      if (Array.isArray(data.file_ids)) {
        activeFileIds = data.file_ids.filter(Boolean).slice(0, 3);
      } else if (data.file_id) {
        if (!activeFileIds.includes(data.file_id)) activeFileIds.push(data.file_id);
        activeFileIds = activeFileIds.slice(0, 3);
      }

      addMessage("Αθηνά", data.reply || "Χωρίς απάντηση.");

      // reset only pending uploads, keep active docs
      selectedFiles = [];
      fileInput.value = "";
      updateLabel();

    } catch (err) {
      const last = bodyDiv.lastChild;
      if (last && last.textContent && last.textContent.includes("Σκέφτομαι")) {
        bodyDiv.removeChild(last);
      }
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

  addMessage("Αθηνά", "Γεια σου! Μπορείς να προσθέτεις 1–3 αρχεία (διαδοχικά) και να ζητήσεις σύγκριση. Τα bullets εμφανίζονται σωστά.");
  updateLabel();
});
