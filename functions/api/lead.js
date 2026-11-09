// Cloudflare Pages Function: POST /api/lead
//
// Στέλνει τα αιτήματα προσφοράς στο email του Ηλία, ΜΟΝΟ αν έχει ρυθμιστεί
// ένας από τους παρακάτω τρόπους στις μεταβλητές του Cloudflare Pages
// (Settings → Environment variables, Production):
//
// 1) Resend (απλούστερο)
//    RESEND_API_KEY     = κλειδί από https://resend.com
//    LEAD_FROM_EMAIL    = αποστολέας σε επιβεβαιωμένο domain, π.χ.
//                         IL Insurance <info@ildigitalassistant.com>
//    LEAD_TO_EMAIL      = προαιρετικό, αλλιώς info@ildigitalassistant.com
//
// 2) Webhook
//    LEAD_WEBHOOK_URL   = διεύθυνση που δέχεται JSON POST
//
// 3) Cloudflare Email Routing (χωρίς τρίτη υπηρεσία)
//    Binding τύπου "Send Email" με όνομα EMAIL
//    LEAD_FROM_EMAIL    = διεύθυνση του domain που επιτρέπεται να στέλνει
//    LEAD_TO_EMAIL      = προαιρετικό
//
// Μέχρι να ρυθμιστεί κάτι από τα παραπάνω, η συνάρτηση απαντά
// { ok:false, configured:false } και η σελίδα ανοίγει mailto
// και δείχνει τηλέφωνο / Viber / WhatsApp.

const TO_DEFAULT = "info@ildigitalassistant.com";
const FROM_DEFAULT = "info@ildigitalassistant.com";

export async function onRequestGet() {
  return json({ ok: false, error: "Use POST" }, 405);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const length = Number(request.headers.get("content-length") || 0);
  if (length > 100000) return json({ ok: false, error: "Payload too large" }, 413);

  let body;
  try {
    body = await readBody(request);
  } catch {
    return json({ ok: false, error: "Invalid body" }, 400);
  }

  if (String(body.company_website || "").trim()) {
    return json({ ok: true, configured: true }, 200);
  }

  const lang = body.lang === "en" ? "en" : "el";
  const isEn = lang === "en";
  const page = clip(body.page, 300);
  const name = clip(body.name, 200);
  const email = clip(body.email, 200);
  const phone = clip(body.phone, 80);
  const need = clip(body.need, 300);
  const subject = clip(body.subject, 180) || need || (isEn ? "Website message" : "Μήνυμα από τον ιστότοπο");

  if (!name) {
    return json({ ok: false, error: isEn ? "Name is required." : "Χρειάζεται ονοματεπώνυμο." }, 400);
  }
  if (!need && !clip(body.subject, 180)) {
    return json({ ok: false, error: isEn ? "Please tell us what you need." : "Πείτε μας τι χρειάζεστε." }, 400);
  }
  if (email && !validEmail(email)) {
    return json({ ok: false, error: isEn ? "The email address is not valid." : "Το email δεν είναι έγκυρο." }, 400);
  }
  if (phone && phone.replace(/\D/g, "").length < 8) {
    return json({ ok: false, error: isEn ? "The phone number is too short." : "Το τηλέφωνο είναι πολύ μικρό." }, 400);
  }
  if (!email && !phone) {
    return json({
      ok: false,
      error: isEn ? "Enter a phone number or an email." : "Συμπληρώστε τηλέφωνο ή email.",
    }, 400);
  }

  const contactPage = String(page).includes("contact");
  const consent = body.consent;
  const consentOk = consent === true || consent === "true" || consent === "yes" || consent === "on" || consent === "skip";
  if (!consentOk || (consent === "skip" && !contactPage)) {
    return json({
      ok: false,
      error: isEn ? "Consent is required." : "Χρειάζεται η συγκατάθεση.",
    }, 400);
  }

  const fields = normalizeFields(body);
  const lines = [];
  lines.push(isEn ? "New message from the IL Insurance website" : "Νέο μήνυμα από τον ιστότοπο IL Insurance");
  lines.push("");
  lines.push((isEn ? "Page: " : "Σελίδα: ") + (page || "-"));
  lines.push((isEn ? "Name: " : "Ονοματεπώνυμο: ") + name);
  lines.push("Email: " + (email || "-"));
  lines.push((isEn ? "Phone: " : "Τηλέφωνο: ") + (phone || "-"));
  lines.push((isEn ? "What they need: " : "Τι χρειάζεται: ") + (need || "-"));
  lines.push("");
  for (const field of fields) {
    lines.push(field.label + ": " + (field.value || "-"));
  }
  const text = lines.join("\n").slice(0, 20000);

  const to = cleanEmail(env.LEAD_TO_EMAIL) || TO_DEFAULT;
  const from = cleanEmail(env.LEAD_FROM_EMAIL) || FROM_DEFAULT;
  const fromHeader = headerAddress(env.LEAD_FROM_EMAIL, from);
  const mailSubject = stripNewlines(`[IL Insurance] ${subject} — ${name}`).slice(0, 200);
  const transport = detectTransport(env);

  if (!transport) {
    return json({ ok: false, configured: false }, 503);
  }

  try {
    if (transport === "email") await sendCfEmail(env, { from, to, fromHeader, replyTo: email, subject: mailSubject, text });
    else if (transport === "resend") await sendResend(env, { fromHeader, to, replyTo: email, subject: mailSubject, text });
    else await sendWebhook(env, { subject: mailSubject, name, email, phone, need, page, lang, text, fields });
  } catch {
    return json({
      ok: false,
      configured: true,
      error: isEn ? "The message could not be delivered. Please call or use email." : "Η αποστολή δεν ολοκληρώθηκε. Καλέστε ή στείλτε email.",
    }, 502);
  }

  return json({ ok: true, configured: true }, 200);
}

function detectTransport(env) {
  if (env && env.EMAIL && typeof env.EMAIL.send === "function") return "email";
  if (String(env?.RESEND_API_KEY || "").trim()) return "resend";
  if (String(env?.LEAD_WEBHOOK_URL || "").trim()) return "webhook";
  return "";
}

async function readBody(request) {
  const ct = (request.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) return await request.json();
  if (ct.includes("form")) {
    const fd = await request.formData();
    const obj = {};
    for (const [key, value] of fd.entries()) {
      if (typeof value === "string") obj[key] = value;
    }
    return obj;
  }
  return await request.json();
}

function normalizeFields(body) {
  if (Array.isArray(body.fields)) {
    return body.fields.slice(0, 40).map((field) => ({
      label: clip(field && field.label, 160),
      value: clip(field && field.value, 4000),
    })).filter((field) => field.label);
  }
  const skip = new Set(["company_website", "consent", "name", "phone", "email", "need", "subject", "lang", "page"]);
  return Object.entries(body)
    .filter(([key]) => !skip.has(key))
    .slice(0, 40)
    .map(([key, value]) => ({ label: clip(key, 160), value: clip(value, 4000) }))
    .filter((field) => field.label);
}

async function sendCfEmail(env, mail) {
  const { EmailMessage } = await import("cloudflare:email");
  const message = new EmailMessage(mail.from, mail.to, buildRaw(mail));
  await env.EMAIL.send(message);
}

async function sendResend(env, mail) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${String(env.RESEND_API_KEY).trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: mail.fromHeader,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
      reply_to: mail.replyTo || undefined,
    }),
  });
  if (!res.ok) throw new Error("resend");
}

async function sendWebhook(env, payload) {
  const res = await fetch(String(env.LEAD_WEBHOOK_URL).trim(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("webhook");
}

function buildRaw(mail) {
  const headers = [
    `From: ${mail.fromHeader}`,
    `To: ${mail.to}`,
    mail.replyTo && validEmail(mail.replyTo) ? `Reply-To: ${mail.replyTo}` : "",
    `Subject: ${encodeHeader(mail.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ].filter(Boolean);
  return `${headers.join("\r\n")}\r\n\r\n${wrap76(utf8ToB64(mail.text))}\r\n`;
}

function headerAddress(raw, fallback) {
  const value = stripNewlines(String(raw || "").trim());
  if (value.includes("<") && value.includes(">")) return value;
  return `IL Insurance <${fallback}>`;
}

function encodeHeader(value) {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${utf8ToB64(value)}?=`;
}

function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin);
}

function wrap76(value) {
  return value.replace(/.{1,76}/g, "$&\r\n").trim();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function cleanEmail(value) {
  const match = String(value || "").match(/[^\s<>]+@[^\s<>]+/);
  return match && validEmail(match[0]) ? match[0] : "";
}

function stripNewlines(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function clip(value, max) {
  return stripNewlines(value).slice(0, max);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
