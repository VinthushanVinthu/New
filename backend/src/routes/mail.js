// routes/mail.js
import { Router } from "express";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { db } from "../config/db.js";

const router = Router();
const saltRounds = 10;

// ---- helpers ----
function genOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
function genericResp(res) {
  // Always reply generically for forgot flow
  return res.json({ message: "If an account exists with this email, an OTP has been sent." });
}
function buildTransport() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "465", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!user || !pass) {
    throw new Error("SMTP_USER / SMTP_PASSWORD missing in environment");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });
}

// ------------------ Forgot Password (OTP) ------------------
router.post("/forgot-password", (req, res) => {
  const { email } = req.body;
  console.log("🔐 Forgot password request:", email);

  if (!email) return res.status(400).json({ error: "Email is required" });

  const sqlFind = "SELECT id, email, name FROM users WHERE email = ?";
  db.query(sqlFind, [email], (err, rows) => {
    // Always reply generically regardless of outcome
    if (err) {
      console.error("❌ DB error on forgot:", err);
      return genericResp(res);
    }
    if (!rows || rows.length === 0) {
      console.log("ⓘ No user for email (generic reply sent).");
      return genericResp(res);
    }

    const user = rows[0];
    const otp = genOtp();
    const expires = Date.now() + 10 * 60 * 1000; // 10 minutes

    const sqlUpd = "UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?";
    db.query(sqlUpd, [otp, expires, user.id], async (uErr) => {
      // respond immediately (generic)
      genericResp(res);

      if (uErr) {
        console.error("❌ Error saving OTP:", uErr);
        return;
      }
      console.log(`✅ OTP ${otp} saved for ${user.email}`);

      try {
        const transporter = buildTransport();
        await transporter.verify();

        const mailOptions = {
          from: { name: "Retail Billing System", address: process.env.SMTP_USER },
          to: user.email,
          subject: "Password Reset OTP - Retail Billing System",
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #ddd;border-radius:10px;">
              <div style="text-align:center;background:#4f46e5;padding:20px;border-radius:10px 10px 0 0;color:white;">
                <h1 style="margin:0;">Password Reset</h1>
              </div>
              <div style="padding:30px;">
                <h2 style="color:#333;">Hello ${user.name || "there"},</h2>
                <p style="color:#555;">Use the OTP below to reset your password (valid 10 minutes):</p>
                <div style="background:#f8f9fa;padding:20px;text-align:center;margin:24px 0;border-radius:8px;border:2px dashed #4f46e5;">
                  <h1 style="letter-spacing:8px;margin:0;color:#111;">${otp}</h1>
                </div>
                <p style="color:#999;font-size:14px;">If you didn't request this, you can safely ignore this email.</p>
              </div>
            </div>
          `,
          text: `Your OTP is ${otp} (valid 10 minutes).`,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("📤 OTP email sent:", info.messageId);
      } catch (mailErr) {
        console.error("❌ Failed to send OTP email:", mailErr.message);
      }
    });
  });
});

// ------------------ Reset Password ------------------
router.post("/reset-password", (req, res) => {
  const { otp, newPassword } = req.body;
  console.log("🔄 Reset password attempt");

  if (!otp || !newPassword) {
    return res.status(400).json({ error: "OTP and new password are required" });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters long" });
  }

  const sqlFind = "SELECT id, reset_expires FROM users WHERE reset_token = ?";
  db.query(sqlFind, [otp], (err, rows) => {
    if (err) {
      console.error("❌ DB error on reset:", err);
      return res.status(500).json({ error: "Database error" });
    }
    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    const user = rows[0];
    if (Date.now() > Number(user.reset_expires)) {
      return res.status(400).json({ error: "OTP has expired" });
    }

    bcrypt.hash(newPassword, saltRounds, (hErr, hash) => {
      if (hErr) {
        console.error("❌ Hash error:", hErr);
        return res.status(500).json({ error: "Error processing password" });
      }

      const sqlUpd = `
        UPDATE users
        SET password_hash = ?, reset_token = NULL, reset_expires = NULL
        WHERE id = ?
      `;
      db.query(sqlUpd, [hash, user.id], (uErr) => {
        if (uErr) {
          console.error("❌ Update password error:", uErr);
          return res.status(500).json({ error: "Failed to reset password" });
        }
        console.log("✅ Password reset for user:", user.id);
        res.json({ message: "Password reset successfully! You can now login." });
      });
    });
  });
});

// ------------------ Send General Mail ------------------
router.post("/sendmail", async (req, res) => {
  const { to, subject, text } = req.body;
  if (!to) return res.status(400).json({ error: "Recipient email (to) is required" });

  try {
    const transporter = buildTransport();
    await transporter.verify();

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
    res.json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error("❌ sendmail failed:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ------------------ Test SMTP ------------------
router.post("/test-email", async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: "Recipient email is required" });

  try {
    const transporter = buildTransport();
    await transporter.verify();

    const info = await transporter.sendMail({
      from: { name: "Retail Billing - Test", address: process.env.SMTP_USER },
      to,
      subject: "SMTP Test - Retail Billing",
      text: `Test OK at ${new Date().toISOString()}`,
      html: `<p>Test OK at <b>${new Date().toString()}</b></p>`,
    });

    res.json({ success: true, message: "Test email sent!", messageId: info.messageId });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
