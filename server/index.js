import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

/* -------------------- IN-MEMORY DATA -------------------- */

let rooms = [
  { id: 1, name: "Conference Room A", capacity: 10, bookings: [], waitingList: [] },
  { id: 2, name: "Meeting Room B", capacity: 6, bookings: [], waitingList: [] },
  { id: 3, name: "Hall C", capacity: 20, bookings: [], waitingList: [] }
];

/* -------------------- GENERIC HELPERS -------------------- */

// pick first non-empty field
function pick(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

// combine "YYYY-MM-DD" and "HH:MM" into Date (local time)
function makeDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const iso = `${dateStr}T${timeStr}:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/* -------------------- BASIC ENDPOINTS -------------------- */

// GET all rooms
app.get("/api/rooms", (req, res) => {
  res.json(rooms);
});

// Book a room (handles waiting logic)
app.post("/api/book", (req, res) => {
  try {
    const { roomId, user, date } = req.body;

    const start = pick(req.body.start, req.body.start_time, req.body.startTime, req.body.time);
    const end = pick(
      req.body.end,
      req.body.end_time,
      req.body.endTime,
      req.body.timeEnd,
      req.body.time
    );

    if (!user || !date || !start || !end) {
      return res.status(400).json({
        ok: false,
        message: "Missing required fields. Provide user, date, start and end (or time)."
      });
    }

    const bookingObj = { user, date, start, end };

    // Specific room selected
    if (roomId) {
      const room = rooms.find((r) => r.id === roomId);
      if (!room) {
        return res.status(404).json({ ok: false, message: "Room not found" });
      }

      const existing = room.bookings.find(
        (b) => b.date === date && b.start === start && b.end === end
      );

      if (existing) {
        // add to this room's waiting list
        room.waitingList.push({
          ...bookingObj,
          created_at: new Date().toISOString(),
          base_priority: 1
        });

        return res.json({
          ok: true,
          message: `⚠️ ${room.name} is already booked by ${existing.user} on ${date} at ${start}. You are added to the waiting list.`,
          currentMeeting: existing
        });
      }

      room.bookings.push({
        ...bookingObj,
        confirmed_at: new Date().toISOString(),
        base_priority: 1
      });

      return res.json({
        ok: true,
        message: `✅ ${room.name} booked for ${date} at ${start} by ${user}`
      });
    }

    // No specific room: find any free
    const availableRoom = rooms.find(
      (r) => !r.bookings.find((b) => b.date === date && b.start === start && b.end === end)
    );

    if (availableRoom) {
      availableRoom.bookings.push({
        ...bookingObj,
        confirmed_at: new Date().toISOString(),
        base_priority: 1
      });
      return res.json({
        ok: true,
        message: `✅ ${availableRoom.name} assigned automatically and booked for ${date} at ${start}`
      });
    }

    // All rooms busy → push to waiting list of first room
    rooms[0].waitingList.push({
      ...bookingObj,
      created_at: new Date().toISOString(),
      base_priority: 1
    });

    return res.json({
      ok: false,
      message: "🚫 All rooms are booked for this time. You were added to waiting list (first room)."
    });
  } catch (err) {
    console.error("Book error", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// Admin summary (for your AdminDashboard)
app.get("/api/rooms/summary", (req, res) => {
  const total = rooms.length;
  const booked = rooms.filter((r) => r.bookings.length > 0).length;
  const available = total - booked;
  res.json({ total, booked, available });
});

/* -------------------- AGING / EFFECTIVE PRIORITY -------------------- */

// aging_factor = maxWaitHours / (priorityHigh - priorityLow)
function computeAgingFactor({ maxWaitHours = 48, priorityHigh = 5, priorityLow = 1 } = {}) {
  const diff = Math.max(1, Math.abs(priorityHigh - priorityLow));
  return maxWaitHours / diff;
}

// waiting time (hours) between createdAt and now
function waitingTimeHours(createdAt, now = new Date()) {
  const created = new Date(createdAt);
  return Math.max(0, (now.getTime() - created.getTime()) / (1000 * 60 * 60));
}

// effective_priority = base_priority + (waiting_time / aging_factor)
function effectivePriority({ basePriority, createdAt, agingFactor, now = new Date() }) {
  const waitHours = waitingTimeHours(createdAt, now);
  return basePriority + waitHours / agingFactor;
}

// choose waiting entry with highest effective priority
function chooseNextBookingFromWaiting(waitingList = [], opts = {}) {
  const agingFactor = computeAgingFactor({
    maxWaitHours: opts.maxWaitHours ?? 48,
    priorityHigh: opts.priorityHigh ?? 5,
    priorityLow: opts.priorityLow ?? 1
  });

  const now = new Date();

  const scored = waitingList.map((b) => {
    const baseP = b.base_priority || b.basePriority || 1;
    const created = b.created_at || b.createdAt || b.created || new Date().toISOString();
    return {
      ...b,
      score: effectivePriority({ basePriority: baseP, createdAt: created, agingFactor, now })
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ta = new Date(a.created_at || a.createdAt || a.created).getTime();
    const tb = new Date(b.created_at || b.createdAt || b.created).getTime();
    return ta - tb;
  });

  return scored[0] || null;
}

// promote best waiting user to confirmed booking for a room
function promoteNextForRoom(room, opts = {}) {
  if (!room || !Array.isArray(room.waitingList) || room.waitingList.length === 0) {
    return null;
  }

  const next = chooseNextBookingFromWaiting(room.waitingList, opts);
  if (!next) return null;

  const dateVal = pick(next.date, next.requestedDate, next.bookingDate);
  const startVal = pick(next.start, next.start_time, next.startTime, next.time, next.from);
  const endVal = pick(next.end, next.end_time, next.endTime, next.timeEnd, next.to);

  if (!dateVal || !startVal || !endVal) {
    console.warn("Cannot promote – missing date/start/end in waiting entry:", next);
    return null;
  }

  // remove chosen from waitingList (others stay)
  room.waitingList = room.waitingList.filter(
    (w) => (w.id || w._id) !== (next.id || next._id)
  );

  const confirmedBooking = {
    id: next.id ?? next._id ?? `bk_${Date.now()}`,
    user: next.user,
    date: dateVal,
    start: startVal,
    end: endVal,
    base_priority: next.base_priority ?? next.basePriority ?? 1,
    confirmed_at: new Date().toISOString()
  };

  room.bookings = room.bookings || [];
  room.bookings.push(confirmedBooking);

  return confirmedBooking;
}

/* -------------------- PROMOTE ENDPOINT (optional manual button) -------------------- */

app.post("/api/promote/:roomId", (req, res) => {
  try {
    const roomIdRaw = req.params.roomId;
    const roomId = isNaN(Number(roomIdRaw)) ? roomIdRaw : Number(roomIdRaw);

    const room = rooms.find((r) => r.id === roomId);
    if (!room) {
      return res.status(404).json({ ok: false, message: "Room not found" });
    }

    const promoted = promoteNextForRoom(room, {
      maxWaitHours: req.body?.maxWaitHours ?? 48,
      priorityHigh: req.body?.priorityHigh ?? 5,
      priorityLow: req.body?.priorityLow ?? 1
    });

    if (!promoted) {
      return res.json({ ok: false, message: "No candidate found to promote." });
    }

    return res.json({
      ok: true,
      promoted,
      message: `Promoted waiting user ${promoted.user} to a confirmed booking.`
    });
  } catch (err) {
    console.error("Promote error", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/* -------------------- CANCEL CONFIRMED + AUTO-PROMOTE -------------------- */

app.post("/api/cancel", (req, res) => {
  try {
    const { roomId, user, date, start, end } = req.body;

    if (!roomId || !user || !date || !start || !end) {
      return res.status(400).json({
        ok: false,
        message: "Missing required fields. Provide roomId, user, date, start, end."
      });
    }

    const idNum = isNaN(Number(roomId)) ? roomId : Number(roomId);
    const room = rooms.find((r) => r.id === idNum);
    if (!room) {
      return res.status(404).json({ ok: false, message: "Room not found" });
    }

    const before = room.bookings.length;
    room.bookings = room.bookings.filter(
      (b) =>
        !(
          b.user === user &&
          b.date === date &&
          b.start === start &&
          b.end === end
        )
    );

    if (room.bookings.length === before) {
      return res.json({ ok: false, message: "No matching booking to cancel." });
    }

    // auto-promote best waiting user for this room (if any)
    const promoted = promoteNextForRoom(room);
    if (promoted) {
      return res.json({
        ok: true,
        message: `Booking cancelled. Waiting user ${promoted.user} promoted automatically (${promoted.start}–${promoted.end} on ${promoted.date}).`,
        promoted
      });
    }

    return res.json({ ok: true, message: "Booking cancelled successfully. No one waiting." });
  } catch (err) {
    console.error("Cancel error", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/* -------------------- CANCEL WAITING ENTRY (for waiting Cancel button) -------------------- */

app.post("/api/cancel-waiting", (req, res) => {
  try {
    const { roomId, user, date, start, end } = req.body;

    if (!roomId || !user || !date || !start || !end) {
      return res.status(400).json({
        ok: false,
        message: "Missing required fields. Provide roomId, user, date, start, end."
      });
    }

    const idNum = isNaN(Number(roomId)) ? roomId : Number(roomId);
    const room = rooms.find((r) => r.id === idNum);
    if (!room) {
      return res.status(404).json({ ok: false, message: "Room not found" });
    }

    const before = room.waitingList.length;
    room.waitingList = room.waitingList.filter(
      (w) =>
        !(
          w.user === user &&
          w.date === date &&
          w.start === start &&
          w.end === end
        )
    );

    if (room.waitingList.length === before) {
      return res.json({ ok: false, message: "No matching waiting entry to cancel." });
    }

    return res.json({
      ok: true,
      message: "Waiting list entry cancelled successfully."
    });
  } catch (err) {
    console.error("Cancel-waiting error", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/* -------------------- AUTO-COMPLETE + AUTO-PROMOTE (every minute) -------------------- */

setInterval(() => {
  const now = new Date();

  rooms.forEach((room) => {
    if (!Array.isArray(room.bookings) || room.bookings.length === 0) return;

    // bookings that have already finished
    const finished = room.bookings.filter((b) => {
      const endTime = makeDateTime(b.date, b.end);
      if (!endTime) return false;
      return endTime <= now;
    });

    // keep only non-finished bookings
    room.bookings = room.bookings.filter((b) => !finished.includes(b));

    // for each finished booking, try to promote someone from waiting list
    finished.forEach((b) => {
      console.log(
        `Meeting finished in room ${room.name}: ${b.user} ${b.date} ${b.start}-${b.end}`
      );
      const promoted = promoteNextForRoom(room);
      if (promoted) {
        console.log(
          `  Promoted waiting user ${promoted.user} to ${promoted.date} ${promoted.start}-${promoted.end}`
        );
      }
    });
  });
}, 60 * 1000); // every 60 seconds

/* -------------------- START SERVER -------------------- */

app.listen(5000, () => console.log("✅ Server running on port 5000"));
