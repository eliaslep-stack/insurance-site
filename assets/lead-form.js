// Sends quote/contact forms to /api/lead.
// If email delivery is not configured yet, opens the visitor's mail app
// and shows phone, Viber and WhatsApp so the lead is not lost on mobile.
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
      sending: "Αποστολή…",
      sent: "Το αίτημα στάλθηκε. Θα επικοινωνήσουμε σύντομα.",
      fallback: "Η online αποστολή δεν είναι ακόμα ενεργή. Ανοίξαμε το email σας προς το " + EMAIL + ". Αν δεν ανοίξει, καλέστε ή στείλτε μήνυμα:",
      call: "Κλήση",
      error: "Κάτι δεν πήγε καλά. Καλέστε ή στείλτε email.",
    },
    en: {
      needContact: "Enter a phone number or an email.",
      sensitive: "You added medical history. Please confirm you provide it voluntarily.",
      sending: "Sending…",
      sent: "Request sent. We will contact you shortly.",
      fallback: "Online delivery is not switched on yet. We opened your email app, addressed to " + EMAIL + ". If it does not open, call or message:",
      call: "Call",
      error: "Something went wrong. Please call or email.",
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

  function arm(form) {
    if (form.querySelector("[name=company_website]")) return;
    const wrap = document.createElement("p");
    wrap.className = "hp";
    wrap.setAttribute("aria-hidden", "true");
    const label = document.createElement("label");
    label.textContent = "Website";
    const input = document.createElement("input");
    input.type = "text";
    input.name = "company_website";
    input.tabIndex = -1;
    input.autocomplete = "off";
    label.appendChild(input);
    wrap.appendChild(label);
    form.appendChild(wrap);
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

  function showStatus(form, message, fallback) {
    let box = form.parentElement && form.parentElement.querySelector(".success-box");
    if (!box) {
      box = document.createElement("div");
      box.className = "success-box";
      form.insertAdjacentElement("afterend", box);
    }
    box.classList.toggle("is-fallback", !!fallback);
    box.replaceChildren();
    const p = document.createElement("p");
    p.textContent = message;
    box.appendChild(p);
    if (fallback) {
      const row = document.createElement("p");
      row.className = "contact-actions";
      row.append(
        link("tel:" + TEL, COPY[langOf(form)].call + " " + DISPLAY, false),
        document.createTextNode(" "),
        link(WA, "WhatsApp", true),
        document.createTextNode(" "),
        link(VIBER, "Viber", false),
        document.createTextNode(" "),
        link("mailto:" + EMAIL, "Email", false)
      );
      box.appendChild(row);
    }
    box.style.display = "block";
    box.hidden = false;
  }

  function collect(form) {
    const fields = [];
    let honeypot = "";
    form.querySelectorAll("input, select, textarea").forEach((el) => {
      if (el.type === "submit" || el.type === "button" || el.type === "hidden") return;
      if (el.name === "company_website") {
        honeypot = el.value || "";
        return;
      }
      if (el.id === "name" || el.id === "email" || el.id === "phone" || el.id === "need" || el.name === "consent") return;
      if (el.type === "checkbox") {
        if (!el.checked) return;
        fields.push({ label: labelFor(el), value: "yes" });
        return;
      }
      const value = (el.value || "").trim();
      if (!value) return;
      fields.push({ label: labelFor(el), value });
    });
    return { fields, honeypot };
  }

  function valueOf(form, selector) {
    const el = form.querySelector(selector);
    return el ? String(el.value || "").trim() : "";
  }

  function openMail(subject, fields) {
    const body = fields.map((field) => field.label + ": " + field.value).join("\n");
    const href = "mailto:" + EMAIL + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body.slice(0, 1800));
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function onSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute("data-lead")) return;
    event.preventDefault();
    event.stopPropagation();

    const t = COPY[langOf(form)];
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

    const button = form.querySelector('button[type="submit"]');
    const previous = button ? button.textContent : "";
    if (button) {
      button.disabled = true;
      button.textContent = t.sending;
    }

    const { fields, honeypot } = collect(form);
    const payload = {
      lang: langOf(form),
      subject: form.dataset.subject || need,
      name,
      email,
      phone,
      need,
      page: valueOf(form, "[name=page]") || location.pathname,
      consent: form.dataset.consent === "skip" ? "skip" : true,
      company_website: honeypot,
      fields,
    };

    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 400) {
        showStatus(form, data.error || t.error, true);
        return;
      }
      if (res.ok && data.ok) {
        showStatus(form, t.sent, false);
        form.reset();
        return;
      }
      openMail(payload.subject, fields);
      showStatus(form, t.fallback, true);
    } catch {
      openMail(payload.subject, fields);
      showStatus(form, t.fallback, true);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = previous;
      }
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("form[data-lead]").forEach(arm);
  });
  document.addEventListener("submit", onSubmit, true);
})();
