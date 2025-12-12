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

  // ---- Upload UI (adds a paperclip + hidden file input) ----
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

  let selectedFile = null;

  attachBtn.addEventListener("click", (e) => {
    e.preventDefault();
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    selectedFile = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
    if (selectedFile) {
      fileNameLabel.textContent = selectedFile.name + " (" + Math.round(selectedFile.size / 1024) + " KB)";
    } else {
      fileNameLabel.textContent = "Καμία επισύναψη";
    }
  });

  // Put toolsRow just above the input row if possible
  const inputRow = input.parentElement; // usually the bottom row container
  if (inputRow && inputRow.parentElement) {
    toolsRow.appendChild(attachBtn);
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
    div.style.color = "#111"; // fixes “black on dark” issues in many themes
    div.innerHTML = "<strong>" + escapeHtml(sender) + ":</strong> " + escapeHtml(text);
    bodyDiv.appendChild(div);
    bodyDiv.scrollTop = bodyDiv.scrollHeight;
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text && !selectedFile) return;

    addMessage("Εσύ", text || "(επισύναψη)");
    input.value = "";
    sendBtn.disabled = true;

    addMessage("Αθηνά", "⏳ Σκέφτομαι…");

    try {
      let res;

      if (selectedFile) {
        // multipart/form-data
        const fd = new FormData();
        fd.append("message", text || "Διάβασε το συνημμένο και καθοδήγησέ με.");
        fd.append("file", selectedFile, selectedFile.name);

        res = await fetch("/athena", {
          method: "POST",
          body: fd,
        });
      } else {
        // JSON
        res = await fetch("/athena", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        });
      }

      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
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

      if (data && data.reply) {
        addMessage("Αθηνά", data.reply);
      } else if (data && data.error) {
        addMessage("Αθηνά", "Σφάλμα: " + data.error);
      } else {
        addMessage("Αθηνά", "Κάτι πήγε στραβά. Προσπάθησε ξανά σε λίγο.");
      }

      // reset attachment after successful send
      selectedFile = null;
      fileInput.value = "";
      fileNameLabel.textContent = "Καμία επισύναψη";
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
