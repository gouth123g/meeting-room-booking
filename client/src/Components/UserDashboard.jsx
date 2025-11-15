import React, { useEffect, useRef, useState } from "react";

export default function UserDashboard() {
  const [rooms, setRooms] = useState([]);
  const [message, setMessage] = useState("");
  const [user, setUser] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [selectedRoom, setSelectedRoom] = useState(null);

  // ------------------ Notification settings ------------------
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [leadMinutes, setLeadMinutes] = useState(10); // default notify 10 minutes before
  const timersRef = useRef({}); // map bookingKey -> timeoutId
  const inAppMessagesRef = useRef([]); // history of in-app messages
  const fetchIntervalRef = useRef(null);

  // Notification banner text (for upcoming meeting)
  const [banner, setBanner] = useState("");

  // Audio ref for audible alert (place /notification.mp3 in client/public)
  const audioRef = useRef(null);

  useEffect(() => {
    try {
      // initialize audio (do not autoplay). This will be unlocked on user gesture.
      audioRef.current = new Audio("/notification.mp3");
      audioRef.current.preload = "auto";
      audioRef.current.volume = 1.0;
    } catch (e) {
      console.warn("Audio init failed:", e);
    }
  }, []);

  // ------------------ Data fetch ------------------
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
    fetchIntervalRef.current = setInterval(fetchRooms, 20000); // optional polling
    return () => {
      clearInterval(fetchIntervalRef.current);
      clearAllScheduledTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reschedule notifications when relevant dependencies change
  useEffect(() => {
    scheduleNotificationsForUserBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, user, notifyEnabled, leadMinutes]);

  // ------------------ Helpers: time handling ------------------
  const timeToMinutes = (t) => {
    if (!t) return null;
    const [hh, mm] = t.split(":").map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    return hh * 60 + mm;
  };

  const combineDateTimeToDateObj = (dateStr, timeStr) => {
    // dateStr: "YYYY-MM-DD", timeStr: "HH:MM"
    if (!dateStr || !timeStr) return null;
    // Build a local ISO-like string: "YYYY-MM-DDTHH:MM:00"
    const [hh, mm] = timeStr.split(":");
    const iso = `${dateStr}T${hh.padStart(2, "0")}:${mm.padStart(2, "0")}:00`;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d;
  };

  // Normalize a time value which may be:
  // - "HH:MM"
  // - ISO datetime "2025-11-14T10:30:00Z" or "2025-11-14T10:30:00"
  // - timestamp number (ms)
  // Return string "HH:MM" in local time (or original if it already was HH:MM).
  const normalizeTimeString = (val) => {
    if (!val && val !== 0) return null;
    if (typeof val === "string") {
      // if already "HH:MM"
      if (/^\d{1,2}:\d{2}$/.test(val.trim())) {
        const parts = val.trim().split(":");
        const hh = String(parseInt(parts[0], 10)).padStart(2, "0");
        const mm = String(parseInt(parts[1], 10)).padStart(2, "0");
        return `${hh}:${mm}`;
      }
      // try ISO parse
      const parsed = Date.parse(val);
      if (!Number.isNaN(parsed)) {
        const d = new Date(parsed);
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        return `${hh}:${mm}`;
      }
      // fallback: try to extract HH:MM with regex
      const m = val.match(/(\d{1,2}):(\d{2})/);
      if (m) {
        const hh = String(parseInt(m[1], 10)).padStart(2, "0");
        const mm = String(parseInt(m[2], 10)).padStart(2, "0");
        return `${hh}:${mm}`;
      }
      return null;
    } else if (typeof val === "number") {
      // ms timestamp
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        return `${hh}:${mm}`;
      }
      return null;
    }
    return null;
  };

  // Getters that look for multiple possible key names and normalize
  const getBookingDate = (b) => {
    return (
      b.date ??
      b.bookingDate ??
      b.requestedDate ??
      b.day ??
      // if object holds datetime in a single field, try to extract date
      (typeof b.startDatetime === "string" && b.startDatetime.split("T")[0]) ??
      null
    );
  };

  const getBookingStart = (b) => {
    const candidates = [
      b.start,
      b.start_time,
      b.startTime,
      b.time,
      b.from,
      b.startDatetime,
      b.start_datetime,
      b.start_at,
    ];
    for (const c of candidates) {
      const t = normalizeTimeString(c);
      if (t) return t;
    }
    // If there's a single datetime in a field called 'datetime' or 'when'
    const fallbacks = [b.datetime, b.when, b.startAt, b.start_at];
    for (const f of fallbacks) {
      const t = normalizeTimeString(f);
      if (t) return t;
    }
    return null;
  };

  const getBookingEnd = (b) => {
    const candidates = [
      b.end,
      b.end_time,
      b.endTime,
      b.to,
      b.endDatetime,
      b.end_datetime,
      b.end_at,
    ];
    for (const c of candidates) {
      const t = normalizeTimeString(c);
      if (t) return t;
    }
    const fallbacks = [b.datetimeEnd, b.until, b.endAt, b.end_at];
    for (const f of fallbacks) {
      const t = normalizeTimeString(f);
      if (t) return t;
    }
    return null;
  };

  // ------------------ Notification utilities ------------------
  const requestNotificationPermission = async () => {
    try {
      if (!("Notification" in window)) {
        // browser doesn't support notifications
        return false;
      }
      if (Notification.permission === "granted") return true;
      if (Notification.permission === "denied") {
        // user explicitly denied — don't nag, fallback to in-app messages
        return false;
      }
      const permission = await Notification.requestPermission();
      return permission === "granted";
    } catch (e) {
      console.error("Notification permission error:", e);
      return false;
    }
  };

  const showBrowserNotification = (title, body) => {
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        const options = {
          body,
          silent: true, // keep browser notification silent; we play audio separately
          // icon: '/favicon.ico' // optional icon in public folder
        };
        const notif = new Notification(title, options);
        notif.onclick = () => {
          try {
            if (window && window.focus) window.focus();
          } catch {}
        };
        return true;
      }
    } catch (e) {
      console.error("showBrowserNotification error:", e);
    }
    return false;
  };

  const showInAppMessage = (text) => {
    // Non-intrusive fallback: update message for a short time (no alert)
    inAppMessagesRef.current.push({ text, time: Date.now() });
    setMessage(text);
    setTimeout(() => {
      setMessage((cur) => (cur === text ? "" : cur));
    }, 6000); // auto-hide after 6s
  };

  const playAlertSound = async () => {
    try {
      if (audioRef.current) {
        // always start from the beginning of the audio
        audioRef.current.currentTime = 0;
        // Attempt to play; if blocked, catch and continue silently
        await audioRef.current.play().catch((err) => {
          // may be blocked if not unlocked by a user gesture
          console.warn("Audio play blocked:", err);
        });
      }
      if (navigator && navigator.vibrate) {
        try {
          navigator.vibrate([200, 100, 200]);
        } catch {}
      }
    } catch (e) {
      console.warn("playAlertSound error:", e);
    }
  };

  const notifyUser = async (booking, room) => {
    const bStart = getBookingStart(booking) ?? "—";
    const bEnd = getBookingEnd(booking) ?? "—";
    const bDate = getBookingDate(booking) ?? "—";
    const title = `Upcoming meeting — ${room.name}`;
    const body = `${booking.user} • ${bDate} ${bStart}–${bEnd} (in ${leadMinutes} min)`;

    const ok = showBrowserNotification(title, body);
    // Play sound (best-effort). If blocked, nothing breaks.
    await playAlertSound();

    // 🔔 Show banner on page as well
    const bannerText = `🔔 Upcoming meeting in ${leadMinutes} min — ${room.name} • ${bDate} ${bStart}–${bEnd}`;
    setBanner(bannerText);
    // Auto-hide banner after 10 seconds
    setTimeout(() => {
      setBanner((cur) => (cur === bannerText ? "" : cur));
    }, 10000);

    if (!ok) {
      showInAppMessage(`🔔 ${title}: ${bDate} ${bStart}`);
    }
  };

  // ------------------ Scheduling ------------------
  const clearAllScheduledTimers = () => {
    const map = timersRef.current || {};
    Object.values(map).forEach((tid) => {
      try {
        clearTimeout(tid);
      } catch {}
    });
    timersRef.current = {};
  };

  const scheduleNotificationsForUserBookings = () => {
    // Cancel existing timers and re-schedule
    clearAllScheduledTimers();

    if (!notifyEnabled) return;
    if (!user) return; // need username to filter bookings

    const now = Date.now();
    const leadMs = Math.max(0, Number(leadMinutes) || 0) * 60 * 1000;

    rooms.forEach((room) => {
      (room.bookings || []).forEach((b) => {
        // only schedule for bookings that belong to current logged-in user
        if (!b.user || b.user !== user) return;

        // use getters (they already handle alternate keys)
        const startStr = getBookingStart(b);
        const dateStr = getBookingDate(b);

        if (!dateStr || !startStr) {
          // can't schedule notification for this booking because time or date is missing
          console.warn("Skipping schedule: booking missing date or start:", b);
          return;
        }

        const startDate = combineDateTimeToDateObj(dateStr, startStr);
        if (!startDate) {
          console.warn("Invalid date/time for booking, skipping:", b);
          return;
        }

        const startMs = startDate.getTime();
        const notifyAt = startMs - leadMs;
        const timeUntilNotify = notifyAt - now;

        // Only schedule if notify time is in the future
        if (timeUntilNotify > 0) {
          const bookingKey = `${room.id}__${dateStr}__${startStr}__${b.user}`;
          const MAX_TIMEOUT = 2147483647; // ~24.8 days
          const timeoutToUse = Math.min(timeUntilNotify, MAX_TIMEOUT);

          if (timersRef.current[bookingKey]) {
            try {
              clearTimeout(timersRef.current[bookingKey]);
            } catch {}
          }

          const tid = setTimeout(() => {
            try {
              // call notifyUser (async). no need to await here.
              notifyUser(b, room);
            } catch (e) {
              console.error("notifyUser error:", e);
            } finally {
              delete timersRef.current[bookingKey];
            }
          }, timeoutToUse);

          timersRef.current[bookingKey] = tid;
        }
      });
    });
  };

  // ------------------ NEW: cancel booking ------------------
  const cancelBooking = async (roomId, booking) => {
    const bookingDate = getBookingDate(booking);
    const bookingStart = getBookingStart(booking);
    const bookingEnd = getBookingEnd(booking);

    if (!bookingDate || !bookingStart || !bookingEnd) {
      alert("Unable to cancel: booking date/time missing.");
      return;
    }

    const confirmCancel = window.confirm(
      `Do you really want to cancel your booking in this room on ${bookingDate} from ${bookingStart} to ${bookingEnd}?`
    );
    if (!confirmCancel) return;

    setMessage("");

    try {
      const res = await fetch("http://localhost:5000/api/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          user: booking.user,
          date: bookingDate,
          start: bookingStart,
          end: bookingEnd,
        }),
      });

      const data = await res.json();
      setMessage(data.message || "Booking cancelled.");
      // refresh rooms so UI updates
      fetchRooms();
    } catch (err) {
      console.error("Error cancelling booking:", err);
      setMessage("Error cancelling booking. Try again.");
    }
  };

  // ------------------ Booking logic (unchanged) ------------------
  const validateTimes = () => {
    if (!date || !start || !end) {
      alert("Please pick date, start time and end time.");
      return false;
    }
    const s = timeToMinutes(start);
    const e = timeToMinutes(end);
    if (s === null || e === null) {
      alert("Invalid start or end time.");
      return false;
    }
    if (e <= s) {
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

    if (selectedRoom) {
      const room = rooms.find((r) => r.id === selectedRoom);
      const sMinutes = timeToMinutes(start);
      const eMinutes = timeToMinutes(end);

      const existing = (room?.bookings || []).find((b) => {
        // use getBookingDate/getBookingStart when comparing to be robust
        if (getBookingDate(b) !== date) return false;
        const bStart = getBookingStart(b);
        const bEnd = getBookingEnd(b);
        const bStartMin = timeToMinutes(bStart);
        const bEndMin = timeToMinutes(bEnd);
        if (bStartMin === null || bEndMin === null) return false;
        return sMinutes < bEndMin && bStartMin < eMinutes;
      });

      if (existing) {
        const exStart = getBookingStart(existing) ?? "—";
        const exEnd = getBookingEnd(existing) ?? "—";
        const wantToWait = window.confirm(
          `⚠️ ${room.name} is already booked by ${existing.user} from ${exStart} to ${exEnd} on ${getBookingDate(
            existing
          )}.\n\nDo you want to wait for this specific room?`
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

  // ------------------ UI ------------------  
  const handleEnableNotifications = async () => {
    const ok = await requestNotificationPermission();
    setNotifyEnabled(ok);
    if (ok) {
      setMessage("Notifications enabled (sound unlocking attempt).");
      // Attempt to unlock audio by playing and pausing immediately (user gesture)
      try {
        if (!audioRef.current) audioRef.current = new Audio("/notification.mp3");
        await audioRef.current
          .play()
          .then(() => {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          })
          .catch(() => {});
      } catch (e) {
        // ignore
      }
    } else {
      setMessage("Notifications unavailable — using in-app messages only.");
    }
  };

  const handleDisableNotifications = () => {
    setNotifyEnabled(false);
    clearAllScheduledTimers();
    setMessage("Notifications disabled.");
  };

  // small helper to display fallback-friendly values in UI
  const renderDate = (b) => getBookingDate(b) ?? "—";
  const renderStart = (b) => getBookingStart(b) ?? "—";
  const renderEnd = (b) => getBookingEnd(b) ?? "—";

  return (
    <div style={{ textAlign: "center", marginTop: "30px" }}>
      {/* 🔔 Notification banner */}
      {banner && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 999,
            padding: "10px 16px",
            background: "#fff3cd",
            color: "#856404",
            borderBottom: "1px solid #ffeeba",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 14,
          }}
        >
          <span>{banner}</span>
          <button
            onClick={() => setBanner("")}
            style={{
              marginLeft: 12,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 16,
              fontWeight: "bold",
              color: "#856404",
            }}
          >
            ×
          </button>
        </div>
      )}

      <h1 style={{ marginTop: banner ? "60px" : "30px" }}>Room Booking</h1>

      {/* Notification controls */}
      <div style={{ marginBottom: 12 }}>
        <strong>Notifications:</strong>{" "}
        {notifyEnabled ? (
          <button onClick={handleDisableNotifications} style={{ marginLeft: 8 }}>
            Disable
          </button>
        ) : (
          <button onClick={handleEnableNotifications} style={{ marginLeft: 8 }}>
            Enable
          </button>
        )}
        <label style={{ marginLeft: 12 }}>
          Lead time (minutes):
          <input
            type="number"
            value={leadMinutes}
            min={1}
            max={1440}
            onChange={(e) => setLeadMinutes(Number(e.target.value || 0))}
            style={{ width: 70, marginLeft: 8 }}
          />
        </label>
        <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
          Lead time = how many minutes before meeting start you'll be notified.
        </div>
      </div>

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
                      <li
                        key={i}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span>
                          {renderDate(b)} — {renderStart(b)} to {renderEnd(b)} — by {b.user}
                        </span>
                        {b.user === user && (
                          <button
                            onClick={() => cancelBooking(r.id, b)}
                            style={{
                              padding: "4px 8px",
                              fontSize: 12,
                              cursor: "pointer",
                              borderRadius: 4,
                              border: "1px solid #cc0000",
                              background: "#ffe5e5",
                              color: "#cc0000",
                            }}
                          >
                            Cancel
                          </button>
                        )}
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
                        {w.user} waiting for {renderDate(w)} {renderStart(w)}-{renderEnd(w)}
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
