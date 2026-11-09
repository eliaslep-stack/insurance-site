// Same delivery as the live site: open a prefilled email to info@ildigitalassistant.com.
// The visitor presses Send in their mail app. No extra service or Cloudflare variable.
(function () {
  const EMAIL = "info@ildigitalassistant.com";
  const TEL = "+306937311411";
  const DISPLAY = "+30 693 731 1411";
  const WA = "https://wa.me/306937311411";
  const VIBER = "viber://chat?number=%2B306937311411";

  const COPY = {
    el: {
      needContact: "Συμπληρώστε τηλέφωνο ή email.",
      sensitive: "Συμπληρώσατε ιατρικό ιστορικό. Τσεκάρετε ότι το δίνετε εθελοντικά.",
      sent: "Το αίτημα δημιουργήθηκε. Ελέγξτε το email σας και πατήστε «Αποστολή».",
      name: "Ονοματεπώνυμο",
      phone: "Τηλέφωνο",
      need: "Τι χρειάζεστε",
      call: "Κλήση",
    },
    en: {
      needContact: "Enter a phone number or an email.",
      sensitive: "You added medical history. Please confirm you provide it voluntarily.",
      sent: "The request was created. Check your email and press Send.",
      name: "Name",
      phone: "Phone",
      need: "What you need",
      call: "Call",
    },
  };

  function langOf(form) {
    return form.dataset.lang === "en" ? "en" : "el";
  }

  function labelFor(el) {
    const label = el.closest("label");
    if (!label) return el.name || el.id || "Field";
    const clone = label.cloneNode(true);
    clone.querySelectorAll("input, select, textarea").forEach((node) => node.remove());
    return clone.textContent.replace(/\s+/g, " ").trim() || el.name || el.id;
  }

  function valueOf(form, selector) {
    const el = form.querySelector(selector);
    return el ? String(el.value || "").trim() : "";
  }

  function link(href, text, blank) {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = text;
    if (blank) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
    return a;
  }

  function showStatus(form) {
    const t = COPY[langOf(form)];
    let box = form.parentElement && form.parentElement.querySelector(".success-box");
    if (!box) {
      box = document.createElement("div");
      box.className = "success-box";
      form.insertAdjacentElement("afterend", box);
    }
    box.classList.remove("is-fallback");
    box.replaceChildren();
    const p = document.createElement("p");
    p.textContent = t.sent;
    const row = document.createElement("p");
    row.className = "contact-actions";
    row.append(
      link("tel:" + TEL, t.call + " " + DISPLAY, false),
      document.createTextNode(" "),
      link(WA, "WhatsApp", true),
      document.createTextNode(" "),
      link(VIBER, "Viber", false)
    );
    box.append(p, row);
    box.style.display = "block";
    box.hidden = false;
  }

  function extraFields(form) {
    const fields = [];
    form.querySelectorAll("input, select, textarea").forEach((el) => {
      if (el.type === "submit" || el.type === "button" || el.type === "hidden") return;
      if (el.name === "company_website") return;
      if (el.id === "name" || el.id === "email" || el.id === "phone" || el.id === "need" || el.name === "consent") return;
      if (el.type === "checkbox") {
        if (el.checked) fields.push(labelFor(el) + ": yes");
        return;
      }
      const value = (el.value || "").trim();
      if (value) fields.push(labelFor(el) + ": " + value);
    });
    return fields;
  }

  function openMail(subject, body) {
    const href = "mailto:" + EMAIL + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
    window.open(href, "_blank");
  }

  function onSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute("data-lead")) return;
    event.preventDefault();
    event.stopPropagation();

    const t = COPY[langOf(form)];
    const honeypot = valueOf(form, "[name=company_website]");
    if (honeypot) return;

    const name = valueOf(form, "#name, [name=name]");
    const email = valueOf(form, "#email, [name=email]");
    const phone = valueOf(form, "#phone, [name=phone]");
    const need = valueOf(form, "#need, [name=need]");
    const medical = form.querySelector("#lh_medical");
    const sensitive = form.querySelector("#lh_sensitive");

    if (!phone && !email) {
      alert(t.needContact);
      return;
    }
    if (medical && sensitive && medical.value.trim() && !sensitive.checked) {
      alert(t.sensitive);
      return;
    }

    const lines = [
      t.name + ": " + name,
      "Email: " + (email || "-"),
      t.phone + ": " + (phone || "-"),
      t.need + ": " + (need || "-"),
      "",
      ...extraFields(form),
    ];
    const subject = (form.dataset.subject || need || "IL Insurance") + (name ? " — " + name : "");
    openMail(subject, lines.join("\n"));
    showStatus(form);
  }

  document.addEventListener("submit", onSubmit, true);
})();
