// src/pages/Login.jsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login(){
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const nav = useNavigate();
  const auth = useAuth();

  async function submit(e){
    e.preventDefault();
    setErr('');
    try {
      const { data } = await api.post('/auth/login', { email, password });
      // Persist + update context -> triggers Header/Sidebar re-render immediately
      auth.login({ token: data.token, user: data.user });

      if (data.user.role === 'Owner') nav('/owner');
      else if (data.user.role === 'Manager') nav('/manager');
      else nav('/cashier');
    } catch (e) {
      setErr(e?.response?.data?.message || 'Login failed');
    }
  }

  return (
    <div className="card" style={{maxWidth:500, margin:"0 auto"}}>
      <h2>Login</h2>
      <form onSubmit={submit}>
        <input className="input" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
        <br/>
        <input className="input" placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
        <br/>
        {err && <p style={{color:"#ff8080"}}>{err}</p>}
        <button className="button">Login</button>
      </form>
      <p>New here? <Link to="/register">Create an account</Link></p>
    </div>
  )
}
