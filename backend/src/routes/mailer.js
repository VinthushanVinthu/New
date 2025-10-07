import { db } from "../config/db.js";
import { Router } from "express";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";

const router = Router();
const saltRounds = 10;

// ------------------ Forgot Password (OTP) ------------------
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  
  console.log("🔐 Forgot password request for:", email);
  
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const sqlFind = "SELECT id, email, name FROM users WHERE email = ?";
  
  db.query(sqlFind, [email], async (err, rows) => {
    // Always return generic response for security
    const genericResponse = { 
      message: "If an account exists with this email, an OTP has been sent." 
    };
    
    if (err) {
      console.error("❌ Database error:", err);
      return res.json(genericResponse);
    }
    
    if (!rows || rows.length === 0) {
      console.log("❌ No user found with email:", email);
      return res.json(genericResponse);
    }

    const user = rows[0];
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 10 * 60 * 1000; // 10 minutes

    console.log(`📧 Generated OTP for ${user.email}: ${otp}`);

    // Update user with OTP
    db.query(
      "UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?",
      [otp, expires, user.id],
      async (updateErr) => {
        if (updateErr) {
          console.error("❌ Error updating user with OTP:", updateErr);
          return res.json(genericResponse);
        }

        console.log("✅ OTP saved to database");

        // Send response immediately
        res.json(genericResponse);

        // Send email in background
        try {
          await sendOtpEmail(user.email, user.name, otp);
        } catch (mailError) {
          console.error("❌ Failed to send OTP email:", mailError);
        }
      }
    );
  });
});

// Enhanced Email Sending Function
async function sendOtpEmail(userEmail, userName, otp) {
  console.log("📧 Attempting to send email to:", userEmail);
  
  const smtpConfig = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: true, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    // Add these for better Gmail compatibility
    tls: {
      rejectUnauthorized: false
    }
  };

  console.log("🔧 SMTP Configuration:", {
    host: smtpConfig.host,
    port: smtpConfig.port,
    user: smtpConfig.auth.user,
    secure: smtpConfig.secure
  });

  try {
    const transporter = nodemailer.createTransport(smtpConfig);

    // Verify connection configuration
    console.log("🔌 Verifying SMTP connection...");
    await transporter.verify();
    console.log("✅ SMTP connection verified successfully");

    const mailOptions = {
      from: {
        name: "Retail Billing System",
        address: process.env.SMTP_USER
      },
      to: userEmail,
      subject: "Password Reset OTP - Retail Billing System",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <div style="text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px 10px 0 0; color: white;">
            <h1 style="margin: 0;">🔐 Password Reset</h1>
          </div>
          <div style="padding: 30px;">
            <h2 style="color: #333;">Hello ${userName || 'there'},</h2>
            <p style="color: #666; font-size: 16px;">You requested a password reset for your Retail Billing System account.</p>
            <p style="color: #666; font-size: 16px;">Use the OTP below to reset your password:</p>
            
            <div style="background: #f8f9fa; padding: 20px; text-align: center; margin: 30px 0; border-radius: 8px; border: 2px dashed #667eea;">
              <h1 style="margin: 0; color: #333; letter-spacing: 8px; font-size: 32px;">${otp}</h1>
            </div>
            
            <p style="color: #999; font-size: 14px;">
              <strong>⚠️ This OTP will expire in 10 minutes.</strong><br/>
              If you didn't request this reset, please ignore this email.
            </p>
          </div>
          <div style="background: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 10px 10px;">
            <p style="margin: 0; color: #999; font-size: 12px;">
              &copy; 2024 Retail Billing System. All rights reserved.
            </p>
          </div>
        </div>
      `,
      text: `Your OTP for password reset is: ${otp}. This OTP expires in 10 minutes.`
    };

    console.log("📤 Sending email...");
    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully! Message ID:", info.messageId);
    console.log("✅ Email preview URL:", nodemailer.getTestMessageUrl(info));
    
    return info;
  } catch (error) {
    console.error("❌ Email sending failed:", error);
    throw error;
  }
}

// ------------------ Reset Password ------------------
router.post("/reset-password", (req, res) => {
  const { otp, newPassword } = req.body;

  console.log("🔄 Reset password request received");

  if (!otp || !newPassword) {
    return res.status(400).json({ 
      error: "OTP and new password are required" 
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ 
      error: "Password must be at least 6 characters long" 
    });
  }

  const sqlFind = "SELECT id, reset_expires FROM users WHERE reset_token = ?";
  
  db.query(sqlFind, [otp], (err, rows) => {
    if (err) {
      console.error("❌ Database error:", err);
      return res.status(500).json({ error: "Database error occurred" });
    }

    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    const user = rows[0];
    
    // Check if OTP is expired
    if (Date.now() > Number(user.reset_expires)) {
      return res.status(400).json({ error: "OTP has expired" });
    }

    // Hash new password
    bcrypt.hash(newPassword, saltRounds, (hashErr, hash) => {
      if (hashErr) {
        console.error("❌ Password hashing error:", hashErr);
        return res.status(500).json({ error: "Error processing password" });
      }

      // Update password and clear reset token
      const sqlUpdate = `
        UPDATE users 
        SET password_hash = ?, reset_token = NULL, reset_expires = NULL 
        WHERE id = ?
      `;
      
      db.query(sqlUpdate, [hash, user.id], (updateErr) => {
        if (updateErr) {
          console.error("❌ Error updating password:", updateErr);
          return res.status(500).json({ error: "Failed to reset password" });
        }

        console.log("✅ Password reset successful for user ID:", user.id);
        res.json({ 
          success: true, 
          message: "Password reset successfully! You can now login with your new password." 
        });
      });
    });
  });
});

// ------------------ Test Email Configuration ------------------
router.post("/test-email", async (req, res) => {
  const { to } = req.body;
  
  if (!to) {
    return res.status(400).json({ error: "Recipient email is required" });
  }

  try {
    const smtpConfig = {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
      tls: {
        rejectUnauthorized: false
      }
    };

    const transporter = nodemailer.createTransport(smtpConfig);
    
    console.log("🔧 Testing SMTP configuration...");
    await transporter.verify();
    console.log("✅ SMTP connection verified");

    const testOtp = "123456"; // Test OTP
    const info = await transporter.sendMail({
      from: {
        name: "Retail Billing - Test",
        address: process.env.SMTP_USER
      },
      to: to,
      subject: "📧 Test Email - Retail Billing System",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h1 style="color: green;">✅ Email Test Successful!</h1>
          <p>This is a test email from your Retail Billing System.</p>
          <p>If you can see this email, your SMTP configuration is working correctly.</p>
          <p><strong>Test OTP:</strong> ${testOtp}</p>
          <p><strong>Time:</strong> ${new Date().toString()}</p>
        </div>
      `,
      text: `Test email successful! Test OTP: ${testOtp}`
    });

    console.log("✅ Test email sent successfully!");
    res.json({ 
      success: true, 
      message: "Test email sent successfully! Check your inbox.",
      messageId: info.messageId 
    });
  } catch (error) {
    console.error("❌ Test email failed:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ------------------ Send General Mail ------------------
router.post("/sendmail", async (req, res) => {
  const { to, subject, text } = req.body;

  console.log("📧 General sendmail request to:", to);

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    await transporter.verify();

    const info = await transporter.sendMail({
      from: {
        name: "Retail Billing System",
        address: process.env.SMTP_USER
      },
      to,
      subject: subject || "Message from Retail Billing System",
      text: text || "This is a test email from your application.",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px; color: white; text-align: center;">
            <h1>Retail Billing System</h1>
          </div>
          <div style="padding: 30px; background: #f9f9f9;">
            <h2>${subject || "Message from Retail Billing System"}</h2>
            <p style="font-size: 16px; line-height: 1.6;">${text || "This is a test email from your application."}</p>
          </div>
        </div>
      `,
    });

    console.log("✅ General email sent:", info.messageId);
    res.json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error("❌ Send mail error:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

export default router;