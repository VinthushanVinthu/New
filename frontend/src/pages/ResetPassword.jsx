import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import "../styles/reset.css"; // ✅ New CSS

export default function ResetPassword() {
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setBusy(true);

    try {
      const { data } = await api.post("/mail/reset-password", {
        otp,
        newPassword,
      });

      setMsg(data?.message || "Password reset successfully!");
      setOtp("");
      setNewPassword("");
    } catch (e2) {
      setErr(e2?.response?.data?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="reset-page">
      <div className="reset-card">
        <h2 className="reset-title">Reset Password</h2>

        {msg && <div className="reset-success">{msg}</div>}
        {err && <div className="reset-error">{err}</div>}

        <form onSubmit={submit} className="reset-form">
          <div className="reset-field">
            <label htmlFor="rp-otp" className="reset-label">
              OTP (6 digits)
            </label>
            <input
              id="rp-otp"
              className="reset-input"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              required
            />
          </div>

          <div className="reset-field">
            <label htmlFor="rp-pass" className="reset-label">
              New Password
            </label>
            <input
              id="rp-pass"
              className="reset-input"
              type="password"
              placeholder="••••••••"
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          <button className="reset-btn" type="submit" disabled={busy}>
            {busy ? "Resetting…" : "Reset Password"}
          </button>

          <div className="reset-actions">
            <Link className="reset-link small-text" to="/forgot">
              Didn’t get OTP?
            </Link>
            <Link className="reset-link small-text" to="/login">
              Back to Login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
