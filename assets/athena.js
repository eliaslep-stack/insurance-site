// /assets/athena.js

async function initAthenaChat() {
  const panel = document.getElementById("athena-panel");
  const toggleBtn = document.getElementById("athena-toggle");
  const chatElement = document.getElementById("athena-chat");

  if (!panel || !toggleBtn || !chatElement) {
    console.warn("Athena elements not found");
    return;
  }

  // Άνοιγμα / κλείσιμο panel όταν πατάς το bubble
  toggleBtn.addEventListener("click", () => {
    const isHidden = panel.hasAttribute("hidden");
    if (isHidden) {
      panel.removeAttribute("hidden");
    } else {
      panel.setAttribute("hidden", "true");
    }
  });

  // Δημιουργία session στο /api/chatkit/session
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

    // Περιμένουμε να οριστεί το <openai-chatkit>
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
            // Προς το παρόν γυρίζουμε πάντα το ίδιο secret
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

// Τρέχει όταν φορτώσει η σελίδα
window.addEventListener("load", initAthenaChat);
