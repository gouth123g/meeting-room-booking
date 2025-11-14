import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Dummy room data
let rooms = [
  { id: 1, name: "Conference Room A", capacity: 10, bookings: [], waitingList: [] },
  { id: 2, name: "Meeting Room B", capacity: 6, bookings: [], waitingList: [] },
  { id: 3, name: "Hall C", capacity: 20, bookings: [], waitingList: [] }
];

// ✅ Get all rooms
app.get("/api/rooms", (req, res) => res.json(rooms));

// ✅ Book a room (handles waiting logic)
app.post("/api/book", (req, res) => {
  const { roomId, user, date, time } = req.body;

  // Check if user selected a specific room
  if (roomId) {
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return res.status(404).json({ message: "Room not found" });

    const existing = room.bookings.find((b) => b.date === date && b.time === time);

    if (existing) {
      room.waitingList.push({ user, date, time });
      return res.json({
        message: `⚠️ ${room.name} is already booked by ${existing.user} on ${date} at ${time}. You are added to the waiting list.`,
        currentMeeting: existing
      });
    }

    room.bookings.push({ user, date, time });
    return res.json({ message: `✅ ${room.name} booked for ${date} at ${time} by ${user}` });
  }

  // If no specific room chosen, find any available
  const availableRoom = rooms.find(
    (r) => !r.bookings.find((b) => b.date === date && b.time === time)
  );

  if (availableRoom) {
    availableRoom.bookings.push({ user, date, time });
    return res.json({
      message: `✅ ${availableRoom.name} assigned automatically and booked for ${date} at ${time}`
    });
  }

  // All rooms are booked
  res.json({
    message: "🚫 All rooms are booked for this time. Please wait or choose a specific room."
  });
});

// ✅ Admin summary
app.get("/api/rooms/summary", (req, res) => {
  const total = rooms.length;
  const booked = rooms.filter((r) => r.bookings.length > 0).length;
  const available = total - booked;
  res.json({ total, booked, available });
});

app.listen(5000, () => console.log("✅ Server running on port 5000"));
