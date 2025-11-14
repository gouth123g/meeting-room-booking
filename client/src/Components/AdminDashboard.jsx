import React, { useEffect, useState } from "react";

export default function AdminDashboard() {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    fetch("http://localhost:5000/api/rooms/summary")
      .then(res => res.json())
      .then(data => setSummary(data))
      .catch(err => console.error("Error fetching summary:", err));
  }, []);

  if (!summary) return <p>Loading data...</p>;

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h1>Admin Dashboard</h1>
      <h3>Total Rooms: {summary.total}</h3>
      <h3>Booked Rooms: {summary.booked}</h3>
      <h3>Available Rooms: {summary.available}</h3>
    </div>
  );
}

