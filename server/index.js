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

// small helper to pick first non-empty field
function pick(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

// ✅ Get all rooms
app.get("/api/rooms", (req, res) => res.json(rooms));

// ✅ Book a room (handles waiting logic)
// NOTE: this endpoint now expects either (start && end) or a `time` field for both start and end.
// Prefer sending { start: "HH:MM", end: "HH:MM" } from the client.
app.post("/api/book", (req, res) => {
  try {
    const { roomId, user, date } = req.body;
    // accept start/end under multiple names; fallback to `time` if provided
    const start = pick(req.body.start, req.body.start_time, req.body.startTime, req.body.time);
    const end = pick(req.body.end, req.body.end_time, req.body.endTime, req.body.timeEnd, req.body.time);

    // validate required fields
    if (!user || !date || !start || !end) {
      return res.status(400).json({
        ok: false,
        message: "Missing required fields. Provide user, date, start and end (or time)."
      });
    }

    // create booking object with start and end fields (so client receives them)
    const bookingObj = { user, date, start, end };

    // Check if user selected a specific room
    if (roomId) {
      const room = rooms.find((r) => r.id === roomId);
      if (!room) return res.status(404).json({ ok: false, message: "Room not found" });

      const existing = room.bookings.find((b) => b.date === date && b.start === start && b.end === end);

      if (existing) {
        // push a waiting entry that also stores start & end
        room.waitingList.push({ ...bookingObj, created_at: new Date().toISOString(), base_priority: 1 });
        return res.json({
          ok: true,
          message: `⚠️ ${room.name} is already booked by ${existing.user} on ${date} at ${start}. You are added to the waiting list.`,
          currentMeeting: existing
        });
      }

      room.bookings.push({ ...bookingObj, confirmed_at: new Date().toISOString(), base_priority: 1 });
      return res.json({ ok: true, message: `✅ ${room.name} booked for ${date} at ${start} by ${user}` });
    }

    // If no specific room chosen, find any available
    const availableRoom = rooms.find(
      (r) => !r.bookings.find((b) => b.date === date && b.start === start && b.end === end)
    );

    if (availableRoom) {
      availableRoom.bookings.push({ ...bookingObj, confirmed_at: new Date().toISOString(), base_priority: 1 });
      return res.json({
        ok: true,
        message: `✅ ${availableRoom.name} assigned automatically and booked for ${date} at ${start}`
      });
    }

    // All rooms are booked -> add to global waiting of first room
    rooms[0].waitingList.push({ ...bookingObj, created_at: new Date().toISOString(), base_priority: 1 });
    return res.json({
      ok: false,
      message: "🚫 All rooms are booked for this time. You were added to waiting list (first room)."
    });
  } catch (err) {
    console.error("Book error", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// ✅ Admin summary
app.get("/api/rooms/summary", (req, res) => {
  const total = rooms.length;
  const booked = rooms.filter((r) => r.bookings.length > 0).length;
  const available = total - booked;
  res.json({ total, booked, available });
});

// ✅ Cancel a booking
app.post("/api/cancel", (req, res) => {
  try {
    const { roomId, user, date, start, end } = req.body;

    if (!roomId || !user || !date || !start || !end) {
      return res.status(400).json({
        ok: false,
        message: "Missing required fields. Provide roomId, user, date, start, end.",
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

    return res.json({ ok: true, message: "Booking cancelled successfully." });
  } catch (err) {
    console.error("Cancel error", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

app.listen(5000, () => console.log("✅ Server running on port 5000"));

/* === BEGIN: aging + promotion helpers and endpoint === */

/**
 * Compute aging factor and effective priority.
 * Units: hours.
 */

// Compute agingFactor like: aging_factor = maxWaitHours / (priorityHigh - priorityLow)
function computeAgingFactor({ maxWaitHours = 48, priorityHigh = 5, priorityLow = 1 } = {}) {
  const diff = Math.max(1, Math.abs(priorityHigh - priorityLow));
  return maxWaitHours / diff;
}

// waiting time in hours between createdAt and now
function waitingTimeHours(createdAt, now = new Date()) {
  const created = new Date(createdAt);
  return Math.max(0, (now.getTime() - created.getTime()) / (1000 * 60 * 60));
}

// effective_priority = base_priority + (waiting_time / aging_factor)
function effectivePriority({ basePriority, createdAt, agingFactor, now = new Date() }) {
  const waitHours = waitingTimeHours(createdAt, now);
  return basePriority + waitHours / agingFactor;
}

/**
 * Choose best waiting entry array based on effective_priority.
 * waitingList is an array of objects with at least:
 *   { id, user, base_priority, created_at, date, start, end }
 */
function chooseNextBookingFromWaiting(waitingList = [], opts = {}) {
  const agingFactor = computeAgingFactor({
    maxWaitHours: opts.maxWaitHours ?? 48,
    priorityHigh: opts.priorityHigh ?? 5,
    priorityLow: opts.priorityLow ?? 1,
  });

  const now = new Date();
  const scored = waitingList.map((b) => {
    const baseP = b.base_priority || b.basePriority || 1;
    const created = b.created_at || b.createdAt || b.created || new Date().toISOString();
    return {
      ...b,
      score: effectivePriority({ basePriority: baseP, createdAt: created, agingFactor, now }),
    };
  });

  // sort by score desc, tiebreak by oldest created_at first
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ta = new Date(a.created_at || a.createdAt || a.created).getTime();
    const tb = new Date(b.created_at || b.createdAt || b.created).getTime();
    return ta - tb;
  });

  return scored[0] || null;
}

/**
 * POST /api/promote/:roomId
 * Promotes the highest effective_priority waiting entry for the given roomId.
 * Body (optional): { maxWaitHours, priorityHigh, priorityLow }
 */
app.post("/api/promote/:roomId", (req, res) => {
  try {
    const roomIdRaw = req.params.roomId;
    const roomId = isNaN(Number(roomIdRaw)) ? roomIdRaw : Number(roomIdRaw);

    const room = rooms.find((r) => r.id === roomId);
    if (!room) return res.status(404).json({ ok: false, message: "Room not found" });

    const waiting = Array.isArray(room.waitingList) ? room.waitingList : [];

    if (waiting.length === 0) {
      return res.json({ ok: false, message: "No waiting entries for this room." });
    }

    const opts = {
      maxWaitHours: req.body?.maxWaitHours ?? 48,
      priorityHigh: req.body?.priorityHigh ?? 5,
      priorityLow: req.body?.priorityLow ?? 1,
    };

    const next = chooseNextBookingFromWaiting(waiting, opts);

    if (!next) {
      return res.json({ ok: false, message: "No candidate found to promote." });
    }

    // Robustly extract start/end/date from waiting entry (support multiple possible field names)
    const dateVal = pick(next.date, next.requestedDate, next.bookingDate);
    const startVal = pick(next.start, next.start_time, next.startTime, next.time, next.from);
    const endVal = pick(next.end, next.end_time, next.endTime, next.timeEnd, next.to);

    if (!dateVal || !startVal || !endVal) {
      return res.status(400).json({
        ok: false,
        message: "Cannot promote: waiting entry missing date/start/end.",
        waitingEntry: next
      });
    }

    // Remove chosen from waitingList
    room.waitingList = room.waitingList.filter((w) => (w.id || w._id) !== (next.id || next._id));

    // Add to bookings for that room (preserve start/end)
    const confirmedBooking = {
      id: next.id ?? next._id ?? `bk_${Date.now()}`, // generate id if missing
      user: next.user,
      date: dateVal,
      start: startVal,
      end: endVal,
      base_priority: next.base_priority ?? next.basePriority ?? 1,
      confirmed_at: new Date().toISOString(),
    };
    room.bookings = room.bookings || [];
    room.bookings.push(confirmedBooking);

    return res.json({ ok: true, promoted: confirmedBooking, message: "Promoted next waiting booking." });
  } catch (err) {
    console.error("Promote error", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/* === END: aging + promotion helpers and endpoint === */
