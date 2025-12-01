// /assets/athena.js

// 1. Άνοιγμα / κλείσιμο του panel
function wireAthenaToggle() {
  const panel = document.getElementById("athena-panel");
  const toggleBtn = document.getElementById("athena-toggle");

  if (!panel || !toggleBtn) {
    console.warn("Athena toggle or panel not found");
    return;
  }

  panel.setAttribute("hidden", "true");
  panel.style.display = "none";

  toggleBtn.addEventListener("click", () => {
    const isHidden =
      panel.hasAttribute("hidden") ||
      panel.style.display === "none" ||
      panel.style.display === "";

    if (isHidden) {
      panel.removeAttribute("hidden");
      panel.style.display = "block";
    } else {
      panel.setAttribute("hidden", "true");
      panel.style.display = "none";
    }
  });
}

// 2. Σύνδεση με ChatKit
async function initAthenaChat() {
  const chatElement = document.getElementById("athena-chat");
  if (!chatElement) {
    console.warn("Athena chat element not found");
    return;
  }

  try {
    const res = await fetch("/api/chatkit/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      console.error("Failed to create ChatKit session", await res.text());
      return;
    }

    const data = await res.json();
    const client_secret = data && data.client_secret;
    if (!client_secret) {
      console.error("No client_secret returned from /api/chatkit/session");
      return;
    }

    if (window.customElements && customElements.whenDefined) {
      try {
        await customElements.whenDefined("openai-chatkit");
      } catch (e) {
        console.warn("openai-chatkit element not defined yet", e);
      }
    }

    if (typeof chatElement.setOptions === "function") {
      chatElement.setOptions({
        api: {
          async getClientSecret(existing) {
            return client_secret;
          },
        },
        title: "Athena – IL Digital Insurance Assistant",
        composerPlaceholder: "Γράψε εδώ την ερώτησή σου για την ασφάλιση…",
        locale: "el-GR",
        theme: "light",
      });
    } else {
      console.error("chatElement.setOptions is not a function");
    }
  } catch (err) {
    console.error("Error initialising Athena chat", err);
  }
}

// 3. Δένουμε όλα όταν φορτώσει το DOM
window.addEventListener("DOMContentLoaded", () => {
  wireAthenaToggle();
  initAthenaChat();
});
