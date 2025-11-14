// client/src/Login.jsx
import React, { useState } from 'react'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('user1@comp.com')
  const [password, setPassword] = useState('password')
  const [error, setError] = useState(null)
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:3001/api'

  async function submit(e) {
    e.preventDefault()
    setError(null)
    try {
      const res = await fetch(`${API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.message || 'Login failed')
      localStorage.setItem('mrbs_token', j.token)
      localStorage.setItem('mrbs_user', JSON.stringify({ id: j.userId, name: j.userName, email: j.email }))
      onLogin(j.token, { id: j.userId, name: j.userName, email: j.email })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div style={{display:'flex', minHeight:'100vh', alignItems:'center', justifyContent:'center'}}>
      <div className="card" style={{width:380}}>
        <h2>Sign in</h2>
        <p className="small">Use seeded account: <strong>user1@comp.com / password</strong></p>
        {error && <div style={{color:'#ef4444'}}>{error}</div>}
        <form onSubmit={submit} style={{display:'grid', gap:10, marginTop:12}}>
          <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
          <input placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
          <div style={{display:'flex', gap:10}}>
            <button className="btn btn-primary" type="submit">Sign In</button>
          </div>
        </form>
      </div>
    </div>
  )
}
