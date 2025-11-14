import express from "express";
import Room from "../models/Room.js"; // adjust the path based on your folder structure

const router = express.Router();

// Dashboard summary API
router.get("/summary", async (req, res) => {
  try {
    const totalRooms = await Room.countDocuments();
    const filledRooms = await Room.countDocuments({ isBooked: true });

    res.json({ totalRooms, filledRooms });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
