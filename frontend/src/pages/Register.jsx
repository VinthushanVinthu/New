import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, setToken } from '../lib/api.js';

export default function Register(){
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Owner');
  const [shopCode, setShopCode] = useState('');
  const [err, setErr] = useState('');
  const nav = useNavigate();

  async function submit(e){
    e.preventDefault();
    setErr('');
    try {
      const body = { name, email, password, role, shop_code: role==='Owner' ? undefined : shopCode };
      const { data } = await api.post('/auth/register', body);
      setToken(data.token, data.user);
      if (role==='Owner') nav('/create-shop'); else if (role==='Manager') nav('/manager'); else nav('/cashier');
    } catch (e) {
      setErr(e?.response?.data?.message || 'Registration failed');
    }
  }

  return (
    <div className="card" style={{maxWidth:600, margin:"0 auto"}}>
      <h2>Register</h2>
      <form onSubmit={submit}>
        <div className="flex">
          <input className="input" placeholder="Full name" value={name} onChange={e=>setName(e.target.value)} />
          <select className="input" value={role} onChange={e=>setRole(e.target.value)}>
            <option>Owner</option>
            <option>Manager</option>
            <option>Cashier</option>
          </select>
        </div>
        <br/>
        <input className="input" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
        <br/>
        <input className="input" placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
        <br/>
        {role !== 'Owner' && (
          <>
            <input className="input" placeholder="Shop Secret Code (6-digits)" value={shopCode} onChange={e=>setShopCode(e.target.value)} />
            <br/>
          </>
        )}
        {err && <p style={{color:"#ff8080"}}>{err}</p>}
        <button className="button">Create Account</button>
      </form>
      <p>Have an account? <Link to="/login">Login</Link></p>
    </div>
  )
}
