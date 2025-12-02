document.addEventListener("DOMContentLoaded", function () {
  // 1) CSS του widget – ανεξάρτητο από styles.css
  const style = document.createElement("style");
  style.textContent = `
    #athena-floating {
      position: fixed;
      bottom: 20px;
      right: 22px;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }

    #athena-btn {
      background: #ffffff;
      border-radius: 50px;
      padding: 6px 14px 6px 6px;
      display: flex;
      align-items: center;
      gap: 10px;
      box-shadow: 0 4px 22px rgba(0,0,0,0.25);
      cursor: pointer;
      border: none;
      transition: all .25s ease;
    }

    #athena-btn:hover {
      transform: scale(1.05);
    }

    #athena-btn img {
      width: 46px;
      height: 46px;
      border-radius: 50%;
      object-fit: cover;
    }

    #athena-btn span {
      font-size: 14px;
      color: #333333;
      font-weight: 500;
    }

    #athena-chatbox {
      position: fixed;
      bottom: 80px;
      right: 20px;
      width: 360px;
      max-width: 95vw;
      max-height: 520px;
      background: #ffffff;
      border-radius: 14px;
      box-shadow: 0 8px 28px rgba(0,0,0,0.3);
      display: none;
      overflow: hidden;
      z-index: 100000;
      color: #222222;
    }

    #athena-header {
      background: #00a8ff;
      color: #ffffff;
      padding: 12px;
      text-align: center;
      font-weight: bold;
      font-size: 15px;
    }

    #athena-body {
      padding: 12px;
      height: 360px;
      overflow-y: auto;
      background: #f7f7f7;
      font-size: 14px;
      color: #222222;
    }

    #athena-body div {
      color: #222222;
    }

    #athena-body strong {
      color: #111111;
    }

    #athena-inputbox {
      display: flex;
      border-top: 1px solid #dddddd;
      background: #ffffff;
    }

    #athena-text {
      flex: 1;
      padding: 10px;
      border: none;
      outline: none;
      font-size: 14px;
      color: #111111;
      background: #ffffff;
    }

    #athena-send {
      background: #00a8ff;
      color: #ffffff;
      border: none;
      padding: 10px 14px;
      cursor: pointer;
      font-size: 15px;
    }

    #athena-send:hover {
      background: #0091dd;
    }

    @media (max-width: 600px) {
      #athena-chatbox {
        width: 94vw;
        right: 3vw;
      }
    }
  `;
  document.head.appendChild(style);

  // 2) HTML του widget
  const wrapper = document.createElement("div");
  wrapper.id = "athena-floating";
  wrapper.innerHTML = `
    <div id="athena-chatbox">
      <div id="athena-header">Αθηνά — Ψηφιακή Βοηθός</div>
      <div id="athena-body"></div>
      <div id="athena-inputbox">
        <input id="athena-text" type="text" placeholder="Γράψε την ερώτησή σου...">
        <button id="athena-send">➤</button>
      </div>
    </div>

    <button id="athena-btn" type="button">
      <img src="https://insurance.ildigitalassistant.com/assets/athena.png" alt="Αθηνά">
      <span>Μίλα με την Αθηνά</span>
    </button>
  `;
  document.body.appendChild(wrapper);

  const box   = document.getElementById("athena-chatbox");
  const bodyDiv = document.getElementById("athena-body");
  const txt   = document.getElementById("athena-text");
  const send  = document.getElementById("athena-send");
  const btn   = document.getElementById("athena-btn");

  // 3) Λειτουργία open/close
  btn.onclick = () => {
    const visible = box.style.display === "block";
    box.style.display = visible ? "none" : "block";
    if (!visible) txt.focus();
  };

  // 4) Συνάρτηση για προσθήκη μηνύματος
  function athenaAdd(sender, text) {
    const div = document.createElement("div");
    div.style.marginBottom = "6px";
    div.style.color = "#222222";

    const label = document.createElement("strong");
    label.textContent = sender + ":";
    label.style.color = "#111111";
    div.appendChild(label);

    const space = document.createTextNode(" ");
    div.appendChild(space);

    const content = document.createTextNode(text);
    div.appendChild(content);

    bodyDiv.appendChild(div);
    bodyDiv.scrollTop = bodyDiv.scrollHeight;
  }

  // 5) Αρχικό μήνυμα
  athenaAdd("Αθηνά", "Γεια σου! Πες μου τι θέλεις να μάθεις για την ασφάλιση.");

  // 6) Αποστολή στο backend /functions/athena
  async function sendAthena() {
    const msg = txt.value.trim();
    if (!msg) return;

    athenaAdd("Εσύ", msg);
    txt.value = "";

    const thinkingMarker = document.createElement("div");
    thinkingMarker.textContent = "Αθηνά: ⏳ Σκέφτομαι…";
    thinkingMarker.style.marginBottom = "6px";
    thinkingMarker.style.color = "#555555";
    bodyDiv.appendChild(thinkingMarker);
    bodyDiv.scrollTop = bodyDiv.scrollHeight;

    try {
      const response = await fetch("/functions/athena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg })
      });

      const data = await response.json();
      bodyDiv.removeChild(thinkingMarker);

      if (data && data.reply) {
        athenaAdd("Αθηνά", data.reply);
      } else if (data && data.error) {
        athenaAdd("Αθηνά", "Σφάλμα: " + data.error);
      } else {
        athenaAdd("Αθηνά", "Σφάλμα ή άδειο μήνυμα από τον server.");
      }
    } catch (err) {
      bodyDiv.removeChild(thinkingMarker);
      athenaAdd("Αθηνά", "Πρόβλημα σύνδεσης. Προσπάθησε ξανά σε λίγο.");
    }
  }

  send.onclick = sendAthena;
  txt.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendAthena();
    }
  });
});
