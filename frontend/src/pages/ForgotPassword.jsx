import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import "../styles/ForgotPassword.css"; // ✅ unique CSS file

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setBusy(true);

    try {
      const { data } = await api.post("/mail/forgot-password", { email });
      setMsg(data?.message || "If an account exists with this email, an OTP has been sent.");

      // Redirect to reset page after 2s
      setTimeout(() => navigate("/reset"), 2000);
    } catch (e2) {
      setErr(e2?.response?.data?.error || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fp-page">
      <div className="fp-card">
        <h2 className="fp-title">Forgot Password</h2>

        {msg && <div className="fp-success">{msg}</div>}
        {err && <div className="fp-error">{err}</div>}

        <form onSubmit={submit} className="fp-form">
          <div className="fp-field">
            <label htmlFor="fp-email" className="fp-label">
              Registered Email
            </label>
            <input
              id="fp-email"
              className="fp-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <button className="fp-btn" type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send OTP"}
          </button>

          <div className="fp-actions">
            <Link className="fp-link small-text" to="/login">
              Back to Login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
