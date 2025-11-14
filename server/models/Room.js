import mongoose from "mongoose";

const roomSchema = new mongoose.Schema({
  name: { type: String, required: true },
  isBooked: { type: Boolean, default: false },
});

const Room = mongoose.model("Room", roomSchema);
export default Room;
