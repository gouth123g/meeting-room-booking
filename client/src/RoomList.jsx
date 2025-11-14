// client/src/RoomList.jsx
import React, { useEffect, useState } from 'react'
import { io } from 'socket.io-client'

const API = import.meta.env.VITE_API_BASE || 'http://localhost:3001/api'
let socket // one socket instance

export default function RoomList({ token, user, onLogout }) {
  const [rooms, setRooms] = useState([])
  const [bookings, setBookings] = useState([])
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [notifications, setNotifications] = useState([])

  useEffect(() => {
    fetchData()
    if (!socket) {
      socket = io('http://localhost:3001')
      socket.on('notification', (n) => {
        setNotifications(prev => [n, ...prev].slice(0,6))
        fetchBookings() // refresh
      })
    }
    // register user socket
    socket.emit('register', user.id)
    return () => {
      // socket.disconnect() // keep for reuse
    }
  // eslint-disable-next-line
  }, [])

  async function fetchData(){
    await fetchRooms()
    await fetchBookings()
  }
  async function fetchRooms(){
    const r = await fetch(`${API}/rooms`, { headers: { Authorization: `Bearer ${token}` } })
    if (r.ok) setRooms(await r.json())
  }
  async function fetchBookings(){
    const r = await fetch(`${API}/bookings`, { headers: { Authorization: `Bearer ${token}` } })
    if (r.ok) setBookings(await r.json())
  }

  async function submitBooking(e){
    e.preventDefault()
    const form = e.target
    const title = form.title.value
    const date = form.date.value
    const start = form.start.value
    const end = form.end.value
    const startISO = new Date(`${date}T${start}`).toISOString()
    const endISO = new Date(`${date}T${end}`).toISOString()
    const res = await fetch(`${API}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ roomId: selectedRoom.id, title, start: startISO, end: endISO })
    })
    if (res.status === 409) {
      const j = await res.json()
      alert(j.message || 'Conflict')
      return
    }
    if (!res.ok) {
      const j = await res.json()
      alert(j.message || 'Error')
      return
    }
    alert('Booked!')
    setSelectedRoom(null)
    fetchBookings()
  }

  async function deleteBooking(id){
    if (!confirm('Delete booking?')) return
    const r = await fetch(`${API}/bookings/${id}`, { method:'DELETE', headers: { Authorization:`Bearer ${token}` } })
    if (!r.ok) {
      alert('Failed to delete')
    } else {
      fetchBookings()
    }
  }

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1>Meeting Room Booker</h1>
          <div className="small">Logged in as: {user.name} ({user.email})</div>
        </div>
        <div>
          <button className="btn btn-danger" onClick={() => { localStorage.removeItem('mrbs_token'); localStorage.removeItem('mrbs_user'); onLogout(); }}>Logout</button>
        </div>
      </div>

      <div style={{display:'flex', gap:16}}>
        <div style={{flex:2}}>
          <h3>Rooms</h3>
          <div className="list">
            {rooms.map(r => (
              <div key={r.id} className="card room">
                <h4>{r.name}</h4>
                <div className="small">{r.description}</div>
                <div className="small">Capacity: {r.capacity}</div>
                <div style={{marginTop:8}}>
                  <button className="btn btn-primary" onClick={() => setSelectedRoom(r)}>Book</button>
                </div>
              </div>
            ))}
          </div>

          <h3 style={{marginTop:18}}>Your / All Bookings</h3>
          <div>
            {bookings.length === 0 && <div className="card small">No bookings</div>}
            <ul>
              {bookings.map(b => (
                <li key={b.id} className="card" style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <div>
                    <div style={{fontWeight:600}}>{b.title}</div>
                    <div className="small">{b.roomName || b.room_id} — {new Date(b.start).toLocaleString()} → {new Date(b.end).toLocaleString()}</div>
                    <div className="small">By: {b.userName || user.name}</div>
                  </div>
                  {b.user_id === user.id && <button className="btn btn-danger" onClick={() => deleteBooking(b.id)}>Delete</button>}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div style={{flex:1}}>
          <div className="card">
            <h4>Notifications</h4>
            {notifications.length === 0 && <div className="small">No notifications</div>}
            {notifications.map((n,i) => (
              <div key={i} className="notification">
                <div style={{fontWeight:600}}>{n.type}</div>
                <div className="small">{n.booking ? `${n.booking.title} @ ${n.booking.roomName}` : JSON.stringify(n)}</div>
              </div>
            ))}
          </div>

          {selectedRoom && (
            <div className="card" style={{marginTop:12}}>
              <h4>Book: {selectedRoom.name}</h4>
              <form onSubmit={submitBooking} style={{display:'grid',gap:8}}>
                <input name="title" placeholder="Title" required />
                <input type="date" name="date" required defaultValue={new Date().toISOString().split('T')[0]} />
                <div style={{display:'flex', gap:8}}>
                  <input type="time" name="start" required defaultValue="09:00" />
                  <input type="time" name="end" required defaultValue="10:00" />
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button className="btn btn-primary" type="submit">Confirm</button>
                  <button type="button" className="btn" onClick={() => setSelectedRoom(null)}>Cancel</button>
                </div>
              </form>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
