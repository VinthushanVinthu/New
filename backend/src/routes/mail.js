// routes/mail.js
import { Router } from "express";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { db } from "../config/db.js";

const router = Router();
const saltRounds = 10;

/* ========== helpers ========== */
function genOtp() {
  // 6-digit numeric
  return Math.floor(100000 + Math.random() * 900000).toString();
}
function genericResp(res) {
  // Always reply generically for forgot flow
  return res.json({ message: "If an account exists with this email, an OTP has been sent." });
}
function buildTransport() {
  const host = (process.env.SMTP_HOST || "smtp.gmail.com").trim();
  const port = parseInt((process.env.SMTP_PORT || "465").trim(), 10);
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASSWORD || "").trim();

  if (!user || !pass) {
    throw new Error("SMTP_USER / SMTP_PASSWORD missing in environment");
  }

  // Gmail-friendly transport. We skip transporter.verify() to avoid slow/blocked calls.
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465, false for 587/25
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });
}

/* =========================================================
   Forgot Password (OTP)
   ========================================================= */
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  console.log("🔐 Forgot password request:", email);

  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    // 1) Find user by email
    const [rows] = await db.query(
      "SELECT id, email, name FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    // Always respond generically (Do this once; email sending happens after)
    genericResp(res);

    if (!rows || rows.length === 0) {
      console.log("ⓘ No user for email (generic reply already sent).");
      return; // stop background work
    }

    const user = rows[0];
    const otp = genOtp();
    const expires = Date.now() + 10 * 60 * 1000; // 10 minutes from now

    // 2) Save OTP
    await db.query(
      "UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?",
      [otp, expires, user.id]
    );

    console.log(`✅ OTP ${otp} saved for ${user.email}`);

    // 3) Fire-and-forget email (no await on res, we've already responded)
    try {
      const transporter = buildTransport();

      const mailOptions = {
        from: { name: "Retail Billing System", address: process.env.SMTP_USER },
        to: user.email,
        subject: "Password Reset OTP - Retail Billing System",
        text: `Your OTP is ${otp} (valid 10 minutes).`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #ddd;border-radius:10px;">
            <div style="text-align:center;background:#4f46e5;padding:20px;border-radius:10px 10px 0 0;color:white;">
              <h1 style="margin:0;">Password Reset</h1>
            </div>
            <div style="padding:30px;">
              <h2 style="color:#333;">Hello ${user.name ? user.name : "there"},</h2>
              <p style="color:#555;">Use the OTP below to reset your password (valid 10 minutes):</p>
              <div style="background:#f8f9fa;padding:20px;text-align:center;margin:24px 0;border-radius:8px;border:2px dashed #4f46e5;">
                <h1 style="letter-spacing:8px;margin:0;color:#111;">${otp}</h1>
              </div>
              <p style="color:#999;font-size:14px;">If you didn't request this, you can safely ignore this email.</p>
            </div>
          </div>
        `,
      };

      const info = await transporter.sendMail(mailOptions);
      console.log("📤 OTP email sent:", info.messageId);
    } catch (mailErr) {
      console.error("❌ Failed to send OTP email:", mailErr?.message || mailErr);
    }
  } catch (err) {
    // Even if DB throws, we already replied generically.
    console.error("❌ Forgot password DB error:", err?.message || err);
  }
});

/* =========================================================
   Reset Password
   ========================================================= */
router.post("/reset-password", async (req, res) => {
  const { otp, newPassword } = req.body;
  console.log("🔄 Reset password attempt");

  if (!otp || !newPassword) {
    return res.status(400).json({ error: "OTP and new password are required" });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters long" });
  }

  try {
    const [rows] = await db.query(
      "SELECT id, reset_expires FROM users WHERE reset_token = ? LIMIT 1",
      [otp]
    );

    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    const user = rows[0];
    const expiresAt = Number(user.reset_expires);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
      return res.status(400).json({ error: "OTP has expired" });
    }

    const hash = await bcrypt.hash(newPassword, saltRounds);

    await db.query(
      `UPDATE users
       SET password_hash = ?, reset_token = NULL, reset_expires = NULL
       WHERE id = ?`,
      [hash, user.id]
    );

    console.log("✅ Password reset for user:", user.id);
    return res.json({ message: "Password reset successfully! You can now login." });
  } catch (err) {
    console.error("❌ Reset password error:", err?.message || err);
    return res.status(500).json({ error: "Server error resetting password" });
  }
});

/* =========================================================
   Send General Mail
   ========================================================= */
router.post("/sendmail", async (req, res) => {
  const { to, subject, text } = req.body;
  if (!to) return res.status(400).json({ error: "Recipient email (to) is required" });

  try {
    const transporter = buildTransport();

    const info = await transporter.sendMail({
      from: { name: "Retail Billing System", address: process.env.SMTP_USER },
      to,
      subject: subject || "Message from Retail Billing System",
      text: text || "This is a test email from your application.",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:#4f46e5;padding:20px;border-radius:10px;color:white;text-align:center;">
            <h1 style="margin:0;">Retail Billing System</h1>
          </div>
          <div style="padding:24px;background:#f9fafb;border-radius:8px;margin-top:12px;">
            <h2 style="margin-top:0;">${subject || "Message from Retail Billing System"}</h2>
            <p style="font-size:16px;line-height:1.6;">${text || "This is a test email from your application."}</p>
          </div>
        </div>
      `,
    });

    console.log("✅ General email sent:", info.messageId);
    return res.json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error("❌ sendmail failed:", error?.message || error);
    return res.status(500).json({ success: false, error: "Failed to send email" });
  }
});

/* =========================================================
   Test SMTP
   ========================================================= */
router.post("/test-email", async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: "Recipient email is required" });

  try {
    const transporter = buildTransport();
    const info = await transporter.sendMail({
      from: { name: "Retail Billing - Test", address: process.env.SMTP_USER },
      to,
      subject: "SMTP Test - Retail Billing",
      text: `Test OK at ${new Date().toISOString()}`,
      html: `<p>Test OK at <b>${new Date().toString()}</b></p>`,
    });

    return res.json({ success: true, message: "Test email sent!", messageId: info.messageId });
  } catch (e) {
    console.error("❌ SMTP test failed:", e?.message || e);
    return res.status(500).json({ success: false, error: "SMTP send failed" });
  }
});

export default router;
