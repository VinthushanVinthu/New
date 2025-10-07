import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js"; // ✅ use same base api
import "../styles/ForgotPassword.css";


export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setBusy(true);

    try {
      // ✅ use api.post just like Login.jsx
      const { data } = await api.post("/mail/forgot-password", { email });

      setMsg(data?.message || "If an account exists, an OTP has been sent.");
      setEmail("");
    } catch (e2) {
      // friendly error
      setErr(e2?.response?.data?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2 className="auth-title">Forgot Password</h2>

        {msg && <div className="auth-success">{msg}</div>}
        {err && <div className="auth-error">{err}</div>}

        <form onSubmit={submit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="fp-email" className="auth-label">Registered Email</label>
            <input
              id="fp-email"
              className="auth-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <button className="auth-btn" type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send OTP"}
          </button>

          <div className="auth-actions" style={{ marginTop: 8 }}>
            <Link className="auth-link small-text" to="/login">Back to Login</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
