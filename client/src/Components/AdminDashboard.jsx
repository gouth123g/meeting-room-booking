import React, { useEffect, useState } from "react";

export default function AdminDashboard() {
  const [rooms, setRooms] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // fetch full room data (includes bookings and waitingList)
  const fetchRooms = async () => {
    try {
      setLoading(true);
      const res = await fetch("http://localhost:5000/api/rooms");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRooms(data);
      setError(null);
    } catch (err) {
      console.error("Error fetching rooms:", err);
      setError("Failed to fetch rooms.");
      setRooms(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
    const id = setInterval(fetchRooms, 20000); // refresh every 20s
    return () => clearInterval(id);
  }, []);

  if (loading) return <p style={{ textAlign: "center", marginTop: 40 }}>Loading rooms...</p>;
  if (error) return <p style={{ textAlign: "center", marginTop: 40, color: "red" }}>{error}</p>;
  if (!rooms || rooms.length === 0)
    return <p style={{ textAlign: "center", marginTop: 40 }}>No rooms found.</p>;

  const renderBooking = (b, idx) => {
    const date = b.date ?? b.bookingDate ?? "—";
    const start = b.start ?? b.start_time ?? b.startTime ?? b.time ?? "—";
    const end = b.end ?? b.end_time ?? b.endTime ?? b.to ?? "—";
    const user = b.user ?? "—";
    const confirmed = b.confirmed_at ?? b.confirmedAt ?? "—";
    return (
      <li key={idx} style={{ marginBottom: 6 }}>
        <strong>{user}</strong> — {date} &nbsp; {start} → {end}{" "}
        <span style={{ color: "#666", fontSize: 12 }}>({confirmed !== "—" ? `confirmed: ${confirmed}` : "unconfirmed"})</span>
      </li>
    );
  };

  const renderWaiting = (w, idx) => {
    const date = w.date ?? w.requestedDate ?? w.bookingDate ?? "—";
    const start = w.start ?? w.start_time ?? w.startTime ?? w.time ?? "—";
    const end = w.end ?? w.end_time ?? w.endTime ?? w.to ?? "—";
    const user = w.user ?? "—";
    const created = w.created_at ?? w.createdAt ?? "—";
    return (
      <li key={idx} style={{ marginBottom: 6 }}>
        <strong>{user}</strong> — {date} &nbsp; {start} → {end}{" "}
        <span style={{ color: "#666", fontSize: 12 }}>({created !== "—" ? `requested: ${created}` : "requested time unknown"})</span>
      </li>
    );
  };

  return (
    <div style={{ maxWidth: 980, margin: "30px auto", padding: 12 }}>
      <h1 style={{ textAlign: "center" }}>Admin Dashboard</h1>

      <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 14, color: "#444" }}>
          <strong>Total rooms:</strong> {rooms.length} &nbsp; • &nbsp;
          <strong>Rooms with bookings:</strong> {rooms.filter(r => r.bookings && r.bookings.length > 0).length} &nbsp; • &nbsp;
          <strong>Rooms with waiting list:</strong> {rooms.filter(r => r.waitingList && r.waitingList.length > 0).length}
        </div>

        <div>
          <button onClick={fetchRooms} style={{ padding: "6px 10px", cursor: "pointer" }}>
            Refresh
          </button>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        {rooms.map((r) => (
          <div
            key={r.id}
            style={{
              border: "1px solid #e2e2e2",
              padding: 12,
              borderRadius: 8,
              marginBottom: 12,
              background: "#fff",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0 }}>{r.name}</h3>
                <div style={{ color: "#666", fontSize: 13 }}>
                  Capacity: {r.capacity ?? "—"} • Bookings: {(r.bookings || []).length} • Waiting: {(r.waitingList || []).length}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <strong>Confirmed bookings:</strong>
              {r.bookings && r.bookings.length > 0 ? (
                <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                  {r.bookings.map((b, i) => renderBooking(b, i))}
                </ul>
              ) : (
                <p style={{ color: "#666", marginTop: 8 }}>No confirmed bookings.</p>
              )}
            </div>

            <div style={{ marginTop: 12 }}>
              <strong>Waiting list:</strong>
              {r.waitingList && r.waitingList.length > 0 ? (
                <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                  {r.waitingList.map((w, i) => renderWaiting(w, i))}
                </ul>
              ) : (
                <p style={{ color: "#666", marginTop: 8 }}>No one waiting.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
