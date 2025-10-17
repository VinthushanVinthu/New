import nodemailer from "nodemailer";

let cachedTransporter = null;
let cachedSender = null;

function ensureString(value, fallback = "") {
  return (value ?? fallback).toString().trim();
}

function resolveSender() {
  if (cachedSender) return cachedSender;
  const address = ensureString(process.env.SMTP_FROM || process.env.SMTP_USER);
  if (!address) {
    throw new Error("SMTP_FROM or SMTP_USER must be configured to send emails.");
  }
  const name = ensureString(process.env.SMTP_FROM_NAME || "Retail Billing System");
  cachedSender = { name, address };
  return cachedSender;
}

export function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const host = ensureString(process.env.SMTP_HOST || "smtp.gmail.com");
  const port = Number.parseInt(ensureString(process.env.SMTP_PORT || "465"), 10);
  const user = ensureString(process.env.SMTP_USER);
  const pass = ensureString(process.env.SMTP_PASSWORD);

  if (!user || !pass) {
    throw new Error("SMTP_USER and SMTP_PASSWORD must be configured to send emails.");
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });

  return cachedTransporter;
}

export async function sendEmail(options = {}) {
  const { to, subject, text, html, attachments, from } = options;

  const recipient = Array.isArray(to) ? to.filter(Boolean).join(",") : ensureString(to);
  if (!recipient) {
    throw new Error("Recipient email address is required.");
  }

  const transporter = getTransporter();
  const sender = from || resolveSender();

  return transporter.sendMail({
    from: sender,
    to: recipient,
    subject: ensureString(subject, "Retail Billing System"),
    text: ensureString(text),
    html: html || undefined,
    attachments,
  });
}

