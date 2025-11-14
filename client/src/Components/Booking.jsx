import React, { useState } from "react";

function Booking() {
  const [room, setRoom] = useState("");
  const [time, setTime] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (room && time) {
      setSuccess(true);
      setRoom("");
      setTime("");
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: "80px" }}>
      <h2>Book a Meeting Room</h2>
      <form onSubmit={handleSubmit} style={{ marginTop: "20px" }}>
        <select
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          required
          style={{ padding: "10px", margin: "10px" }}
        >
          <option value="">Select Room</option>
          <option value="Room A">Room A</option>
          <option value="Room B">Room B</option>
          <option value="Room C">Room C</option>
        </select>

        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          required
          style={{ padding: "10px", margin: "10px" }}
        />

        <button
          type="submit"
          style={{
            backgroundColor: "#28a745",
            color: "white",
            border: "none",
            padding: "10px 20px",
            cursor: "pointer",
          }}
        >
          Book Room
        </button>
      </form>

      {success && (
        <p
          style={{
            color: "green",
            fontWeight: "bold",
            marginTop: "20px",
          }}
        >
          ✅ Booking successful!
        </p>
      )}
    </div>
  );
}

export default Booking;
