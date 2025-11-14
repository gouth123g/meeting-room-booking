import React, { useEffect, useState } from "react";

export default function UserDashboard() {
  const [rooms, setRooms] = useState([]);
  const [message, setMessage] = useState("");
  const [user, setUser] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [selectedRoom, setSelectedRoom] = useState(null);

  const fetchRooms = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/rooms");
      const data = await res.json();
      setRooms(data);
    } catch (err) {
      console.error("Error fetching rooms:", err);
      setMessage("Error fetching rooms from server.");
    }
  };

  useEffect(() => {
    fetchRooms();
    const id = setInterval(fetchRooms, 20000); // optional polling
    return () => clearInterval(id);
  }, []);

  const validateTimes = () => {
    if (!date || !start || !end) {
      alert("Please pick date, start time and end time.");
      return false;
    }
    if (end <= start) {
      alert("End time must be later than start time.");
      return false;
    }
    return true;
  };

  const bookRoom = async () => {
    setMessage("");
    if (!user || !date || !start || !end) {
      alert("Please enter your name, date, start and end time!");
      return;
    }
    if (!validateTimes()) return;

    // If user chose a specific room, check local overlap and ask to wait
    if (selectedRoom) {
      const room = rooms.find((r) => r.id === selectedRoom);
      const existing = (room?.bookings || []).find((b) => {
        if (b.date !== date) return false;
        return start < b.end && b.start < end; // overlap check
      });

      if (existing) {
        const wantToWait = window.confirm(
          `⚠️ ${room.name} is already booked by ${existing.user} from ${existing.start} to ${existing.end} on ${existing.date}.\n\nDo you want to wait for this specific room?`
        );
        if (!wantToWait) {
          setMessage("❌ Booking cancelled.");
          return;
        }
      }
    }

    try {
      const res = await fetch("http://localhost:5000/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: selectedRoom ? selectedRoom : null,
          user,
          date,
          start,
          end,
        }),
      });
      const data = await res.json();
      setMessage(data.message || JSON.stringify(data));
      fetchRooms();
    } catch (err) {
      console.error("Error booking room:", err);
      setMessage("Error booking room. Try again.");
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: "30px" }}>
      <h1>Room Booking</h1>

      <div style={{ marginBottom: "18px" }}>
        <input
          type="text"
          placeholder="Enter your name"
          value={user}
          onChange={(e) => setUser(e.target.value)}
        />
        <br />
        <div style={{ marginTop: 8 }}>
          <label>Date: </label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <label style={{ marginLeft: 8 }}>Start: </label>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          <label style={{ marginLeft: 8 }}>End: </label>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>

      <h3>Select a Room</h3>
      <div style={{ marginBottom: "10px" }}>
        <label>
          <input
            type="radio"
            name="room"
            checked={selectedRoom === null}
            onChange={() => setSelectedRoom(null)}
          />
          Any Available Room
        </label>
      </div>

      {rooms.map((r) => (
        <div key={r.id}>
          <label>
            <input
              type="radio"
              name="room"
              checked={selectedRoom === r.id}
              onChange={() => setSelectedRoom(r.id)}
            />
            {r.name} (Capacity: {r.capacity})
          </label>
        </div>
      ))}

      <button
        onClick={bookRoom}
        style={{
          marginTop: "18px",
          padding: "10px 20px",
          background: "#007bff",
          color: "white",
          border: "none",
          cursor: "pointer",
        }}
      >
        Book Room
      </button>

      {message && <p style={{ color: "orange", marginTop: "18px" }}>{message}</p>}

      <h3 style={{ marginTop: "22px" }}>Current Room Status</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {rooms.map((r) => (
          <li
            key={r.id}
            style={{
              marginBottom: "20px",
              textAlign: "left",
              maxWidth: 720,
              margin: "20px auto",
              border: "1px solid #e0e0e0",
              padding: 12,
              borderRadius: 8,
            }}
          >
            <strong>{r.name}</strong>
            <div style={{ marginTop: 6 }}>
              {r.bookings && r.bookings.length > 0 ? (
                <>
                  <strong>Confirmed bookings:</strong>
                  <ul>
                    {r.bookings.map((b, i) => (
                      <li key={i}>
                        {b.date} — {b.start} to {b.end} — by {b.user}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>Available ✅</p>
              )}

              {r.waitingList && r.waitingList.length > 0 && (
                <>
                  <strong>Waiting list:</strong>
                  <ul>
                    {r.waitingList.map((w, i) => (
                      <li key={i}>
                        {w.user} waiting for {w.date} {w.start}-{w.end}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
